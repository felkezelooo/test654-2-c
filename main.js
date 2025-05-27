const Apify = require('apify');
const { Actor } = Apify;

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { to } = require('await-to-js');
const { v4: uuidv4 } = require('uuid');
const { URL } = require('url');

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
            if (pathParts.length > 1 && pathParts[1].length === 11 && !vParam) return pathParts[1];
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
    for (const selector of consentButtonSelectors) {
        try {
            const button = page.locator(selector).first();
            if (await button.isVisible({ timeout: 7000 })) {
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

async function applyAntiDetectionScripts(pageOrContext, logger) {
    const safeLogger = getSafeLogger(logger);
    const scriptToInject = () => {
        if (navigator.webdriver === true) Object.defineProperty(navigator, 'webdriver', { get: () => false });
        if (navigator.languages && !navigator.languages.includes('en-US')) Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        if (navigator.language !== 'en-US') Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
        try {
            const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (parameter) {
                if (this.canvas && this.canvas.id === 'webgl-fingerprint-canvas') return originalGetParameter.apply(this, arguments);
                if (parameter === 37445) return 'Google Inc. (Intel)';
                if (parameter === 37446) return 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 640, OpenGL 4.1)';
                return originalGetParameter.apply(this, arguments);
            };
        } catch (e) { console.debug('[AntiDetectInPage] Failed WebGL spoof:', e.message); }
        try {
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
        if (window.screen) {
            try {
                Object.defineProperty(window.screen, 'availWidth', { get: () => 1920, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'availHeight', { get: () => 1040, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'width', { get: () => 1920, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'height', { get: () => 1080, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'colorDepth', { get: () => 24, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'pixelDepth', { get: () => 24, configurable: true, writable: false });
            } catch (e) { console.debug('[AntiDetectInPage] Failed screen spoof:', e.message); }
         }
        try { Date.prototype.getTimezoneOffset = function() { return 5 * 60; }; } catch (e) { console.debug('[AntiDetectInPage] Failed timezone spoof:', e.message); }
        if (navigator.plugins) try { Object.defineProperty(navigator, 'plugins', { get: () => [], configurable: true }); } catch(e) { console.debug('[AntiDetectInPage] Failed plugin spoof:', e.message); }
        if (navigator.mimeTypes) try { Object.defineProperty(navigator, 'mimeTypes', { get: () => [], configurable: true }); } catch(e) { console.debug('[AntiDetectInPage] Failed mimeType spoof:', e.message); }
    };
    try {
        if (pageOrContext.addInitScript) {
            await pageOrContext.addInitScript(scriptToInject);
        } else if (pageOrContext.evaluateOnNewDocument) {
            await pageOrContext.evaluateOnNewDocument(scriptToInject);
        }
        safeLogger.info('Custom anti-detection script applied.');
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
                 console.log(`WORKER_CONSTRUCTOR_DEBUG for ${this.id.substring(0,6)}: this.logger seems valid with .info and .warn/warning after baseLogger.child().`);
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
        this.adWatchState = { isWatchingAd: false, timeToWatchThisAdBeforeSkip: 0, adPlayedForEnoughTime: false, adStartTime: 0 };
        this.lastReportedVideoTimeSeconds = 0;
        
        this.logger.info('Worker instance constructed.'); // Simplified log
    }

    createFallbackLogger(prefix) {
        return {
            info: (m, d) => console.log(`INFO ${prefix}${m}`, d || ''),
            warn: (m, d) => console.warn(`WARN ${prefix}${m}`, d || ''),
            warning: (m, d) => console.warn(`WARN ${prefix}${m}`, d || ''),
            error: (m, d) => console.error(`ERROR ${prefix}${m}`, d || ''),
            debug: (m, d) => console.log(`DEBUG ${prefix}${m}`, d || ''),
            child: function(childOpts) {
                const newPrefix = (this.prefix || prefix || '') + (childOpts && childOpts.prefix ? childOpts.prefix : '');
                return this.createFallbackLogger(newPrefix);
            }.bind(this)
        };
    }

    async startWorker() {
        this.logger.info(`Launching browser... Proxy: ${this.proxyUrlString ? 'Yes' : 'No'}, Headless: ${this.effectiveInput.headless}`);
        const userAgentStrings = [
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

        let contextLocale = 'en-US';
        let contextTimezone = 'America/New_York';
        if (this.effectiveInput.proxyCountry === 'GB') {
            contextLocale = 'en-GB';
            contextTimezone = 'Europe/London';
        } else if (this.effectiveInput.proxyCountry === 'HU') {
            contextLocale = 'hu-HU';
            contextTimezone = 'Europe/Budapest';
        }

        this.context = await this.browser.newContext({
            bypassCSP: true, ignoreHTTPSErrors: true,
            locale: contextLocale,
            timezoneId: contextTimezone,
            javaScriptEnabled: true, userAgent: selectedUserAgent,
            geolocation: this.effectiveInput.proxyCountry === 'US' ? { latitude: 34.0522, longitude: -118.2437 } :
                         this.effectiveInput.proxyCountry === 'GB' ? { latitude: 51.5074, longitude: 0.1278 } :
                         this.effectiveInput.proxyCountry === 'HU' ? { latitude: 47.4979, longitude: 19.0402 } : undefined,
            permissions: ['geolocation']
        });
        this.logger.info(`Browser context created with locale: ${contextLocale}, timezone: ${contextTimezone}`);

        if (this.effectiveInput.customAntiDetection) {
            await applyAntiDetectionScripts(this.context, this.logger);
        }

        if (this.job.referer) {
            this.logger.info(`Setting referer: ${this.job.referer}`);
            await this.context.setExtraHTTPHeaders({ 'Referer': this.job.referer });
        }
        this.page = await this.context.newPage();
        this.logger.info('New page created.');

        this.logger.info(`Navigating to: ${this.job.videoUrl}`);
        await this.page.goto(this.job.videoUrl, { waitUntil: 'load', timeout: this.effectiveInput.timeout * 1000 * 0.9 });
        this.logger.info('Navigation (load event) complete.');
        await this.page.waitForLoadState('networkidle', { timeout: this.effectiveInput.timeout * 1000 * 0.1 }).catch(e => this.logger.warn(`Page 'networkidle' state (post-load) timeout: ${e.message.split('\n')[0]}`));


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
                    } else { this.logger.warn('No quality options found in menu.'); }
                    await this.page.waitForTimeout(random(400,700));
                } else { this.logger.warn('Quality menu item not found.'); }
                if (await this.page.locator('.ytp-settings-menu').isVisible({timeout:500})) {
                    await this.page.keyboard.press('Escape', {delay: random(100,300)});
                }
            } else { this.logger.info('Settings button not visible for quality adjustment.'); }
        } catch (e) {
            this.logger.warn(`Could not set video quality: ${e.message.split('\n')[0]}`);
            if (this.page && !this.page.isClosed() && await this.page.locator('.ytp-settings-menu').isVisible({timeout:500})) {
                 await this.page.keyboard.press('Escape').catch(()=>{});
            }
        }

        const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];
        this.logger.info('Initial attempt to ensure video is playing after setup...');
        const initialPlaySuccess = await this.ensureVideoPlaying(playButtonSelectors);
        if (initialPlaySuccess) {
            this.logger.info('Video seems to be playing after initial setup efforts.');
        } else {
            this.logger.warn('Video did not reliably start playing during initial setup. Watch loop will attempt further.');
        }

        await this.page.waitForTimeout(random(2000, 4500));
        return true;
    }

    async handleAds() {
        this.logger.info('Handling ads...');
        const adCheckInterval = 3000;
        let adWatchLoop = 0;
        const skipAdsAfterConfig = this.effectiveInput.skipAdsAfter;
        const minSkipTime = skipAdsAfterConfig[0];
        const maxSecondsAds = this.effectiveInput.maxSecondsAds || 15;
        const maxAdLoopIterations = Math.ceil((maxSecondsAds * 1000) / adCheckInterval) + 5;
        let adWasPlayingThisCheck = false;

        for (adWatchLoop = 0; adWatchLoop < maxAdLoopIterations; adWatchLoop++) {
            if (this.killed || this.page.isClosed()) break;
            let isAdPlaying = false; let canSkip = false;
            let adCurrentTime = adWatchLoop * (adCheckInterval / 1000);

            isAdPlaying = await this.page.locator('.ytp-ad-player-overlay-instream-info, .video-ads .ad-showing').count() > 0;
            if (isAdPlaying) {
                this.logger.info('YouTube ad detected.');
                adWasPlayingThisCheck = true;
                canSkip = await this.page.locator('.ytp-ad-skip-button-modern, .ytp-ad-skip-button').count() > 0;
            }

            if (!isAdPlaying) { this.logger.info('No ad currently playing or ad finished.'); break; }

            if (this.effectiveInput.autoSkipAds && canSkip) {
                this.logger.info('AutoSkipAds: Attempting to skip ad.');
                if (await clickIfExists(this.page, '.ytp-ad-skip-button-modern, .ytp-ad-skip-button', 1000, this.logger)) {
                    await this.page.waitForTimeout(2000 + random(500, 1000)); continue;
                }
            }

            if (adCurrentTime >= minSkipTime && canSkip) {
                this.logger.info(`Ad played for ~${adCurrentTime.toFixed(1)}s (>= minSkipTime ${minSkipTime}s), skippable. Attempting skip.`);
                if (await clickIfExists(this.page, '.ytp-ad-skip-button-modern, .ytp-ad-skip-button', 1000, this.logger)) {
                     await this.page.waitForTimeout(2000 + random(500, 1000)); continue;
                }
            }

            if (adCurrentTime >= maxSecondsAds) {
                 this.logger.info(`Ad played for ~${adCurrentTime.toFixed(1)}s (maxSecondsAds ${maxSecondsAds}s reached).`);
                 if (canSkip) await clickIfExists(this.page, '.ytp-ad-skip-button-modern, .ytp-ad-skip-button', 1000, this.logger);
                 else this.logger.info('Max ad watch time reached, but cannot skip yet.');
                 break;
            }
            await sleep(adCheckInterval);
        }
        if (adWatchLoop >= maxAdLoopIterations) (this.logger.warn || this.logger.warning).call(this.logger, 'Max ad loop iterations reached in handleAds.');
        this.logger.info('Ad handling logic finished for this check.');
        return adWasPlayingThisCheck;
    }

    async ensureVideoPlaying(playButtonSelectors) {
        const logFn = (msg, level = 'info') => {
            const loggerMethod = this.logger[level] || (level === 'warn' && (this.logger.warning || this.logger.warn)) || this.logger.info;
            loggerMethod.call(this.logger, msg);
        };
        logFn('Ensuring video is playing (v4.1)...');

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
            }).catch(() => ({ p: true, rs: 0, err: {message: "Eval failed to get video state"} }));

            if (videoState.err && videoState.err.code) {
                logFn(`Video element has an error: Code ${videoState.err.code}, Msg: ${videoState.err.message || 'N/A'}`, 'warn');
            }

            if (!videoState.p && videoState.rs >= 3) {
                logFn(`Video is already playing (attempt ${attempt + 1} initial check).`);
                return true;
            }

            logFn(`Video state (attempt ${attempt + 1}): Paused=${videoState.p}, ReadyState=${videoState.rs}. Trying strategies...`);

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
                if (await clickIfExists(this.page, selector, 1500, this.logger)) {
                    logFn(`Clicked potential play button: ${selector}`);
                    await sleep(1200 + random(300));
                    videoState = await this.page.evaluate(() => {const v = document.querySelector('video.html5-main-video'); return v ? { p: v.paused, rs: v.readyState } : {p:true, rs:0}; }).catch(()=>({p:true, rs:0}));
                    if (!videoState.p && videoState.rs >=3) { logFn('Video playing after play button click.'); return true;}
                }
            }

            if (videoState.p) {
                const playerLocators = ['video.html5-main-video', '.html5-video-player', '#movie_player'];
                for (const playerSelector of playerLocators) {
                    try {
                        const playerElement = this.page.locator(playerSelector).first();
                        if (await playerElement.isVisible({timeout: 1000})) {
                            logFn(`Clicking player area ('${playerSelector}').`);
                            await playerElement.click({ timeout: 1500, force: true });
                            await sleep(1200 + random(300));
                            videoState = await this.page.evaluate(() => {const v = document.querySelector('video.html5-main-video'); return v ? { p: v.paused, rs: v.readyState } : {p:true, rs:0}; }).catch(()=>({p:true, rs:0}));
                            if (!videoState.p && videoState.rs >=3) {
                                logFn(`Video playing after clicking player area ('${playerSelector}').`);
                                return true;
                            }
                            break;
                        }
                    } catch (e) { logFn(`Player area click ('${playerSelector}') error: ${e.message.split('\n')[0]}`, 'debug'); }
                 }
            }
            if (attempt < 2) await sleep(1500 + attempt * 500);
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
        const checkIntervalMs = 1000; // Reduced further for more frequent interaction checks

        let consecutiveStallChecks = 0;
        const MAX_STALL_CHECKS_BEFORE_RECOVERY = 2;
        let recoveryAttemptsThisJob = 0;
        const MAX_RECOVERY_ATTEMPTS_PER_JOB = 1;

        let lastProgressTimestamp = Date.now();
        let lastKnownGoodVideoTime = 0;
        this.maxTimeReachedThisView = 0;
        let currentActualVideoTime = 0;

        while (!this.killed) {
            const loopIterationStartTime = Date.now();
            const loopNumber = Math.floor((Date.now() - overallWatchStartTime) / checkIntervalMs);

            if (this.page.isClosed()) { (this.logger.warn || this.logger.warning).call(this.logger, 'Page closed during watch loop.'); break; }
            if (Date.now() - overallWatchStartTime > maxOverallWatchDurationMs) {
                (this.logger.warn || this.logger.warning).call(this.logger, 'Max watch duration for this video exceeded. Ending.'); break;
            }

            const adWasPlayingPreviously = await this.handleAds();
            if (adWasPlayingPreviously) {
                this.logger.info('Ad cycle finished, resetting stall detection timers.');
                lastProgressTimestamp = Date.now();
                lastKnownGoodVideoTime = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime || 0).catch(() => lastKnownGoodVideoTime);
                consecutiveStallChecks = 0;
                await sleep(3000 + random(1000));
            }

            let videoState = null;
            try {
                videoState = await this.page.evaluate(() => {
                    const v = document.querySelector('video.html5-main-video');
                    if (!v) return { currentTime: 0, paused: true, ended: true, readyState: 0, networkState: 3, error: null };
                    return {
                        ct: v.currentTime, p: v.paused, e: v.ended,
                        rs: v.readyState, ns: v.networkState,
                        error: v.error ? { code: v.error.code, message: v.error.message } : null
                    };
                });
                if (!videoState) {
                    (this.logger.warn || this.logger.warning).call(this.logger, 'Video element not found in evaluate. Trying to recover.');
                    await sleep(2000);
                    if (!(await this.page.locator('video.html5-main-video').count() > 0)) {
                        throw new Error('Video element disappeared definitively.');
                    }
                    continue;
                 }

                currentActualVideoTime = videoState.ct || 0;
                if (currentActualVideoTime > this.maxTimeReachedThisView) {
                    this.maxTimeReachedThisView = currentActualVideoTime;
                }
                this.logger.debug(`VidState: time=${currentActualVideoTime.toFixed(1)}, maxReached=${this.maxTimeReachedThisView.toFixed(1)}, p=${videoState.p}, e=${videoState.e}, rs=${videoState.rs}, ns=${videoState.ns}, err=${videoState.error?.code}`);

                if (videoState.error && videoState.error.code) {
                    this.logger.error(`Video player error: Code ${videoState.error.code}, Msg: ${videoState.error.message}. Ending watch.`);
                    throw new Error(`Video Player Error Code ${videoState.error.code}: ${videoState.error.message}`);
                }

                let isStalledThisCheck = false;
                if (!videoState.p && videoState.rs >= 2) {
                    if (Math.abs(currentActualVideoTime - lastKnownGoodVideoTime) < 0.8 && (Date.now() - lastProgressTimestamp) > 10000) {
                        isStalledThisCheck = true;
                    } else if (currentActualVideoTime > lastKnownGoodVideoTime + 0.2) {
                        lastKnownGoodVideoTime = currentActualVideoTime;
                        lastProgressTimestamp = Date.now();
                        consecutiveStallChecks = 0;
                    }
                } else if (videoState.p) {
                    lastProgressTimestamp = Date.now();
                }

                if (videoState.rs === 0 && currentActualVideoTime < 5 && (Date.now() - overallWatchStartTime > 20000)) {
                     (this.logger.warn || this.logger.warning).call(this.logger, `Critical Stall: readyState is 0 and video time < 5s after 20s. CurrentTime: ${currentActualVideoTime.toFixed(1)}`);
                     isStalledThisCheck = true;
                }

                if (isStalledThisCheck) {
                    consecutiveStallChecks++;
                    (this.logger.warn || this.logger.warning).call(this.logger, `Playback stalled. CT: ${currentActualVideoTime.toFixed(1)}, LastGood: ${lastKnownGoodVideoTime.toFixed(1)}. Stalls: ${consecutiveStallChecks}. RS: ${videoState.rs}, NS: ${videoState.ns}`);
                    
                    if (Actor.isAtHome && typeof Actor.isAtHome === 'function' && Actor.isAtHome()) {
                        try {
                            const stallTime = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '_');
                            const screenshotKey = `STALL_SCREENSHOT_${this.job.videoId}_${this.id.substring(0,8)}_${stallTime}`;
                            this.logger.info(`Taking screenshot due to stall: ${screenshotKey}`);
                            const screenshotBuffer = await this.page.screenshot({ fullPage: true, timeout: 15000 });
                            if (Actor.setValue && typeof Actor.setValue === 'function') {
                                await Actor.setValue(screenshotKey, screenshotBuffer, { contentType: 'image/png' });
                                this.logger.info(`Screenshot saved: ${screenshotKey}`);
                            } else {
                                (this.logger.warn || this.logger.warning).call(this.logger, "Actor.setValue is not available to save screenshot.");
                            }
                        } catch (screenshotError) {
                            this.logger.error(`Failed to take or save stall screenshot: ${screenshotError.message}`);
                        }
                    }
                    // Check for "Something went wrong" text
                    const somethingWrongLocator = this.page.locator('text=/Something went wrong/i, text=/An error occurred/i, .ytp-error-content');
                    let isPlayerErrorVisible = false;
                    try {
                        if (await somethingWrongLocator.first().isVisible({ timeout: 1000 })) {
                            isPlayerErrorVisible = true;
                            (this.logger.warn || this.logger.warning).call(this.logger, 'CONFIRMED: "Something went wrong" or similar error message visible on player.');
                        }
                    } catch (e) { /* ignore if not visible */ }


                    if (consecutiveStallChecks >= MAX_STALL_CHECKS_BEFORE_RECOVERY) {
                        if (recoveryAttemptsThisJob < MAX_RECOVERY_ATTEMPTS_PER_JOB) {
                            (this.logger.warn || this.logger.warning).call(this.logger, `Stalled. Attempting recovery ${recoveryAttemptsThisJob + 1}/${MAX_RECOVERY_ATTEMPTS_PER_JOB}...`);
                            recoveryAttemptsThisJob++;
                            consecutiveStallChecks = 0;
                            
                            // Always reload if "Something went wrong" is visible or if it's a second recovery attempt for other stalls.
                            // For now, with MAX_RECOVERY_ATTEMPTS_PER_JOB = 1, this means always reload on detected stall that hits MAX_STALL_CHECKS.
                            this.logger.info('Attempting page reload for recovery.');
                            await this.page.reload({ waitUntil: 'load', timeout: this.effectiveInput.timeout * 1000 * 0.6 });
                            this.logger.info('Page reloaded. Re-handling consent & playback...');
                            await handleYouTubeConsent(this.page, this.logger);
                            await this.ensureVideoPlaying(playButtonSelectors);
                            
                            lastKnownGoodVideoTime = 0;
                            this.maxTimeReachedThisView = 0;
                            currentActualVideoTime = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime || 0).catch(()=>0);
                            lastKnownGoodVideoTime = currentActualVideoTime;
                            this.maxTimeReachedThisView = currentActualVideoTime;
                            lastProgressTimestamp = Date.now();
                            this.logger.info(`State after reload and play attempt: CT: ${currentActualVideoTime.toFixed(1)}s`);
                            continue; 
                        } else {
                            this.logger.error('Video stalled and recovery attempts (reload) exhausted. Failing job.');
                            throw new Error('Video stalled/player error, recovery reloads exhausted.');
                        }
                    }
                }
            } catch (e) {
                if (e.message.includes('Target closed') || e.message.includes('Protocol error')) {
                    (this.logger.warn || this.logger.warning).call(this.logger, `Watch loop error (Target closed/Protocol): ${e.message}`); throw e;
                }
                 (this.logger.warn || this.logger.warning).call(this.logger, `Video state eval/check error: ${e.message.split('\n')[0]}`);
                 if (e.message.includes('Unrecoverable video stall') || e.message.includes('recovery reloads exhausted')) throw e;
                 await sleep(checkIntervalMs); continue;
            }
            
            if (videoState.p && !videoState.e && this.maxTimeReachedThisView < targetVideoPlayTimeSeconds) {
                await this.ensureVideoPlaying(playButtonSelectors);
            }
            
            if (videoState.e) { this.logger.info('Video playback naturally ended.'); break; }
            if (this.maxTimeReachedThisView >= targetVideoPlayTimeSeconds) {
                this.logger.info(`Target watch time reached. Max Reached: ${this.maxTimeReachedThisView.toFixed(1)}s`); break;
            }
            
            // More frequent and varied interactions
            if (loopNumber % 3 === 0) { // Approx every 3 * 1s = 3s
                 try {
                    const videoElement = this.page.locator('video.html5-main-video, video.rumble-player-video').first();
                    if (await videoElement.isVisible({timeout:500})) {
                        await videoElement.hover({timeout: 1000});
                        await sleep(100 + random(100));
                        const boundingBox = await videoElement.boundingBox();
                        if (boundingBox) {
                             await this.page.mouse.move(
                                 boundingBox.x + random(Math.floor(boundingBox.width * 0.2), Math.floor(boundingBox.width * 0.8)),
                                 boundingBox.y + random(Math.floor(boundingBox.height * 0.2), Math.floor(boundingBox.height * 0.8)),
                                 {steps:random(3,7)}
                             );
                        }
                        this.logger.debug('Simulated mouse hover and move over video.');
                    }
                 } catch(e) {this.logger.debug(`Minor interaction simulation error (mouse move): ${e.message.split('\n')[0]}. Ignoring.`);}
            }
            if (loopNumber % 7 === 0) { // Approx every 7s
                try {
                    const settingsButton = this.page.locator('.ytp-settings-button').first();
                    if (await settingsButton.isVisible({timeout: 300})) {
                        await settingsButton.hover({timeout: 300});
                        this.logger.debug('Simulated hover on settings button.');
                        await sleep(100 + random(100));
                        await this.page.mouse.move(random(50,100), random(50,100), {steps: 2});
                    }
                } catch (e) {this.logger.debug('Minor settings hover interaction error.');}
            }
             if (loopNumber % 11 === 0) { // Approx every 11s
                 try {
                    const videoElementToClick = this.page.locator('video.html5-main-video').first();
                     if (await videoElementToClick.isVisible({timeout:300})) {
                        await videoElementToClick.focus(); // Ensure focus before click
                        await videoElementToClick.click({timeout: 300, position: {x: random(10,50), y: random(10,50)}, delay: random(50,150) });
                        this.logger.debug('Simulated click on video player area.');
                    }
                 } catch(e) {this.logger.debug('Minor video area click error.'); }
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

    actorLog.info('ACTOR_MAIN_LOGIC: Starting YouTube View Bot (Custom Playwright with Stealth & Integrated Logic).');
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
        skipAdsAfter: ["5", "10"],
        autoSkipAds: true, stopSpawningOnOverload: true, useAV1: false,
        customAntiDetection: true,
    };
    const effectiveInput = { ...defaultInputFromSchema, ...input };

    let tempSkipAds = effectiveInput.skipAdsAfter;
    if (Array.isArray(tempSkipAds) && tempSkipAds.length > 0 && tempSkipAds.every(s => typeof s === 'string' || typeof s === 'number')) {
        const parsedSkipAds = tempSkipAds.map(s => parseInt(String(s), 10)).filter(n => !isNaN(n) && n >= 0);
        if (parsedSkipAds.length === 1) effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[0] + 5];
        else if (parsedSkipAds.length >= 2) effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[1]];
        else effectiveInput.skipAdsAfter = [5, 12];
    } else {
        effectiveInput.skipAdsAfter = [5, 12];
    }
    if (typeof input.skipAdsAfterMinSeconds === 'number' && typeof input.skipAdsAfterMaxSeconds === 'number' &&
        !isNaN(input.skipAdsAfterMinSeconds) && !isNaN(input.skipAdsAfterMaxSeconds) &&
        input.skipAdsAfterMinSeconds >= 0 && input.skipAdsAfterMaxSeconds >=0) {
        effectiveInput.skipAdsAfter = [
            input.skipAdsAfterMinSeconds,
            Math.max(input.skipAdsAfterMinSeconds, input.skipAdsAfterMaxSeconds)
        ];
    }
    if (effectiveInput.skipAdsAfter[0] > effectiveInput.skipAdsAfter[1]) {
        effectiveInput.skipAdsAfter[1] = effectiveInput.skipAdsAfter[0] + 5;
    }
    effectiveInput.maxSecondsAds = Number(effectiveInput.maxSecondsAds);
    if(isNaN(effectiveInput.maxSecondsAds) || effectiveInput.maxSecondsAds < 0) {
        effectiveInput.maxSecondsAds = 15;
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
        if (effectiveInput.proxyCountry && effectiveInput.proxyCountry.trim() !== "" && effectiveInput.proxyCountry.toUpperCase() !== "ANY") proxyOpts.countryCode = effectiveInput.proxyCountry;
        try {
            actorProxyConfiguration = await Actor.createProxyConfiguration(proxyOpts);
            actorLog.info(`Apify Proxy: Country=${proxyOpts.countryCode || 'Any'}, Groups=${(proxyOpts.groups || []).join(', ')}`);
        } catch (e) { actorLog.error(`Failed Apify Proxy config: ${e.message}.`); actorProxyConfiguration = null; }
    }

    const jobs = [];
    const userAgentStringsForSearch = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0'
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
            referer: refererUrl, video_info: { duration: 300, isLive: false },
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
                proxyInfoForLog = `CustomProxy: ${proxyUrlString.split('@').pop().split(':')[0]}`;
                jobLogger.info(`Using custom proxy: ${proxyInfoForLog}`);
            } else if (actorProxyConfiguration) {
                const sessionId = `session_${job.id.substring(0, 12).replace(/-/g, '')}`;
                try {
                    proxyUrlString = await actorProxyConfiguration.newUrl(sessionId);
                    proxyInfoForLog = `ApifyProxy (Session: ${sessionId}, Country: ${effectiveInput.proxyCountry || 'Any'})`;
                     jobLogger.info(`Using Apify proxy: ${proxyInfoForLog}`);
                } catch (proxyError) {
                    jobLogger.error(`Failed to get new Apify proxy URL: ${proxyError.message}`);
                    proxyUrlString = null; proxyInfoForLog = 'ProxyAcquisitionFailed';
                }
            } else { jobLogger.warn(`Proxies enabled but no configuration found.`); }
        }

        if (job.watchType === 'search' && job.searchKeywords && job.searchKeywords.length > 0) {
            jobLogger.info(`Attempting YouTube search for: "${job.searchKeywords.join(', ')}" to find ID: ${job.videoId}`);
            let searchBrowser = null, searchContext = null, searchPage = null;
            const searchLaunchOptions = { headless: effectiveInput.headless, args: [...ANTI_DETECTION_ARGS] };
            if(proxyUrlString) {
                try {
                    const p = new URL(proxyUrlString);
                    searchLaunchOptions.proxy = { server: `${p.protocol}//${p.hostname}:${p.port}`, username: p.username?decodeURIComponent(p.username):undefined, password: p.password?decodeURIComponent(p.password):undefined };
                } catch(e){ jobLogger.warn('Failed to parse proxy for search browser, search will be direct.'); }
            }
            try {
                const searchUserAgent = userAgentStringsForSearch[random(userAgentStringsForSearch.length-1)];
                searchBrowser = await chromium.launch(searchLaunchOptions);
                searchContext = await searchBrowser.newContext({ userAgent: searchUserAgent });
                if (effectiveInput.customAntiDetection) await applyAntiDetectionScripts(searchContext, jobLogger);

                searchPage = await searchContext.newPage();

                const searchQuery = job.searchKeywords[random(job.searchKeywords.length - 1)];
                const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
                jobLogger.info(`Navigating to search URL: ${youtubeSearchUrl}`);
                await searchPage.goto(youtubeSearchUrl, { waitUntil: 'domcontentloaded', timeout: effectiveInput.timeout * 1000 });
                await handleYouTubeConsent(searchPage, jobLogger);

                const videoLinkSelector = `a#video-title[href*="/watch?v=${job.videoId}"]`;
                jobLogger.info(`Looking for video link: ${videoLinkSelector}`);
                const videoLinkElement = searchPage.locator(videoLinkSelector).first();
                await videoLinkElement.waitFor({ state: 'visible', timeout: 45000 });

                const href = await videoLinkElement.getAttribute('href');
                if (href) {
                    const fullVideoUrl = `https://www.youtube.com${href}`;
                    const currentUrl = searchPage.url();
                     if (currentUrl.includes(job.videoId) || href.includes(job.videoId)){
                        jobLogger.info(`Video found via search: ${fullVideoUrl}. Updating job URL and referer.`);
                        job.videoUrl = fullVideoUrl;
                        job.referer = youtubeSearchUrl;
                    } else {
                         jobLogger.warn(`Found video link element but current URL ${currentUrl} or href ${href} does not match video ID ${job.videoId}. Proceeding with original URL.`);
                    }
                } else {
                    jobLogger.warn('Found video link element but href was null. Proceeding with original URL.');
                }
            } catch (searchError) {
                jobLogger.error(`YouTube search failed: ${searchError.message}. Falling back to direct URL: ${job.videoUrl}`);
            } finally {
                if (searchPage) await searchPage.close().catch(e => jobLogger.debug(`Search page close error: ${e.message}`));
                if (searchContext) await searchContext.close().catch(e => jobLogger.debug(`Search context close error: ${e.message}`));
                if (searchBrowser) await searchBrowser.close().catch(e => jobLogger.debug(`Search browser close error: ${e.message}`));
            }
        }

        const worker = new YouTubeViewWorker(job, effectiveInput, proxyUrlString, jobLogger);
        let jobResultData = {
            jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId,
            status: 'initiated', proxyUsed: proxyInfoForLog, refererRequested: job.referer,
            watchTypePerformed: job.watchType,
            error: null,
            lastReportedVideoTimeSeconds: 0,
            targetVideoPlayTimeSeconds: 0
        };

        try {
            await worker.startWorker();
            const watchResult = await worker.watchVideo();
            Object.assign(jobResultData, watchResult);

            if (jobResultData.lastReportedVideoTimeSeconds >= jobResultData.targetVideoPlayTimeSeconds) {
                jobResultData.status = 'success';
                overallResults.successfulJobs++;
                jobLogger.info(`Job success: Watched ${jobResultData.lastReportedVideoTimeSeconds.toFixed(1)}s / ${jobResultData.targetVideoPlayTimeSeconds.toFixed(1)}s`);
            } else {
                jobResultData.status = 'failure_watch_time_not_met';
                const message = `Target watch time ${jobResultData.targetVideoPlayTimeSeconds.toFixed(1)}s not met. Actual: ${jobResultData.lastReportedVideoTimeSeconds.toFixed(1)}s (Max time reached in worker: ${worker.maxTimeReachedThisView.toFixed(1)}s).`;
                jobResultData.error = jobResultData.error ? `${jobResultData.error}; ${message}` : message;
                overallResults.failedJobs++;
                (jobLogger.warning || jobLogger.warn).call(jobLogger, message); // Use .warning, fallback to .warn
            }

        } catch (error) {
            jobLogger.error(`Job failed with exception: ${error.message}`, { stack: error.stack && error.stack.split('\n').slice(0,7).join(' | ') });
            jobResultData.status = 'failure_exception';
            jobResultData.error = error.message + (error.stack ? ` STACK_TRACE_SNIPPET: ${error.stack.split('\n').slice(0,5).join(' | ')}` : '');
            jobResultData.lastReportedVideoTimeSeconds = worker.maxTimeReachedThisView;
            overallResults.failedJobs++;
        } finally {
            await worker.kill();
            jobLogger.info(`Finished job. Status: ${jobResultData.status}. Watched: ${(jobResultData.lastReportedVideoTimeSeconds || 0).toFixed(1)}s`);
        }
        overallResults.details.push(jobResultData);
        await Actor.pushData(jobResultData);
    };

    const runPromises = [];
    for (const job of jobs) {
        if (activeWorkers.size >= effectiveInput.concurrency) {
            (actorLog.warning || actorLog.warn).call(actorLog, `Concurrency limit ${effectiveInput.concurrency} reached. Waiting for a slot.`);
            await Promise.race(Array.from(activeWorkers)).catch(e => (actorLog.warning || actorLog.warn).call(actorLog, `Error during Promise.race (worker slot wait): ${e.message}`));
        }
        const promise = processJob(job).catch(e => {
            actorLog.error(`Unhandled error directly from processJob promise for ${job.videoId}: ${e.message}`);
            const errorResult = { jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId, status: 'catastrophic_processJob_failure', error: e.message };
            Actor.pushData(errorResult).catch(pushErr => console.error("Failed to pushData for catastrophic failure:", pushErr));
            overallResults.failedJobs++;
            overallResults.details.push(errorResult);
        }).finally(() => {
            activeWorkers.delete(promise);
        });
        activeWorkers.add(promise);
        runPromises.push(promise);
        jobCounter++;
        if (jobCounter < jobs.length && activeWorkers.size < effectiveInput.concurrency && effectiveInput.concurrencyInterval > 0) {
            actorLog.debug(`Waiting ${effectiveInput.concurrencyInterval}s before dispatching next job (active: ${activeWorkers.size}).`);
            await sleep(effectiveInput.concurrencyInterval * 1000);
        }
    }
    await Promise.all(runPromises.map(p => p.catch(e => {
        actorLog.error(`Error caught by Promise.all on worker promise: ${e.message}`);
        return e;
    })));

    actorLog.info('All jobs processed. Final results:', { summary: { total: overallResults.totalJobs, success: overallResults.successfulJobs, failed: overallResults.failedJobs }});
    await Actor.setValue('OVERALL_RESULTS', overallResults);
    actorLog.info('Actor finished successfully.');
    await Actor.exit();
}

// --- Actor Entry Point ---
Actor.main(actorMainLogic);

console.log('MAIN.JS: Script fully loaded. Actor.main is set up.');
