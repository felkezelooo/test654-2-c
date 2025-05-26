const Apify = require('apify');
const { Actor, log } = Apify;
const playwright = require('playwright-core');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { to } = require('await-to-js');
const { v4: uuidv4 } = require('uuid');

// Apply stealth plugin to playwright-extra's chromium instance
chromium.use(StealthPlugin());

function extractVideoId(url) {
    if (!url || typeof url !== 'string') return null;
    const patterns = [
        /[?&]v=([a-zA-Z0-9_-]{11})/,
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

function random(min, max) {
    if (max === undefined) { max = min; min = 0; }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function handleYouTubeConsent(page, logger) {
    logger.info('Checking for YouTube consent dialog...');
    const consentButtonSelectors = [
        'button[aria-label*="Accept all"]',
        'button[aria-label*="Accept the use of cookies"]',
        'button[aria-label*="Agree"]',
        'div[role="dialog"] button:has-text("Accept all")',
        'div[role="dialog"] button:has-text("Agree")',
        'ytd-button-renderer:has-text("Accept all")',
        'tp-yt-paper-button:has-text("ACCEPT ALL")',
        '#introAgreeButton',
    ];

    for (const selector of consentButtonSelectors) {
        try {
            const button = page.locator(selector).first();
            if (await button.isVisible({ timeout: 7000 })) {
                logger.info(`Consent button found: "${selector}". Clicking.`);
                await button.click({ timeout: 5000, force: true });
                await page.waitForTimeout(1500 + random(500, 1500));
                logger.info('Consent button clicked.');
                const stillVisible = await page.locator('ytd-consent-bump-v2-lightbox, tp-yt-paper-dialog[role="dialog"]').first().isVisible({timeout:1000}).catch(() => false);
                if (!stillVisible) {
                    logger.info('Consent dialog likely dismissed.');
                    return true;
                } else {
                    logger.warn('Clicked consent button, but a dialog might still be visible.');
                }
                return true; 
            }
        } catch (e) {
            logger.debug(`Consent selector "${selector}" not actionable or error: ${e.message.split('\n')[0]}`);
        }
    }
    logger.info('No actionable consent dialog found.');
    return false;
}

class YouTubeViewWorker {
    constructor(job, effectiveInput, proxyUrl, baseLogger) {
        this.job = job;
        this.effectiveInput = effectiveInput;
        this.proxyUrl = proxyUrl;
        this.logger = baseLogger.child({ prefix: `Worker-${job.videoId.substring(0, 6)}` });
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
        this.logger.info(`Launching browser... Proxy: ${this.proxyUrl ? 'Yes' : 'No'}, Headless: ${this.effectiveInput.headless}`);
        const launchOptions = {
            headless: this.effectiveInput.headless,
            args: [ /* ... standard args for Apify ... */
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
                '--disable-gpu', '--disable-blink-features=AutomationControlled',
            ],
        };
        if (this.proxyUrl) {
            launchOptions.proxy = { server: this.proxyUrl };
        }

        // Use playwright-extra's chromium via Actor.launchPlaywright
        this.browser = await Actor.launchPlaywright(launchOptions, { launcher: chromium });
        this.logger.info('Browser launched.');
        
        const userAgentStrings = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0'
        ];
        const selectedUserAgent = userAgentStrings[random(userAgentStrings.length - 1)];

        this.context = await this.browser.newContext({
            bypassCSP: true, ignoreHTTPSErrors: true,
            viewport: { width: 1280 + random(0, 640), height: 720 + random(0, 360) },
            locale: ['en-US', 'en-GB', 'hu-HU'][random(2)], // Focus on specified countries
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
                        video.onloadedmetadata = () => { clearTimeout(tid); resolve(undefined); }; // Resolve with undefined
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
        
        try { // Set quality
            if (await this.page.locator('.ytp-settings-button').first().isVisible({timeout: 10000})) {
                await this.page.click('.ytp-settings-button');
                await this.page.waitForTimeout(random(600, 1000));
                const qualityMenuItem = this.page.locator('.ytp-menuitem-label:has-text("Quality")').first();
                if (await qualityMenuItem.isVisible({timeout: 4000})) {
                    await qualityMenuItem.click();
                    await this.page.waitForTimeout(random(600, 1000));
                    // Get all quality options and click the last one (lowest)
                    const qualityOptions = await this.page.locator('.ytp-quality-menu .ytp-menuitem').allTextContents();
                    if (qualityOptions.length > 0) {
                        // Find the last option that is not "Auto"
                        let targetQualityIndex = -1;
                        for(let i = qualityOptions.length - 1; i >= 0; i--) {
                            if (!qualityOptions[i].toLowerCase().includes('auto')) {
                                targetQualityIndex = i;
                                break;
                            }
                        }
                        if (targetQualityIndex === -1 && qualityOptions.length > 0) targetQualityIndex = qualityOptions.length - 1; // Fallback to absolute last if all are auto or weird

                        if (targetQualityIndex !== -1) {
                            await this.page.locator('.ytp-quality-menu .ytp-menuitem').nth(targetQualityIndex).click();
                            this.logger.info(`Attempted to set video quality to: ${qualityOptions[targetQualityIndex]}.`);
                        } else {this.logger.warn('No suitable quality option found.');}
                    } else { this.logger.warn('No quality options found in menu.'); }
                    await this.page.waitForTimeout(random(400,800));
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
        
        try { // Play video
            const playButton = this.page.locator('button.ytp-large-play-button[aria-label*="Play"], button.ytp-play-button[aria-label*="Play"]:not([aria-label*="Pause"])').first();
             if (await playButton.isVisible({ timeout: 10000 })) {
                await playButton.click({timeout: 3000, force: true}); // force:true to help with overlays
                this.logger.info('Clicked play button.');
            } else {
                this.logger.info('Play button not visible, attempting JS play.');
                 await this.page.evaluate(() => {
                    const video = document.querySelector('video.html5-main-video');
                    if (video && video.paused) video.play().catch(e => console.warn("JS play() failed:", e.message));
                });
            }
        } catch(e) { this.logger.warn(`Error clicking play: ${e.message.split('\n')[0]}`); }
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
        }
        return true; // Ad is still present or being watched
    }

    async watchVideo() {
        if (!this.page || this.page.isClosed()) throw new Error('Page not initialized/closed.');

        const videoDurationSeconds = this.job.video_info.duration;
        const targetWatchPercentage = this.job.watch_time;
        const targetVideoPlayTimeSeconds = Math.max(10, (targetWatchPercentage / 100) * videoDurationSeconds); // Ensure at least 10s target

        this.logger.info(`Watch target: ${targetWatchPercentage}% of ${videoDurationSeconds.toFixed(0)}s = ${targetVideoPlayTimeSeconds.toFixed(0)}s. URL: ${this.job.videoUrl}`);
        
        const overallWatchStartTime = Date.now();
        const maxWatchLoopDurationMs = this.effectiveInput.timeout * 1000 * 0.90; // Max time for this specific video watching loop
        const checkInterval = 5000; // ms

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

            if (hasVideoEnded) { this.logger.info('Video ended.'); break; }
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
        this.logger.info('Kill signal received. Closing browser context and browser.');
        if (this.context) {
            await this.context.close().catch(e => this.logger.warn(`Error closing context: ${e.message}`));
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close().catch(e => this.logger.warn(`Error closing browser: ${e.message}`));
            this.browser = null;
        }
    }
}

async function actorMainLogic() {
    await Actor.init(); // Ensures Actor environment is ready
    log.info('Starting YouTube View Bot (Custom Playwright with Stealth).');

    const input = await Actor.getInput();
    if (!input) { log.error('No input provided.'); await Actor.fail('No input provided.'); return; }

    const defaultInput = {
        videoUrls: [], refererUrls: [], watchTimePercentage: 85,
        useProxies: true, proxyCountry: 'US', proxyGroups: ['RESIDENTIAL'],
        headless: true, autoSkipAds: true, skipAdsAfterMinSeconds: 5, skipAdsAfterMaxSeconds: 12,
        timeout: 120, concurrency: 1, concurrencyInterval: 5,
    };
    const effectiveInput = { ...defaultInput, ...input };
    effectiveInput.skipAdsAfter = [
        Math.max(0, effectiveInput.skipAdsAfterMinSeconds || 0),
        Math.max(effectiveInput.skipAdsAfterMinSeconds || 0, effectiveInput.skipAdsAfterMaxSeconds || (effectiveInput.skipAdsAfterMinSeconds || 0) + 7)
    ];
    log.info('Effective input (summary):', { videos: effectiveInput.videoUrls.length, proxy: effectiveInput.proxyCountry, headless: effectiveInput.headless, watchPercent: effectiveInput.watchTimePercentage });

    if (!effectiveInput.videoUrls || effectiveInput.videoUrls.length === 0) {
        log.error('No videoUrls provided.'); await Actor.fail('No videoUrls provided.'); return;
    }

    let actorProxyConfiguration = null;
    if (effectiveInput.useProxies) {
        const proxyOpts = { groups: effectiveInput.proxyGroups || ['RESIDENTIAL'] };
        if (effectiveInput.proxyCountry && effectiveInput.proxyCountry !== "ANY") proxyOpts.countryCode = effectiveInput.proxyCountry;
        try {
            actorProxyConfiguration = await Actor.createProxyConfiguration(proxyOpts);
            log.info(`Apify Proxy: Country=${proxyOpts.countryCode || 'Any'}, Groups=${(proxyOpts.groups).join(', ')}`);
        } catch (e) { log.error(`Failed Apify Proxy config: ${e.message}.`); actorProxyConfiguration = null; }
    }

    const jobs = [];
    for (let i = 0; i < effectiveInput.videoUrls.length; i++) {
        const videoUrl = effectiveInput.videoUrls[i];
        const videoId = extractVideoId(videoUrl);
        if (!videoId) { log.warn(`Invalid URL/ID: "${videoUrl}". Skipping.`); await Actor.pushData({ videoUrl, status: 'error', error: 'Invalid URL' }); continue; }
        const refererUrl = (effectiveInput.refererUrls && effectiveInput.refererUrls[i] && effectiveInput.refererUrls[i].trim() !== "") ? effectiveInput.refererUrls[i].trim() : null;
        jobs.push({ id: uuidv4(), videoUrl, videoId, referer: refererUrl, video_info: { duration: 300, isLive: false }, watch_time: effectiveInput.watchTimePercentage, jobIndex: i });
    }

    if (jobs.length === 0) { log.error('No valid jobs.'); await Actor.fail('No valid jobs.'); return; }
    log.info(`Created ${jobs.length} job(s). Concurrency: ${effectiveInput.concurrency}`);

    const overallResults = { totalJobs: jobs.length, successfulJobs: 0, failedJobs: 0, details: [], startTime: new Date().toISOString() };
    const activeWorkers = new Set();
    let jobCounter = 0;

    const processJob = async (job) => { /* ... (same as previous full main.js) ... */ };
    // ... (rest of processJob and concurrency logic from previous full main.js) ...
    // For brevity, reusing the processJob and concurrency logic from the previous main.js,
    // ensure it's copied here. The main changes were within the worker and top-level structure.

    // Simplified: loop directly for now to ensure basic flow
    for (const job of jobs) {
        log.info(`Processing job ${job.jobIndex + 1}/${jobs.length} for Video ID: ${job.videoId}, Referer: ${job.referer || 'None'}`);
        let proxyUrlToUse = null;
        let proxyInfoForLog = 'None';

        if (actorProxyConfiguration) {
            proxyUrlToUse = actorProxyConfiguration.newUrl(`session-${job.id.substring(0,8)}`);
            proxyInfoForLog = `ApifyProxy (Session: ${job.id.substring(0,8)}, Country: ${effectiveInput.proxyCountry || 'Any'})`;
        } else if (effectiveInput.useProxies) {
             log.warn(`Proxy requested but not configured for VideoID: ${job.videoId}.`);
        }

        const worker = new YouTubeViewWorker(job, effectiveInput, proxyUrlToUse, log);
        let jobResultData = { 
            jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId, 
            status: 'initiated', proxyUsed: proxyInfoForLog, refererRequested: job.referer 
        };

        try {
            await worker.startWorker();
            const watchResult = await worker.watchVideo();
            Object.assign(jobResultData, watchResult, { status: 'success' }); // watchResult includes timing details
            overallResults.successfulJobs++;
        } catch (error) {
            log.error(`Error processing job ${job.videoUrl}: ${error.message}`, { stack: error.stack && error.stack.split('\n').slice(0,5).join(' | '), videoId: job.videoId });
            jobResultData = { ...jobResultData, status: 'failure', error: error.message + (error.stack ? ` STACK_TRACE_SNIPPET: ${error.stack.split('\n').slice(0,3).join(' | ')}` : '') };
            overallResults.failedJobs++;
        } finally {
            await worker.kill();
            log.info(`Job ${job.jobIndex + 1} for VideoID ${job.videoId} finished. Status: ${jobResultData.status}`);
        }
        overallResults.details.push(jobResultData);
        await Actor.pushData(jobResultData);

        // Handle concurrencyInterval for sequential processing if concurrency is 1
        if (effectiveInput.concurrency === 1 && job.jobIndex < jobs.length - 1 && effectiveInput.concurrencyInterval > 0) {
            log.debug(`Waiting ${effectiveInput.concurrencyInterval}s before next video.`);
            await Apify.utils.sleep(effectiveInput.concurrencyInterval * 1000);
        }
    }
    // If implementing full concurrency > 1, the Set-based activeWorkers loop would go here.
    // For now, this direct loop is simpler to debug initial runs.


    overallResults.endTime = new Date().toISOString();
    log.info('All jobs processed.', { summary: { total: overallResults.totalJobs, success: overallResults.successfulJobs, failed: overallResults.failedJobs }});
    await Actor.setValue('OVERALL_RESULTS', overallResults);
    log.info('Actor finished successfully.');
    await Actor.exit();
}


Actor.main(async () => {
    try {
        await actorMainLogic();
    } catch (error) {
        const loggerInstance = (typeof log !== 'undefined' && log.exception) ? log : console;
        loggerInstance.error('CRITICAL UNHANDLED ERROR IN Actor.main:', { message: error.message, stack: error.stack });
        
        if (Actor.isAtHome && typeof Actor.isAtHome === 'function' && Actor.isAtHome()) {
            await Actor.fail(`Critical error in Actor.main: ${error.message}`);
        } else {
            console.error("Exiting due to critical error in local/non-Apify environment.");
            process.exit(1);
        }
    }
});

console.log('MAIN.JS: Script fully loaded. Actor.main is set up.');
