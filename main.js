const Apify = require('apify');
const { Actor, log, ProxyConfiguration } = Apify;
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { to } = require('await-to-js');
const { v4: uuidv4 } = require('uuid');
const { URL } = require('url');

chromium.use(StealthPlugin());

function getSafeLogger(loggerInstance) {
    const defaultLogger = {
        info: (msg, data) => console.log(`INFO: ${msg}`, data || ''),
        warn: (msg, data) => console.warn(`WARN: ${msg}`, data || ''),
        error: (msg, data) => console.error(`ERROR: ${msg}`, data || ''),
        debug: (msg, data) => console.log(`DEBUG: ${msg}`, data || ''),
        child: function(childOpts) { 
            const newPrefix = childOpts && childOpts.prefix ? (this.prefix || '') + childOpts.prefix : (this.prefix || '');
            const currentLogger = this;
            return {
                ...currentLogger,
                prefix: newPrefix,
                info: (m, d) => console.log(`INFO: ${newPrefix}${m}`, d || ''),
                warn: (m, d) => console.warn(`WARN: ${newPrefix}${m}`, d || ''),
                error: (m, d) => console.error(`ERROR: ${newPrefix}${m}`, d || ''),
                debug: (m, d) => console.log(`DEBUG: ${newPrefix}${m}`, d || ''),
                exception: (e, m, d) => console.error(`EXCEPTION: ${newPrefix}${m}`, e, d || ''),
            };
        },
        exception: (e, msg, data) => console.error(`EXCEPTION: ${msg}`, e, data || ''),
    };

    if (loggerInstance && 
        typeof loggerInstance.info === 'function' &&
        typeof loggerInstance.warn === 'function' &&
        typeof loggerInstance.error === 'function' &&
        typeof loggerInstance.debug === 'function' &&
        typeof loggerInstance.child === 'function' &&
        typeof loggerInstance.exception === 'function') {
        return loggerInstance;
    }
    // This console.error uses basic console because loggerInstance is faulty
    console.error("APIFY LOGGER WAS NOT AVAILABLE OR INCOMPLETE, FALLING BACK TO CONSOLE.");
    return defaultLogger;
}

function extractVideoIdFromUrl(url, loggerToUse) { // Using your preferred name
    const safeLogger = getSafeLogger(loggerToUse);
    try {
        const urlObj = new URL(url);
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const vParam = urlObj.searchParams.get('v');
            if (vParam && vParam.length === 11) return vParam;
            const pathParts = urlObj.pathname.split('/');
            // For youtu.be/VIDEOID
            if (urlObj.hostname === 'youtu.be' && pathParts.length > 1 && pathParts[1].length === 11) return pathParts[1];
            // For youtube.com/shorts/VIDEOID or youtube.com/embed/VIDEOID
            if (pathParts.length > 2 && (pathParts[1] === 'shorts' || pathParts[1] === 'embed') && pathParts[2].length === 11) return pathParts[2];
            // Fallback for simple youtube.com/VIDEOID (less common)
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

// --- FROM YOUR PREVIOUS WORKING CODE (INTEGRATED) ---
const ANTI_DETECTION_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process,ImprovedCookieControls,LazyFrameLoading,GlobalMediaControls,DestroyProfileOnBrowserClose,MediaRouter,DialMediaRouteProvider,AcceptCHFrame,AutoExpandDetailsElement,CertificateTransparencyEnforcement,AvoidUnnecessaryBeforeUnloadCheckSync,Translate',
    '--disable-component-extensions-with-background-pages',
    '--disable-default-apps', '--disable-extensions', '--disable-site-isolation-trials',
    '--disable-sync', '--force-webrtc-ip-handling-policy=default_public_interface_only',
    '--no-first-run', '--no-service-autorun', '--password-store=basic',
    '--use-mock-keychain', '--enable-precise-memory-info', /*'--window-size=1920,1080', // Let worker randomize this*/
    '--disable-infobars', '--disable-notifications', '--disable-popup-blocking',
    '--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu',
    '--disable-setuid-sandbox', '--disable-software-rasterizer', '--mute-audio',
    '--ignore-certificate-errors',
];

async function applyAntiDetectionScripts(page, loggerToUse) {
    const safeLogger = getSafeLogger(loggerToUse);
    const scriptToInject = () => { // Renamed to avoid conflict if 'script' is used elsewhere
        // WebDriver
        if (navigator.webdriver === true) Object.defineProperty(navigator, 'webdriver', { get: () => false });
        // Languages
        if (navigator.languages && !navigator.languages.includes('en-US')) Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        if (navigator.language !== 'en-US') Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
        // WebGL
        try {
            const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (parameter) {
                if (this.canvas && this.canvas.id === 'webgl-fingerprint-canvas') return originalGetParameter.apply(this, arguments);
                if (parameter === 37445) return 'Google Inc. (Intel)';
                if (parameter === 37446) return 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 640, OpenGL 4.1)';
                return originalGetParameter.apply(this, arguments);
            };
        } catch (e) { console.debug('[AntiDetectInPage] Failed WebGL spoof:', e.message); } // Use console inside page script
        // Canvas
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
        await page.addInitScript(scriptToInject); // Use the renamed variable
        safeLogger.info('Custom anti-detection script (your version) applied via addInitScript.');
    } catch (e) {
        safeLogger.error(`Failed to add init script: ${e.message}`);
    }
}

async function getVideoDuration(page, loggerToUse) {
    const safeLogger = getSafeLogger(loggerToUse);
    safeLogger.info('Attempting to get video duration (your version).');
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
        await Apify.utils.sleep(1000);
    }
    safeLogger.warning('Could not determine video duration after 15 seconds.');
    return null; 
}

async function clickIfExists(page, selector, timeout = 3000, loggerToUse) {
    const safeLogger = getSafeLogger(loggerToUse);
    try {
        const element = page.locator(selector).first();
        await element.waitFor({ state: 'visible', timeout });
        await element.click({ timeout: timeout / 2, force: false, noWaitAfter: false }); // noWaitAfter defaults to false
        safeLogger.info(`Clicked on selector: ${selector}`);
        return true;
    } catch (e) {
        // Check if page is closed before logging
        if (page.isClosed()) {
            console.warn(`Page closed while trying to click selector: ${selector}`); // Use console if logger might be tied to worker
            return false;
        }
        safeLogger.debug(`Selector not found/clickable: ${selector} - Error: ${e.message.split('\n')[0]}`);
        return false;
    }
}


class YouTubeViewWorker {
    // ... (Constructor remains the same as my previous full main.js)
    constructor(job, effectiveInput, proxyUrlString, baseLogger) {
        this.job = job; this.effectiveInput = effectiveInput; this.proxyUrlString = proxyUrlString;
        this.logger = getSafeLogger(baseLogger).child({ prefix: `Worker-${job.videoId.substring(0, 6)}: ` });
        this.id = uuidv4(); this.browser = null; this.context = null; this.page = null; this.killed = false;
        this.adWatchState = { isWatchingAd: false, timeToWatchThisAdBeforeSkip: 0, adPlayedForEnoughTime: false, adStartTime: 0, };
        this.lastReportedVideoTimeSeconds = 0;
    }


    async startWorker() {
        this.logger.info(`Launching browser... Proxy: ${this.proxyUrlString ? 'Yes' : 'No'}, Headless: ${this.effectiveInput.headless}`);
        const userAgentStrings = [ /* ... user agents ... */ ];
        const selectedUserAgent = userAgentStrings[random(userAgentStrings.length - 1)];
        const launchOptions = {
            headless: this.effectiveInput.headless,
            args: [...ANTI_DETECTION_ARGS, `--window-size=${1280 + random(0, 640)},${720 + random(0, 360)}`], // Use your args and dynamic size
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
            } catch (e) { /* ... error handling ... */ }
        }
        
        this.browser = await chromium.launch(launchOptions);
        this.logger.info('Browser launched with playwright-extra.');
        this.context = await this.browser.newContext({ /* ... context options from previous ... */ });
        this.logger.info('Browser context created.');

        if (this.job.referer) { /* ... set referer ... */ }
        this.page = await this.context.newPage();
        this.logger.info('New page created.');
        
        if (this.effectiveInput.customAntiDetection) {
            await applyAntiDetectionScripts(this.page, this.logger);
        }
        
        this.logger.info(`Navigating to: ${this.job.videoUrl}`);
        await this.page.goto(this.job.videoUrl, { waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 * 0.7 });
        this.logger.info('Navigation (domcontentloaded) complete.');
        await this.page.waitForLoadState('load', { timeout: this.effectiveInput.timeout * 1000 * 0.3 }).catch(e => this.logger.warn(`Page 'load' state timeout: ${e.message.split('\n')[0]}`));
        this.logger.info('Page load state reached.');

        await handleYouTubeConsent(this.page, this.logger); 
        await this.page.waitForTimeout(random(2000,4000));

        const duration = await getVideoDuration(this.page, this.logger); // Use your function
        if (duration && duration > 0) {
            this.job.video_info.duration = duration;
        } else {
            this.logger.warn(`Could not determine video duration, using default 300s.`);
            this.job.video_info.duration = 300;
        }
        
        // Attempt to set quality
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
        
        // Ensure video is playing using your function
        const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];
        await this.ensureVideoPlaying(playButtonSelectors); // Call the integrated ensureVideoPlaying

        await this.page.waitForTimeout(random(2000, 4500));
        return true;
    }

    async handleAds() { // Your version of handleAds
        this.logger.info('Starting ad handling logic (your version).');
        const adCheckInterval = 3000;
        let adWatchLoop = 0;
        
        const skipAdsAfterConfig = this.effectiveInput.skipAdsAfter; // This is now [min, max]
        const minSkipTime = skipAdsAfterConfig[0];
        // maxSecondsAds from input schema is also relevant
        const maxSecondsAds = this.effectiveInput.maxSecondsAds || 15;

        const maxAdLoopIterations = Math.ceil((maxSecondsAds * 1000) / adCheckInterval) + 5;

        for (adWatchLoop = 0; adWatchLoop < maxAdLoopIterations; adWatchLoop++) {
            if (this.killed || this.page.isClosed()) break;
            let isAdPlaying = false; let canSkip = false; 
            let adCurrentTime = adWatchLoop * (adCheckInterval / 1000);

            isAdPlaying = await this.page.locator('.ytp-ad-player-overlay-instream-info, .video-ads .ad-showing').count() > 0;
            if (isAdPlaying) { 
                this.logger.info('YouTube ad detected.'); 
                canSkip = await this.page.locator('.ytp-ad-skip-button-modern, .ytp-ad-skip-button').count() > 0; 
            }
            
            if (!isAdPlaying) { this.logger.info('No ad currently playing or ad finished.'); break; }
            
            if (this.effectiveInput.autoSkipAds && canSkip) {
                // Your old code's autoSkipAds logic directly tries to click if skippable.
                // The minSkipTime logic applies if autoSkipAds is false OR if it's true but ad is not yet skippable.
                // Let's refine this to be closer to your old logic.
                // If autoSkipAds and canSkip, we might try to skip earlier than minSkipTime if YouTube allows.
                // For "test1111" similarity, skipping is often tied to `ad.canSkip` directly.
                // The `skipAdsAfter` array in current context implies a *delay before trying even if skippable*.
                // Let's use a simplified approach: if autoSkip and skippable, try to click.
                this.logger.info('AutoSkipAds: Attempting to skip ad.');
                if (await clickIfExists(this.page, '.ytp-ad-skip-button-modern, .ytp-ad-skip-button', 1000, this.logger)) {
                    await this.page.waitForTimeout(2000 + random(500, 1000)); continue;
                }
            }
            // This part is for when autoSkipAds might be false, or if the above click failed
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
            await Apify.utils.sleep(adCheckInterval);
        }
        if (adWatchLoop >= maxAdLoopIterations) this.logger.warn('Max ad loop iterations reached in handleAds.');
        this.logger.info('Ad handling logic finished for this check.');
        // Return true if an ad was active and handled (even if just by waiting), false if no ad was playing.
        // This is tricky as the loop breaks if no ad. Let's assume if loop ran, ad was handled.
        return adWatchLoop > 0 && isAdPlaying; // If loop ran and an ad was playing at start of loop
    }

    async ensureVideoPlaying(playButtonSelectors) { // Your version
        const logFn = (msg, level = 'info') => this.logger[level](msg);
        logFn('Ensuring video is playing...');
        for (let attempt = 0; attempt < 3; attempt++) {
            if (this.killed || this.page.isClosed()) return false;
            const isPaused = await this.page.evaluate(() => {
                const video = document.querySelector('video.html5-main-video');
                if (video) {
                    if (video.paused) video.play().catch(e => console.warn('Direct video.play() in eval failed:', e.message)); 
                    return video.paused;
                } return true; 
            }).catch(e => { logFn(`Error evaluating video state for play: ${e.message}`, 'warn'); return true; });

            if (!isPaused) { logFn(`Video is playing (attempt ${attempt + 1}).`); return true; }

            logFn(`Video is paused (attempt ${attempt + 1}), trying to click play buttons.`);
            for (const selector of playButtonSelectors) {
                if (await clickIfExists(this.page, selector, 1500, this.logger)) {
                    logFn(`Clicked play button: ${selector}`);
                    await this.page.waitForTimeout(500); 
                    const stillPaused = await this.page.evaluate(() => document.querySelector('video')?.paused).catch(()=>true);
                    if (!stillPaused) { logFn('Video started playing after click.'); return true; }
                }
            }
            logFn('Trying to click video element directly to play.');
            await this.page.locator('video.html5-main-video').first().click({ timeout: 2000, force: true, trial: true }).catch(e => logFn(`Failed to click video element (trial): ${e.message}`, 'warn'));
            await this.page.waitForTimeout(500);
            const finalCheckPaused = await this.page.evaluate(() => document.querySelector('video')?.paused).catch(()=>true);
            if (!finalCheckPaused) { logFn('Video started playing after general video click.'); return true; }
            if (attempt < 2) await Apify.utils.sleep(1000);
        }
        logFn('Failed to ensure video is playing after multiple attempts.', 'warn');
        return false;
    }

    async watchVideo() { // Adapted to use your helper functions
        if (!this.page || this.page.isClosed()) throw new Error('Page not initialized/closed for watching.');

        const videoDurationSeconds = this.job.video_info.duration;
        const targetWatchPercentage = this.effectiveInput.watchTimePercentage;
        const targetVideoPlayTimeSeconds = Math.max(10, (targetWatchPercentage / 100) * videoDurationSeconds);

        this.logger.info(`Watch target: ${targetWatchPercentage}% of ${videoDurationSeconds.toFixed(0)}s = ${targetVideoPlayTimeSeconds.toFixed(0)}s.`);
        
        const overallWatchStartTime = Date.now();
        const maxOverallWatchDurationMs = this.effectiveInput.timeout * 1000 * 0.95; // Max time for this whole video watching phase
        const checkIntervalMs = 5000; 
        let currentActualVideoTime = 0;

        while (!this.killed) {
            const loopIterationStartTime = Date.now();
            if (this.page.isClosed()) { this.logger.warn('Page closed during watch.'); break; }
            if (Date.now() - overallWatchStartTime > maxOverallWatchDurationMs) {
                this.logger.warn('Max watch duration for this video exceeded. Ending.'); break;
            }

            await this.handleAds(); // Use your integrated handleAds
            
            const videoState = await this.page.evaluate(() => { 
                const v = document.querySelector('video.html5-main-video'); 
                return v ? { ct:v.currentTime, p:v.paused, e:v.ended, rs:v.readyState } : null; 
            }).catch(e => { this.logger.warn(`Video state error: ${e.message}`); return null; });
            
            if (!videoState) {
                this.logger.warn('Video element not found in evaluate during watch loop. Trying to recover.');
                await Apify.utils.sleep(2000); // was Apify.utils.sleep
                const videoExists = await this.page.locator('video.html5-main-video').count() > 0;
                if (!videoExists) throw new Error('Video element disappeared definitively during watch loop.');
                continue; 
            }

            this.logger.debug(`State: time=${videoState.ct?.toFixed(1)}, paused=${videoState.p}, ended=${videoState.e}, ready=${videoState.rs}`);
            currentActualVideoTime = videoState.ct || 0;
            
            if (videoState.p && !videoState.e && currentActualVideoTime < targetVideoPlayTimeSeconds) {
                this.logger.info('Video paused, ensuring play.');
                await this.ensureVideoPlaying(
                    ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video']
                );
            }
            
            if (videoState.e) { this.logger.info('Video ended.'); break; }
            if (currentActualVideoTime >= targetVideoPlayTimeSeconds) { 
                this.logger.info(`Target watch time reached. Actual: ${currentActualVideoTime.toFixed(1)}s`); break; 
            }
            
            // Simulate mouse move occasionally from your old code
            if (Math.floor((Date.now() - overallWatchStartTime) / 1000) % 30 < 5 ) { // Roughly every 30s for 5s
                 await this.page.mouse.move(random(100,500),random(100,300),{steps:random(3,7)}).catch(()=>{}); 
                 this.logger.debug('Simulated mouse move.');
            }

            await Apify.utils.sleep(Math.max(0, checkIntervalMs - (Date.now() - loopIterationStartTime))); // CORRECTED
        }
        const actualOverallWatchDurationMs = Date.now() - overallWatchStartTime;
        this.logger.info(`Finished watch. Total loop: ${(actualOverallWatchDurationMs / 1000).toFixed(1)}s. Last video time: ${currentActualVideoTime.toFixed(1)}s.`);
        return { actualOverallWatchDurationMs, lastReportedVideoTimeSeconds: currentActualVideoTime, targetVideoPlayTimeSeconds };
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


async function actorMainLogic() {
    await Actor.init();
    const actorLog = getSafeLogger(log); 
    
    actorLog.info('Starting YouTube View Bot (Custom Playwright with Stealth & Integrated Logic).');

    const input = await Actor.getInput();
    if (!input) { actorLog.error('No input provided.'); await Actor.fail('No input provided.'); return; }

    const defaultInputFromSchema = { /* ... (Your schema's defaults) ... */ };
    const effectiveInput = { ...defaultInputFromSchema, ...input };
    
    // Parse skipAdsAfter from schema into the [min, max] array needed
    let tempSkipAds = effectiveInput.skipAdsAfter; 
    if (Array.isArray(tempSkipAds) && tempSkipAds.length > 0 && tempSkipAds.every(s => typeof s === 'string' || typeof s === 'number')) {
        const parsedSkipAds = tempSkipAds.map(s => parseInt(String(s), 10)).filter(n => !isNaN(n));
        if (parsedSkipAds.length === 1) effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[0] + 5];
        else if (parsedSkipAds.length >= 2) effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[1]];
        else effectiveInput.skipAdsAfter = [5, 12]; 
    } else { 
        effectiveInput.skipAdsAfter = [5, 12]; 
    }
    if (typeof input.skipAdsAfterMinSeconds === 'number' && typeof input.skipAdsAfterMaxSeconds === 'number') { // Prioritize explicit min/max if present
        effectiveInput.skipAdsAfter = [ Math.max(0, input.skipAdsAfterMinSeconds), Math.max(input.skipAdsAfterMinSeconds, input.skipAdsAfterMaxSeconds)];
    }
    // Ensure maxSecondsAds is used if defined
    effectiveInput.maxSecondsAds = effectiveInput.maxSecondsAds || 15;


    actorLog.info('Effective input (summary):', { videos: effectiveInput.videoUrls.length, proxy: effectiveInput.proxyCountry, headless: effectiveInput.headless, watchPercent: effectiveInput.watchTimePercentage, customAntiDetect: effectiveInput.customAntiDetection });

    if (!effectiveInput.videoUrls || effectiveInput.videoUrls.length === 0) { /* ... fail ... */ }

    let actorProxyConfiguration = null;
    if (effectiveInput.useProxies && !(effectiveInput.proxyUrls && effectiveInput.proxyUrls.length > 0) ) { // Only use Apify proxy if no custom ones
        const proxyOpts = { groups: effectiveInput.proxyGroups || ['RESIDENTIAL'] };
        if (effectiveInput.proxyCountry && effectiveInput.proxyCountry.trim() !== "" && effectiveInput.proxyCountry.toUpperCase() !== "ANY") proxyOpts.countryCode = effectiveInput.proxyCountry;
        try {
            actorProxyConfiguration = await Actor.createProxyConfiguration(proxyOpts);
            actorLog.info(`Apify Proxy: Country=${proxyOpts.countryCode || 'Any'}, Groups=${(proxyOpts.groups).join(', ')}`);
        } catch (e) { actorLog.error(`Failed Apify Proxy config: ${e.message}.`); actorProxyConfiguration = null; }
    }

    const jobs = [];
    for (let i = 0; i < effectiveInput.videoUrls.length; i++) {
        const url = effectiveInput.videoUrls[i];
        const videoId = extractVideoIdFromUrl(url, actorLog); 
        if (!videoId) { actorLog.warn(`Invalid YouTube URL/ID: "${url}". Skipping.`); await Actor.pushData({ url, status: 'error', error: 'Invalid YouTube URL' }); continue; }
        
        const watchType = (effectiveInput.watchTypes && effectiveInput.watchTypes[i]) || 'direct';
        const refererUrl = (watchType === 'referer' && effectiveInput.refererUrls && effectiveInput.refererUrls[i] && effectiveInput.refererUrls[i].trim() !== "") 
            ? effectiveInput.refererUrls[i].trim() 
            : null;
        
        let searchKeywords = [];
        if (watchType === 'search' && effectiveInput.searchKeywordsForEachVideo && typeof effectiveInput.searchKeywordsForEachVideo[i] === 'string') {
            searchKeywords = effectiveInput.searchKeywordsForEachVideo[i].split(',').map(kw => kw.trim()).filter(kw => kw.length > 0);
        }
        
        jobs.push({ 
            id: uuidv4(), videoUrl: url, videoId, platform: 'youtube', // Assuming only YouTube for now
            referer: refererUrl, video_info: { duration: 300, isLive: false }, 
            watch_time: effectiveInput.watchTimePercentage, jobIndex: i, 
            watchType, searchKeywords 
        });
    }

    if (jobs.length === 0) { actorLog.error('No valid jobs.'); await Actor.fail('No valid jobs.'); return; }
    actorLog.info(`Created ${jobs.length} job(s). Concurrency: ${effectiveInput.concurrency}`);

    const overallResults = { /* ... */ }; // Same as before
    const activeWorkers = new Set();
    let jobCounter = 0;

    const processJob = async (job) => {
        const jobLogger = actorLog.child({ prefix: `Job-${job.videoId.substring(0,4)}: ` });
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

        // --- Search Logic Integration Point ---
        if (job.watchType === 'search' && job.searchKeywords && job.searchKeywords.length > 0) {
            jobLogger.info(`Attempting YouTube search for keywords: "${job.searchKeywords.join(', ')}" to find video ID: ${job.videoId}`);
            let searchBrowser = null, searchContext = null, searchPage = null;
            try {
                const tempLaunchOptions = { headless: effectiveInput.headless, args: [...ANTI_DETECTION_ARGS] };
                if(proxyUrlString) tempLaunchOptions.proxy = (new URL(proxyUrlString)).protocol === 'http:' // Basic check, refine if needed
                    ? { server: proxyUrlString } 
                    : { server: proxyUrlString }; // Playwright handles http/https/socks in server string

                searchBrowser = await chromium.launch(tempLaunchOptions);
                searchContext = await searchBrowser.newContext({ userAgent: selectedUserAgent }); // Use a consistent UA
                searchPage = await searchContext.newPage();
                if (effectiveInput.customAntiDetection) await applyAntiDetectionScripts(searchPage, jobLogger);
                
                const searchQuery = job.searchKeywords[random(job.searchKeywords.length - 1)];
                const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
                jobLogger.info(`Navigating to search URL: ${youtubeSearchUrl}`);
                await searchPage.goto(youtubeSearchUrl, { waitUntil: 'domcontentloaded', timeout: effectiveInput.timeout * 1000 });
                await handleYouTubeConsent(searchPage, jobLogger); // Handle consent on search page too
                
                const videoLinkSelector = `a#video-title[href*="/watch?v=${job.videoId}"]`;
                jobLogger.info(`Looking for video link: ${videoLinkSelector}`);
                const videoLinkElement = searchPage.locator(videoLinkSelector).first();
                await videoLinkElement.waitFor({ state: 'visible', timeout: 45000 });
                
                const href = await videoLinkElement.getAttribute('href');
                const fullVideoUrl = `https://www.youtube.com${href}`;
                jobLogger.info(`Video found via search: ${fullVideoUrl}. Updating job URL and setting referer.`);
                job.videoUrl = fullVideoUrl; // Update job's URL to the direct link
                job.referer = youtubeSearchUrl; // Set referer to the search results page
                job.watchType = 'direct'; // Now proceed as direct navigation with referer
            } catch (searchError) {
                jobLogger.error(`YouTube search failed: ${searchError.message}. Falling back to direct URL: ${job.videoUrl}`);
                // job.videoUrl remains the original, job.referer might be null or previous value
            } finally {
                if (searchPage) await searchPage.close().catch(e => jobLogger.debug(`Search page close error: ${e.message}`));
                if (searchContext) await searchContext.close().catch(e => jobLogger.debug(`Search context close error: ${e.message}`));
                if (searchBrowser) await searchBrowser.close().catch(e => jobLogger.debug(`Search browser close error: ${e.message}`));
            }
        }
        // --- End Search Logic ---


        const worker = new YouTubeViewWorker(job, effectiveInput, proxyUrlString, jobLogger); 
        let jobResultData = { /* ... */ }; 

        try {
            await worker.startWorker(); // This will now use the potentially updated job.videoUrl and job.referer
            const watchResult = await worker.watchVideo();
            Object.assign(jobResultData, watchResult, { status: 'success' }); 
            overallResults.successfulJobs++;
        } catch (error) { /* ... */ } finally { /* ... */ }
        overallResults.details.push(jobResultData);
        await Actor.pushData(jobResultData);
    };
    
    const runPromises = [];
    for (const job of jobs) { /* ... Concurrency logic same as before, ensure actorLog is used ... */ }
    await Promise.all(runPromises.map(p => p.catch(e => { /* ... */ })));

    overallResults.endTime = new Date().toISOString();
    actorLog.info('All jobs processed.', { /* ... */ });
    await Actor.setValue('OVERALL_RESULTS', overallResults);
    actorLog.info('Actor finished successfully.');
    await Actor.exit();
}

Actor.main(async () => { /* ... same as before ... */ });
console.log('MAIN.JS: Script fully loaded. Actor.main is set up.');
