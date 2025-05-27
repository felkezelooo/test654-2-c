const Apify = require('apify');
const { Actor } = Apify; // Actor might already be global on Apify platform

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { to } = require('await-to-js'); // Not used extensively, but kept
const { v4: uuidv4 } = require('uuid');
const { URL } = require('url');

// MediaError numeric codes (for reference in comments)
// const MEDIA_ERR_ABORTED = 1;
// const MEDIA_ERR_NETWORK = 2;
// const MEDIA_ERR_DECODE = 3;
// const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;


try {
    console.log('MAIN.JS: Attempting to apply StealthPlugin...');
    chromium.use(StealthPlugin());
    console.log('MAIN.JS: StealthPlugin applied successfully.');
} catch (e) {
    console.error('MAIN.JS: CRITICAL ERROR applying StealthPlugin:', e.message, e.stack);
    throw e;
}

// --- Utility functions ---
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getSafeLogger(loggerInstance) {
    const baseConsoleLogger = {
        info: (msg, data) => console.log(`CONSOLE_INFO: ${msg || ''}`, data || ''),
        warn: (msg, data) => console.warn(`CONSOLE_WARN: ${msg || ''}`, data || ''),
        warning: (msg, data) => console.warn(`CONSOLE_WARN: ${msg || ''}`, data || ''),
        error: (msg, data) => console.error(`CONSOLE_ERROR: ${msg || ''}`, data || ''),
        debug: (msg, data) => console.log(`CONSOLE_DEBUG: ${msg || ''}`, data || ''),
        exception: (e, msg, data) => console.error(`CONSOLE_EXCEPTION: ${msg || ''}`, e, data || ''),
        child: function(childOpts) {
            const newPrefix = (this.prefix || 'FALLBACK_CHILD') + (childOpts && childOpts.prefix ? childOpts.prefix : '');
            const childConsoleLogger = { prefix: newPrefix };
            for (const key in this) {
                if (typeof this[key] === 'function' && key !== 'child' && key !== 'prefix') {
                    childConsoleLogger[key] = (m, d) => this[key](`${newPrefix}${m}`, d);
                } else if (key !== 'child' && key !== 'prefix') {
                    childConsoleLogger[key] = this[key];
                }
            }
            childConsoleLogger.child = function(opts) { return baseConsoleLogger.child.call(this, opts); };
            return childConsoleLogger;
        }
    };

    if (loggerInstance &&
        typeof loggerInstance.info === 'function' &&
        (typeof loggerInstance.warn === 'function' || typeof loggerInstance.warning === 'function') &&
        typeof loggerInstance.error === 'function' &&
        typeof loggerInstance.debug === 'function' &&
        typeof loggerInstance.child === 'function'
    ) {
        if (typeof loggerInstance.warn !== 'function' && typeof loggerInstance.warning === 'function') {
            loggerInstance.warn = loggerInstance.warning;
        }
        return loggerInstance;
    }

    if (!getSafeLogger.hasWarnedOnceGetSafeLogger) {
        console.error("GET_SAFE_LOGGER: Provided loggerInstance was invalid or incomplete. Falling back to basic console logger WITH dummy child support.");
        getSafeLogger.hasWarnedOnceGetSafeLogger = true;
    }
    return { ...baseConsoleLogger };
}
getSafeLogger.hasWarnedOnceGetSafeLogger = false;


function extractVideoIdFromUrl(url, logger) {
    const safeLogger = getSafeLogger(logger);
    try {
        const urlObj = new URL(url);
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const vParam = urlObj.searchParams.get('v');
            if (vParam && vParam.length === 11) return vParam;
            const pathParts = urlObj.pathname.split('/');
            if (urlObj.hostname === 'youtu.be' && pathParts.length > 1 && pathParts[1].length === 11) return pathParts[1];
            if (pathParts.length > 2 && (pathParts[1] === 'shorts' || pathParts[1] === 'embed') && pathParts[2].length === 11) return pathParts[2];
            if (pathParts.length > 1 && pathParts[1].length === 11 && !vParam) return pathParts[1]; // Handles /watch/VIDEOID format
        }
    } catch (error) {
        safeLogger.error(`Error extracting video ID from URL ${url}: ${error.message}`);
    }
    (safeLogger.warn || safeLogger.warning).call(safeLogger, `Could not extract valid YouTube video ID from: ${url}`);
    return null;
}

function random(min, max) {
    if (max === undefined) { max = min; min = 0; }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function handleYouTubeConsent(page, logger) {
    const safeLogger = getSafeLogger(logger);
    safeLogger.info('Checking for YouTube consent dialog...');
    const consentButtonSelectors = [
        'button[aria-label*="Accept all"]', 'button[aria-label*="Accept the use of cookies"]',
        'button[aria-label*="Agree to all"]', 'button[aria-label*="Agree"]',
        'div[role="dialog"] button:has-text("Accept all")', 'div[role="dialog"] button:has-text("Agree")',
        'ytd-button-renderer:has-text("Accept all")', 'tp-yt-paper-button:has-text("ACCEPT ALL")',
        '#introAgreeButton',
    ];
    // Increased timeout for consent button visibility
    const consentVisibilityTimeout = 10000; // from 7000
    for (const selector of consentButtonSelectors) {
        try {
            const button = page.locator(selector).first();
            if (await button.isVisible({ timeout: consentVisibilityTimeout })) {
                safeLogger.info(`Consent button found: "${selector}". Clicking.`);
                await button.click({ timeout: 5000, force: true });
                await page.waitForTimeout(1500 + random(500, 1500));
                safeLogger.info('Consent button clicked.');
                const stillVisible = await page.locator('ytd-consent-bump-v2-lightbox, tp-yt-paper-dialog[role="dialog"]').first().isVisible({timeout:1000}).catch(() => false);
                if (!stillVisible) { safeLogger.info('Consent dialog likely dismissed.'); return true; }
                else { (safeLogger.warn || safeLogger.warning).call(safeLogger, 'Clicked consent, but a dialog might still be visible.');}
                return true;
            }
        } catch (e) {
            safeLogger.debug(`Consent selector "${selector}" not actionable/error: ${e.message.split('\n')[0]}`);
        }
    }
    safeLogger.info('No actionable consent dialog found.');
    return false;
}

const ANTI_DETECTION_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process,ImprovedCookieControls,LazyFrameLoading,GlobalMediaControls,DestroyProfileOnBrowserClose,MediaRouter,DialMediaRouteProvider,AcceptCHFrame,AutoExpandDetailsElement,CertificateTransparencyEnforcement,AvoidUnnecessaryBeforeUnloadCheckSync,Translate',
    '--disable-component-extensions-with-background-pages',
    '--disable-default-apps', '--disable-extensions', '--disable-site-isolation-trials',
    '--disable-sync', '--force-webrtc-ip-handling-policy=default_public_interface_only',
    '--no-first-run', '--no-service-autorun', '--password-store=basic',
    '--use-mock-keychain', '--enable-precise-memory-info',
    '--disable-infobars', '--disable-notifications', '--disable-popup-blocking',
    '--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu',
    '--disable-setuid-sandbox', '--disable-software-rasterizer', '--mute-audio',
    '--ignore-certificate-errors',
];

async function applyAntiDetectionScripts(pageOrContext, logger, fingerprintConfig) {
    const safeLogger = getSafeLogger(logger);
    const {
        locale, // e.g., 'en-GB'
        timezoneId, // e.g., 'Europe/London' (Used to calculate offset)
        webGLVendor, // e.g., 'Google Inc. (NVIDIA)'
        webGLRenderer, // e.g., 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1070 Direct3D11 vs_5_0 ps_5_0, D3D11)'
        // userAgent is applied at context level
    } = fingerprintConfig;

    let timezoneOffsetMinutes;
    // Simplified timezone offset calculation. For precise DST, a library like moment-timezone would be needed.
    // These are standard time offsets, not DST adjusted.
    if (timezoneId === 'Europe/London') timezoneOffsetMinutes = 0; // GMT
    else if (timezoneId === 'Europe/Budapest') timezoneOffsetMinutes = -60; // CET (UTC+1)
    else if (timezoneId === 'America/New_York') timezoneOffsetMinutes = 300; // EST (UTC-5)
    else timezoneOffsetMinutes = 300; // Default to UTC-5 if not specified

    const scriptToInject = (dynamicLocale, dynamicTimezoneOffsetMinutes, dynamicWebGLVendor, dynamicWebGLRenderer) => {
        if (navigator.webdriver === true) Object.defineProperty(navigator, 'webdriver', { get: () => false });

        // Ensure dynamicLocale is used and split correctly
        const langBase = dynamicLocale.split('-')[0];
        const languagesArray = dynamicLocale.includes('-') ? [dynamicLocale, langBase] : [dynamicLocale];
        Object.defineProperty(navigator, 'languages', { get: () => languagesArray });
        Object.defineProperty(navigator, 'language', { get: () => dynamicLocale });

        try { // WebGL
            const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (parameter) {
                // UNMASKED_VENDOR_WEBGL (37445) and UNMASKED_RENDERER_WEBGL (37446)
                if (parameter === 37445) return dynamicWebGLVendor;
                if (parameter === 37446) return dynamicWebGLRenderer;
                // Fallback for older WebGL versions or specific cases if needed
                if (this.canvas && this.canvas.id === 'webgl-fingerprint-canvas') return originalGetParameter.apply(this, arguments);
                return originalGetParameter.apply(this, arguments);
            };
        } catch (e) { console.debug('[AntiDetectInPage] Failed WebGL spoof:', e.message); }

        try { // Canvas - Basic noise, stealth plugin might do more.
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function() {
                if (this.id === 'canvas-fingerprint-element') return originalToDataURL.apply(this, arguments);
                const shift = { r: Math.floor(Math.random()*10)-5, g: Math.floor(Math.random()*10)-5, b: Math.floor(Math.random()*10)-5, a: Math.floor(Math.random()*10)-5 };
                const ctx = this.getContext('2d');
                if (ctx && this.width > 0 && this.height > 0) {
                    try {
                        const imageData = ctx.getImageData(0,0,this.width,this.height);
                        for(let i=0; i<imageData.data.length; i+=4){
                            imageData.data[i] = Math.min(255,Math.max(0,imageData.data[i]+shift.r));
                            imageData.data[i+1] = Math.min(255,Math.max(0,imageData.data[i+1]+shift.g));
                            imageData.data[i+2] = Math.min(255,Math.max(0,imageData.data[i+2]+shift.b));
                        }
                        ctx.putImageData(imageData,0,0);
                    } catch(e) { console.debug('[AntiDetectInPage] Failed Canvas noise:', e.message); }
                }
                return originalToDataURL.apply(this, arguments);
            };
        } catch (e) { console.debug('[AntiDetectInPage] Failed Canvas spoof:', e.message); }

        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
            const originalPermissionsQuery = navigator.permissions.query;
            navigator.permissions.query = (parameters) => ( parameters.name === 'notifications' ? Promise.resolve({ state: Notification.permission || 'prompt' }) : originalPermissionsQuery.call(navigator.permissions, parameters) );
        }

        if (window.screen) { // Hardcoded, but common. Stealth might adjust.
            try {
                Object.defineProperty(window.screen, 'availWidth', { get: () => 1920, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'availHeight', { get: () => 1040, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'width', { get: () => 1920, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'height', { get: () => 1080, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'colorDepth', { get: () => 24, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'pixelDepth', { get: () => 24, configurable: true, writable: false });
            } catch (e) { console.debug('[AntiDetectInPage] Failed screen spoof:', e.message); }
         }

        try { // Timezone
            Date.prototype.getTimezoneOffset = function() { return dynamicTimezoneOffsetMinutes; };
        } catch (e) { console.debug('[AntiDetectInPage] Failed timezone spoof:', e.message); }

        if (navigator.plugins) try { Object.defineProperty(navigator, 'plugins', { get: () => [], configurable: true }); } catch(e) { console.debug('[AntiDetectInPage] Failed plugin spoof:', e.message); }
        if (navigator.mimeTypes) try { Object.defineProperty(navigator, 'mimeTypes', { get: () => [], configurable: true }); } catch(e) { console.debug('[AntiDetectInPage] Failed mimeType spoof:', e.message); }
    };
    try {
        if (pageOrContext.addInitScript) {
            // Pass arguments to the scriptToInject function
            await pageOrContext.addInitScript(scriptToInject, {
                arg1: locale,
                arg2: timezoneOffsetMinutes,
                arg3: webGLVendor,
                arg4: webGLRenderer
            });
        } else if (pageOrContext.evaluateOnNewDocument) { // Fallback for older Playwright or different contexts
             await pageOrContext.evaluateOnNewDocument(scriptToInject, {
                arg1: locale,
                arg2: timezoneOffsetMinutes,
                arg3: webGLVendor,
                arg4: webGLRenderer
            });
        }
        safeLogger.info(`Custom anti-detection script applied with locale: ${locale}, tzOffsetMin: ${timezoneOffsetMinutes}, WebGLVendor: ${webGLVendor.substring(0,30)}, WebGLRenderer: ${webGLRenderer.substring(0,30)}...`);
    } catch (e) {
        safeLogger.error(`Failed to add anti-detection init script: ${e.message}`);
    }
}


async function getVideoDuration(page, logger) {
    const safeLogger = getSafeLogger(logger);
    safeLogger.info('Attempting to get video duration.');
    for (let i = 0; i < 15; i++) {
        if (page.isClosed()) { (safeLogger.warn || safeLogger.warning).call(safeLogger, "Page closed while getting video duration."); return null; }
        try {
            const duration = await page.evaluate(() => {
                const video = document.querySelector('video.html5-main-video');
                return video ? video.duration : null;
            });
            if (duration && Number.isFinite(duration) && duration > 0) {
                safeLogger.info(`Video duration found: ${duration} seconds.`);
                return duration;
            }
        } catch (e) {
            safeLogger.debug(`Attempt ${i+1} to get duration failed: ${e.message.split('\n')[0]}`);
        }
        await sleep(1000);
    }
    (safeLogger.warn || safeLogger.warning).call(safeLogger, 'Could not determine video duration after 15 seconds.');
    return null;
}

async function clickIfExists(page, selector, timeout = 3000, logger) {
    const safeLogger = getSafeLogger(logger);
    try {
        const element = page.locator(selector).first();
        await element.waitFor({ state: 'visible', timeout });
        // noWaitAfter: false is generally safer, ensuring command completes.
        await element.click({ timeout: timeout / 2, force: true, noWaitAfter: false });
        safeLogger.info(`Clicked on selector: ${selector}`);
        return true;
    } catch (e) {
        if (page.isClosed()) { (safeLogger.warn || safeLogger.warning).call(safeLogger, `Page closed attempting to click: ${selector} - ${e.message.split('\n')[0]}`); return false;}
        safeLogger.debug(`Selector not found/clickable: ${selector} - Error: ${e.message.split('\n')[0]}`);
        return false;
    }
}

class YouTubeViewWorker {
    constructor(job, effectiveInput, proxyUrlString, baseLogger) {
        this.job = job;
        this.effectiveInput = effectiveInput;
        this.proxyUrlString = proxyUrlString;
        this.id = uuidv4();
        const workerPrefix = `WKR-${this.id.substring(0,6)}: `;

        if (baseLogger && typeof baseLogger.child === 'function') {
            this.logger = baseLogger.child({ prefix: workerPrefix });
            if (!(this.logger && typeof this.logger.info === 'function' && (typeof this.logger.warn === 'function' || typeof this.logger.warning === 'function'))) {
                console.error(`WORKER_CONSTRUCTOR_ERROR for ${this.id.substring(0,6)}: baseLogger.child() did NOT return a logger with .info AND .warn/warning. This is unexpected. Falling back to created fallback logger.`);
                this.logger = this.createFallbackLogger(workerPrefix);
            } else {
                 // console.log(`WORKER_CONSTRUCTOR_DEBUG for ${this.id.substring(0,6)}: this.logger seems valid with .info and .warn/warning after baseLogger.child().`);
            }
        } else {
            console.error(`WORKER_CONSTRUCTOR_ERROR for ${job.id}: baseLogger is invalid or lacked .child(). Using created fallback logger.`);
            this.logger = this.createFallbackLogger(workerPrefix);
        }
        if (this.logger && typeof this.logger.warn !== 'function' && typeof this.logger.warning === 'function') {
            this.logger.warn = this.logger.warning;
        }
        
        this.killed = false;
        this.maxTimeReachedThisView = 0;
        this.browser = null; this.context = null; this.page = null;
        // this.adWatchState = { isWatchingAd: false, timeToWatchThisAdBeforeSkip: 0, adPlayedForEnoughTime: false, adStartTime: 0 }; // Replaced by handleAds
        this.lastReportedVideoTimeSeconds = 0;
        this.lastLoggedVideoTime = 0;
        
        this.logger.info('Worker instance constructed.');
    }

    createFallbackLogger(prefix) {
        const self = this; // Keep reference to 'this' of YouTubeViewWorker
        return {
            prefix: prefix,
            info: (m, d) => console.log(`INFO ${self.prefix || prefix}${m}`, d || ''),
            warn: (m, d) => console.warn(`WARN ${self.prefix || prefix}${m}`, d || ''),
            warning: (m, d) => console.warn(`WARN ${self.prefix || prefix}${m}`, d || ''),
            error: (m, d) => console.error(`ERROR ${self.prefix || prefix}${m}`, d || ''),
            debug: (m, d) => console.log(`DEBUG ${self.prefix || prefix}${m}`, d || ''),
            child: function(childOpts) { // Use 'function' to get its own 'this' if needed, but here we use 'self' from parent.
                const newPrefix = (this.prefix || '') + (childOpts && childOpts.prefix ? childOpts.prefix : '');
                return self.createFallbackLogger(newPrefix); // Use self to ensure it calls the worker's createFallbackLogger
            }
        };
    }

    async startWorker() {
        this.logger.info(`Launching browser... Proxy: ${this.proxyUrlString ? 'Yes' : 'No'}, Headless: ${this.effectiveInput.headless}`);
        const userAgentStrings = [ // Kept as is, but for true profile matching, UA should also inform WebGL choice
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0'
        ];
        const selectedUserAgent = userAgentStrings[random(userAgentStrings.length - 1)];
        
        const launchOptions = {
            headless: this.effectiveInput.headless,
            args: [...ANTI_DETECTION_ARGS, `--window-size=${1280 + random(0, 640)},${720 + random(0, 360)}`],
        };
        if (this.proxyUrlString) {
            try {
                const parsedProxy = new URL(this.proxyUrlString);
                launchOptions.proxy = {
                    server: `${parsedProxy.protocol}//${parsedProxy.hostname}:${parsedProxy.port}`,
                    username: parsedProxy.username ? decodeURIComponent(parsedProxy.username) : undefined,
                    password: parsedProxy.password ? decodeURIComponent(parsedProxy.password) : undefined,
                };
                this.logger.info(`Parsed proxy for Playwright: server=${launchOptions.proxy.server}, user=${launchOptions.proxy.username ? 'Present' : 'N/A'}`);
            } catch (e) {
                this.logger.error(`Failed to parse proxy URL: ${this.proxyUrlString}. Error: ${e.message}`);
                throw new Error(`Invalid proxy URL format: ${this.proxyUrlString}`);
            }
        }

        this.browser = await chromium.launch(launchOptions);
        this.logger.info('Browser launched with playwright-extra.');

        // --- Fingerprint Configuration ---
        let fingerprintConfig = {
            locale: 'en-US', // Default
            timezoneId: 'America/New_York', // Default
            webGLVendor: 'Google Inc. (Intel)', // Default
            webGLRenderer: 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 640, OpenGL 4.1)', // Default
            userAgent: selectedUserAgent,
            proxyCountry: this.effectiveInput.proxyCountry
        };

        // Example: More realistic fingerprinting based on proxy country
        // For a production system, this map should be more extensive and potentially tied to User-Agent specifics.
        if (this.effectiveInput.proxyCountry === 'GB') {
            fingerprintConfig.locale = 'en-GB';
            fingerprintConfig.timezoneId = 'Europe/London';
            // Example WebGL for a common UK setup (NVIDIA GPU with Chrome on Windows)
            if (selectedUserAgent.toLowerCase().includes('chrome') && selectedUserAgent.toLowerCase().includes('windows')) {
                fingerprintConfig.webGLVendor = 'Google Inc. (NVIDIA)';
                fingerprintConfig.webGLRenderer = 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
            } else { // Fallback for other UAs or more generic
                fingerprintConfig.webGLVendor = 'Google Inc. (Intel)';
                fingerprintConfig.webGLRenderer = 'ANGLE (Intel, Intel HD Graphics 630, OpenGL 4.5)';
            }
        } else if (this.effectiveInput.proxyCountry === 'HU') {
            fingerprintConfig.locale = 'hu-HU';
            fingerprintConfig.timezoneId = 'Europe/Budapest';
            // Example WebGL for a common HU setup (AMD GPU with Chrome on Windows)
             if (selectedUserAgent.toLowerCase().includes('chrome') && selectedUserAgent.toLowerCase().includes('windows')) {
                fingerprintConfig.webGLVendor = 'Google Inc. (AMD)';
                fingerprintConfig.webGLRenderer = 'ANGLE (AMD, AMD Radeon RX 570 Series Direct3D11 vs_5_0 ps_5_0, D3D11)';
            } else {
                fingerprintConfig.webGLVendor = 'Google Inc. (Intel)';
                fingerprintConfig.webGLRenderer = 'ANGLE (Intel, Intel(R) UHD Graphics, OpenGL 4.6)';
            }
        } else if (this.effectiveInput.proxyCountry === 'US') {
            // Use defaults or vary US-based fingerprints if desired
            // Example: Could select between Intel, NVIDIA, AMD based on random or UA properties
             if (selectedUserAgent.toLowerCase().includes('macintosh') && selectedUserAgent.toLowerCase().includes('chrome')) {
                fingerprintConfig.webGLVendor = 'Google Inc. (Apple)';
                fingerprintConfig.webGLRenderer = 'ANGLE (Apple, Apple M1, OpenGL 4.1)';
            }
            // Default Intel already set
        }
        this.logger.info(`Fingerprint profile: Locale=${fingerprintConfig.locale}, TZ=${fingerprintConfig.timezoneId}, WebGLVendor=${fingerprintConfig.webGLVendor.substring(0,30)}, WebGLRenderer=${fingerprintConfig.webGLRenderer.substring(0,30)}`);
        // --- End Fingerprint Configuration ---


        this.context = await this.browser.newContext({
            bypassCSP: true, ignoreHTTPSErrors: true,
            locale: fingerprintConfig.locale,
            timezoneId: fingerprintConfig.timezoneId,
            javaScriptEnabled: true, userAgent: fingerprintConfig.userAgent,
            geolocation: this.effectiveInput.proxyCountry === 'US' ? { latitude: 34.0522, longitude: -118.2437 } : // Geolocation can also be part of fingerprintConfig
                         this.effectiveInput.proxyCountry === 'GB' ? { latitude: 51.5074, longitude: 0.1278 } :
                         this.effectiveInput.proxyCountry === 'HU' ? { latitude: 47.4979, longitude: 19.0402 } : undefined,
            permissions: ['geolocation']
        });
        this.logger.info(`Browser context created with locale: ${fingerprintConfig.locale}, timezone: ${fingerprintConfig.timezoneId}`);

        if (this.effectiveInput.customAntiDetection) {
            await applyAntiDetectionScripts(this.context, this.logger, fingerprintConfig);
        }

        if (this.job.referer) {
            this.logger.info(`Setting referer: ${this.job.referer}`);
            await this.context.setExtraHTTPHeaders({ 'Referer': this.job.referer });
        }
        this.page = await this.context.newPage();
        this.logger.info('New page created.');
        
        // Optional: Listen to page console errors for more debug info
        this.page.on('console', msg => {
            if (msg.type() === 'error' || msg.type() === 'warn') {
                this.logger.debug(`PAGE_CONSOLE (${msg.type().toUpperCase()}): ${msg.text()}`);
            }
        });


        this.logger.info(`Navigating to: ${this.job.videoUrl}`);
        await this.page.goto(this.job.videoUrl, { waitUntil: 'load', timeout: this.effectiveInput.timeout * 1000 * 0.9 });
        this.logger.info('Navigation (load event) complete.');
        await this.page.waitForLoadState('networkidle', { timeout: this.effectiveInput.timeout * 1000 * 0.1 }).catch(e => (this.logger.warn || this.logger.warning).call(this.logger, `Page 'networkidle' state (post-load) timeout: ${e.message.split('\n')[0]}`));


        await handleYouTubeConsent(this.page, this.logger);
        await this.page.waitForTimeout(random(2000,4000));

        const duration = await getVideoDuration(this.page, this.logger);
        if (duration && Number.isFinite(duration) && duration > 0) {
            this.job.video_info.duration = duration;
        } else {
            this.logger.error(`CRITICAL: Could not determine a valid video duration after navigation. Found: ${duration}. Failing job early.`);
            throw new Error(`Could not determine valid video duration after navigation (got ${duration}).`);
        }

        try {
            if (await this.page.locator('.ytp-settings-button').first().isVisible({timeout: 10000})) {
                await this.page.click('.ytp-settings-button');
                await this.page.waitForTimeout(random(600, 1000));
                const qualityMenuItem = this.page.locator('.ytp-menuitem-label:has-text("Quality")').first();
                if (await qualityMenuItem.isVisible({timeout: 4000})) {
                    await qualityMenuItem.click();
                    await this.page.waitForTimeout(random(600, 1000));
                    const qualityOptionsElements = await this.page.locator('.ytp-quality-menu .ytp-menuitem').all();
                    if (qualityOptionsElements.length > 0) {
                        let lowestQualityOptionElement = qualityOptionsElements[qualityOptionsElements.length - 1];
                         const textContent = await lowestQualityOptionElement.textContent();
                         if (textContent && textContent.toLowerCase().includes('auto')) {
                             if (qualityOptionsElements.length > 1) lowestQualityOptionElement = qualityOptionsElements[qualityOptionsElements.length - 2];
                         }
                        await lowestQualityOptionElement.click();
                        this.logger.info(`Attempted to set video quality.`);
                    } else { (this.logger.warn || this.logger.warning).call(this.logger, 'No quality options found in menu.'); }
                    await this.page.waitForTimeout(random(400,700));
                } else { (this.logger.warn || this.logger.warning).call(this.logger, 'Quality menu item not found.'); }
                if (await this.page.locator('.ytp-settings-menu').isVisible({timeout:500})) {
                    await this.page.keyboard.press('Escape', {delay: random(100,300)});
                }
            } else { this.logger.info('Settings button not visible for quality adjustment.'); }
        } catch (e) {
            (this.logger.warn || this.logger.warning).call(this.logger, `Could not set video quality: ${e.message.split('\n')[0]}`);
            if (this.page && !this.page.isClosed() && await this.page.locator('.ytp-settings-menu').isVisible({timeout:500})) {
                 await this.page.keyboard.press('Escape').catch(()=>{});
            }
        }

        const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];
        this.logger.info('Initial attempt to ensure video is playing after setup...');
        const initialPlaySuccess = await this.ensureVideoPlaying(playButtonSelectors, 'initial-setup');
        if (initialPlaySuccess) {
            this.logger.info('Video seems to be playing after initial setup efforts.');
        } else {
            (this.logger.warn || this.logger.warning).call(this.logger, 'Video did not reliably start playing during initial setup. Watch loop will attempt further.');
        }

        await this.page.waitForTimeout(random(2000, 4500));
        return true;
    }

    async handleAds() {
        // this.logger.info('Checking for ads...'); // Called conditionally
        let adWasPlayingThisCheckCycle = false;
        const adPlayingInitially = await this.page.locator('.ytp-ad-player-overlay-instream-info, .video-ads .ad-showing').count() > 0;

        if (!adPlayingInitially) {
            // this.logger.debug('No ad detected at the start of this ad check cycle.');
            return false;
        }

        this.logger.info('Ad detected! Entering ad handling loop.');
        adWasPlayingThisCheckCycle = true;

        const adSkipCheckInterval = 1500;
        const maxAdWatchDuration = this.effectiveInput.maxSecondsAds * 1000;
        const adLoopStartTime = Date.now();

        while (Date.now() - adLoopStartTime < maxAdWatchDuration) {
            if (this.killed || this.page.isClosed()) break;

            const isAdStillPlaying = await this.page.locator('.ytp-ad-player-overlay-instream-info, .video-ads .ad-showing').count() > 0;
            if (!isAdStillPlaying) {
                this.logger.info('Ad finished or disappeared during handling loop.');
                break;
            }

            const canSkipModern = await this.page.locator('.ytp-ad-skip-button-modern').count() > 0;
            const canSkipLegacy = await this.page.locator('.ytp-ad-skip-button').count() > 0;
            const canSkip = canSkipModern || canSkipLegacy;
            
            const minSkipTimeMs = (this.effectiveInput.skipAdsAfter[0] || 0) * 1000; // Using the min from the array

            const skipSelector = canSkipModern ? '.ytp-ad-skip-button-modern' : '.ytp-ad-skip-button';

            if (this.effectiveInput.autoSkipAds && canSkip) {
                this.logger.info('AutoSkipAds: Attempting to skip ad.');
                if (await clickIfExists(this.page, skipSelector, 1000, this.logger)) {
                    await sleep(1500 + random(500));
                    break;
                }
            } else if (canSkip && (Date.now() - adLoopStartTime >= minSkipTimeMs)) {
                this.logger.info(`Ad skippable and min watch time met. Attempting skip.`);
                if (await clickIfExists(this.page, skipSelector, 1000, this.logger)) {
                    await sleep(1500 + random(500));
                    break;
                }
            }
            await sleep(adSkipCheckInterval);
        }
        if (Date.now() - adLoopStartTime >= maxAdWatchDuration && await this.page.locator('.ytp-ad-player-overlay-instream-info, .video-ads .ad-showing').count() > 0) {
             (this.logger.warn || this.logger.warning).call(this.logger, 'Max ad watch duration reached in ad handling loop, ad might still be playing.');
        }
        this.logger.info('Exiting ad handling loop.');
        return adWasPlayingThisCheckCycle;
    }


    async ensureVideoPlaying(playButtonSelectors, attemptType = 'general') { // Added attemptType for logging
        const logFn = (msg, level = 'info') => {
            const loggerMethod = this.logger[level] || (level === 'warn' && (this.logger.warning || this.logger.warn)) || this.logger.info;
            loggerMethod.call(this.logger, `[ensureVideoPlaying-${attemptType}] ${msg}`);
        };
        logFn('Ensuring video is playing (v4.2)...');

        for (let attempt = 0; attempt < 3; attempt++) {
            if (this.killed || this.page.isClosed()) return false;

            let isVideoElementPresent = await this.page.locator('video.html5-main-video').count() > 0;
            if (!isVideoElementPresent) {
                logFn('Video element not present on page.', 'warn');
                return false;
            }

            let videoState = await this.page.evaluate(() => {
                const v = document.querySelector('video.html5-main-video');
                return v ? { p: v.paused, rs: v.readyState, err: v.error ? {code: v.error.code, message: v.error.message} : null } : { p: true, rs: 0, err: null };
            }).catch((e) => {
                logFn(`Eval to get video state failed: ${e.message}`, 'warn');
                return { p: true, rs: 0, err: {message: "Eval failed to get video state"} };
            });

            if (videoState.err && videoState.err.code) {
                logFn(`Video element has an error: Code ${videoState.err.code || 'N/A'}, Msg: ${videoState.err.message || 'N/A'}. Attempt ${attempt + 1}`, 'warn');
                // MEDIA_ERR_NETWORK = 2, MEDIA_ERR_DECODE = 3. These might be fatal for the current attempt.
                if ((videoState.err.code === 2 || videoState.err.code === 3) && attempt > 0) { // More aggressive on later attempts
                    logFn(`Potentially fatal media error detected (Code: ${videoState.err.code}). Stopping play attempts for this ensureVideoPlaying cycle.`, 'error');
                    return false;
                }
            }

            // readyState: 0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA
            if (!videoState.p && videoState.rs >= 3 /* HAVE_FUTURE_DATA */) {
                logFn(`Video is already playing (attempt ${attempt + 1}).`);
                return true;
            }
            
            logFn(`Video state (attempt ${attempt + 1}): Paused=${videoState.p}, ReadyState=${videoState.rs}. Trying strategies...`);

            if (videoState.rs < 2 /* HAVE_METADATA */ && attempt > 0) { // If not even metadata is loaded after first try, wait longer
                logFn(`Video readyState is ${videoState.rs} (less than HAVE_METADATA/HAVE_CURRENT_DATA). Waiting before retry.`, 'debug');
                await sleep(1500 + attempt * 500);
            }


            try {
                await this.page.evaluate(() => {
                    const video = document.querySelector('video.html5-main-video');
                    if (video && video.paused) {
                        console.log('[In-Page Eval] ensureVideoPlaying: Attempting video.play()');
                        video.play().catch(e => console.warn('[In-Page Eval] video.play() promise rejected:', e.message));
                    }
                });
                await sleep(1200 + random(300));
                videoState = await this.page.evaluate(() => {const v = document.querySelector('video.html5-main-video'); return v ? { p: v.paused, rs: v.readyState } : {p:true, rs:0}; }).catch(()=>({p:true, rs:0}));
                if (!videoState.p && videoState.rs >=3) { logFn(`Video playing after JS play() (attempt ${attempt + 1}).`); return true; }
            } catch (e) { logFn(`JS play() eval error: ${e.message.split('\n')[0]}`, 'debug'); }

            for (const selector of playButtonSelectors) {
                if (await clickIfExists(this.page, selector, 1500, this.logger)) { // logger passed to clickIfExists
                    logFn(`Clicked potential play button: ${selector}`);
                    await sleep(1200 + random(300)); // Wait for action to take effect
                    videoState = await this.page.evaluate(() => {const v = document.querySelector('video.html5-main-video'); return v ? { p: v.paused, rs: v.readyState } : {p:true, rs:0}; }).catch(()=>({p:true, rs:0}));
                    if (!videoState.p && videoState.rs >=3) { logFn('Video playing after play button click.'); return true;}
                }
            }

            if (videoState.p) { // If still paused, try clicking the player area
                const playerLocators = ['video.html5-main-video', '.html5-video-player', '#movie_player'];
                for (const playerSelector of playerLocators) {
                    try {
                        const playerElement = this.page.locator(playerSelector).first();
                        if (await playerElement.isVisible({timeout: 1000})) {
                            logFn(`Clicking player area ('${playerSelector}').`);
                            await playerElement.click({ timeout: 1500, force: true }); // Force true as a last resort for player area
                            await sleep(1200 + random(300));
                            videoState = await this.page.evaluate(() => {const v = document.querySelector('video.html5-main-video'); return v ? { p: v.paused, rs: v.readyState } : {p:true, rs:0}; }).catch(()=>({p:true, rs:0}));
                            if (!videoState.p && videoState.rs >=3) {
                                logFn(`Video playing after clicking player area ('${playerSelector}').`);
                                return true;
                            }
                            break; // Only try one player area click strategy
                        }
                    } catch (e) { logFn(`Player area click ('${playerSelector}') error: ${e.message.split('\n')[0]}`, 'debug'); }
                 }
            }
            if (attempt < 2) await sleep(1500 + attempt * 500); // Longer sleep if attempts fail
        }
        logFn('Failed to ensure video is playing after multiple attempts.', 'warn');
        return false;
    }

    async watchVideo() {
        if (!this.page || this.page.isClosed()) throw new Error('Page not initialized/closed for watching.');

        const videoDurationSeconds = this.job.video_info.duration;
        const targetWatchPercentage = this.effectiveInput.watchTimePercentage;
        const targetVideoPlayTimeSeconds = Math.max(10, (targetWatchPercentage / 100) * videoDurationSeconds);
        const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];

        this.logger.info(`Watch target: ${targetWatchPercentage}% of ${videoDurationSeconds.toFixed(0)}s = ${targetVideoPlayTimeSeconds.toFixed(0)}s. URL: ${this.job.videoUrl}`);

        const overallWatchStartTime = Date.now();
        const maxOverallWatchDurationMs = this.effectiveInput.timeout * 1000 * 0.90;
        const checkIntervalMs = 1000; 

        let consecutiveStallChecks = 0;
        const MAX_STALL_CHECKS_BEFORE_RECOVERY = 2; // As before, or tune
        let recoveryAttemptsThisJob = 0;
        const MAX_RECOVERY_ATTEMPTS_PER_JOB = 2; // Increased to allow reload, then navigate away

        let lastProgressTimestamp = Date.now();
        let lastKnownGoodVideoTime = 0;
        this.maxTimeReachedThisView = 0;
        let currentActualVideoTime = 0;
        this.lastLoggedVideoTime = -1;

        let adCheckCooldownMs = 0;
        const AD_CHECK_INTERVAL_WHEN_NO_AD = 5000;
        const AD_CHECK_INTERVAL_DURING_AD = 1500;


        while (!this.killed) {
            const loopIterationStartTime = Date.now();
            const loopNumber = Math.floor((Date.now() - overallWatchStartTime) / checkIntervalMs);

            if (this.page.isClosed()) { (this.logger.warn || this.logger.warning).call(this.logger, 'Page closed during watch loop.'); break; }
            if (Date.now() - overallWatchStartTime > maxOverallWatchDurationMs) {
                (this.logger.warn || this.logger.warning).call(this.logger, 'Max watch duration for this video exceeded. Ending.'); break;
            }

            if (Date.now() >= adCheckCooldownMs) {
                this.logger.debug('Checking for ads...');
                const adPlayed = await this.handleAds();
                if (adPlayed) {
                    adCheckCooldownMs = Date.now() + AD_CHECK_INTERVAL_DURING_AD;
                    lastProgressTimestamp = Date.now(); // Reset stall timers as ad was playing
                    lastKnownGoodVideoTime = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime || 0).catch(() => lastKnownGoodVideoTime);
                    consecutiveStallChecks = 0;
                    this.logger.info('Ad cycle handled, resetting stall detection and allowing video to buffer/resume.');
                    await sleep(1000 + random(500)); 
                } else {
                    adCheckCooldownMs = Date.now() + AD_CHECK_INTERVAL_WHEN_NO_AD;
                }
            }
            
            let videoState = null;
            let isStalledThisCheck = false; // Initialize here

            try {
                videoState = await this.page.evaluate(() => {
                    const v = document.querySelector('video.html5-main-video');
                    if (!v) return { currentTime: 0, paused: true, ended: true, readyState: 0, networkState: 3, error: null }; // networkState 3 = NETWORK_NO_SOURCE
                    return {
                        ct: v.currentTime, p: v.paused, e: v.ended,
                        rs: v.readyState, ns: v.networkState,
                        error: v.error ? { code: v.error.code, message: v.error.message } : null
                    };
                });
                if (!videoState) {
                    (this.logger.warn || this.logger.warning).call(this.logger, 'Video element not found in evaluate. Trying to recover or will stall.');
                    await sleep(2000);
                    if (!(await this.page.locator('video.html5-main-video').count() > 0)) {
                        throw new Error('Video element disappeared definitively.');
                    }
                    isStalledThisCheck = true; // Treat as stall if element was temporarily gone
                 } else {
                    currentActualVideoTime = videoState.ct || 0;
                    if (currentActualVideoTime > this.maxTimeReachedThisView) {
                        this.maxTimeReachedThisView = currentActualVideoTime;
                    }
                    
                    // Logging video state
                    const videoPlaying = !videoState.p && videoState.rs >= 3 && !videoState.e;
                    if (videoPlaying) {
                        if (currentActualVideoTime > this.lastLoggedVideoTime + 4.5 || this.lastLoggedVideoTime < 0) { 
                            this.logger.info(`Video playing at ${currentActualVideoTime.toFixed(1)}s (max: ${this.maxTimeReachedThisView.toFixed(1)}s) RS:${videoState.rs} NS:${videoState.ns}`);
                            this.lastLoggedVideoTime = currentActualVideoTime;
                        } else {
                            this.logger.debug(`Video playing at ${currentActualVideoTime.toFixed(1)}s`);
                        }
                    } else if (videoState.p && !videoState.e) {
                        this.logger.info(`Video PAUSED at ${currentActualVideoTime.toFixed(1)}s. RS:${videoState.rs} NS:${videoState.ns}. Will attempt to resume.`);
                        this.lastLoggedVideoTime = -1;
                    } else {
                         this.logger.debug(`VidState: time=${currentActualVideoTime.toFixed(1)}, maxReached=${this.maxTimeReachedThisView.toFixed(1)}, p=${videoState.p}, e=${videoState.e}, rs=${videoState.rs}, ns=${videoState.ns}, err=${videoState.error?.code}`);
                    }

                    if (videoState.error && videoState.error.code) {
                        this.logger.error(`Video player error: Code ${videoState.error.code}, Msg: ${videoState.error.message}.`);
                        // If MEDIA_ERR_NETWORK (2) and recovery attempts available, treat as stall
                        if (videoState.error.code === 2 && recoveryAttemptsThisJob < MAX_RECOVERY_ATTEMPTS_PER_JOB) {
                            this.logger.warn("Network error in player (code 2), will trigger recovery.");
                            isStalledThisCheck = true;
                        } else {
                           throw new Error(`Video Player Error Code ${videoState.error.code}: ${videoState.error.message}`);
                        }
                    }
                    
                    // Stall detection logic
                    if (!isStalledThisCheck) { // Only check for stalls if not already flagged by error
                        if (!videoState.p && videoState.rs >= 2) { // Playing or buffering enough to play
                            if (Math.abs(currentActualVideoTime - lastKnownGoodVideoTime) < 0.8 && (Date.now() - lastProgressTimestamp) > 10000) { // 10s no progress
                                isStalledThisCheck = true;
                            } else if (currentActualVideoTime > lastKnownGoodVideoTime + 0.2) { // Progress made
                                lastKnownGoodVideoTime = currentActualVideoTime;
                                lastProgressTimestamp = Date.now();
                                consecutiveStallChecks = 0; // Reset stall count on progress
                            }
                        } else if (videoState.p) { // If paused, reset stall timer
                            lastProgressTimestamp = Date.now();
                        }
                    }


                    if (videoState.rs === 0 && currentActualVideoTime < 5 && (Date.now() - overallWatchStartTime > 20000)) {
                         (this.logger.warn || this.logger.warning).call(this.logger, `Critical Stall: readyState is 0 (HAVE_NOTHING) and video time < 5s after 20s. CT: ${currentActualVideoTime.toFixed(1)}`);
                         isStalledThisCheck = true;
                    }
                 }


                if (isStalledThisCheck) {
                    consecutiveStallChecks++;
                    (this.logger.warn || this.logger.warning).call(this.logger, `Playback stalled. CT: ${currentActualVideoTime.toFixed(1)}, LastGood: ${lastKnownGoodVideoTime.toFixed(1)}. Stalls: ${consecutiveStallChecks}. RS: ${videoState?.rs}, NS: ${videoState?.ns}`);
                    
                    if (Actor.isAtHome && typeof Actor.isAtHome === 'function' && Actor.isAtHome()) {
                        try {
                            const stallTime = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '_');
                            const screenshotKey = `STALL_SCREENSHOT_${this.job.videoId}_${this.id.substring(0,8)}_${stallTime}`;
                            this.logger.info(`Taking screenshot due to stall: ${screenshotKey}`);
                            const screenshotBuffer = await this.page.screenshot({ fullPage: true, timeout: 15000 });
                            if (Actor.setValue && typeof Actor.setValue === 'function') {
                                await Actor.setValue(screenshotKey, screenshotBuffer, { contentType: 'image/png' });
                                this.logger.info(`Screenshot saved: ${screenshotKey}`);
                            }
                        } catch (screenshotError) { this.logger.error(`Failed to take or save stall screenshot: ${screenshotError.message}`); }
                        
                        // Attempt to get browser console messages
                        try {
                            const browserConsoleMessages = await this.page.evaluate(() => {
                                if (typeof window.capturedConsoleMessages === 'undefined') window.capturedConsoleMessages = [];
                                return window.capturedConsoleMessages.slice(-10); // Get last 10, assumes page.on('console') is populating this
                            });
                            if (browserConsoleMessages && browserConsoleMessages.length > 0) {
                                this.logger.warn('Recent browser console messages during stall/error:', browserConsoleMessages);
                            }
                        } catch(e) {this.logger.debug("Could not get recent browser console messages via evaluate.");}

                    }
                    const somethingWrongLocator = this.page.locator('text=/Something went wrong/i, text=/An error occurred/i, .ytp-error-content');
                    try {
                        if (await somethingWrongLocator.first().isVisible({ timeout: 1000 })) {
                            (this.logger.warn || this.logger.warning).call(this.logger, 'CONFIRMED: "Something went wrong" or similar error message visible on player.');
                        }
                    } catch (e) { /* ignore if not visible */ }


                    if (consecutiveStallChecks >= MAX_STALL_CHECKS_BEFORE_RECOVERY) {
                        recoveryAttemptsThisJob++;
                        consecutiveStallChecks = 0; // Reset for next recovery stage if this one fails
                        (this.logger.warn || this.logger.warning).call(this.logger, `Stalled. Attempting recovery ${recoveryAttemptsThisJob}/${MAX_RECOVERY_ATTEMPTS_PER_JOB}...`);
                        
                        let recoveryActionSuccess = false;
                        if (recoveryAttemptsThisJob === 1) {
                            this.logger.info('Recovery 1: Attempting page reload.');
                            await this.page.reload({ waitUntil: 'load', timeout: this.effectiveInput.timeout * 1000 * 0.6 }).catch(e => {
                                this.logger.error(`Page reload failed: ${e.message}`); throw e;
                            });
                            recoveryActionSuccess = true;
                        } else if (recoveryAttemptsThisJob === 2) {
                            this.logger.info('Recovery 2: Attempting navigate to about:blank and back.');
                            const currentUrl = this.job.videoUrl;
                            try {
                                await this.page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 10000 });
                                await sleep(random(1000, 2000));
                                await this.page.goto(currentUrl, { waitUntil: 'load', timeout: this.effectiveInput.timeout * 1000 * 0.6 });
                                recoveryActionSuccess = true;
                            } catch (navError) {
                                this.logger.error(`Error during navigate-away recovery: ${navError.message}`);
                                throw new Error('Recovery by navigation failed.'); // This will break and fail the job
                            }
                        } else {
                            this.logger.error('Video stalled and all recovery attempts exhausted. Failing job.');
                            throw new Error('Video stalled/player error, all recovery attempts exhausted.');
                        }

                        if (recoveryActionSuccess) {
                            this.logger.info('Page re-navigated/reloaded. Re-handling consent & playback...');
                            await handleYouTubeConsent(this.page, this.logger);
                            await sleep(random(1000,2500)); // Extra pause after consent/reload
                            const playSuccess = await this.ensureVideoPlaying(playButtonSelectors, `recovery-${recoveryAttemptsThisJob}`);
                             if (!playSuccess) {
                                 this.logger.error(`Recovery attempt ${recoveryAttemptsThisJob} failed to restart playback after action.`);
                                 // For first recovery, allow it to try the second one. For second, throw.
                                 if (recoveryAttemptsThisJob >= MAX_RECOVERY_ATTEMPTS_PER_JOB) {
                                     throw new Error(`Recovery attempt ${recoveryAttemptsThisJob} failed to restart playback.`);
                                 }
                                 // If recovery 1 fails to play, it will loop and potentially try recovery 2
                             } else {
                                 this.logger.info(`Playback seems to have resumed after recovery ${recoveryAttemptsThisJob}.`);
                             }
                            // Reset state for watch loop after recovery action
                            lastKnownGoodVideoTime = 0; this.maxTimeReachedThisView = 0;
                            currentActualVideoTime = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime || 0).catch(()=>0);
                            lastKnownGoodVideoTime = currentActualVideoTime; this.maxTimeReachedThisView = currentActualVideoTime;
                            lastProgressTimestamp = Date.now(); this.lastLoggedVideoTime = -1;
                            this.logger.info(`State after recovery ${recoveryAttemptsThisJob} action: CT: ${currentActualVideoTime.toFixed(1)}s`);
                            continue; // Continue the main watch loop
                        }
                    }
                } else { // No stall this check
                    consecutiveStallChecks = 0; // Reset if not stalled
                }
            } catch (e) {
                if (e.message.includes('Target closed') || e.message.includes('Protocol error')) {
                    (this.logger.warn || this.logger.warning).call(this.logger, `Watch loop error (Target closed/Protocol): ${e.message}`); throw e;
                }
                 (this.logger.warn || this.logger.warning).call(this.logger, `Video state eval/check error: ${e.message.split('\n')[0]}`);
                 if (e.message.includes('all recovery attempts exhausted') || e.message.includes('Recovery by navigation failed')) throw e;
                 // For other errors, try to continue or let stall detection catch it
                 await sleep(checkIntervalMs); continue;
            }
            
            if (videoState && videoState.p && !videoState.e && this.maxTimeReachedThisView < targetVideoPlayTimeSeconds) {
                await this.ensureVideoPlaying(playButtonSelectors, 'paused-resume');
            }
            
            if (videoState && videoState.e) { this.logger.info('Video playback naturally ended.'); break; }
            if (this.maxTimeReachedThisView >= targetVideoPlayTimeSeconds) {
                this.logger.info(`Target watch time reached. Max Reached: ${this.maxTimeReachedThisView.toFixed(1)}s`); break;
            }
            
            // Interaction logic (largely unchanged, ensure it uses this.logger)
            const interactionRandom = Math.random(); // More randomness for interactions
            if (loopNumber % 3 === 0 && interactionRandom < 0.7) { // ~70% chance every 3 loops
                 try {
                    const videoElement = this.page.locator('video.html5-main-video').first();
                    if (await videoElement.isVisible({timeout:500})) {
                        await videoElement.hover({timeout: 1000, force: false}).catch(e => this.logger.debug(`Hover error (non-critical): ${e.message}`));
                        await sleep(100 + random(100));
                        const boundingBox = await videoElement.boundingBox();
                        if (boundingBox) {
                             await this.page.mouse.move(
                                 boundingBox.x + random(Math.floor(boundingBox.width * 0.1), Math.floor(boundingBox.width * 0.9)),
                                 boundingBox.y + random(Math.floor(boundingBox.height * 0.1), Math.floor(boundingBox.height * 0.9)),
                                 {steps:random(3,8)}
                             );
                        }
                        this.logger.debug('Simulated mouse hover and move over video.');
                    }
                 } catch(e) {this.logger.debug(`Minor interaction simulation error (mouse move): ${e.message.split('\n')[0]}. Ignoring.`);}
            }
             if (loopNumber % 7 === 0 && interactionRandom < 0.5) { // ~50% chance every 7 loops
                try {
                    const settingsButton = this.page.locator('.ytp-settings-button').first();
                    if (await settingsButton.isVisible({timeout: 300})) {
                        await settingsButton.hover({timeout: 300, force: false}).catch(e => this.logger.debug(`Settings hover error: ${e.message}`));
                        this.logger.debug('Simulated hover on settings button.');
                        await sleep(100 + random(100));
                        const vp = this.page.viewportSize();
                        if (vp) await this.page.mouse.move(random(vp.width * 0.1, vp.width * 0.9), random(0, vp.height * 0.1), {steps: 2});
                    }
                } catch (e) {this.logger.debug(`Minor settings hover interaction error: ${e.message.split('\n')[0]}`);}
            }
             if (loopNumber % 11 === 0 && interactionRandom < 0.3) { // ~30% chance every 11 loops
                 try {
                    const videoElementToClick = this.page.locator('video.html5-main-video').first(); // or #movie_player for broader area
                     if (await videoElementToClick.isVisible({timeout:300})) {
                        await videoElementToClick.focus().catch(e => this.logger.debug(`Focus error: ${e.message}`));
                        await videoElementToClick.click({timeout: 300, position: {x: random(10,50), y: random(10,50)}, delay: random(50,150), force: false }).catch(e => this.logger.debug(`Minor click error: ${e.message}`));
                        this.logger.debug('Simulated click on video player area.');
                    }
                 } catch(e) {this.logger.debug(`Minor video area click error: ${e.message.split('\n')[0]}`); }
            }
            if (loopNumber % 13 === 0 && videoState && !videoState.p && videoState.rs >=3 && interactionRandom < 0.2) { // ~20% chance to pause/play via space
                try {
                    await this.page.locator('body').press('Space');
                    this.logger.debug('Simulated Spacebar press (pause).');
                    await sleep(random(700,1800));
                    // Re-check state before pressing space again, in case it ended or errored
                    const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? { p: v.paused, e: v.ended } : { p: true, e: true}; }).catch(()=> ({p:true, e:true}));
                    if (tempState.p && !tempState.e) { // If it's paused and not ended
                        await this.page.locator('body').press('Space');
                        this.logger.debug('Simulated Spacebar press (play).');
                        this.lastLoggedVideoTime = -1;
                    } else {
                        this.logger.debug('Skipped second spacebar press as video was not in a suitable state.');
                    }
                } catch(e) {this.logger.debug(`Spacebar press error: ${e.message.split('\n')[0]}`)}
            }

            await sleep(Math.max(0, checkIntervalMs - (Date.now() - loopIterationStartTime)));
        }
        const actualOverallWatchDurationMs = Date.now() - overallWatchStartTime;
        this.logger.info(`Finished watch. Total loop: ${(actualOverallWatchDurationMs / 1000).toFixed(1)}s. Max video time reached: ${this.maxTimeReachedThisView.toFixed(1)}s.`);
        return {
            actualOverallWatchDurationMs,
            lastReportedVideoTimeSeconds: this.maxTimeReachedThisView,
            targetVideoPlayTimeSeconds
        };
    }

    async kill() {
        this.killed = true;
        this.logger.info('Kill signal. Closing resources.');
        if (this.page && !this.page.isClosed()) { await this.page.close().catch(e => (this.logger.warn || this.logger.warning).call(this.logger, `Page close error: ${e.message}`)); }
        this.page = null;
        if (this.context) { await this.context.close().catch(e => (this.logger.warn || this.logger.warning).call(this.logger, `Context close error: ${e.message}`)); }
        this.context = null;
        if (this.browser) { await this.browser.close().catch(e => (this.logger.warn || this.logger.warning).call(this.logger, `Browser close error: ${e.message}`)); }
        this.browser = null;
        this.logger.info('Resources closed.');
    }
}

// --- Main Actor Logic ---
async function actorMainLogic() {
    console.log('DEBUG: actorMainLogic started.');
    let actorLog;

    try {
        await Actor.init();
        console.log('DEBUG: Actor.init() completed successfully.');

        if (Actor.log && typeof Actor.log.info === 'function') {
            actorLog = Actor.log;
            console.log('INFO: Logger obtained successfully via standard Actor.log. Testing it...');
            actorLog.info('DEBUG: Standard Actor.log test successful.');
        } else {
            console.warn('DEBUG: Standard Actor.log was undefined or invalid. Attempting fallback via _instance...');
            if (Actor._instance && Actor._instance.apifyClient && Actor._instance.apifyClient.logger && typeof Actor._instance.apifyClient.logger.info === 'function') {
                actorLog = Actor._instance.apifyClient.logger;
                console.log('INFO: Successfully obtained logger from Actor._instance.apifyClient.logger. Testing it...');
                actorLog.info('DEBUG: Logger obtained via Actor._instance.apifyClient.logger and tested.');
            } else {
                console.error('CRITICAL DEBUG: Could not obtain logger from Actor.log OR Actor._instance.apifyClient.logger. Dumping Actor object:');
                console.dir(Actor, { depth: 3 });
                throw new Error("All attempts to obtain a valid Apify logger failed.");
            }
        }
    } catch (initError) {
        console.error('CRITICAL DEBUG: Actor.init() FAILED or subsequent logger acquisition failed:', initError);
        if (Actor && Actor.isAtHome && typeof Actor.isAtHome === 'function' && Actor.fail && typeof Actor.fail === 'function') {
            try { await Actor.fail(`Actor.init() or logger acquisition failed: ${initError.message}`); }
            catch (failError) { console.error('CRITICAL DEBUG: Actor.fail() also failed:', failError); }
        }
        process.exit(1);
    }

    if (!actorLog || typeof actorLog.info !== 'function' || !(typeof actorLog.warn === 'function' || typeof actorLog.warning === 'function')) {
        console.error('CRITICAL DEBUG: actorLog is STILL UNDEFINED or not a valid logger after all attempts!');
        const fallbackLogger = getSafeLogger(undefined);
        fallbackLogger.error("actorMainLogic: Using fallback logger because all attempts to get Apify logger failed (final check).");
        if (typeof Actor.fail === 'function') { await Actor.fail("Apify logger could not be initialized (final check)."); }
        else { console.error("CRITICAL: Actor.fail is not available. Exiting."); process.exit(1); }
        return;
    }
    if (typeof actorLog.warn !== 'function' && typeof actorLog.warning === 'function') {
        actorLog.warn = actorLog.warning;
    }

    actorLog.info('ACTOR_MAIN_LOGIC: Starting YouTube View Bot (Custom Playwright with Stealth & Integrated Logic - v1.1 Gemini Updates).');
    const input = await Actor.getInput();
    if (!input) {
        actorLog.error('ACTOR_MAIN_LOGIC: No input provided.');
        await Actor.fail('No input provided.');
        return;
    }
    actorLog.info('ACTOR_MAIN_LOGIC: Actor input received.');
    actorLog.debug('Raw input object:', input);

    const defaultInputFromSchema = {
        videoUrls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
        watchTypes: ['direct'], refererUrls: [''], searchKeywordsForEachVideo: ['funny cat videos, cute kittens'],
        watchTimePercentage: 80, useProxies: true, proxyUrls: [], proxyCountry: 'US', proxyGroups: ['RESIDENTIAL'],
        headless: true,
        concurrency: 1, concurrencyInterval: 5, timeout: 120, maxSecondsAds: 15,
        skipAdsAfter: ["5", "10"], // Array of strings or numbers
        autoSkipAds: true, stopSpawningOnOverload: true, // stopSpawning not directly used here, Apify handles concurrency
        customAntiDetection: true,
    };
    const effectiveInput = { ...defaultInputFromSchema, ...input };

    // Parse skipAdsAfter more robustly
    let tempSkipAds = effectiveInput.skipAdsAfter;
    if (Array.isArray(tempSkipAds) && tempSkipAds.length > 0 && tempSkipAds.every(s => typeof s === 'string' || typeof s === 'number')) {
        const parsedSkipAds = tempSkipAds.map(s => parseInt(String(s), 10)).filter(n => !isNaN(n) && n >= 0);
        if (parsedSkipAds.length === 1) effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[0] + 5]; // Ensure it's an array of two
        else if (parsedSkipAds.length >= 2) effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[1]];
        else effectiveInput.skipAdsAfter = [5, 12]; // Fallback if parsing fails or empty
    } else { // If not an array or invalid format
        effectiveInput.skipAdsAfter = [5, 12]; // Default
    }
     // Allow direct min/max override if provided (as in original logic)
    if (typeof input.skipAdsAfterMinSeconds === 'number' && typeof input.skipAdsAfterMaxSeconds === 'number' &&
        !isNaN(input.skipAdsAfterMinSeconds) && !isNaN(input.skipAdsAfterMaxSeconds) &&
        input.skipAdsAfterMinSeconds >= 0 && input.skipAdsAfterMaxSeconds >=0) {
        effectiveInput.skipAdsAfter = [
            input.skipAdsAfterMinSeconds,
            Math.max(input.skipAdsAfterMinSeconds, input.skipAdsAfterMaxSeconds)
        ];
    }
    if (effectiveInput.skipAdsAfter[0] > effectiveInput.skipAdsAfter[1]) { // Ensure min <= max
        effectiveInput.skipAdsAfter[1] = effectiveInput.skipAdsAfter[0] + 5;
    }
    effectiveInput.maxSecondsAds = Number(effectiveInput.maxSecondsAds);
    if(isNaN(effectiveInput.maxSecondsAds) || effectiveInput.maxSecondsAds < 0) {
        effectiveInput.maxSecondsAds = 15; // Default
    }


    actorLog.info('ACTOR_MAIN_LOGIC: Effective input (summary):', { videos: effectiveInput.videoUrls.length, proxy: effectiveInput.proxyCountry, headless: effectiveInput.headless, watchPercent: effectiveInput.watchTimePercentage, customAntiDetect: effectiveInput.customAntiDetection, skipAdsAfter: effectiveInput.skipAdsAfter, maxSecondsAds: effectiveInput.maxSecondsAds });

    if (!effectiveInput.videoUrls || effectiveInput.videoUrls.length === 0) {
        actorLog.error('No videoUrls provided in input.');
        await Actor.fail('No videoUrls provided in input.');
        return;
    }

    let actorProxyConfiguration = null;
    if (effectiveInput.useProxies && !(effectiveInput.proxyUrls && effectiveInput.proxyUrls.length > 0) ) {
        const proxyOpts = { groups: effectiveInput.proxyGroups || ['RESIDENTIAL'] };
        if (effectiveInput.proxyCountry && effectiveInput.proxyCountry.trim() !== "" && effectiveInput.proxyCountry.toUpperCase() !== "ANY") {
            proxyOpts.countryCode = effectiveInput.proxyCountry;
        }
        try {
            actorProxyConfiguration = await Actor.createProxyConfiguration(proxyOpts);
            actorLog.info(`Apify Proxy: Country=${proxyOpts.countryCode || 'Any'}, Groups=${(proxyOpts.groups || []).join(', ')}`);
        } catch (e) { actorLog.error(`Failed Apify Proxy config: ${e.message}.`); actorProxyConfiguration = null; }
    }

    const jobs = [];
    const userAgentStringsForSearch = [ // Keep a separate, potentially more common list for search
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0'
    ];

    for (let i = 0; i < effectiveInput.videoUrls.length; i++) {
        const url = effectiveInput.videoUrls[i];
        const videoId = extractVideoIdFromUrl(url, actorLog);
        if (!videoId) { (actorLog.warn || actorLog.warning).call(actorLog, `Invalid YouTube URL/ID: "${url}". Skipping.`); await Actor.pushData({ url, status: 'error', error: 'Invalid YouTube URL' }); continue; }

        const watchType = (effectiveInput.watchTypes && effectiveInput.watchTypes[i]) || 'direct';
        const refererUrl = (watchType === 'referer' && effectiveInput.refererUrls && effectiveInput.refererUrls[i] && effectiveInput.refererUrls[i].trim() !== "")
            ? effectiveInput.refererUrls[i].trim()
            : null;

        let searchKeywords = [];
        if (watchType === 'search' && effectiveInput.searchKeywordsForEachVideo && typeof effectiveInput.searchKeywordsForEachVideo[i] === 'string') {
            searchKeywords = effectiveInput.searchKeywordsForEachVideo[i].split(',').map(kw => kw.trim()).filter(kw => kw.length > 0);
        }

        jobs.push({
            id: uuidv4(), videoUrl: url, videoId, platform: 'youtube',
            referer: refererUrl, video_info: { duration: 300, isLive: false }, // duration will be updated
            watch_time: effectiveInput.watchTimePercentage, jobIndex: i,
            watchType, searchKeywords
        });
    }

    if (jobs.length === 0) { actorLog.error('No valid jobs.'); await Actor.fail('No valid jobs.'); return; }
    actorLog.info(`ACTOR_MAIN_LOGIC: Created ${jobs.length} job(s). Concurrency: ${effectiveInput.concurrency}`);

    const overallResults = { totalJobs: jobs.length, successfulJobs: 0, failedJobs: 0, details: [], startTime: new Date().toISOString() };
    const activeWorkers = new Set();
    let jobCounter = 0;

    const processJob = async (job) => {
        const jobLogger = actorLog.child({ prefix: `Job-${job.videoId.substring(0,4)}-${job.id.substring(0,4)}: ` });
        if (typeof jobLogger.warn !== 'function' && typeof jobLogger.warning === 'function') {
            jobLogger.warn = jobLogger.warning;
        }

        jobLogger.info(`Starting job ${job.jobIndex + 1}/${jobs.length}, Type: ${job.watchType}, Referer: ${job.referer || 'None'}`);
        let proxyUrlString = null;
        let proxyInfoForLog = 'None';

        if (effectiveInput.useProxies) {
            if (effectiveInput.proxyUrls && effectiveInput.proxyUrls.length > 0) {
                proxyUrlString = effectiveInput.proxyUrls[job.jobIndex % effectiveInput.proxyUrls.length];
                proxyInfoForLog = `CustomProxy: ${proxyUrlString.split('@').pop().split(':')[0]}`; // Basic obfuscation
                jobLogger.info(`Using custom proxy: ${proxyInfoForLog}`);
            } else if (actorProxyConfiguration) {
                const sessionId = `session_${job.id.substring(0, 12).replace(/-/g, '')}`;
                try {
                    proxyUrlString = await actorProxyConfiguration.newUrl(sessionId);
                    proxyInfoForLog = `ApifyProxy (Session: ${sessionId}, Country: ${effectiveInput.proxyCountry || 'Any'})`; // Proxy country from effectiveInput
                     jobLogger.info(`Using Apify proxy: ${proxyInfoForLog}`);
                } catch (proxyError) {
                    jobLogger.error(`Failed to get new Apify proxy URL: ${proxyError.message}`);
                    proxyUrlString = null; proxyInfoForLog = 'ProxyAcquisitionFailed';
                }
            } else { jobLogger.warn(`Proxies enabled but no configuration (Apify or custom list) found.`); }
        }

        if (job.watchType === 'search' && job.searchKeywords && job.searchKeywords.length > 0) {
            jobLogger.info(`Attempting YouTube search for: "${job.searchKeywords.join(', ')}" to find ID: ${job.videoId}`);
            let searchBrowser = null, searchContext = null, searchPage = null;
            const searchLaunchOptions = { headless: effectiveInput.headless, args: [...ANTI_DETECTION_ARGS] };
            if(proxyUrlString) { // Use the same proxy for search if available
                try {
                    const p = new URL(proxyUrlString);
                    searchLaunchOptions.proxy = { server: `${p.protocol}//${p.hostname}:${p.port}`, username: p.username?decodeURIComponent(p.username):undefined, password: p.password?decodeURIComponent(p.password):undefined };
                } catch(e){ jobLogger.warn('Failed to parse proxy for search browser, search will be direct if proxy string invalid.'); }
            }
            try {
                const searchUserAgent = userAgentStringsForSearch[random(userAgentStringsForSearch.length-1)];
                searchBrowser = await chromium.launch(searchLaunchOptions);
                
                // For search, a simpler fingerprint might be okay, or reuse the main logic.
                // Here, just setting UA and basic context.
                const searchFingerprintConfig = { // Simplified for search
                    locale: effectiveInput.proxyCountry === 'GB' ? 'en-GB' : effectiveInput.proxyCountry === 'HU' ? 'hu-HU' : 'en-US',
                    timezoneId: effectiveInput.proxyCountry === 'GB' ? 'Europe/London' : effectiveInput.proxyCountry === 'HU' ? 'Europe/Budapest' : 'America/New_York',
                    webGLVendor: 'Google Inc. (Intel)', // Generic for search
                    webGLRenderer: 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 640, OpenGL 4.1)',
                    userAgent: searchUserAgent,
                    proxyCountry: effectiveInput.proxyCountry
                };

                searchContext = await searchBrowser.newContext({ 
                    userAgent: searchFingerprintConfig.userAgent,
                    locale: searchFingerprintConfig.locale,
                    timezoneId: searchFingerprintConfig.timezoneId
                });

                if (effectiveInput.customAntiDetection) { // Apply anti-detection to search context too
                    await applyAntiDetectionScripts(searchContext, jobLogger.child({prefix: 'SearchAntiDetect: '}), searchFingerprintConfig);
                }

                searchPage = await searchContext.newPage();

                const searchQuery = job.searchKeywords[random(job.searchKeywords.length - 1)];
                const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
                jobLogger.info(`Navigating to search URL: ${youtubeSearchUrl}`);
                await searchPage.goto(youtubeSearchUrl, { waitUntil: 'domcontentloaded', timeout: effectiveInput.timeout * 1000 * 0.8 }); // Shorter timeout for search
                await handleYouTubeConsent(searchPage, jobLogger.child({prefix: 'SearchConsent: '}));

                const videoLinkSelector = `a#video-title[href*="/watch?v=${job.videoId}"]`;
                jobLogger.info(`Looking for video link: ${videoLinkSelector}`);
                
                // Scroll a bit to ensure elements load
                for(let k=0; k<3; k++) { await searchPage.evaluate(() => window.scrollBy(0, window.innerHeight/2)); await sleep(500 + random(500));}

                const videoLinkElement = searchPage.locator(videoLinkSelector).first();
                await videoLinkElement.waitFor({ state: 'visible', timeout: 45000 });

                const href = await videoLinkElement.getAttribute('href');
                if (href) {
                    const fullVideoUrl = (href.startsWith('http') ? href : `https://www.youtube.com${href}`);
                    const currentSearchPageUrl = searchPage.url();
                     // Check if videoId is in the href or title to be more certain
                    const linkTitle = await videoLinkElement.textContent();
                    if (href.includes(job.videoId) || (linkTitle && linkTitle.includes(job.videoId))) { // Added title check as a fallback
                        jobLogger.info(`Video found via search: ${fullVideoUrl}. Updating job URL and referer.`);
                        job.videoUrl = fullVideoUrl; // Use the full URL from search
                        job.referer = currentSearchPageUrl; // Set referer to search results page
                    } else {
                         jobLogger.warn(`Found video link element (href: ${href}, title: ${linkTitle}), but ID ${job.videoId} not strongly matched. Proceeding with original/direct URL for safety.`);
                    }
                } else {
                    jobLogger.warn('Found video link element but href was null. Proceeding with original URL.');
                }
            } catch (searchError) {
                jobLogger.error(`YouTube search failed: ${searchError.message.split('\n')[0]}. Falling back to direct URL: ${job.videoUrl}`);
                 if (Actor.isAtHome()) { // Save screenshot on search fail if local
                    try {
                        const ssKey = `SEARCH_FAIL_${job.videoId}_${new Date().toISOString().replace(/:/g, '-')}`;
                        if (searchPage && !searchPage.isClosed()) await Actor.setValue(ssKey, await searchPage.screenshot(), { contentType: 'image/png' });
                    } catch (e) { jobLogger.debug(`Failed to save search fail screenshot: ${e.message}`);}
                 }
            } finally {
                if (searchPage && !searchPage.isClosed()) await searchPage.close().catch(e => jobLogger.debug(`Search page close error: ${e.message}`));
                if (searchContext) await searchContext.close().catch(e => jobLogger.debug(`Search context close error: ${e.message}`));
                if (searchBrowser) await searchBrowser.close().catch(e => jobLogger.debug(`Search browser close error: ${e.message}`));
            }
        }

        const worker = new YouTubeViewWorker(job, effectiveInput, proxyUrlString, jobLogger);
        let jobResultData = {
            jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId,
            status: 'initiated', proxyUsed: proxyInfoForLog, refererRequested: job.referer,
            watchTypePerformed: job.watchType, // Includes if it was 'search' type
            error: null,
            lastReportedVideoTimeSeconds: 0,
            targetVideoPlayTimeSeconds: 0, // Will be filled by worker
            videoDurationSeconds: 0 // Will be filled by worker
        };

        try {
            await worker.startWorker();
            jobResultData.targetVideoPlayTimeSeconds = Math.max(10, (effectiveInput.watchTimePercentage / 100) * worker.job.video_info.duration);
            jobResultData.videoDurationSeconds = worker.job.video_info.duration;

            const watchResult = await worker.watchVideo();
            Object.assign(jobResultData, watchResult); // Overwrites some fields with actuals

            if (jobResultData.lastReportedVideoTimeSeconds >= jobResultData.targetVideoPlayTimeSeconds) {
                jobResultData.status = 'success';
                overallResults.successfulJobs++;
                jobLogger.info(`Job success: Watched ${jobResultData.lastReportedVideoTimeSeconds.toFixed(1)}s / ${jobResultData.targetVideoPlayTimeSeconds.toFixed(1)}s`);
            } else {
                jobResultData.status = 'failure_watch_time_not_met';
                const message = `Target watch time ${jobResultData.targetVideoPlayTimeSeconds.toFixed(1)}s not met. Actual: ${jobResultData.lastReportedVideoTimeSeconds.toFixed(1)}s (Max time reached in worker: ${worker.maxTimeReachedThisView.toFixed(1)}s).`;
                jobResultData.error = jobResultData.error ? `${jobResultData.error}; ${message}` : message;
                overallResults.failedJobs++;
                (jobLogger.warning || jobLogger.warn).call(jobLogger, message);
            }

        } catch (error) {
            jobLogger.error(`Job failed with exception: ${error.message}`, { stack: error.stack && error.stack.split('\n').slice(0,7).join(' | ') });
            jobResultData.status = 'failure_exception';
            jobResultData.error = error.message + (error.stack ? ` STACK_TRACE_SNIPPET: ${error.stack.split('\n').slice(0,5).join(' | ')}` : '');
            jobResultData.lastReportedVideoTimeSeconds = worker.maxTimeReachedThisView; // Ensure this is captured on error
            if (worker.job && worker.job.video_info && worker.job.video_info.duration) { // Capture these if available
                 jobResultData.targetVideoPlayTimeSeconds = Math.max(10, (effectiveInput.watchTimePercentage / 100) * worker.job.video_info.duration);
                 jobResultData.videoDurationSeconds = worker.job.video_info.duration;
            }
            overallResults.failedJobs++;
        } finally {
            await worker.kill(); // Ensure worker resources are always cleaned up
            jobLogger.info(`Finished job. Status: ${jobResultData.status}. Watched: ${(jobResultData.lastReportedVideoTimeSeconds || 0).toFixed(1)}s`);
        }
        overallResults.details.push(jobResultData);
        await Actor.pushData(jobResultData);
    };

    const runPromises = [];
    for (const job of jobs) {
        // Concurrency management: Wait if max concurrency reached
        while (activeWorkers.size >= effectiveInput.concurrency) {
            (actorLog.warning || actorLog.warn).call(actorLog, `Concurrency limit ${effectiveInput.concurrency} reached (active: ${activeWorkers.size}). Waiting for a slot.`);
            try {
                 await Promise.race(Array.from(activeWorkers)); // Wait for any worker to finish
            } catch (e) {
                 // This catch is for errors from the promises in activeWorkers,
                 // which should ideally be handled by their own .catch().
                 // However, if a promise in activeWorkers rejects without its own catch, Promise.race might throw.
                 actorLog.debug(`Error during Promise.race (worker slot wait), likely already handled by worker's own catch: ${e.message.substring(0,100)}`);
            }
        }

        const promise = processJob(job).catch(e => {
            // This catch is a safety net for unhandled rejections from processJob itself
            actorLog.error(`Unhandled error directly from processJob promise for ${job.videoId}: ${e.message}`);
            const errorResult = { 
                jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId, 
                status: 'catastrophic_processJob_failure', 
                error: e.message  + (e.stack ? ` | STACK: ${e.stack.substring(0,200)}` : '')
            };
            Actor.pushData(errorResult).catch(pushErr => console.error("Failed to pushData for catastrophic failure:", pushErr));
            overallResults.failedJobs++; // Ensure failed count is updated
            overallResults.details.push(errorResult); // Add to details
        }).finally(() => {
            activeWorkers.delete(promise); // Remove worker from active set when done
            actorLog.debug(`Worker finished for job ${job.videoId.substring(0,4)}. Active workers: ${activeWorkers.size}`);
        });
        activeWorkers.add(promise); // Add new worker to active set
        runPromises.push(promise); // Keep track of all promises to await at the end

        jobCounter++;
        if (jobCounter < jobs.length && effectiveInput.concurrencyInterval > 0) { // No need to wait if it's the last job
            actorLog.debug(`Waiting ${effectiveInput.concurrencyInterval}s before dispatching next job (active: ${activeWorkers.size}, current job ${jobCounter}/${jobs.length}).`);
            await sleep(effectiveInput.concurrencyInterval * 1000);
        }
    }
    
    actorLog.info(`All ${jobs.length} jobs have been dispatched. Waiting for all to complete... Active workers: ${activeWorkers.size}`);
    await Promise.all(runPromises.map(p => p.catch(e => {
        // This catch is for promises that might have already been caught by the individual processJob's catch,
        // but it's a good final safety net.
        actorLog.error(`Error caught by final Promise.all on a worker promise (should have been handled earlier): ${e.message}`);
        return e; // Return the error so Promise.all doesn't break if one fails catastrophically
    })));

    overallResults.endTime = new Date().toISOString();
    actorLog.info('All jobs processed. Final results:', { summary: { total: overallResults.totalJobs, success: overallResults.successfulJobs, failed: overallResults.failedJobs }, duration: (new Date(overallResults.endTime) - new Date(overallResults.startTime))/1000 + 's' });
    await Actor.setValue('OVERALL_RESULTS', overallResults);
    actorLog.info('Actor finished successfully.');
    await Actor.exit();
}

// --- Actor Entry Point ---
Actor.main(actorMainLogic);

console.log('MAIN.JS: Script fully loaded. Actor.main is set up.');
