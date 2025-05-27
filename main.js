const Apify = require('apify');
const { Actor } = Apify;

// ... other require statements ...
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { to } = require('await-to-js'); // Kept, might be used by other functions later
const { v4: uuidv4 } = require('uuid'); // Kept, might be used by other functions later
const { URL } = require('url'); // Kept, might be used by other functions later

// StealthPlugin application (using console.log is fine here before Actor.init)
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
        info: (msg, data) => console.log(`INFO: ${msg || ''}`, data || ''),
        warn: (msg, data) => console.warn(`WARN: ${msg || ''}`, data || ''),
        error: (msg, data) => console.error(`ERROR: ${msg || ''}`, data || ''),
        debug: (msg, data) => console.log(`DEBUG: ${msg || ''}`, data || ''),
        exception: (e, msg, data) => console.error(`EXCEPTION: ${msg || ''}`, e, data || ''),
    };
    const createChild = function(parentLogger, childOpts) {
        const parentPrefix = (parentLogger && parentLogger.prefix) ? parentLogger.prefix : '';
        const newPrefix = childOpts && childOpts.prefix ? parentPrefix + childOpts.prefix : parentPrefix;
        const effectiveParentMethods = (parentLogger && typeof parentLogger.info === 'function') ? parentLogger : baseConsoleLogger;
        return {
            info: (m, d) => effectiveParentMethods.info(`${newPrefix}${m}`, d),
            warn: (m, d) => effectiveParentMethods.warn(`${newPrefix}${m}`, d),
            error: (m, d) => effectiveParentMethods.error(`${newPrefix}${m}`, d),
            debug: (m, d) => effectiveParentMethods.debug(`${newPrefix}${m}`, d),
            exception: (e, m, d) => effectiveParentMethods.exception(e, `${newPrefix}${m}`, d),
            child: function(opts) { return createChild(this, opts); },
            prefix: newPrefix
        };
    };
    if (loggerInstance &&
        typeof loggerInstance.info === 'function' &&
        typeof loggerInstance.warn === 'function' &&
        typeof loggerInstance.error === 'function' &&
        typeof loggerInstance.debug === 'function' &&
        typeof loggerInstance.exception === 'function' &&
        typeof loggerInstance.child === 'function') { // Added full checks
        return loggerInstance;
    }
    if (!getSafeLogger.hasWarnedOnce) {
        console.error("SAFE_LOGGER: Apify logger was not available or incomplete, falling back to console-based logger.");
        getSafeLogger.hasWarnedOnce = true;
    }
    return { ...baseConsoleLogger, child: function(childOpts) { return createChild(this, childOpts); } };
}
getSafeLogger.hasWarnedOnce = false;


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
    safeLogger.warn(`Could not extract valid YouTube video ID from: ${url}`);
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
                else { safeLogger.warn('Clicked consent, but a dialog might still be visible.');}
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
        if (page.isClosed()) { safeLogger.warn("Page closed while getting video duration."); return null; }
        try {
            const duration = await page.evaluate(() => {
                const video = document.querySelector('video.html5-main-video');
                return video ? video.duration : null;
            });
            if (duration && !isNaN(duration) && isFinite(duration) && duration > 0) {
                safeLogger.info(`Video duration found: ${duration} seconds.`);
                return duration;
            }
        } catch (e) {
            safeLogger.debug(`Attempt ${i+1} to get duration failed: ${e.message.split('\n')[0]}`);
        }
        await sleep(1000);
    }
    safeLogger.warning('Could not determine video duration after 15 seconds.');
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
        if (page.isClosed()) { safeLogger.warn(`Page closed attempting to click: ${selector} - ${e.message.split('\n')[0]}`); return false;}
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
        this.logger = getSafeLogger(baseLogger).child({ prefix: `Worker-${job.videoId.substring(0, 6)}-${this.id.substring(0,4)}: ` });
        this.browser = null; this.context = null; this.page = null; this.killed = false;
        this.adWatchState = { isWatchingAd: false, timeToWatchThisAdBeforeSkip: 0, adPlayedForEnoughTime: false, adStartTime: 0 };
        this.lastReportedVideoTimeSeconds = 0;
        this.maxTimeReachedThisView = 0;
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
        this.context = await this.browser.newContext({
            bypassCSP: true, ignoreHTTPSErrors: true,
            locale: ['en-US', 'en-GB', 'hu-HU'][random(2)],
            timezoneId: ['America/New_York', 'Europe/London', 'Europe/Budapest'][random(2)],
            javaScriptEnabled: true, userAgent: selectedUserAgent,
            geolocation: this.effectiveInput.proxyCountry === 'US' ? { latitude: 34.0522, longitude: -118.2437 } :
                         this.effectiveInput.proxyCountry === 'GB' ? { latitude: 51.5074, longitude: 0.1278 } :
                         this.effectiveInput.proxyCountry === 'HU' ? { latitude: 47.4979, longitude: 19.0402 } : undefined,
            permissions: ['geolocation']
        });
        this.logger.info('Browser context created.');

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
        await this.page.goto(this.job.videoUrl, { waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 * 0.7 });
        this.logger.info('Navigation (domcontentloaded) complete.');
        await this.page.waitForLoadState('networkidle', { timeout: this.effectiveInput.timeout * 1000 * 0.3 }).catch(e => this.logger.warn(`Page 'networkidle' state timeout: ${e.message.split('\n')[0]}`));
        this.logger.info('Page networkidle state (or timeout) reached.');

        await handleYouTubeConsent(this.page, this.logger);
        await this.page.waitForTimeout(random(2000,4000));

        const duration = await getVideoDuration(this.page, this.logger);
        if (duration && duration > 0) {
            this.job.video_info.duration = duration;
        } else {
            this.logger.warn(`Could not determine video duration, using default 300s.`);
            this.job.video_info.duration = 300;
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
        if (adWatchLoop >= maxAdLoopIterations) this.logger.warn('Max ad loop iterations reached in handleAds.');
        this.logger.info('Ad handling logic finished for this check.');
        return adWasPlayingThisCheck;
    }

    async ensureVideoPlaying(playButtonSelectors) {
        const logFn = (msg, level = 'info') => this.logger[level](msg);
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
        const checkIntervalMs = 3500;

        let consecutiveStallChecks = 0;
        const MAX_STALL_CHECKS_BEFORE_RECOVERY = 2;
        let recoveryAttemptsThisJob = 0;
        const MAX_RECOVERY_ATTEMPTS_PER_JOB = 2;

        let lastProgressTimestamp = Date.now();
        let lastKnownGoodVideoTime = 0;
        this.maxTimeReachedThisView = 0;

        while (!this.killed) {
            const loopIterationStartTime = Date.now();
            if (this.page.isClosed()) { this.logger.warn('Page closed during watch.'); break; }
            if (Date.now() - overallWatchStartTime > maxOverallWatchDurationMs) {
                this.logger.warn('Max watch duration for this video exceeded. Ending.'); break;
            }

            const adWasPlayingPreviously = await this.handleAds();
            if (adWasPlayingPreviously) {
                this.logger.info('Ad cycle finished, resetting stall detection timers and allowing video to buffer/resume.');
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
                    this.logger.warn('Video element not found in evaluate. Trying to recover.');
                    await sleep(2000);
                    if (!(await this.page.locator('video.html5-main-video').count() > 0)) {
                        throw new Error('Video element disappeared definitively.');
                    }
                    continue;
                 }

                const currentEvalTime = videoState.ct || 0;
                if (currentEvalTime > this.maxTimeReachedThisView) {
                    this.maxTimeReachedThisView = currentEvalTime;
                }
                this.logger.debug(`VidState: time=${currentEvalTime.toFixed(1)}, maxReached=${this.maxTimeReachedThisView.toFixed(1)}, paused=${videoState.p}, ended=${videoState.e}, readyState=${videoState.rs}, netState=${videoState.ns}, error=${videoState.error?.code}`);

                if (videoState.error && videoState.error.code) {
                    this.logger.error(`Video player error: Code ${videoState.error.code}, Msg: ${videoState.error.message}. Ending watch.`);
                    throw new Error(`Video Player Error Code ${videoState.error.code}: ${videoState.error.message}`);
                }

                let isStalledThisCheck = false;
                if (!videoState.p && videoState.rs >= 2) {
                    if (Math.abs(currentEvalTime - lastKnownGoodVideoTime) < 0.8 && (Date.now() - lastProgressTimestamp) > 12000) {
                        isStalledThisCheck = true;
                        this.logger.warn(`Playback stalled. CT: ${currentEvalTime.toFixed(1)}, LastGoodCT: ${lastKnownGoodVideoTime.toFixed(1)}. Time since last progress: ${((Date.now() - lastProgressTimestamp)/1000).toFixed(1)}s.`);
                    } else if (currentEvalTime > lastKnownGoodVideoTime + 0.2) {
                        lastKnownGoodVideoTime = currentEvalTime;
                        lastProgressTimestamp = Date.now();
                        consecutiveStallChecks = 0;
                    }
                } else if (videoState.p) {
                    lastProgressTimestamp = Date.now();
                }

                if (videoState.rs === 0 && (Date.now() - overallWatchStartTime > 25000) && currentEvalTime < 5) {
                     this.logger.warn(`Critical Stall: readyState is 0 for >25s and video time < 5s. CurrentTime: ${currentEvalTime.toFixed(1)}`);
                     isStalledThisCheck = true;
                }

                if (isStalledThisCheck) {
                    consecutiveStallChecks++;
                }

                if (consecutiveStallChecks >= MAX_STALL_CHECKS_BEFORE_RECOVERY) {
                    if (recoveryAttemptsThisJob < MAX_RECOVERY_ATTEMPTS_PER_JOB) {
                        this.logger.warn(`Stalled for ${consecutiveStallChecks} checks. Attempting recovery ${recoveryAttemptsThisJob + 1}/${MAX_RECOVERY_ATTEMPTS_PER_JOB}...`);
                        recoveryAttemptsThisJob++;
                        consecutiveStallChecks = 0;

                        this.logger.info('Stall detected. Gathering diagnostics...');
                        const diagnostics = await this.page.evaluate(() => {
                            const video = document.querySelector('video.html5-main-video');
                            if (!video) return { error: 'No video element found for diagnostics' };
                            return {
                                currentTime: video.currentTime, duration: video.duration, paused: video.paused, ended: video.ended,
                                readyState: video.readyState, networkState: video.networkState,
                                error: video.error ? { code: video.error.code, message: video.error.message, MEDIA_ERR_NETWORK: video.NETWORK_STATE_NETWORK_ERROR, MEDIA_ERR_DECODE: video.NETWORK_STATE_DECODE_ERROR } : null,
                                buffered: video.buffered && video.buffered.length > 0 ? { start: video.buffered.start(0), end: video.buffered.end(0) } : 'No buffer info',
                                src: video.src, currentSrc: video.currentSrc,
                            };
                        }).catch(err => ({ evaluateError: err.message }));
                        this.logger.warn('Stall Diagnostics:', diagnostics);

                        this.logger.info('Recovery: Trying JS pause/play and clicking player.');
                        await this.page.evaluate(() => {
                            const v = document.querySelector('video.html5-main-video');
                            if (v) { v.pause(); setTimeout(() => v.play().catch(console.error), 200); }
                        }).catch(e => this.logger.warn(`JS pause/play eval error: ${e.message}`));
                        await sleep(1500 + random(500));
                        await this.ensureVideoPlaying(playButtonSelectors);

                        let postRecoveryState = await this.page.evaluate(() => {
                            const v = document.querySelector('video.html5-main-video');
                            return v ? { p: v.paused, ct:v.currentTime, rs: v.readyState } : {p:true,ct:0,rs:0};
                        }).catch(()=>({p:true,ct:lastKnownGoodVideoTime,rs:0}));

                        if (postRecoveryState.p || Math.abs(postRecoveryState.ct - lastKnownGoodVideoTime) < 1.0 || postRecoveryState.rs < 2) {
                            this.logger.warn('JS/Click recovery ineffective or readyState very low. Attempting page reload.');
                            await this.page.reload({ waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 * 0.5 });
                            this.logger.info('Page reloaded. Re-handling consent & playback...');
                            await handleYouTubeConsent(this.page, this.logger);
                            await this.ensureVideoPlaying(playButtonSelectors);
                            lastKnownGoodVideoTime = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime || 0).catch(()=>0);
                            this.maxTimeReachedThisView = Math.max(this.maxTimeReachedThisView, lastKnownGoodVideoTime);
                        } else {
                            this.logger.info('Recovery attempt (JS/Click) might have resumed playback.');
                            lastKnownGoodVideoTime = postRecoveryState.ct;
                        }
                        lastProgressTimestamp = Date.now();
                    } else {
                        this.logger.error('Video stalled and recovery attempts exhausted. Failing job.');
                        throw new Error('Unrecoverable video stall - recovery attempts exhausted.');
                    }
                }
            } catch (e) {
                if (e.message.includes('Target closed') || e.message.includes('Protocol error')) {
                    this.logger.warn(`Watch loop error (Target closed/Protocol): ${e.message}`); throw e;
                }
                 this.logger.warn(`Video state eval/check error: ${e.message.split('\n')[0]}`);
                 if (e.message.includes('Unrecoverable video stall')) throw e;
                 await sleep(checkIntervalMs); continue;
            }

            this.lastReportedVideoTimeSeconds = this.maxTimeReachedThisView;

            if (videoState.p && !videoState.e && this.maxTimeReachedThisView < targetVideoPlayTimeSeconds) {
                this.logger.info('Video paused, ensuring play.');
                await this.ensureVideoPlaying(playButtonSelectors);
            }

            if (videoState.e) { this.logger.info('Video playback naturally ended.'); break; }
            if (this.maxTimeReachedThisView >= targetVideoPlayTimeSeconds) {
                this.logger.info(`Target watch time reached. Max Reached: ${this.maxTimeReachedThisView.toFixed(1)}s`);
                break;
            }

            if (Math.floor((Date.now() - overallWatchStartTime) / (checkIntervalMs * 4)) > Math.floor(((Date.now() - overallWatchStartTime - checkIntervalMs)) / (checkIntervalMs * 4)) ) {
                 try {
                    await this.page.locator('body').hover({timeout: 500});
                    await sleep(100 + random(100));
                    await this.page.mouse.move(random(100,500),random(100,300),{steps:random(3,7)});
                    this.logger.debug('Simulated mouse hover and move.');
                 } catch(e) {this.logger.debug("Minor interaction simulation error, ignoring.");}
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
        if (this.page && !this.page.isClosed()) { await this.page.close().catch(e => this.logger.warn(`Page close error: ${e.message}`)); }
        this.page = null;
        if (this.context) { await this.context.close().catch(e => this.logger.warn(`Context close error: ${e.message}`)); }
        this.context = null;
        if (this.browser) { await this.browser.close().catch(e => this.logger.warn(`Browser close error: ${e.message}`)); }
        this.browser = null;
        this.logger.info('Resources closed.');
    }
}

// --- Main Actor Logic (Simplified for Debugging Logger) ---
async function actorMainLogic() {
    console.log('DEBUG: actorMainLogic started.');

    try {
        await Actor.init();
        console.log('DEBUG: Actor.init() completed.');
    } catch (initError) {
        console.error('CRITICAL DEBUG: Actor.init() FAILED:', initError);
        process.exit(1);
    }

    if (Actor.log && typeof Actor.log.info === 'function') {
        Actor.log.info('DEBUG: Actor.log is VALID immediately after Actor.init()');
    } else {
        console.error('CRITICAL DEBUG: Actor.log is UNDEFINED/INVALID immediately after Actor.init()');
        if (Actor.isAtHome && Actor.fail) {
             await Actor.fail("Actor.log was not properly initialized by Actor.init().");
        } else {
            console.error("CRITICAL: Actor.fail not available. Exiting.");
            process.exit(1);
        }
        return;
    }

    const actorLog = Actor.log;

    actorLog.info('ACTOR_MAIN_LOGIC: Logger test successful. Proceeding with minimal logic...');

    const input = await Actor.getInput();
    if (!input) {
        actorLog.error('No input received.');
        if (Actor.isAtHome && Actor.fail) await Actor.fail('No input.');
        else { actorLog.error("Actor.fail not available. No input."); process.exit(1); }
        return;
    }
    actorLog.info('Input received (minimal test):', { hasInput: true }); // Log a simple object

    // For this minimal test, we are NOT calling the full job processing logic.
    // We will just log success and exit.
    // If you want to restore the full logic, replace the lines below with your
    // original job processing loop and overallResults handling.

    // Example of how you WOULD use the logger for the original logic:
    /*
    const defaultInputFromSchema = { ... };
    const effectiveInput = { ...defaultInputFromSchema, ...input };
    actorLog.info('ACTOR_MAIN_LOGIC: Effective input (summary):', { videos: effectiveInput.videoUrls.length });
    // ... rest of your original actorMainLogic ...
    // const processJob = async (job) => {
    //     const jobLogger = actorLog.child({ prefix: `Job-${job.videoId.substring(0,4)}-${job.id.substring(0,4)}: ` });
    //     const worker = new YouTubeViewWorker(job, effectiveInput, proxyUrlString, jobLogger);
    //     // ...
    // };
    */

    actorLog.info('Actor minimal test completed. Will now exit successfully.');
    if(Actor.isAtHome && Actor.exit) await Actor.exit("Minimal test completed successfully.");
    else { actorLog.info("Actor.exit not available. Minimal test complete."); }
}

// --- Actor Entry Point ---
Actor.main(actorMainLogic);

console.log('MAIN.JS: Script fully loaded. Actor.main is set up.');
