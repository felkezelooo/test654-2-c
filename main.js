const Apify = require('apify');
const { Actor } = Apify; // Destructure for easier use
const { to } = require('await-to-js');
const { v4: uuidv4 } = require('uuid');

let youtube_selfbot_api;

// Async import for youtube-selfbot-api
(async () => {
    try {
        youtube_selfbot_api = (await import("youtube-selfbot-api")).selfbot;
        console.log('MAIN.JS: youtube-selfbot-api imported successfully');
    } catch (error) {
        console.error('MAIN.JS: Failed to import youtube-selfbot-api:', error);
        // Actor will likely fail if this doesn't load, which is handled in actorMainLogic
    }
})();

function extractVideoId(url) {
    if (!url || typeof url !== 'string') {
        return null;
    }
    // YouTube URL patterns
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const youtubeMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (youtubeMatch) return youtubeMatch[1];

        const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
        if (shortMatch) return shortMatch[1];

        const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
        if (embedMatch) return embedMatch[1];
    }
    return null;
}

function random(min, max) {
    if (max === undefined) { // If only one argument, it's max, min is 0
        max = min;
        min = 0;
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

class YouTubeViewWorker {
    constructor(job, effectiveInput, proxyUrl, logger) {
        this.job = job;
        this.effectiveInput = effectiveInput;
        this.proxyUrl = proxyUrl;
        this.logger = logger.child({ prefix: `Worker-${job.videoId.substring(0, 6)}` });
        this.id = uuidv4();
        this.browser = null;
        this.page = null;
        this.watcherContext = null;
        this.killed = false;
        this.adDetectedThisSession = false;
        this.timeToWatchThisAdBeforeSkip = 0;
        this.lastReportedVideoTimeSeconds = 0;
    }

    async startWorker() {
        if (!youtube_selfbot_api) {
            this.logger.error('youtube-selfbot-api not available. Ensure it was imported correctly.');
            throw new Error('youtube-selfbot-api not available');
        }

        const botOptions = {
            headless: this.effectiveInput.headless,
            proxy: this.proxyUrl, // selfbot API handles proxy string format
            autoSkipAds: this.effectiveInput.autoSkipAds, // This is handled by our custom logic now mostly
            timeout: this.effectiveInput.timeout * 1000,
            muteAudio: true,
            useAV1: this.effectiveInput.useAV1,
            // workingFolder: '/tmp/youtube-viewer-cache-' + this.id, // Optional: for local cache if needed by API
        };
        this.logger.info(`Launching YouTube bot with options:`, { headless: botOptions.headless, proxy: !!botOptions.proxy, timeout: botOptions.timeout, useAV1: botOptions.useAV1 });
        
        const bot = new youtube_selfbot_api(botOptions);

        const [launch_error, browserInstance] = await to(bot.launch());
        if (launch_error) {
            this.logger.error(`Error spawning browser: ${launch_error.message}`, { stack: launch_error.stack });
            throw new Error(`Error spawning browser: ${launch_error.message}`);
        }
        this.browser = browserInstance;
        this.logger.info(`Browser launched successfully`);

        const [clear_storage_err] = await to(this.browser.clearStorage());
        if (clear_storage_err) {
            this.logger.warn(`Warning: Error clearing storage: ${clear_storage_err.message}`);
        }

        const [init_loader_err] = await to(this.browser.initLoader());
        if (init_loader_err) {
            this.logger.error(`Error initializing browser loader: ${init_loader_err.message}`, { stack: init_loader_err.stack });
            throw new Error(`Error initializing browser loader: ${init_loader_err.message}`);
        }

        const [new_page_err, pageInstance] = await to(this.browser.newPage());
        if (new_page_err) {
            this.logger.error(`Error starting new page: ${new_page_err.message}`, { stack: new_page_err.stack });
            throw new Error(`Error starting new page: ${new_page_err.message}`);
        }
        this.page = pageInstance;

        const gotoOptions = {
            referer: this.job.referer || undefined,
        };
        this.logger.info(`Navigating to YouTube video ID: ${this.job.videoId}`, { referer: gotoOptions.referer || 'None' });
        
        const [goto_video_err, watcherCtx] = await to(this.page.gotoVideo('direct', this.job.videoId, gotoOptions));
        if (goto_video_err) {
            this.logger.error(`Error going to video: ${goto_video_err.message}`, { stack: goto_video_err.stack });
            throw new Error(`Error going to video: ${goto_video_err.message}`);
        }
        this.watcherContext = watcherCtx;
        this.logger.info(`Successfully navigated to video. Watcher context obtained.`);
        
        // Fetch actual video info if not already present (duration is important)
        if (!this.job.video_info || !this.job.video_info.duration) {
            const [infoErr, videoInfo] = await to(this.watcherContext.getVideoInfo());
            if (infoErr || !videoInfo) {
                this.logger.warn(`Could not fetch video info for ${this.job.videoId}, using estimate. Error: ${infoErr ? infoErr.message : 'No info'}`);
                this.job.video_info = { duration: 300, isLive: false, ...this.job.video_info }; // Default duration 5 mins
            } else {
                this.job.video_info = {
                    duration: parseFloat(videoInfo.duration) || 300,
                    isLive: videoInfo.isLive || false,
                    title: videoInfo.title || 'Unknown Title'
                };
                this.logger.info(`Fetched video info: Duration=${this.job.video_info.duration}s, Live=${this.job.video_info.isLive}, Title="${this.job.video_info.title}"`);
            }
        }


        if (!this.job.video_info.isLive) {
            const [seek_err] = await to(this.watcherContext.seek(0));
            if (seek_err) this.logger.warn(`Warning: Could not seek to video start: ${seek_err.message}`);
            else this.logger.info('Seeked to video start (0s).');
        }

        const [resolution_err] = await to(this.watcherContext.setResolution("tiny"));
        if(resolution_err) this.logger.warn(`Warning: Could not set resolution to tiny: ${resolution_err.message}`);
        else this.logger.info('Set video resolution to "tiny".');

        const [playErr] = await to(this.watcherContext.play());
        if (playErr) this.logger.warn(`Could not explicitly play video: ${playErr.message}. It might autoplay.`);
        else this.logger.info('Video play command issued.');
        
        this.logger.info(`YouTube worker started for video ID: ${this.job.videoId}`);
        return true;
    }

    async handleAd(ad) {
        this.logger.info(`Handling ad. Type: ${ad.type}, Duration: ${ad.duration || 'N/A'}, CanSkip: ${ad.canSkip}, CurrentTime: ${ad.currentTime || 'N/A'}`);

        if (ad.type === "small" || ad.type === "popup" || ad.type === "banner") { // Example non-video ad types
            const [ad_skip_err] = await to(this.watcherContext.skipAd(false)); // false might mean don't wait for skip button
            if (!ad_skip_err) this.logger.info(`Attempted to skip/close small/banner ad.`);
            else this.logger.warn(`Failed to skip small/banner ad: ${ad_skip_err.message}`);
            return;
        }

        if (ad.type === "video") {
            if (this.effectiveInput.autoSkipAds) {
                if (!this.adDetectedThisSession) {
                    this.adDetectedThisSession = true;
                    const minSkip = this.effectiveInput.skipAdsAfter[0];
                    const maxSkip = this.effectiveInput.skipAdsAfter[1];
                    this.timeToWatchThisAdBeforeSkip = random(minSkip, maxSkip);
                    this.logger.info(`Video ad detected. Will attempt to skip after ~${this.timeToWatchThisAdBeforeSkip}s of ad playback.`);
                }

                if (ad.canSkip) {
                    if (ad.currentTime >= this.timeToWatchThisAdBeforeSkip) {
                        const [ad_skip_err] = await to(this.watcherContext.skipAd(true));
                        if (!ad_skip_err) {
                            this.logger.info(`Skipped video ad after ${ad.currentTime.toFixed(1)}s (target was ~${this.timeToWatchThisAdBeforeSkip}s).`);
                            this.adDetectedThisSession = false;
                        } else {
                             this.logger.warn(`Failed to skip video ad (was skippable): ${ad_skip_err.message}`);
                        }
                    } else {
                        this.logger.debug(`Video ad playing (${ad.currentTime.toFixed(1)}s / ${ad.duration ? ad.duration.toFixed(1) : 'N/A'}s). Waiting for ~${this.timeToWatchThisAdBeforeSkip}s to skip.`);
                    }
                } else {
                     this.logger.debug(`Video ad playing (${ad.currentTime.toFixed(1)}s / ${ad.duration ? ad.duration.toFixed(1) : 'N/A'}s). Not skippable yet.`);
                }
            } else if (ad.canSkip) { // Not autoSkipAds, but if it's skippable by YouTube, skip immediately
                const [ad_skip_err] = await to(this.watcherContext.skipAd(true));
                if (!ad_skip_err) {
                    this.logger.info(`Immediately skipped ad (autoSkipAds=false, but ad.canSkip=true).`);
                    this.adDetectedThisSession = false;
                } else {
                    this.logger.warn(`Failed to immediately skip video ad: ${ad_skip_err.message}`);
                }
            }
        }
    }

    async watchVideo() {
        if (!this.watcherContext) {
            this.logger.error('Watcher context not initialized. Cannot watch video.');
            throw new Error('Watcher context not initialized');
        }

        const videoDurationSeconds = this.job.video_info.duration;
        const targetWatchPercentage = this.job.watch_time; // This is the percentage from input
        const targetWatchTimeSeconds = (targetWatchPercentage / 100) * videoDurationSeconds;
        
        this.logger.info(`Starting to watch video. Target: ${targetWatchPercentage}% of ${videoDurationSeconds.toFixed(0)}s = ${targetWatchTimeSeconds.toFixed(0)}s.`);

        const loopStartTime = Date.now();
        let actualOverallWatchDurationMs = 0;
        const checkInterval = 3000; // Check every 3 seconds

        while (!this.killed) {
            const elapsedTimeInLoopMs = Date.now() - loopStartTime;

            // Check for ads
            const [ad_err, ad] = await to(this.watcherContext.isAdPlaying());
            if (ad_err) {
                this.logger.warn(`Error checking for ad: ${ad_err.message}.`);
            } else if (ad && Object.keys(ad).length > 0) { // Check if 'ad' is a non-empty object
                await this.handleAd(ad);
                await Apify.utils.sleep(checkInterval); // Wait after ad handling
                continue; // Re-evaluate conditions
            } else {
                 this.adDetectedThisSession = false; // No ad, reset ad detection state
            }

            // Get current video playback time
            const [time_err, currentVideoTime] = await to(this.watcherContext.time());
            if (time_err) {
                this.logger.warn(`Error getting current video time: ${time_err.message}`);
            } else if (currentVideoTime !== undefined) {
                this.lastReportedVideoTimeSeconds = currentVideoTime;
                this.logger.debug(`Current video playback time: ${currentVideoTime.toFixed(2)}s`);
            }

            // Check if target video content watch time is reached
            if (!this.job.video_info.isLive && this.lastReportedVideoTimeSeconds >= targetWatchTimeSeconds) {
                this.logger.info(`Target video content watch time (${targetWatchTimeSeconds.toFixed(0)}s) reached. Current playback time: ${this.lastReportedVideoTimeSeconds.toFixed(2)}s.`);
                break;
            }
            
            // For live streams, or if overall time limit is a concern (e.g. timeout / 2)
            if (this.job.video_info.isLive && elapsedTimeInLoopMs >= (targetWatchTimeSeconds * 1000)) {
                 this.logger.info(`Live stream target watch duration (${targetWatchTimeSeconds.toFixed(0)}s) reached.`);
                 break;
            }
            if (elapsedTimeInLoopMs >= this.effectiveInput.timeout * 1000 * 0.9) { // Safety break near overall timeout
                this.logger.warn('Approaching overall job timeout. Ending watch loop.');
                break;
            }

            // Check if video ended
            const [ended_err, hasEnded] = await to(this.watcherContext.hasEnded());
            if (ended_err) {
                this.logger.warn(`Error checking if video ended: ${ended_err.message}`);
            } else if (hasEnded) {
                this.logger.info('Video has ended according to watcherContext.');
                break;
            }
            
            await Apify.utils.sleep(checkInterval);
        }

        actualOverallWatchDurationMs = Date.now() - loopStartTime;
        this.logger.info(`Finished watch loop. Total time in loop: ${(actualOverallWatchDurationMs / 1000).toFixed(1)}s. Last reported video time: ${this.lastReportedVideoTimeSeconds.toFixed(2)}s.`);

        return {
            status: 'success',
            actualOverallWatchDurationMs,
            lastReportedVideoTimeSeconds: this.lastReportedVideoTimeSeconds,
            targetWatchTimeSeconds,
            videoId: this.job.videoId,
            videoUrl: this.job.videoUrl,
            refererUsed: this.job.referer
        };
    }

    async kill() {
        this.killed = true;
        this.logger.info(`Kill signal received. Closing browser if active.`);
        if (this.browser) {
            const [close_err] = await to(this.browser.close());
            if (close_err) this.logger.warn(`Error closing browser: ${close_err.message}`);
            else this.logger.info('Browser closed successfully.');
            this.browser = null;
        }
    }
}

async function actorMainLogic() {
    await Actor.init();
    const logger = Actor.log;
    logger.info('Starting YouTube View Bot (Referer & Proxy Focused - Apify).');

    if (!youtube_selfbot_api) {
        logger.error("youtube-selfbot-api did not load. Actor cannot continue.");
        await Actor.fail("Critical dependency youtube-selfbot-api failed to load.");
        return;
    }

    const input = await Actor.getInput();
    if (!input) {
        logger.error('No input provided. Exiting.');
        await Actor.fail('No input provided.');
        return;
    }

    const defaultInput = { // Ensure these match your INPUT_SCHEMA.json defaults
        videoUrls: [],
        refererUrls: [],
        watchTimePercentage: 85,
        useProxies: true,
        proxyCountry: 'US',
        proxyGroups: ['RESIDENTIAL'],
        headless: true,
        autoSkipAds: true,
        skipAdsAfterMinSeconds: 5,
        skipAdsAfterMaxSeconds: 12,
        timeout: 120,
        concurrency: 1,
        concurrencyInterval: 5,
    };

    const effectiveInput = { ...defaultInput, ...input };
    // Convert min/max ad skip times to array for worker
    effectiveInput.skipAdsAfter = [
        Math.max(0, effectiveInput.skipAdsAfterMinSeconds || 0), // Ensure non-negative
        Math.max(effectiveInput.skipAdsAfterMinSeconds || 0, effectiveInput.skipAdsAfterMaxSeconds || (effectiveInput.skipAdsAfterMinSeconds || 0) + 7) // Ensure max >= min
    ];

    logger.info('Effective input settings:', {
        videoUrlsCount: effectiveInput.videoUrls.length,
        watchTimePercentage: effectiveInput.watchTimePercentage,
        useProxies: effectiveInput.useProxies,
        proxyCountry: effectiveInput.proxyCountry,
        headless: effectiveInput.headless,
        autoSkipAds: effectiveInput.autoSkipAds,
        skipAdsAfter: effectiveInput.skipAdsAfter,
        timeout: effectiveInput.timeout,
        concurrency: effectiveInput.concurrency
    });

    if (!effectiveInput.videoUrls || effectiveInput.videoUrls.length === 0) {
        logger.error('No videoUrls provided in input. Exiting.');
        await Actor.fail('No videoUrls provided in input.');
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
            logger.info(`Apify Proxy Configured. Country: ${proxyOpts.countryCode || 'Any (group default)'}, Groups: ${effectiveInput.proxyGroups.join(', ')}`);
        } catch (e) {
            logger.error(`Failed to create Apify Proxy Configuration: ${e.message}. Continuing without Apify residential proxies.`, { error: e });
            actorProxyConfiguration = null; // Ensure it's null if creation fails
        }
    }


    const jobs = [];
    for (let i = 0; i < effectiveInput.videoUrls.length; i++) {
        const videoUrl = effectiveInput.videoUrls[i];
        const videoId = extractVideoId(videoUrl);

        if (!videoId) {
            logger.warn(`Could not extract video ID from URL: "${videoUrl}". Skipping.`);
            await Actor.pushData({ videoUrl, status: 'error', error: 'Invalid YouTube URL or could not extract ID' });
            continue;
        }

        const refererUrl = (effectiveInput.refererUrls && effectiveInput.refererUrls[i] && effectiveInput.refererUrls[i].trim() !== "")
            ? effectiveInput.refererUrls[i].trim()
            : null;

        jobs.push({
            id: uuidv4(), // Unique ID for this job run
            videoUrl,
            videoId,
            platform: 'youtube',
            watch_type: 'direct', // For selfbot API, 'direct' is used with referer in options
            referer: refererUrl,
            video_info: { duration: 300, isLive: false }, // Placeholder, worker will try to update
            watch_time: effectiveInput.watchTimePercentage, // Pass percentage
            jobIndex: i // For logging and reference
        });
    }

    if (jobs.length === 0) {
        logger.error('No valid jobs to process after parsing input. Exiting.');
        await Actor.fail('No valid video URLs to process.');
        return;
    }
    logger.info(`Created ${jobs.length} job(s) to process.`);

    const overallResults = { totalJobs: jobs.length, successfulJobs: 0, failedJobs: 0, details: [], startTime: new Date().toISOString() };
    const activeWorkers = new Set();
    let jobIndex = 0;

    const processJob = async (job) => {
        logger.info(`Starting job ${job.jobIndex + 1}/${jobs.length} for Video ID: ${job.videoId}`);
        let proxyUrlToUse = null;
        let proxyInfoForLog = 'None';

        if (actorProxyConfiguration) {
            proxyUrlToUse = actorProxyConfiguration.newUrl(`session-${job.id}`);
            proxyInfoForLog = `ApifyProxy (Session: session-${job.id.substring(0,6)})`;
            logger.info(`Using proxy: ${proxyInfoForLog} for job ${job.videoId}`);
        } else if (effectiveInput.useProxies) {
             logger.warn(`Apify Proxy was enabled in input, but configuration failed. Proceeding without proxy for job ${job.videoId}.`);
        }


        const worker = new YouTubeViewWorker(job, effectiveInput, proxyUrlToUse, logger);
        let jobResultData = {
            jobId: job.id,
            videoUrl: job.videoUrl,
            videoId: job.videoId,
            refererRequested: job.referer,
            proxyUsed: proxyInfoForLog,
            status: 'initiated',
            error: null,
        };

        try {
            await worker.startWorker();
            const watchResult = await worker.watchVideo();
            Object.assign(jobResultData, watchResult); // watchResult already includes status: 'success'
            jobResultData.status = 'success'; // Ensure it's success if no error
            overallResults.successfulJobs++;
        } catch (error) {
            logger.error(`Error processing job for ${job.videoUrl}: ${error.message}`, { stack: error.stack, videoId: job.videoId });
            jobResultData.status = 'failure';
            jobResultData.error = error.message + (error.stack ? `\nStack: ${error.stack}` : '');
            overallResults.failedJobs++;
        } finally {
            await worker.kill();
            logger.info(`Finished job ${job.jobIndex + 1}/${jobs.length} for Video ID: ${job.videoId} with status: ${jobResultData.status}`);
        }
        
        overallResults.details.push(jobResultData);
        await Actor.pushData(jobResultData);
    };


    // Concurrency management
    const runPromises = [];
    for (const job of jobs) {
        if (activeWorkers.size >= effectiveInput.concurrency) {
            await Promise.race(activeWorkers); // Wait for one worker to finish
        }

        const promise = processJob(job).finally(() => {
            activeWorkers.delete(promise);
        });
        activeWorkers.add(promise);
        runPromises.push(promise);

        if (effectiveInput.concurrencyInterval > 0 && jobIndex < jobs.length - 1) {
            logger.debug(`Waiting ${effectiveInput.concurrencyInterval}s before dispatching next job batch.`);
            await Apify.utils.sleep(effectiveInput.concurrencyInterval * 1000);
        }
        jobIndex++;
    }

    await Promise.all(runPromises); // Wait for all dispatched jobs

    overallResults.endTime = new Date().toISOString();
    logger.info('All jobs processed. Final results summary:', {
        totalJobs: overallResults.totalJobs,
        successfulJobs: overallResults.successfulJobs,
        failedJobs: overallResults.failedJobs,
    });
    await Actor.setValue('OVERALL_RESULTS', overallResults);

    logger.info('Actor finished.');
    await Actor.exit();
}

// Apify Actor entry point
Apify.main(async () => {
    try {
        // A short delay to ensure async import of youtube-selfbot-api completes
        if (!youtube_selfbot_api) {
            console.log('MAIN.JS: Waiting a few seconds for youtube-selfbot-api to potentially load...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        await actorMainLogic();
    } catch (error) {
        console.error('ACTOR_MAIN_LOGIC: CRITICAL UNHANDLED ERROR IN TOP LEVEL:', error.message, { stack: error.stack });
        if (Actor.isAtHome()) { // Check if running on Apify platform
            await Actor.fail(`Critical error: ${error.message}`);
        } else {
            process.exit(1);
        }
    }
});

console.log('MAIN.JS: Script fully loaded and main execution path determined.');
