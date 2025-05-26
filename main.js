const Apify = require('apify');
const { Actor, log, ProxyConfiguration } = Apify;
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { to } = require('await-to-js');
const { v4: uuidv4 } = require('uuid');
const { URL } = require('url'); // For parsing proxy URL

chromium.use(StealthPlugin());

// ... (extractVideoId, random, getSafeLogger, handleYouTubeConsent remain the same) ...
// ... (applyAntiDetectionScripts remains the same) ...


class YouTubeViewWorker {
    constructor(job, effectiveInput, proxyUrlString, baseLogger) { // proxyUrlString is the full URL string
        this.job = job;
        this.effectiveInput = effectiveInput;
        this.proxyUrlString = proxyUrlString; // Store the string
        this.logger = getSafeLogger(baseLogger).child({ prefix: `Worker-${job.videoId.substring(0, 6)}` });
        // ... rest of constructor ...
        this.id = uuidv4();
        this.browser = null; 
        this.context = null; 
        this.page = null;
        this.killed = false;
        this.adWatchState = {
            isWatchingAd: false,
            timeToWatchThisAdBeforeSkip: 0,
            adPlayedForEnoughTime: false,
            adStartTime: 0,
        };
        this.lastReportedVideoTimeSeconds = 0;
    }

    async startWorker() {
        this.logger.info(`Launching browser... Proxy: ${this.proxyUrlString ? 'Yes' : 'No'}, Headless: ${this.effectiveInput.headless}`);
        
        const userAgentStrings = [ /* ... */ ];
        const selectedUserAgent = userAgentStrings[random(userAgentStrings.length - 1)];

        const launchOptions = {
            headless: this.effectiveInput.headless,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
                '--disable-gpu', '--disable-blink-features=AutomationControlled',
                `--window-size=${1280 + random(0, 640)},${720 + random(0, 360)}`
            ],
        };

        if (this.proxyUrlString) {
            try {
                const parsedProxy = new URL(this.proxyUrlString);
                launchOptions.proxy = {
                    server: `${parsedProxy.protocol}//${parsedProxy.hostname}:${parsedProxy.port}`,
                    username: parsedProxy.username ? decodeURIComponent(parsedProxy.username) : undefined,
                    password: parsedProxy.password ? decodeURIComponent(parsedProxy.password) : undefined,
                };
                this.logger.info(`Parsed proxy for Playwright: server=${launchOptions.proxy.server}, user=${launchOptions.proxy.username ? '***' : 'N/A'}`);
            } catch (e) {
                this.logger.error(`Failed to parse proxy URL string: ${this.proxyUrlString}. Error: ${e.message}`);
                // Decide: throw error or proceed without proxy? For now, throw.
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
        });
        this.logger.info('Browser context created.');

        if (this.job.referer) {
            this.logger.info(`Setting referer: ${this.job.referer}`);
            await this.context.setExtraHTTPHeaders({ 'Referer': this.job.referer });
        }
        this.page = await this.context.newPage();
        this.logger.info('New page created.');
        
        if (this.effectiveInput.customAntiDetection) {
            await applyAntiDetectionScripts(this.page, this.logger);
        }
        
        // ... (rest of startWorker, handleAds, watchVideo, kill methods remain the same) ...
        // Make sure they use this.logger or pass it correctly.
        this.logger.info(`Navigating to: ${this.job.videoUrl}`);
        await this.page.goto(this.job.videoUrl, { waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 * 0.7 });
        this.logger.info('Navigation (domcontentloaded) complete.');
        await this.page.waitForLoadState('load', { timeout: this.effectiveInput.timeout * 1000 * 0.3 }).catch(e => this.logger.warn(`Page 'load' state timeout: ${e.message.split('\n')[0]}`));
        this.logger.info('Page load state reached.');

        await handleYouTubeConsent(this.page, this.logger);
        await this.page.waitForTimeout(random(2000,4000));

        try {
            await this.page.waitForSelector('video.html5-main-video', { timeout: 25000, state: 'attached' });
            this.logger.info('Video element attached.');
            await this.page.evaluate(async () => { 
                const video = document.querySelector('video.html5-main-video');
                if (video && video.readyState < 1) { 
                    return new Promise((resolve, reject) => {
                        const tid = setTimeout(() => reject(new Error('Video metadata load timeout (15s)')), 15000);
                        video.onloadedmetadata = () => { clearTimeout(tid); resolve(undefined); }; 
                        video.onerror = (e) => {clearTimeout(tid); reject(new Error('Video element error on metadata: ' + (e.target?.error?.message || 'Unknown'))); };
                    });
                }
            }).catch(e => this.logger.warn(`Video metadata script error: ${e.message}`));

            const duration = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.duration);
            if (duration && !isNaN(duration) && isFinite(duration)) {
                this.job.video_info.duration = Math.round(duration);
                this.logger.info(`Video duration: ${this.job.video_info.duration}s`);
            } else {
                this.logger.warn(`Invalid/Unavailable video duration (${duration}), using default 300s.`);
                this.job.video_info.duration = 300;
            }
        } catch (e) {
            this.logger.warn(`Error during video duration check: ${e.message}. Using default 300s.`);
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
                    const qualityOptions = await this.page.locator('.ytp-quality-menu .ytp-menuitem').all(); 
                    if (qualityOptions.length > 0) {
                        let lowestQualityOptionElement = qualityOptions[qualityOptions.length - 1]; 
                         const textContent = await lowestQualityOptionElement.textContent(); // Use textContent
                         if (textContent && textContent.toLowerCase().includes('auto')) { 
                             if (qualityOptions.length > 1) lowestQualityOptionElement = qualityOptions[qualityOptions.length - 2];
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
            if (await this.page.locator('.ytp-settings-menu').isVisible({timeout:500})) {
                 await this.page.keyboard.press('Escape').catch(()=>{});
            }
        }
        
        try { 
            const playSelectors = [
                'button.ytp-large-play-button[aria-label*="Play"]',
                'button.ytp-play-button[aria-label*="Play"]',
                '.ytp-play-button:not([aria-label*="Pause"])', 
                'div[role="button"][aria-label*="Play"]'
            ];
            let playClicked = false;
            for(const selector of playSelectors) {
                const button = this.page.locator(selector).first();
                if(await button.isVisible({timeout: 2000})) {
                    await button.click({timeout: 2000, force: true});
                    this.logger.info(`Clicked play button via selector: ${selector}`);
                    playClicked = true;
                    break;
                }
            }
            if (!playClicked) {
                 this.logger.info('No standard play button found, attempting JS play.');
                 await this.page.evaluate(() => {
                    const video = document.querySelector('video.html5-main-video');
                    if (video && video.paused) video.play().catch(e => console.warn("JS play() failed in startWorker:", e.message));
                });
            }
        } catch(e) { this.logger.warn(`Error trying to play video: ${e.message.split('\n')[0]}`); }
        await this.page.waitForTimeout(random(2000, 4500));
        return true;
    }

    async handleAds() {
        const adPlayingSelectors = ['.ad-showing', '.ytp-ad-player-overlay-instream-info', '.video-ads .ad-container:not([style*="display: none"])'];
        const adSkipButtonSelectors = ['.ytp-ad-skip-button-modern', '.ytp-ad-skip-button', '.videoAdUiSkipButton'];

        let adIsCurrentlyPlaying = false;
        for (const selector of adPlayingSelectors) {
            if (await this.page.locator(selector).first().isVisible({ timeout: 300 })) {
                adIsCurrentlyPlaying = true; this.logger.debug(`Ad indicator "${selector}" visible.`); break;
            }
        }

        if (!adIsCurrentlyPlaying) {
            if (this.adWatchState.isWatchingAd) { this.logger.info('Ad seems to have ended.'); this.adWatchState.isWatchingAd = false;}
            return false;
        }
        
        if (!this.adWatchState.isWatchingAd) {
            this.adWatchState.isWatchingAd = true; this.adWatchState.adPlayedForEnoughTime = false;
            const minSkip = this.effectiveInput.skipAdsAfter[0]; const maxSkip = this.effectiveInput.skipAdsAfter[1];
            this.adWatchState.timeToWatchThisAdBeforeSkip = random(minSkip, maxSkip);
            this.adWatchState.adStartTime = Date.now();
            this.logger.info(`Ad detected. Will try skip after ~${this.adWatchState.timeToWatchThisAdBeforeSkip}s.`);
        }
        
        const adElapsedTimeSeconds = (Date.now() - this.adWatchState.adStartTime) / 1000;
        if (!this.adWatchState.adPlayedForEnoughTime && adElapsedTimeSeconds >= this.adWatchState.timeToWatchThisAdBeforeSkip) {
            this.adWatchState.adPlayedForEnoughTime = true;
            this.logger.info(`Ad played for ${adElapsedTimeSeconds.toFixed(1)}s. Checking for skip.`);
        }

        if (this.effectiveInput.autoSkipAds && this.adWatchState.adPlayedForEnoughTime) {
            for (const selector of adSkipButtonSelectors) {
                try {
                    const skipButton = this.page.locator(selector).first();
                    if (await skipButton.isVisible({ timeout: 300 }) && await skipButton.isEnabled({ timeout: 300 })) {
                        this.logger.info(`Clicking ad skip button: "${selector}"`);
                        await skipButton.click({ timeout: 1000, force: true });
                        await this.page.waitForTimeout(random(1200, 1800));
                        this.adWatchState.isWatchingAd = false;
                        return true; // Ad skipped
                    }
                } catch (e) { this.logger.debug(`Skip btn "${selector}" not actionable: ${e.message.split('\n')[0]}`); }
            }
            this.logger.debug('Ad played long enough, but no skip button was actionable yet.');
        } else if (this.effectiveInput.autoSkipAds) {
            this.logger.debug(`Ad playing (for ${adElapsedTimeSeconds.toFixed(1)}s), target: ~${this.adWatchState.timeToWatchThisAdBeforeSkip}s.`);
        } else {
             this.logger.info('autoSkipAds is false. Watching ad.');
        }
        return true; 
    }

    async watchVideo() {
        if (!this.page || this.page.isClosed()) throw new Error('Page not initialized/closed.');

        const videoDurationSeconds = this.job.video_info.duration;
        const targetWatchPercentage = this.job.watch_time;
        const targetVideoPlayTimeSeconds = Math.max(10, (targetWatchPercentage / 100) * videoDurationSeconds); 

        this.logger.info(`Watch target: ${targetWatchPercentage}% of ${videoDurationSeconds.toFixed(0)}s = ${targetVideoPlayTimeSeconds.toFixed(0)}s. URL: ${this.job.videoUrl}`);
        
        const overallWatchStartTime = Date.now();
        const maxWatchLoopDurationMs = this.effectiveInput.timeout * 1000 * 0.90; 
        const checkInterval = 5000; 

        while (!this.killed) {
            const loopIterationStartTime = Date.now();
            if (this.page.isClosed()) { this.logger.warn('Page closed during watch.'); break; }
            if (Date.now() - overallWatchStartTime > maxWatchLoopDurationMs) {
                this.logger.warn('Watch loop max duration exceeded. Ending.');
                break;
            }

            const adIsPresent = await this.handleAds();
            if (adIsPresent) {
                await Apify.utils.sleep(Math.max(0, checkInterval - (Date.now() - loopIterationStartTime)));
                continue;
            }
            
            let currentVideoTime = 0, isVideoPaused = true, hasVideoEnded = false;
            try {
                const videoState = await this.page.evaluate(() => {
                    const video = document.querySelector('video.html5-main-video');
                    if (!video) return { currentTime: 0, paused: true, ended: true, readyState: 0 };
                    return { currentTime: video.currentTime, paused: video.paused, ended: video.ended, readyState: video.readyState };
                });
                currentVideoTime = videoState.currentTime || 0; isVideoPaused = videoState.paused; hasVideoEnded = videoState.ended;
                if (videoState.readyState < 2 && currentVideoTime < 1 && (Date.now() - overallWatchStartTime > 30000) ) {
                    this.logger.warn('Video stuck at start (readyState < 2) after 30s.');
                }
            } catch (e) { this.logger.warn(`Err getting video state: ${e.message.split('\n')[0]}`); if (e.message.includes('Target closed')) throw e; }
            
            this.lastReportedVideoTimeSeconds = currentVideoTime;
            this.logger.debug(`VidTime: ${currentVideoTime.toFixed(1)}s. Paused: ${isVideoPaused}. Ended: ${hasVideoEnded}`);

            if (isVideoPaused && !hasVideoEnded && currentVideoTime < targetVideoPlayTimeSeconds) {
                this.logger.info('Video paused, attempting to resume.');
                try {
                    await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); if (v && v.paused) v.play().catch(console.error); });
                    await this.page.locator('button.ytp-play-button[aria-label*="Play"]').first().click({timeout:1000, force:true}).catch(()=>{});
                } catch (e) { this.logger.warn(`Resume fail: ${e.message.split('\n')[0]}`);}
            }

            if (hasVideoEnded) { this.logger.info('Video playback ended.'); break; }
            if (!this.job.video_info.isLive && currentVideoTime >= targetVideoPlayTimeSeconds) {
                this.logger.info(`Target VOD watch time (${targetVideoPlayTimeSeconds.toFixed(0)}s) reached.`); break;
            }
            if (this.job.video_info.isLive && (Date.now() - overallWatchStartTime >= targetVideoPlayTimeSeconds * 1000)) {
                 this.logger.info(`Live stream target duration (${targetVideoPlayTimeSeconds.toFixed(0)}s) reached.`); break;
            }
            await Apify.utils.sleep(Math.max(0, checkInterval - (Date.now() - loopIterationStartTime)));
        }
        const actualOverallWatchDurationMs = Date.now() - overallWatchStartTime;
        this.logger.info(`Finished watch. Total loop time: ${(actualOverallWatchDurationMs / 1000).toFixed(1)}s. Last video time: ${this.lastReportedVideoTimeSeconds.toFixed(1)}s.`);
        return { actualOverallWatchDurationMs, lastReportedVideoTimeSeconds: this.lastReportedVideoTimeSeconds, targetVideoPlayTimeSeconds };
    }

    async kill() {
        this.killed = true;
        this.logger.info('Kill signal received. Closing resources.');
        if (this.page && !this.page.isClosed()) {
            await this.page.close().catch(e => this.logger.warn(`Error closing page: ${e.message}`));
        }
        this.page = null;
        if (this.context) {
            await this.context.close().catch(e => this.logger.warn(`Error closing context: ${e.message}`));
        }
        this.context = null;
        if (this.browser) {
            await this.browser.close().catch(e => this.logger.warn(`Error closing browser: ${e.message}`));
        }
        this.browser = null;
        this.logger.info('Resources closed.');
    }
}


async function applyAntiDetectionScripts(page, loggerToUse) {
    const safeLogger = getSafeLogger(loggerToUse);
    const script = () => {
        // WebDriver
        if (navigator.webdriver === true) Object.defineProperty(navigator, 'webdriver', { get: () => false });
        // Languages
        if (navigator.languages && !navigator.languages.includes('en-US')) Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        if (navigator.language !== 'en-US') Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
        // WebGL - Be cautious with this as it can be too aggressive or break sites
        try {
            const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (parameter) {
                // Allow specific canvases to bypass if needed for tests or specific site functionality
                if (this.canvas && (this.canvas.id === 'webgl-fingerprint-canvas-test' || this.canvas.id === 'some-known-legit-canvas')) {
                     return originalGetParameter.apply(this, arguments);
                }
                // Spoof specific WebGL parameters known to be used in fingerprinting
                if (parameter === 37445 /* UNMASKED_VENDOR_WEBGL */) return 'Google Inc. (Intel)';
                if (parameter === 37446 /* UNMASKED_RENDERER_WEBGL */) return 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 640, OpenGL 4.1)';
                // Add more known parameters to spoof if necessary
                // e.g., if (parameter === WebGLRenderingContext.VERSION) return "WebGL 1.0";
                return originalGetParameter.apply(this, arguments);
            };
        } catch (e) { console.debug('[AntiDetect] Failed WebGL spoof:', e.message); }
        // Canvas - Noise addition (can slightly degrade image quality)
        try {
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function() {
                if (this.id === 'canvas-fingerprint-element-test') return originalToDataURL.apply(this, arguments); // Bypass for specific test elements
                const shift = { 
                    r: Math.floor(Math.random()*4)-2, // Smaller noise values
                    g: Math.floor(Math.random()*4)-2, 
                    b: Math.floor(Math.random()*4)-2, 
                    // a: Math.floor(Math.random()*4)-2 // Avoid alpha modification generally
                };
                const ctx = this.getContext('2d');
                if (ctx && this.width > 0 && this.height > 0) {
                    try {
                        const imageData = ctx.getImageData(0,0,this.width,this.height);
                        for(let i=0; i<imageData.data.length; i+=4){
                            imageData.data[i]   = Math.min(255,Math.max(0,imageData.data[i]   + shift.r));
                            imageData.data[i+1] = Math.min(255,Math.max(0,imageData.data[i+1] + shift.g));
                            imageData.data[i+2] = Math.min(255,Math.max(0,imageData.data[i+2] + shift.b));
                        }
                        ctx.putImageData(imageData,0,0);
                    } catch(e) { console.debug('[AntiDetect] Failed Canvas noise application:', e.message); }
                }
                return originalToDataURL.apply(this, arguments);
            };
        } catch (e) { console.debug('[AntiDetect] Failed Canvas dataURL spoof:', e.message); }
        // Permissions API
        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
            const originalPermissionsQuery = navigator.permissions.query;
            navigator.permissions.query = (parameters) => ( 
                parameters.name === 'notifications' ? 
                Promise.resolve({ state: Notification.permission || 'prompt' }) : 
                originalPermissionsQuery.call(navigator.permissions, parameters) 
            );
        }
        // Screen properties
        if (window.screen) {
            try {
                Object.defineProperty(window.screen, 'availWidth', { get: () => 1920, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'availHeight', { get: () => 1040, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'width', { get: () => 1920, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'height', { get: () => 1080, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'colorDepth', { get: () => 24, configurable: true, writable: false });
                Object.defineProperty(window.screen, 'pixelDepth', { get: () => 24, configurable: true, writable: false });
            } catch (e) { console.debug('[AntiDetect] Failed screen spoof:', e.message); }
        }
        // Timezone (Example: New York, UTC-5 during standard time)
        try { Date.prototype.getTimezoneOffset = function() { return 5 * 60; }; } catch (e) { console.debug('[AntiDetect] Failed timezone spoof:', e.message); }
        // Plugins & MimeTypes (report as empty, or a very minimal common set)
        if (navigator.plugins) try { Object.defineProperty(navigator, 'plugins', { get: () => [], configurable: true }); } catch(e) { console.debug('[AntiDetect] Failed plugin spoof:', e.message); }
        if (navigator.mimeTypes) try { Object.defineProperty(navigator, 'mimeTypes', { get: () => [], configurable: true }); } catch(e) { console.debug('[AntiDetect] Failed mimeType spoof:', e.message); }
    };

    try {
        await page.addInitScript(script);
        safeLogger.info('Custom anti-detection script added via addInitScript.');
    } catch (e) {
        safeLogger.error(`Failed to add init script: ${e.message}`);
    }
}


async function actorMainLogic() {
    const actorLog = getSafeLogger(log);
    await Actor.init(); 
    actorLog.info('Starting YouTube View Bot (Custom Playwright with Stealth).');

    const input = await Actor.getInput();
    if (!input) { actorLog.error('No input provided.'); await Actor.fail('No input provided.'); return; }

    const defaultInput = {
        videoUrls: [], refererUrls: [], watchTimePercentage: 85,
        useProxies: true, proxyCountry: 'US', proxyGroups: ['RESIDENTIAL'],
        headless: true, autoSkipAds: true, skipAdsAfterMinSeconds: 5, skipAdsAfterMaxSeconds: 12,
        timeout: 120, concurrency: 1, concurrencyInterval: 5,
        customAntiDetection: true,
    };
    const effectiveInput = { ...defaultInput, ...input };
    effectiveInput.skipAdsAfter = [
        Math.max(0, effectiveInput.skipAdsAfterMinSeconds || 0),
        Math.max(effectiveInput.skipAdsAfterMinSeconds || 0, effectiveInput.skipAdsAfterMaxSeconds || (effectiveInput.skipAdsAfterMinSeconds || 0) + 7)
    ];
    actorLog.info('Effective input (summary):', { videos: effectiveInput.videoUrls.length, proxy: effectiveInput.proxyCountry, headless: effectiveInput.headless, watchPercent: effectiveInput.watchTimePercentage });

    if (!effectiveInput.videoUrls || effectiveInput.videoUrls.length === 0) {
        actorLog.error('No videoUrls provided.'); await Actor.fail('No videoUrls provided.'); return;
    }

    let actorProxyConfiguration = null;
    if (effectiveInput.useProxies) {
        const proxyOpts = { groups: effectiveInput.proxyGroups || ['RESIDENTIAL'] };
        if (effectiveInput.proxyCountry && effectiveInput.proxyCountry !== "ANY") proxyOpts.countryCode = effectiveInput.proxyCountry;
        try {
            actorProxyConfiguration = await Actor.createProxyConfiguration(proxyOpts); // CORRECTED
            actorLog.info(`Apify Proxy: Country=${proxyOpts.countryCode || 'Any'}, Groups=${(proxyOpts.groups).join(', ')}`);
        } catch (e) { actorLog.error(`Failed Apify Proxy config: ${e.message}.`); actorProxyConfiguration = null; }
    }

    const jobs = [];
    for (let i = 0; i < effectiveInput.videoUrls.length; i++) {
        const videoUrl = effectiveInput.videoUrls[i];
        const videoId = extractVideoId(videoUrl);
        if (!videoId) { actorLog.warn(`Invalid YouTube URL/ID: "${videoUrl}". Skipping.`); await Actor.pushData({ videoUrl, status: 'error', error: 'Invalid YouTube URL' }); continue; }
        const refererUrl = (effectiveInput.refererUrls && effectiveInput.refererUrls[i] && effectiveInput.refererUrls[i].trim() !== "") ? effectiveInput.refererUrls[i].trim() : null;
        jobs.push({ id: uuidv4(), videoUrl, videoId, referer: refererUrl, video_info: { duration: 300, isLive: false }, watch_time: effectiveInput.watchTimePercentage, jobIndex: i });
    }

    if (jobs.length === 0) { actorLog.error('No valid jobs.'); await Actor.fail('No valid jobs.'); return; }
    actorLog.info(`Created ${jobs.length} job(s). Concurrency: ${effectiveInput.concurrency}`);

    const overallResults = { totalJobs: jobs.length, successfulJobs: 0, failedJobs: 0, details: [], startTime: new Date().toISOString() };
    const activeWorkers = new Set();
    let jobCounter = 0;

    const processJob = async (job) => {
        const jobLogger = actorLog.child({ prefix: `Job-${job.videoId.substring(0,4)}` });
        jobLogger.info(`Starting job ${job.jobIndex + 1}/${jobs.length}, Referer: ${job.referer || 'None'}`);
        let proxyUrlToUse = null;
        let proxyInfoForLog = 'None';

        if (actorProxyConfiguration) {
            const sessionId = `session_${job.id.substring(0, 12).replace(/-/g, '')}`;
            proxyUrlToUse = actorProxyConfiguration.newUrl(sessionId);
            proxyInfoForLog = `ApifyProxy (Session: ${sessionId}, Country: ${effectiveInput.proxyCountry || 'Any'})`;
        } else if (effectiveInput.useProxies) {
             jobLogger.warn(`Proxy requested but not configured.`);
        }

        const worker = new YouTubeViewWorker(job, effectiveInput, proxyUrlToUse, jobLogger); 
        let jobResultData = { 
            jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId, 
            status: 'initiated', proxyUsed: proxyInfoForLog, refererRequested: job.referer 
        };

        try {
            await worker.startWorker();
            const watchResult = await worker.watchVideo();
            Object.assign(jobResultData, watchResult, { status: 'success' }); 
            overallResults.successfulJobs++;
        } catch (error) {
            jobLogger.error(`Error processing: ${error.message}`, { stack: error.stack && error.stack.split('\n').slice(0,5).join(' | ')});
            jobResultData = { ...jobResultData, status: 'failure', error: error.message + (error.stack ? ` STACK_TRACE_SNIPPET: ${error.stack.split('\n').slice(0,3).join(' | ')}` : '') };
            overallResults.failedJobs++;
        } finally {
            await worker.kill();
            jobLogger.info(`Finished. Status: ${jobResultData.status}`);
        }
        overallResults.details.push(jobResultData);
        await Actor.pushData(jobResultData);
    };
    
    const runPromises = [];
    for (const job of jobs) {
        if (activeWorkers.size >= effectiveInput.concurrency) {
            await Promise.race(Array.from(activeWorkers)).catch(e => actorLog.warn(`Error during Promise.race (worker slot wait): ${e.message}`));
        }
        const promise = processJob(job).catch(e => {
            actorLog.error(`Unhandled error directly from processJob promise for ${job.videoId}: ${e.message}`);
            const errorResult = { jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId, status: 'catastrophic_processJob_failure', error: e.message };
            Actor.pushData(errorResult); 
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
            await Apify.utils.sleep(effectiveInput.concurrencyInterval * 1000);
        }
    }
    await Promise.all(runPromises.map(p => p.catch(e => { 
        actorLog.error(`Error caught by Promise.all on worker promise: ${e.message}`);
        return e; 
    })));

    overallResults.endTime = new Date().toISOString();
    actorLog.info('All jobs processed.', { summary: { total: overallResults.totalJobs, success: overallResults.successfulJobs, failed: overallResults.failedJobs }});
    await Actor.setValue('OVERALL_RESULTS', overallResults);
    actorLog.info('Actor finished successfully.');
    await Actor.exit();
}


Actor.main(async () => {
    try {
        await actorMainLogic();
    } catch (error) {
        const loggerToUse = getSafeLogger(log); 
        loggerToUse.error('CRITICAL UNHANDLED ERROR IN Actor.main:', { message: error.message, stack: error.stack });
        
        if (Actor.isAtHome && typeof Actor.isAtHome === 'function' && Actor.isAtHome()) {
            await Actor.fail(`Critical error in Actor.main: ${error.message}`);
        } else {
            console.error("Exiting due to critical error in local/non-Apify environment.");
            process.exit(1);
        }
    }
});

console.log('MAIN.JS: Script fully loaded. Actor.main is set up.');
