const Apify = require('apify');
const { Actor, log } = Apify; // Using Actor.log for consistency
const playwright = require('playwright-core'); // playwright-core for Apify
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { to } = require('await-to-js');
const { v4: uuidv4 } = require('uuid');

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

// Simplified consent handler
async function handleYouTubeConsent(page, logger) {
    logger.info('Checking for YouTube consent dialog...');
    const consentButtonSelectors = [
        'button[aria-label*="Accept all"]',
        'button[aria-label*="Accept the use of cookies"]',
        'form[action*="consent"] button[aria-label*="Accept"]',
        'ytd-button-renderer:has-text("Accept all")',
        'tp-yt-paper-button:has-text("ACCEPT ALL")'
    ];

    for (const selector of consentButtonSelectors) {
        try {
            const button = page.locator(selector).first();
            if (await button.isVisible({ timeout: 5000 })) {
                logger.info(`Consent button found with selector: "${selector}". Clicking.`);
                await button.click({ timeout: 3000 });
                await page.waitForTimeout(1000 + random(500, 1500)); // Wait for dialog to disappear
                logger.info('Consent button clicked.');
                return true;
            }
        } catch (e) {
            logger.debug(`Consent button selector "${selector}" not found or failed: ${e.message}`);
        }
    }
    logger.info('No consent dialog found or handled.');
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
            adPlayedForEnoughTime: false
        };
        this.lastReportedVideoTimeSeconds = 0;
    }

    async startWorker() {
        this.logger.info(`Launching browser... Proxy: ${this.proxyUrl ? 'Yes' : 'No'}`);
        const launchOptions = {
            headless: this.effectiveInput.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox'], // Standard args for Apify
        };
        if (this.proxyUrl) {
            launchOptions.proxy = { server: this.proxyUrl };
        }

        this.browser = await Actor.launchPlaywright(launchOptions, { launcher: chromium });
        this.logger.info('Browser launched.');

        this.context = await this.browser.newContext({
            bypassCSP: true,
            ignoreHTTPSErrors: true,
            // You can set viewport, locale, timezone here if desired from input
            // viewport: { width: 1280, height: 720 },
            // locale: 'en-US', // Consider making this configurable
        });
        this.logger.info('Browser context created.');

        if (this.job.referer) {
            this.logger.info(`Setting referer to: ${this.job.referer}`);
            await this.context.setExtraHTTPHeaders({ 'Referer': this.job.referer });
        }

        this.page = await this.context.newPage();
        this.logger.info('New page created.');

        this.logger.info(`Navigating to video URL: ${this.job.videoUrl}`);
        await this.page.goto(this.job.videoUrl, { waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 });
        this.logger.info('Navigation complete.');

        await handleYouTubeConsent(this.page, this.logger);

        // Attempt to get video duration (can be unreliable without APIs)
        try {
            await this.page.waitForSelector('video.html5-main-video', { timeout: 15000 });
            const duration = await this.page.evaluate(() => {
                const video = document.querySelector('video.html5-main-video');
                return video ? video.duration : null;
            });
            if (duration && !isNaN(duration)) {
                this.job.video_info.duration = Math.round(duration);
                this.logger.info(`Video duration fetched: ${this.job.video_info.duration}s`);
            } else {
                this.logger.warn('Could not determine video duration from player, using default.');
            }
        } catch (e) {
            this.logger.warn(`Error fetching video duration: ${e.message}. Using default.`);
        }
        
        // Try to set low quality
        try {
            await this.page.waitForSelector('.ytp-settings-button', { timeout: 10000 });
            await this.page.click('.ytp-settings-button');
            await this.page.waitForTimeout(500);
            // This part is highly dependent on current YouTube UI structure
            const qualityMenu = this.page.locator('.ytp-menuitem-label:has-text("Quality")').first();
            if (await qualityMenu.isVisible({timeout: 2000})) {
                await qualityMenu.click();
                await this.page.waitForTimeout(500);
                const lowestQuality = this.page.locator('.ytp-quality-menu .ytp-menuitem-label').locator('span:not(:empty)').last(); // Try to get the last quality option
                 if (await lowestQuality.isVisible({timeout: 2000})) {
                    await lowestQuality.click();
                    this.logger.info('Attempted to set lowest video quality.');
                } else {this.logger.warn('Lowest quality option not found.');}
            } else {this.logger.warn('Quality menu not found.');}
             await this.page.keyboard.press('Escape'); // Close settings
        } catch (e) {
            this.logger.warn(`Could not set video quality: ${e.message}`);
        }
        
        // Try to play the video
        const playButton = this.page.locator('button.ytp-large-play-button, button.ytp-play-button').first();
        if (await playButton.isVisible({ timeout: 5000 })) {
            await playButton.click();
            this.logger.info('Clicked play button.');
        } else {
             this.logger.info('Play button not immediately visible, video might autoplay or be unstartable.');
        }

        return true;
    }

    async handleAds() {
        const adSkipButtonSelectors = [
            '.ytp-ad-skip-button-modern',
            '.ytp-ad-skip-button',
            '.videoAdUiSkipButton', // More generic
        ];
        const adPlayingSelectors = [
            '.ad-showing',
            '.ytp-ad-player-overlay-instream-info',
             '.video-ads' // If this container has content and is visible
        ];

        let adIsCurrentlyPlaying = false;
        for (const selector of adPlayingSelectors) {
            if (await this.page.locator(selector).first().isVisible({ timeout: 500 })) {
                adIsCurrentlyPlaying = true;
                break;
            }
        }

        if (!adIsCurrentlyPlaying) {
            if (this.adWatchState.isWatchingAd) {
                this.logger.info('Ad finished or disappeared.');
                this.adWatchState.isWatchingAd = false;
            }
            return false; // No ad playing
        }
        
        // Ad is playing
        if (!this.adWatchState.isWatchingAd) { // First detection of this ad
            this.adWatchState.isWatchingAd = true;
            this.adWatchState.adPlayedForEnoughTime = false; // Reset for current ad
            const minSkip = this.effectiveInput.skipAdsAfter[0];
            const maxSkip = this.effectiveInput.skipAdsAfter[1];
            this.adWatchState.timeToWatchThisAdBeforeSkip = random(minSkip, maxSkip);
            this.logger.info(`Ad detected. Will attempt skip after ~${this.adWatchState.timeToWatchThisAdBeforeSkip}s.`);
            this.adWatchState.adStartTime = Date.now();
        }
        
        const adElapsedTime = (Date.now() - (this.adWatchState.adStartTime || Date.now())) / 1000;
        if (adElapsedTime >= this.adWatchState.timeToWatchThisAdBeforeSkip) {
            this.adWatchState.adPlayedForEnoughTime = true;
        }

        if (this.effectiveInput.autoSkipAds && this.adWatchState.adPlayedForEnoughTime) {
            for (const selector of adSkipButtonSelectors) {
                const skipButton = this.page.locator(selector).first();
                if (await skipButton.isVisible({ timeout: 500 }) && await skipButton.isEnabled({ timeout: 500 })) {
                    this.logger.info(`Attempting to click ad skip button: ${selector}`);
                    await skipButton.click({ timeout: 1000, force: true }); // Force might be needed for overlays
                    await this.page.waitForTimeout(1000 + random(500, 1000)); // Wait for skip action
                    this.adWatchState.isWatchingAd = false; // Assume ad skipped
                    return true; // Ad handled
                }
            }
            this.logger.debug('Ad playing, watched for enough time, but no skip button found/enabled yet.');
        } else if (this.effectiveInput.autoSkipAds) {
            this.logger.debug(`Ad playing, but not yet watched for ${this.adWatchState.timeToWatchThisAdBeforeSkip}s. Current ad play time: ${adElapsedTime.toFixed(1)}s`);
        }
        return true; // Ad is still playing, but being "handled" (watched)
    }

    async watchVideo() {
        if (!this.page) throw new Error('Page not initialized for watching.');

        const videoDurationSeconds = this.job.video_info.duration || 300; // Fallback if duration not found
        const targetWatchPercentage = this.job.watch_time;
        const targetVideoPlayTimeSeconds = (targetWatchPercentage / 100) * videoDurationSeconds;

        this.logger.info(`Starting to watch video. Target: ${targetWatchPercentage}% of ${videoDurationSeconds.toFixed(0)}s = ${targetVideoPlayTimeSeconds.toFixed(0)}s. Video URL: ${this.job.videoUrl}`);
        
        const overallWatchStartTime = Date.now();
        const maxWatchLoopDurationMs = this.effectiveInput.timeout * 1000 * 0.9; // Max time for this loop
        const checkInterval = 5000; // Check every 5 seconds

        while (!this.killed) {
            const loopIterationStartTime = Date.now();

            if (Date.now() - overallWatchStartTime > maxWatchLoopDurationMs) {
                this.logger.warn('Watch loop duration exceeded safety timeout. Ending watch.');
                break;
            }

            const adWasPlaying = await this.handleAds();
            if (adWasPlaying) {
                this.logger.debug('Ad is being handled, continuing watch loop.');
                await Apify.utils.sleep(checkInterval);
                continue;
            }
            
            // If no ad, check video state
            let currentVideoTime = 0;
            let isVideoPaused = true;
            let hasVideoEnded = false;

            try {
                const videoState = await this.page.evaluate(() => {
                    const video = document.querySelector('video.html5-main-video');
                    if (!video) return { currentTime: 0, paused: true, ended: true, readyState: 0 }; // No video element means ended
                    return {
                        currentTime: video.currentTime,
                        paused: video.paused,
                        ended: video.ended,
                        readyState: video.readyState
                    };
                });
                currentVideoTime = videoState.currentTime || 0;
                isVideoPaused = videoState.paused;
                hasVideoEnded = videoState.ended;

                if (videoState.readyState < 2 && currentVideoTime === 0) { // HAVE_NOTHING or HAVE_METADATA but no progress
                    this.logger.debug('Video readyState low and no playback, might be buffering or stuck.');
                }

            } catch (e) {
                this.logger.warn(`Error getting video state: ${e.message}`);
                // Potentially break if page is not responding
                if (e.message.includes('Target closed')) throw e;
            }
            this.lastReportedVideoTimeSeconds = currentVideoTime;
            this.logger.debug(`Video time: ${currentVideoTime.toFixed(2)}s. Paused: ${isVideoPaused}. Ended: ${hasVideoEnded}`);


            if (isVideoPaused && !hasVideoEnded && currentVideoTime < targetVideoPlayTimeSeconds) {
                this.logger.info('Video is paused, attempting to play.');
                try {
                    await this.page.evaluate(() => {
                        const video = document.querySelector('video.html5-main-video');
                        if (video && video.paused) video.play();
                    });
                     await this.page.locator('button.ytp-play-button[aria-label*="Play"]').first().click({timeout: 1000}).catch(() => {});
                } catch (e) { this.logger.warn(`Failed to JS play: ${e.message}`);}
            }

            if (hasVideoEnded) {
                this.logger.info('Video has ended.');
                break;
            }

            if (!this.job.video_info.isLive && currentVideoTime >= targetVideoPlayTimeSeconds) {
                this.logger.info(`Target video content watch time (${targetVideoPlayTimeSeconds.toFixed(0)}s) reached.`);
                break;
            }
            if (this.job.video_info.isLive && (Date.now() - overallWatchStartTime >= targetVideoPlayTimeSeconds * 1000)) {
                 this.logger.info(`Live stream target watch duration (${targetVideoPlayTimeSeconds.toFixed(0)}s) reached.`);
                 break;
            }
            
            const timeSpentInIteration = Date.now() - loopIterationStartTime;
            await Apify.utils.sleep(Math.max(0, checkInterval - timeSpentInIteration));
        }

        const actualOverallWatchDurationMs = Date.now() - overallWatchStartTime;
        this.logger.info(`Finished watch. Total time: ${(actualOverallWatchDurationMs / 1000).toFixed(1)}s. Last video time: ${this.lastReportedVideoTimeSeconds.toFixed(2)}s.`);

        return {
            status: 'success',
            actualOverallWatchDurationMs,
            lastReportedVideoTimeSeconds: this.lastReportedVideoTimeSeconds,
            targetVideoPlayTimeSeconds,
            videoId: this.job.videoId,
            videoUrl: this.job.videoUrl,
            refererUsed: this.job.referer
        };
    }

    async kill() {
        this.killed = true;
        this.logger.info(`Kill signal received. Closing browser context and browser.`);
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
    await Actor.init();
    log.info('Starting YouTube View Bot (Custom Playwright - Referer & Proxy Focused - Apify).');

    const input = await Actor.getInput();
    if (!input) {
        log.error('No input provided. Exiting.');
        await Actor.fail('No input provided.');
        return;
    }

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

    log.info('Effective input settings:', { /* ... selective logging ... */ });

    if (!effectiveInput.videoUrls || effectiveInput.videoUrls.length === 0) {
        log.error('No videoUrls provided. Exiting.');
        await Actor.fail('No videoUrls provided.');
        return;
    }

    let actorProxyConfiguration = null;
    if (effectiveInput.useProxies) {
        const proxyOpts = { groups: effectiveInput.proxyGroups };
        if (effectiveInput.proxyCountry && effectiveInput.proxyCountry !== "ANY") {
            proxyOpts.countryCode = effectiveInput.proxyCountry;
        }
        try {
            actorProxyConfiguration = await Actor.createProxyConfiguration(proxyOpts);
            log.info(`Apify Proxy Configured. Country: ${proxyOpts.countryCode || 'Any'}, Groups: ${effectiveInput.proxyGroups.join(', ')}`);
        } catch (e) {
            log.error(`Failed to create Apify Proxy: ${e.message}. Proceeding without proxy if other options are not set.`);
            actorProxyConfiguration = null;
        }
    }

    const jobs = [];
    for (let i = 0; i < effectiveInput.videoUrls.length; i++) {
        const videoUrl = effectiveInput.videoUrls[i];
        const videoId = extractVideoId(videoUrl);
        if (!videoId) {
            log.warn(`Invalid YouTube URL or ID extraction failed: "${videoUrl}". Skipping.`);
            await Actor.pushData({ videoUrl, status: 'error', error: 'Invalid YouTube URL' });
            continue;
        }
        const refererUrl = (effectiveInput.refererUrls && effectiveInput.refererUrls[i] && effectiveInput.refererUrls[i].trim() !== "")
            ? effectiveInput.refererUrls[i].trim()
            : null;
        jobs.push({
            id: uuidv4(), videoUrl, videoId, platform: 'youtube', referer: refererUrl,
            video_info: { duration: 300, isLive: false }, // Default, worker updates
            watch_time: effectiveInput.watchTimePercentage, jobIndex: i,
        });
    }

    if (jobs.length === 0) {
        log.error('No valid jobs. Exiting.');
        await Actor.fail('No valid jobs.');
        return;
    }
    log.info(`Created ${jobs.length} job(s).`);

    const overallResults = { totalJobs: jobs.length, successfulJobs: 0, failedJobs: 0, details: [], startTime: new Date().toISOString() };
    const activeWorkers = new Set();
    let jobCounter = 0;

    const processJob = async (job) => {
        log.info(`Starting job ${job.jobIndex + 1}/${jobs.length} for Video ID: ${job.videoId}`);
        let proxyUrlToUse = null;
        let proxyInfoForLog = 'None';
        if (actorProxyConfiguration) {
            proxyUrlToUse = actorProxyConfiguration.newUrl(`session-${job.id.substring(0,8)}`);
            proxyInfoForLog = `ApifyProxy (Session: ${job.id.substring(0,8)}, Country: ${effectiveInput.proxyCountry || 'Any'})`;
        }
        const worker = new YouTubeViewWorker(job, effectiveInput, proxyUrlToUse, log);
        let jobResultData = { /* ... initial data ... */ };
        try {
            await worker.startWorker();
            const watchResult = await worker.watchVideo();
            Object.assign(jobResultData, watchResult, { status: 'success', proxyUsed: proxyInfoForLog, refererRequested: job.referer });
            overallResults.successfulJobs++;
        } catch (error) {
            log.error(`Error in job ${job.videoUrl}: ${error.message}`, { stack: error.stack, videoId: job.videoId });
            jobResultData = { ...jobResultData, status: 'failure', error: error.message, proxyUsed: proxyInfoForLog, refererRequested: job.referer };
            overallResults.failedJobs++;
        } finally {
            await worker.kill();
             log.info(`Finished job ${job.jobIndex + 1}/${jobs.length} for Video ID: ${job.videoId}. Status: ${jobResultData.status}`);
        }
        overallResults.details.push(jobResultData);
        await Actor.pushData(jobResultData);
    };

    const runPromises = [];
    for (const job of jobs) {
        if (activeWorkers.size >= effectiveInput.concurrency) {
            await Promise.race(activeWorkers);
        }
        const promise = processJob(job).finally(() => {
            activeWorkers.delete(promise);
        });
        activeWorkers.add(promise);
        runPromises.push(promise);
        jobCounter++;
        if (jobCounter < jobs.length && activeWorkers.size < effectiveInput.concurrency && effectiveInput.concurrencyInterval > 0) {
            log.debug(`Waiting ${effectiveInput.concurrencyInterval}s before dispatching next.`);
            await Apify.utils.sleep(effectiveInput.concurrencyInterval * 1000);
        }
    }
    await Promise.all(runPromises);

    overallResults.endTime = new Date().toISOString();
    log.info('All jobs processed.', { summary: { total: overallResults.totalJobs, success: overallResults.successfulJobs, failed: overallResults.failedJobs }});
    await Actor.setValue('OVERALL_RESULTS', overallResults);
    log.info('Actor finished successfully.');
    await Actor.exit();
}

Apify.main(async () => {
    try {
        await actorMainLogic();
    } catch (error) {
        log.exception(error, 'Critical unhandled error in Apify.main:');
        if (Actor.isAtHome()) {
            await Actor.fail(`Critical error: ${error.message}`);
        } else {
            process.exit(1);
        }
    }
});
