const Apify = require('apify'); // Use Apify directly for utils
const { Actor, log, ProxyConfiguration } = Apify;
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { to } = require('await-to-js');
const { v4: uuidv4 } = require('uuid');
const { URL } = require('url');

chromium.use(StealthPlugin());

// --- FROM YOUR PREVIOUS WORKING CODE ---
const ANTI_DETECTION_ARGS = [ // Your args
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process,ImprovedCookieControls,LazyFrameLoading,GlobalMediaControls,DestroyProfileOnBrowserClose,MediaRouter,DialMediaRouteProvider,AcceptCHFrame,AutoExpandDetailsElement,CertificateTransparencyEnforcement,AvoidUnnecessaryBeforeUnloadCheckSync,Translate',
    '--disable-component-extensions-with-background-pages',
    '--disable-default-apps', '--disable-extensions', '--disable-site-isolation-trials',
    '--disable-sync', '--force-webrtc-ip-handling-policy=default_public_interface_only',
    '--no-first-run', '--no-service-autorun', '--password-store=basic',
    '--use-mock-keychain', '--enable-precise-memory-info', '--window-size=1920,1080',
    '--disable-infobars', '--disable-notifications', '--disable-popup-blocking',
    '--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu',
    '--disable-setuid-sandbox', '--disable-software-rasterizer', '--mute-audio',
    '--ignore-certificate-errors',
];

async function applyAntiDetectionScripts(page, loggerToUse) { // Your version of this function
    const safeLogger = getSafeLogger(loggerToUse);
    const script = () => {
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
        } catch (e) { (typeof safeLogger !== 'undefined' ? safeLogger : console).debug('[AntiDetect] Failed WebGL spoof:', e.message); }
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
                    } catch(e) { (typeof safeLogger !== 'undefined' ? safeLogger : console).debug('[AntiDetect] Failed Canvas noise:', e.message); }
                }
                return originalToDataURL.apply(this, arguments);
            };
        } catch (e) { (typeof safeLogger !== 'undefined' ? safeLogger : console).debug('[AntiDetect] Failed Canvas spoof:', e.message); }
        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
            const originalPermissionsQuery = navigator.permissions.query;
            navigator.permissions.query = (parameters) => ( parameters.name === 'notifications' ? Promise.resolve({ state: Notification.permission || 'prompt' }) : originalPermissionsQuery.call(navigator.permissions, parameters) );
        }
        if (window.screen) { /* ... your screen spoofing ... */ }
        try { Date.prototype.getTimezoneOffset = function() { return 5 * 60; }; } catch (e) { /* ... */ }
        if (navigator.plugins) try { Object.defineProperty(navigator, 'plugins', { get: () => [], configurable: true }); } catch(e) { /* ... */ }
        if (navigator.mimeTypes) try { Object.defineProperty(navigator, 'mimeTypes', { get: () => [], configurable: true }); } catch(e) { /* ... */ }
    };
    try {
        await page.addInitScript(script);
        safeLogger.info('Custom anti-detection script (your version) applied.');
    } catch (e) {
        safeLogger.error(`Failed to add init script: ${e.message}`);
    }
}

function extractVideoIdFromUrl(url, loggerToUse) { // Your version, renamed
    const safeLogger = getSafeLogger(loggerToUse);
    try {
        const urlObj = new URL(url);
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const vParam = urlObj.searchParams.get('v');
            if (vParam) return vParam;
            // For youtu.be/VIDEOID or youtube.com/shorts/VIDEOID
            const pathParts = urlObj.pathname.split('/');
            if (pathParts.length > 1 && pathParts[1].length === 11) return pathParts[1];
            if (pathParts.length > 2 && pathParts[1] === 'shorts' && pathParts[2].length === 11) return pathParts[2];
            if (pathParts.length > 2 && pathParts[1] === 'embed' && pathParts[2].length === 11) return pathParts[2];
        }
        // Rumble support removed as per request
    } catch (error) {
        safeLogger.error(`Error extracting video ID from URL ${url}: ${error.message}`);
    }
    safeLogger.warn(`Could not extract YouTube video ID from: ${url}`);
    return null;
}

async function getVideoDuration(page, loggerToUse) { // Your version
    const safeLogger = getSafeLogger(loggerToUse);
    safeLogger.info('Attempting to get video duration.');
    for (let i = 0; i < 15; i++) { // Try for 15 seconds
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
        await Apify.utils.sleep(1000); // CORRECTED
    }
    safeLogger.warning('Could not determine video duration after 15 seconds.');
    return null; 
}

async function clickIfExists(page, selector, timeout = 3000, loggerToUse) { // Your version
    const safeLogger = getSafeLogger(loggerToUse);
    try {
        const element = page.locator(selector).first();
        await element.waitFor({ state: 'visible', timeout });
        await element.click({ timeout: timeout / 2, force: false, noWaitAfter: false });
        safeLogger.info(`Clicked on selector: ${selector}`);
        return true;
    } catch (e) {
        safeLogger.debug(`Selector not found/clickable: ${selector} - Error: ${e.message.split('\n')[0]}`);
        return false;
    }
}

// --- END OF YOUR PREVIOUS WORKING CODE FUNCTIONS ---

// getSafeLogger and random from my previous response should be here
function getSafeLogger(loggerInstance) { /* ... same as my previous response ... */ }
function random(min, max) { /* ... same as my previous response ... */ }


async function handleYouTubeConsent(page, logger) { /* ... same as my previous response ... */ }


class YouTubeViewWorker {
    constructor(job, effectiveInput, proxyUrlString, baseLogger) {
        this.job = job;
        this.effectiveInput = effectiveInput;
        this.proxyUrlString = proxyUrlString;
        this.logger = getSafeLogger(baseLogger).child({ prefix: `Worker-${job.videoId.substring(0, 6)}: ` });
        this.id = uuidv4();
        this.browser = null; this.context = null; this.page = null; this.killed = false;
    }

    async startWorker() {
        this.logger.info(`Launching browser... Proxy: ${this.proxyUrlString ? 'Yes' : 'No'}, Headless: ${this.effectiveInput.headless}`);
        const userAgentStrings = [ /* ... user agents ... */ ];
        const selectedUserAgent = userAgentStrings[random(userAgentStrings.length - 1)];

        const launchOptions = {
            headless: this.effectiveInput.headless,
            args: [...ANTI_DETECTION_ARGS], // Use your args
        };
        // Update window size from ANTI_DETECTION_ARGS or set dynamically
        const windowSizeArg = ANTI_DETECTION_ARGS.find(arg => arg.startsWith('--window-size='));
        if (!windowSizeArg) {
            launchOptions.args.push(`--window-size=${1280 + random(0, 640)},${720 + random(0, 360)}`);
        }


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
        });
        this.logger.info('Browser context created.');

        if (this.job.referer) {
            this.logger.info(`Setting referer: ${this.job.referer}`);
            await this.context.setExtraHTTPHeaders({ 'Referer': this.job.referer });
        }
        this.page = await this.context.newPage();
        this.logger.info('New page created.');
        
        // Apply your anti-detection scripts
        await applyAntiDetectionScripts(this.page, this.logger);
        
        this.logger.info(`Navigating to: ${this.job.videoUrl}`);
        await this.page.goto(this.job.videoUrl, { waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 * 0.7 });
        this.logger.info('Navigation (domcontentloaded) complete.');
        await this.page.waitForLoadState('load', { timeout: this.effectiveInput.timeout * 1000 * 0.3 }).catch(e => this.logger.warn(`Page 'load' state timeout: ${e.message.split('\n')[0]}`));
        this.logger.info('Page load state reached.');

        // Use the more robust consent handler (integrated or your previous one if preferred)
        await handleYouTubeConsent(this.page, this.logger); 
        await this.page.waitForTimeout(random(2000,4000));

        // Get video duration using your function
        const duration = await getVideoDuration(this.page, this.logger);
        if (duration && duration > 0) {
            this.job.video_info.duration = duration;
        } else {
            this.logger.warn(`Could not determine video duration, using default 300s.`);
            this.job.video_info.duration = 300; // Fallback
        }
        
        // Attempt to set quality (can be fragile)
        try {
            if (await this.page.locator('.ytp-settings-button').first().isVisible({timeout: 10000})) { /* ... quality setting logic ... */ }
        } catch (e) { this.logger.warn(`Quality setting error: ${e.message.split('\n')[0]}`); }
        
        // Ensure video is playing using your function
        const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];
        await this.ensureVideoPlaying(playButtonSelectors); // Call the integrated ensureVideoPlaying

        await this.page.waitForTimeout(random(2000, 4500));
        return true;
    }

    // Integrate your handleAds function
    async handleAds() {
        // This is your detailed handleAds function, adapted to use this.page, this.effectiveInput, this.logger
        // For brevity, the full logic of your handleAds is not pasted here but should be inserted.
        // It will look something like:
        // const loggerToUse = this.logger;
        // const effectiveInput = this.effectiveInput;
        // const page = this.page;
        // ... (rest of your handleAds logic from the prompt) ...
        // Make sure to use `await Apify.utils.sleep()` inside it.
        this.logger.info('Starting ad handling logic (using your version).');
        const adCheckInterval = 3000;
        let adWatchLoop = 0;
        // Convert skipAdsAfter from [min,max] array to the single value your old code expects for minSkipTime
        const minSkipTimeArray = Array.isArray(this.effectiveInput.skipAdsAfter) && this.effectiveInput.skipAdsAfter.length > 0 
            ? this.effectiveInput.skipAdsAfter 
            : [5, 10]; // Fallback
        const minSkipTime = minSkipTimeArray[0]; 
        const maxSecondsAds = this.effectiveInput.maxSecondsAds || 15;


        const maxAdLoopIterations = Math.ceil((maxSecondsAds * 1000) / adCheckInterval) + 5;

        for (adWatchLoop = 0; adWatchLoop < maxAdLoopIterations; adWatchLoop++) {
            if (this.killed || this.page.isClosed()) break;
            let isAdPlaying = false; let canSkip = false; 
            let adCurrentTime = adWatchLoop * (adCheckInterval / 1000); // Approximate ad play time

            // YouTube specific ad detection
            isAdPlaying = await this.page.locator('.ytp-ad-player-overlay-instream-info, .video-ads .ad-showing').count() > 0;
            if (isAdPlaying) { 
                this.logger.info('YouTube ad detected.'); 
                canSkip = await this.page.locator('.ytp-ad-skip-button-modern, .ytp-ad-skip-button').count() > 0; 
            }
            
            if (!isAdPlaying) { this.logger.info('No ad currently playing or ad finished.'); break; }
            
            if (this.effectiveInput.autoSkipAds && canSkip) {
                this.logger.info('Attempting to skip ad (autoSkipAds is true and ad is skippable).');
                await clickIfExists(this.page, '.ytp-ad-skip-button-modern, .ytp-ad-skip-button', 1000, this.logger);
                await this.page.waitForTimeout(2000 + random(500, 1000)); continue;
            }
            
            if (adCurrentTime >= minSkipTime && canSkip) {
                this.logger.info(`Ad has played for ~${adCurrentTime.toFixed(1)}s (>= minSkipTime ${minSkipTime}s), and is skippable. Attempting skip.`);
                await clickIfExists(this.page, '.ytp-ad-skip-button-modern, .ytp-ad-skip-button', 1000, this.logger);
                await this.page.waitForTimeout(2000 + random(500, 1000)); continue;
            }
            
            if (adCurrentTime >= maxSecondsAds) {
                 this.logger.info(`Ad has played for ~${adCurrentTime.toFixed(1)}s (maxSecondsAds ${maxSecondsAds}s reached).`);
                 if (canSkip) await clickIfExists(this.page, '.ytp-ad-skip-button-modern, .ytp-ad-skip-button', 1000, this.logger);
                 else this.logger.info('Max ad watch time reached, but cannot skip yet.');
                 break; 
            }
            await Apify.utils.sleep(adCheckInterval); // CORRECTED
        }
        if (adWatchLoop >= maxAdLoopIterations) this.logger.warn('Max ad loop iterations reached in handleAds.');
        this.logger.info('Ad handling logic finished for this check.');
        return adIsCurrentlyPlaying; // Return if an ad was active during this check
    }

    // Integrate your ensureVideoPlaying
    async ensureVideoPlaying(playButtonSelectors) {
        const logFn = (msg, level = 'info') => this.logger[level](msg); // Adapt logger
        logFn('Ensuring video is playing (using your version)...');
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
            if (attempt < 2) await Apify.utils.sleep(1000); // CORRECTED
        }
        logFn('Failed to ensure video is playing after multiple attempts.', 'warn');
        return false;
    }


    async watchVideo() {
        if (!this.page || this.page.isClosed()) throw new Error('Page not initialized/closed for watching.');

        const videoDurationSeconds = this.job.video_info.duration;
        const targetWatchPercentage = this.effectiveInput.watchTimePercentage; // from effectiveInput
        const targetVideoPlayTimeSeconds = Math.max(10, (targetWatchPercentage / 100) * videoDurationSeconds);

        this.logger.info(`Watch target: ${targetWatchPercentage}% of ${videoDurationSeconds.toFixed(0)}s = ${targetVideoPlayTimeSeconds.toFixed(0)}s. URL: ${this.job.videoUrl}`);
        
        const overallWatchStartTime = Date.now();
        const maxWatchLoopDurationMs = this.effectiveInput.timeout * 1000 * 0.95; 
        const checkInterval = 5000; // ms

        while (!this.killed) {
            const loopIterationStartTime = Date.now();
            if (this.page.isClosed()) { this.logger.warn('Page closed during watch.'); break; }
            if (Date.now() - overallWatchStartTime > maxWatchLoopDurationMs) {
                this.logger.warn('Watch loop max duration exceeded. Ending.'); break;
            }

            await this.handleAds(); // Use the integrated handleAds
            
            let currentVideoTime = 0, isVideoPaused = true, hasVideoEnded = false;
            try {
                const videoState = await this.page.evaluate(() => { /* ... same evaluate as before ... */ });
                currentVideoTime = videoState.currentTime || 0; isVideoPaused = videoState.paused; hasVideoEnded = videoState.ended;
                 if (videoState.readyState < 2 && currentVideoTime < 1 && (Date.now() - overallWatchStartTime > 30000) ) {
                    this.logger.warn('Video stuck at start (readyState < 2) after 30s.');
                }
            } catch (e) { /* ... */ }
            
            this.lastReportedVideoTimeSeconds = currentVideoTime;
            this.logger.debug(`VidTime: ${currentVideoTime.toFixed(1)}s. Paused: ${isVideoPaused}. Ended: ${hasVideoEnded}`);

            if (isVideoPaused && !hasVideoEnded && currentVideoTime < targetVideoPlayTimeSeconds) {
                this.logger.info('Video paused, attempting to resume.');
                await this.ensureVideoPlaying( // Use the integrated one
                    this.job.platform === 'youtube' 
                        ? ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video']
                        : [] // Add Rumble selectors if needed
                );
            }

            if (hasVideoEnded) { this.logger.info('Video playback ended.'); break; }
            if (!this.job.video_info.isLive && currentVideoTime >= targetVideoPlayTimeSeconds) {
                this.logger.info(`Target VOD watch time (${targetVideoPlayTimeSeconds.toFixed(0)}s) reached.`); break;
            }
            if (this.job.video_info.isLive && (Date.now() - overallWatchStartTime >= targetVideoPlayTimeSeconds * 1000)) {
                 this.logger.info(`Live stream target duration (${targetVideoPlayTimeSeconds.toFixed(0)}s) reached.`); break;
            }
            await Apify.utils.sleep(Math.max(0, checkInterval - (Date.now() - loopIterationStartTime))); // CORRECTED
        }
        const actualOverallWatchDurationMs = Date.now() - overallWatchStartTime;
        this.logger.info(`Finished watch. Total loop time: ${(actualOverallWatchDurationMs / 1000).toFixed(1)}s. Last video time: ${this.lastReportedVideoTimeSeconds.toFixed(1)}s.`);
        return { actualOverallWatchDurationMs, lastReportedVideoTimeSeconds: this.lastReportedVideoTimeSeconds, targetVideoPlayTimeSeconds };
    }

    async kill() { /* ... same kill logic ... */ }
}


async function actorMainLogic() {
    const actorLog = getSafeLogger(log); // Use this consistently
    await Actor.init(); 
    actorLog.info('Starting YouTube View Bot (Custom Playwright with Stealth and Integrated Logic).');

    const input = await Actor.getInput();
    if (!input) { actorLog.error('No input provided.'); await Actor.fail('No input provided.'); return; }

    // Merge with your defaultInput from the provided schema
    const defaultInputFromSchema = {
        videoUrls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
        watchTypes: ['direct'], refererUrls: [''], searchKeywordsForEachVideo: ['funny cat videos, cute kittens'],
        watchTimePercentage: 80, useProxies: true, proxyUrls: [], proxyCountry: 'US', proxyGroups: ['RESIDENTIAL'],
        headless: true, // Changed to true for Apify platform
        concurrency: 1, concurrencyInterval: 5, timeout: 120, maxSecondsAds: 15,
        skipAdsAfter: ["5", "10"], // This will be parsed
        autoSkipAds: true, stopSpawningOnOverload: true, useAV1: false,
        customAntiDetection: true, // Assuming you want your script by default
    };

    const effectiveInput = { ...defaultInputFromSchema, ...input };
    
    // Parse skipAdsAfter from schema into the [min, max] array needed by the worker
    let tempSkipAds = effectiveInput.skipAdsAfter; 
    if (Array.isArray(tempSkipAds) && tempSkipAds.length > 0 && tempSkipAds.every(s => typeof s === 'string' || typeof s === 'number')) {
        const parsedSkipAds = tempSkipAds.map(s => parseInt(String(s), 10)).filter(n => !isNaN(n));
        if (parsedSkipAds.length === 1) {
            effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[0] + 5]; // Default range if only one value
        } else if (parsedSkipAds.length >= 2) {
            effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[1]];
        } else { // Fallback if parsing fails or empty array
            effectiveInput.skipAdsAfter = [5, 12]; 
        }
    } else { 
        effectiveInput.skipAdsAfter = [5, 12]; // Default if not a valid array
    }
    // Also use skipAdsAfterMinSeconds and skipAdsAfterMaxSeconds if provided (more explicit)
    if (typeof input.skipAdsAfterMinSeconds === 'number' && typeof input.skipAdsAfterMaxSeconds === 'number') {
        effectiveInput.skipAdsAfter = [
            Math.max(0, input.skipAdsAfterMinSeconds),
            Math.max(input.skipAdsAfterMinSeconds, input.skipAdsAfterMaxSeconds)
        ];
    }


    actorLog.info('Effective input (summary):', { videos: effectiveInput.videoUrls.length, proxy: effectiveInput.proxyCountry, headless: effectiveInput.headless, watchPercent: effectiveInput.watchTimePercentage });

    if (!effectiveInput.videoUrls || effectiveInput.videoUrls.length === 0) { /* ... fail ... */ }

    let actorProxyConfiguration = null;
    if (effectiveInput.useProxies) {
        // Use proxyUrls if provided, otherwise Apify Proxy
        if (effectiveInput.proxyUrls && effectiveInput.proxyUrls.length > 0) {
            actorLog.info(`Using custom proxy URLs. Note: playwright-extra direct launch handles these; Apify ProxyConfiguration not used for custom URLs.`);
            // Logic to cycle through customProxyPool will be handled in processJob
        } else {
            const proxyOpts = { groups: effectiveInput.proxyGroups || ['RESIDENTIAL'] };
            if (effectiveInput.proxyCountry && effectiveInput.proxyCountry !== "" && effectiveInput.proxyCountry !== "ANY") proxyOpts.countryCode = effectiveInput.proxyCountry;
            try {
                actorProxyConfiguration = await Actor.createProxyConfiguration(proxyOpts);
                actorLog.info(`Apify Proxy: Country=${proxyOpts.countryCode || 'Any'}, Groups=${(proxyOpts.groups).join(', ')}`);
            } catch (e) { actorLog.error(`Failed Apify Proxy config: ${e.message}.`); actorProxyConfiguration = null; }
        }
    }

    const jobs = [];
    for (let i = 0; i < effectiveInput.videoUrls.length; i++) {
        const url = effectiveInput.videoUrls[i];
        // Use your extractVideoId function
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
        
        if (watchType === 'search' && searchKeywords.length === 0) {
            actorLog.warn(`Watch type 'search' for ${url} but no keywords. Defaulting to 'direct'.`);
            jobs.push({ id: uuidv4(), videoUrl: url, videoId, referer: null, video_info: { duration: 300, isLive: false }, watch_time: effectiveInput.watchTimePercentage, jobIndex: i, watchType: 'direct', searchKeywords: [] });
        } else {
            jobs.push({ id: uuidv4(), videoUrl: url, videoId, referer: refererUrl, video_info: { duration: 300, isLive: false }, watch_time: effectiveInput.watchTimePercentage, jobIndex: i, watchType, searchKeywords });
        }
    }

    if (jobs.length === 0) { /* ... fail ... */ }
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
                proxyUrlString = effectiveInput.proxyUrls[job.jobIndex % effectiveInput.proxyUrls.length]; // Cycle through custom proxies
                proxyInfoForLog = `CustomProxy: ${proxyUrlString.split('@').pop().split(':')[0]}`; // Basic obfuscation
                 jobLogger.info(`Using custom proxy: ${proxyInfoForLog}`);
            } else if (actorProxyConfiguration) {
                const sessionId = `session_${job.id.substring(0, 12).replace(/-/g, '')}`; 
                try {
                    proxyUrlString = await actorProxyConfiguration.newUrl(sessionId);
                    proxyInfoForLog = `ApifyProxy (Session: ${sessionId}, Country: ${effectiveInput.proxyCountry || 'Any'})`;
                     jobLogger.info(`Using Apify proxy: ${proxyInfoForLog}`);
                } catch (proxyError) { /* ... */ }
            } else {
                 jobLogger.warn(`Proxies enabled but no configuration available.`);
            }
        }

        const worker = new YouTubeViewWorker(job, effectiveInput, proxyUrlString, jobLogger); 
        let jobResultData = { /* ... */ }; // Same as before

        try {
            // Handle 'search' watchType before starting worker's main navigation
            if (job.watchType === 'search' && job.searchKeywords && job.searchKeywords.length > 0) {
                // Placeholder: This would involve launching a browser, going to youtube, searching,
                // finding the video link, and then setting job.videoUrl to that link before worker.startWorker().
                // For now, we'll convert 'search' to 'direct' if it reaches here without pre-navigation.
                // This part requires significant new logic if search is to be fully implemented.
                jobLogger.info(`Search type: "${job.searchKeywords.join(', ')}". Needs separate pre-navigation logic. For now, using direct URL.`);
                // job.videoUrl should be the direct link after successful search.
                // If search fails, this job might need to be skipped or error out.
            }

            await worker.startWorker(); // This will use job.videoUrl and job.referer
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
            await Promise.race(Array.from(activeWorkers)).catch(e => actorLog.warn(`Error in Promise.race (worker slot): ${e.message}`));
        }
        const promise = processJob(job).catch(e => { /* ... */ }).finally(() => activeWorkers.delete(promise));
        activeWorkers.add(promise);
        runPromises.push(promise);
        jobCounter++;
        if (jobCounter < jobs.length && activeWorkers.size < effectiveInput.concurrency && effectiveInput.concurrencyInterval > 0) {
            await Apify.utils.sleep(effectiveInput.concurrencyInterval * 1000); // CORRECTED
        }
    }
    await Promise.all(runPromises.map(p => p.catch(e => { /* ... */ })));

    overallResults.endTime = new Date().toISOString();
    actorLog.info('All jobs processed.', { /* ... */ });
    await Actor.setValue('OVERALL_RESULTS', overallResults);
    actorLog.info('Actor finished successfully.');
    await Actor.exit();
}


Actor.main(async () => { /* ... same, uses getSafeLogger ... */ });
console.log('MAIN.JS: Script fully loaded. Actor.main is set up.');
