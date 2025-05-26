// === APIFY ACTOR MAIN.JS - USING TEST1111 FINGERPRINTING APPROACH ===

const Apify = require('apify');
const { to } = require('await-to-js');
const { v4: uuidv4 } = require('uuid');

// Import test1111's exact libraries
let youtube_selfbot_api;
let rumble_selfbot_api;

// Async import like test1111 does
(async () => {
    try {
        youtube_selfbot_api = (await import("youtube-selfbot-api")).selfbot;
        rumble_selfbot_api = (await import("rumble-selfbot-api")).selfbot;
        console.log('MAIN.JS: Selfbot APIs imported successfully');
    } catch (error) {
        console.error('Failed to import selfbot APIs:', error);
        // Fallback to regular playwright if selfbot APIs fail
        // This fallback might need more robust implementation if selfbot APIs are crucial
        // For now, it just logs and potentially lets the script fail later if APIs are not loaded.
        // const playwright = require('playwright'); // Original snippet had this, but it's not used if APIs fail here.
        console.log('MAIN.JS: Selfbot APIs failed to load. Actor might not function as expected.');
    }
})();

console.log('MAIN.JS: Script execution started.');
console.log('MAIN.JS: Node.js version:', process.version);

// === HELPER FUNCTIONS FROM TEST1111 (or similar) ===

function clamp(num, min, max) {
    return num <= min ? min : num >= max ? max : num;
}

function extractVideoId(url) {
    if (!url || typeof url !== 'string') {
        return null;
    }

    // YouTube URL patterns - exactly as test1111 would handle them
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const youtubeMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (youtubeMatch) return youtubeMatch[1];

        const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
        if (shortMatch) return shortMatch[1];

        const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
        if (embedMatch) return embedMatch[1];
    }

    // Rumble URL patterns
    if (url.includes('rumble.com')) {
        // Example: https://rumble.com/v1abcde-my-video-title.html -> v1abcde
        // Or https://rumble.com/c/ChannelName/live -> c/ChannelName/live (may need refinement depending on what ID is expected)
        // The original test1111 example was: /rumble\.com\/([a-zA-Z0-9_-]+)/
        // This would grab 'v1abcde-my-video-title.html' or 'c'
        // Let's use a more specific one for video IDs like vXXXXX
        const rumbleVideoMatch = url.match(/rumble\.com\/(v[a-zA-Z0-9]+(?:-[^?#\s/&]+)?)/);
        if (rumbleVideoMatch) return rumbleVideoMatch[1];

        // Fallback for other Rumble URL structures if needed, or the original more generic one
        const rumbleGenericMatch = url.match(/rumble\.com\/([a-zA-Z0-9_-]+)/);
        if (rumbleGenericMatch) return rumbleGenericMatch[1];
    }

    return null;
}

function getRandomUserAgent() {
    // This function is defined but not explicitly used in the Test1111Worker in the provided example,
    // as the selfbot APIs likely handle user-agent internally. Kept for completeness if needed elsewhere.
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

console.log('MAIN.JS: Helper functions defined.');

// === TEST1111-STYLE WORKER IMPLEMENTATION ===

class Test1111Worker {
    constructor(job, effectiveInput, proxyUrl, logger) {
        this.job = job;
        this.effectiveInput = effectiveInput;
        this.proxyUrl = proxyUrl;
        this.logger = logger.child({ prefix: `Worker-${job.videoId.substring(0,6)}` });
        this.id = uuidv4(); // Worker instance ID
        this.browser = null;
        this.page = null;
        this.watcherContext = null;
        this.killed = false;
        this.lastWatchtime = 0;
        this.startTime = Date.now();
        // maxWatchtime in test1111 seems to be a general cap, not per video from input
        // Let's use watchTimePercentage from input to determine video-specific watch duration.
        // this.maxWatchtime = 30; // Default like test1111 - seems to be a general cap
        this.adDetected = false;
        this.adPlayTime = 0; // For YouTube ads, time in seconds to watch before attempting skip
    }

    async startYoutubeWorker() {
        if (!youtube_selfbot_api) {
            this.logger.error('YouTube selfbot API not available. Ensure it was imported correctly.');
            throw new Error('YouTube selfbot API not available');
        }

        const botOptions = {
            headless: this.effectiveInput.headless,
            proxy: this.proxyUrl,
            autoSkipAds: this.effectiveInput.autoSkipAds, // This is a boolean
            timeout: this.effectiveInput.timeout * 1000,
            muteAudio: true, // Typically desired for bots
            useAV1: this.effectiveInput.useAV1,
            // workingFolder can be omitted in Apify environment, or set to a temp path if needed
        };
        this.logger.info(`Launching YouTube bot with options:`, botOptions);
        const bot = new youtube_selfbot_api(botOptions);

        const [launch_error, browser] = await to(bot.launch());
        if (launch_error) {
            this.logger.error(`Error spawning browser: ${launch_error.message}`, { stack: launch_error.stack });
            throw new Error(`Error spawning browser: ${launch_error.message}`);
        }
        this.browser = browser;
        this.logger.info(`Browser launched successfully`);

        // Set up bandwidth monitoring like test1111
        // Note: The "bandwith" event might be a typo in the original example for "bandwidth"
        // and its availability/functionality depends on the selfbot API.
        if (browser.on) { // Check if event emitter 'on' method exists
            browser.on("bandwith", (id, type, len) => { // Or "bandwidth"
                len = parseFloat((len * 1e-6).toFixed(2));
                this.logger.info(`Bandwidth usage: ${len}MB (id: ${id}, type: ${type})`);
            });
        }


        const [clear_storage_err] = await to(browser.clearStorage());
        if (clear_storage_err) {
            // Non-fatal, log and continue
            this.logger.warn(`Warning: Error clearing storage: ${clear_storage_err.message}`);
        }

        const [init_loader_err] = await to(browser.initLoader());
        if (init_loader_err) {
            this.logger.error(`Error initializing browser loader: ${init_loader_err.message}`, { stack: init_loader_err.stack });
            throw new Error(`Error initializing browser loader: ${init_loader_err.message}`);
        }

        const [new_page_err, page] = await to(browser.newPage());
        if (new_page_err) {
            this.logger.error(`Error starting new page: ${new_page_err.message}`, { stack: new_page_err.stack });
            throw new Error(`Error starting new page: ${new_page_err.message}`);
        }
        this.page = page;

        // Navigate to video using test1111's approach
        // The 'direct' type is assumed here. For 'search', the selfbot API would need to support it,
        // or you'd implement search logic before calling gotoVideo.
        // The original `job` structure had `searchKeywords`. This needs to be integrated if search is required.
        const gotoOptions = {};
        if (this.job.watchType === 'search' && this.job.keyword) {
            // This depends on how youtube-selfbot-api handles search.
            // It might take a keyword directly, or you might need to navigate to search results first.
            // For now, assuming 'direct' for simplicity as per original example of gotoVideo.
            this.logger.info(`Search watchType specified with keyword "${this.job.keyword}", but selfbot API's gotoVideo typically handles direct. Adapt if API supports search.`);
        }

        this.logger.info(`Navigating to YouTube video ID: ${this.job.videoId}`);
        const [goto_video_err, watcherContext] = await to(page.gotoVideo('direct', this.job.videoId, gotoOptions));

        if (goto_video_err) {
            this.logger.error(`Error going to video: ${goto_video_err.message}`, { stack: goto_video_err.stack });
            throw new Error(`Error going to video: ${goto_video_err.message}`);
        }
        this.watcherContext = watcherContext;
        this.logger.info(`Successfully navigated to video. Watcher context obtained.`);

        if (!this.job.isLive) { // Assuming job.isLive is correctly set
            const [seek_err] = await to(watcherContext.seek(0));
            if (seek_err) {
                this.logger.warn(`Warning: Could not seek to start: ${seek_err.message}`);
            } else {
                this.logger.info('Seeked to video start (0s).');
            }
        }

        // Set resolution to lowest quality like test1111
        const [resolution_err] = await to(watcherContext.setResolution("tiny")); // or "lowest" etc. depending on API
        if(resolution_err){
            this.logger.warn(`Warning: Could not set resolution to tiny: ${resolution_err.message}`);
        } else {
            this.logger.info('Set video resolution to "tiny".');
        }


        this.logger.info(`YouTube worker started successfully for video ID: ${this.job.videoId}`);
        return true;
    }

    async startRumbleWorker() {
        if (!rumble_selfbot_api) {
            this.logger.error('Rumble selfbot API not available. Ensure it was imported correctly.');
            throw new Error('Rumble selfbot API not available');
        }

        const botOptions = {
            headless: this.effectiveInput.headless,
            proxy: this.proxyUrl,
            timeout: this.effectiveInput.timeout * 1000,
            muteAudio: true,
        };
        this.logger.info(`Launching Rumble bot with options:`, botOptions);
        const bot = new rumble_selfbot_api(botOptions);


        const [launch_error, browser] = await to(bot.launch());
        if (launch_error) {
            this.logger.error(`Error spawning Rumble browser: ${launch_error.message}`, { stack: launch_error.stack });
            throw new Error(`Error spawning Rumble browser: ${launch_error.message}`);
        }
        this.browser = browser;
        this.logger.info('Rumble browser launched successfully.');

        const [new_page_err, page] = await to(browser.newPage());
        if (new_page_err) {
            this.logger.error(`Error starting Rumble page: ${new_page_err.message}`, { stack: new_page_err.stack });
            throw new Error(`Error starting Rumble page: ${new_page_err.message}`);
        }
        this.page = page;

        // For Rumble, gotoVideo might take the full URL or just the ID part.
        // The job.videoId from extractVideoId for Rumble might be like "v1abcde-my-video-title.html"
        // The selfbot API docs would clarify what it expects.
        // test1111 used options like: { forceFind: true, title: this.job.keyword }
        // This implies it might search on Rumble if a direct ID match isn't found.
        const gotoOptions = {
            forceFind: true, // Example from test1111
            // title: this.job.keyword // if keyword is relevant for Rumble video finding
        };
        this.logger.info(`Navigating to Rumble video ID/URL part: ${this.job.videoId} with options:`, gotoOptions);
        const [goto_video_err, watcherContext] = await to(page.gotoVideo(this.job.videoId, gotoOptions)); // Rumble API might take ID directly

        if (goto_video_err) {
            this.logger.error(`Error going to Rumble video: ${goto_video_err.message}`, { stack: goto_video_err.stack });
            throw new Error(`Error going to Rumble video: ${goto_video_err.message}`);
        }
        this.watcherContext = watcherContext;
        this.logger.info('Successfully navigated to Rumble video. Watcher context obtained.');

        const [play_err] = await to(watcherContext.play());
        if(play_err){
            this.logger.warn(`Warning: Could not explicitly play Rumble video: ${play_err.message}. It might autoplay.`);
        } else {
            this.logger.info('Rumble video play command issued.');
        }

        this.logger.info(`Rumble worker started successfully for video: ${this.job.videoId}`);
        return true;
    }

    async watchVideo() {
        if (!this.watcherContext) {
            this.logger.error('Watcher context not initialized. Cannot watch video.');
            throw new Error('Watcher context not initialized');
        }

        const videoDurationSeconds = this.job.duration || 300; // Assume a default if not known, e.g., 5 minutes
        const watchTimeSeconds = (this.effectiveInput.watchTimePercentage / 100) * videoDurationSeconds;
        const watchTimeMs = watchTimeSeconds * 1000;

        this.logger.info(`Starting to watch video. Target watch duration: ${watchTimeSeconds.toFixed(0)}s (${watchTimeMs}ms). Video actual duration (estimated): ${videoDurationSeconds}s.`);

        const loopStartTime = Date.now();
        let actualWatchDurationMs = 0;

        while ((Date.now() - loopStartTime) < watchTimeMs && !this.killed) {
            try {
                const [ad_err, ad] = await to(this.watcherContext.isAdPlaying());
                if (ad_err) {
                    this.logger.warn(`Error checking for ad: ${ad_err.message}. Assuming no ad.`);
                } else if (ad) { // 'ad' object might contain details like ad.type, ad.duration etc.
                    this.logger.info(`Ad detected: ${JSON.stringify(ad)}`);
                    await this.handleAd(ad); // handleAd needs to be aware of ad object structure
                }

                const [time_err, currentWatchTime] = await to(this.watcherContext.time()); // Gets current video playback time in seconds
                if (time_err) {
                    this.logger.warn(`Error getting current video time: ${time_err.message}`);
                } else if (currentWatchTime !== undefined) {
                    this.lastWatchtime = currentWatchTime;
                    this.logger.debug(`Current video playback time: ${currentWatchTime.toFixed(2)}s`);
                }

                // Check if desired percentage of *video content* has been watched
                if (this.lastWatchtime >= watchTimeSeconds) {
                    this.logger.info(`Target watch time (${watchTimeSeconds.toFixed(0)}s) based on video content reached. Current playback time: ${this.lastWatchtime.toFixed(2)}s.`);
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


                await new Promise(resolve => setTimeout(resolve, 2000 + random(0,1000))); // Check every 2-3 seconds

            } catch (error) {
                this.logger.warn(`Error during watch loop: ${error.message}`, { stack: error.stack });
                // Decide if this error is critical enough to break
                break;
            }
        }
        actualWatchDurationMs = Date.now() - loopStartTime;
        this.logger.info(`Finished watch loop. Total time in loop: ${actualWatchDurationMs / 1000}s. Last reported video time: ${this.lastWatchtime.toFixed(2)}s.`);

        return {
            status: 'success',
            actualWatchDurationMs: actualWatchDurationMs,
            lastReportedVideoTimeSeconds: this.lastWatchtime,
            targetWatchTimeSeconds: watchTimeSeconds,
            videoId: this.job.videoId,
            videoUrl: this.job.videoUrl
        };
    }

    async handleAd(ad) { // ad object structure is from youtube-selfbot-api
        this.logger.info(`Handling ad. Type: ${ad.type}, Duration: ${ad.duration}, CanSkip: ${ad.canSkip}, CurrentTime: ${ad.currentTime}`);

        if (ad.type === "small" || ad.type === "popup" || ad.type === "banner") { // Example types
            const [ad_skip_err] = await to(this.watcherContext.skipAd(false)); // false might mean don't wait for skip button
            if (!ad_skip_err) {
                this.logger.info(`Attempted to skip/close small/banner ad.`);
            } else {
                this.logger.warn(`Failed to skip small/banner ad: ${ad_skip_err.message}`);
            }
        }

        if (ad.type === "video") {
            if (this.effectiveInput.autoSkipAds) { // autoSkipAds from main input
                if (!this.adDetected) { // First time seeing this video ad
                    this.adDetected = true;
                    // SkipAdsAfter is an array [min, max] from input
                    const skipAfterMin = this.effectiveInput.skipAdsAfter[0] || 5;
                    const skipAfterMax = this.effectiveInput.skipAdsAfter[1] || (skipAfterMin + 5);
                    this.adPlayTime = random(skipAfterMin, skipAfterMax); // Time in seconds to wait before trying to skip
                    this.logger.info(`Video ad detected. Will attempt to skip after ~${this.adPlayTime}s.`);
                }

                // Check if ad can be skipped and if enough time has passed
                if (ad.canSkip) {
                    if (ad.currentTime >= this.adPlayTime) {
                        const [ad_skip_err] = await to(this.watcherContext.skipAd(true)); // true might mean click the actual skip button
                        if (!ad_skip_err) {
                            this.logger.info(`Skipped video ad after ${ad.currentTime.toFixed(1)}s (target: ${this.adPlayTime}s).`);
                            this.adDetected = false; // Reset for next ad
                        } else {
                             this.logger.warn(`Failed to skip video ad (was skippable): ${ad_skip_err.message}`);
                        }
                    } else {
                        this.logger.debug(`Video ad playing (${ad.currentTime.toFixed(1)}s / ${ad.duration.toFixed(1)}s). Waiting for ${this.adPlayTime}s to skip.`);
                    }
                } else {
                     this.logger.debug(`Video ad playing (${ad.currentTime.toFixed(1)}s / ${ad.duration.toFixed(1)}s). Not skippable yet.`);
                }

            } else if (ad.canSkip) { // Not autoSkipAds, but if it's skippable, skip immediately
                const [ad_skip_err] = await to(this.watcherContext.skipAd(true));
                if (!ad_skip_err) {
                    this.logger.info(`Immediately skipped ad (autoSkipAds=false, but ad.canSkip=true).`);
                } else {
                    this.logger.warn(`Failed to immediately skip video ad: ${ad_skip_err.message}`);
                }
            }
        }
    }

    async kill() {
        this.killed = true;
        this.logger.info(`Kill signal received. Closing browser if active.`);
        if (this.browser) {
            const [close_err] = await to(this.browser.close());
            if (close_err) {
                this.logger.warn(`Error closing browser: ${close_err.message}`);
            } else {
                this.logger.info('Browser closed successfully.');
            }
            this.browser = null;
        }
    }
}

// === MAIN ACTOR LOGIC ===

async function actorMainLogic() {
    console.log('ACTOR_MAIN_LOGIC: >>> Entered main logic function - VERY FIRST LINE <<<');

    await Apify.init();
    console.log('ACTOR_MAIN_LOGIC: Actor.init() completed.');

    const logger = Apify.utils.log.child({ prefix: 'ACTOR' });
    logger.info('Starting YouTube & Rumble View Bot Actor (using selfbot-api approach)');

    const input = await Apify.getInput();
    if (!input) {
        logger.error('No input provided. Exiting.');
        await Apify.Actor.fail('No input provided.'); // Use Actor.fail for cleaner exit on Apify
        return;
    }

    logger.info('Actor input received:', input);

    // Default input values (enhance these as needed)
    const effectiveInput = {
        videoUrls: [],
        watchTimePercentage: 80,
        useProxies: true,
        proxyGroups: ['RESIDENTIAL'],
        proxyCountry: 'US',
        headless: true,
        autoSkipAds: true,
        skipAdsAfter: [5, 10], // min, max seconds
        useAV1: false,
        timeout: 120, // seconds
        concurrencyInterval: 1, // seconds
        searchKeywordsForEachVideo: [], // For 'search' watchType
        watchTypes: ['direct'], // Per video, or a single default
        // Add other fields from INPUT_SCHEMA.json
        ...input,
    };

    if (!effectiveInput.videoUrls || effectiveInput.videoUrls.length === 0) {
        logger.error('No videoUrls provided in input. Exiting.');
        await Apify.Actor.fail('No videoUrls provided in input.');
        return;
    }

    const results = [];
    const jobs = [];

    // Create job objects
    for (let i = 0; i < effectiveInput.videoUrls.length; i++) {
        const videoUrl = effectiveInput.videoUrls[i];
        const videoId = extractVideoId(videoUrl);

        if (!videoId) {
            logger.error(`Could not extract video ID from: ${videoUrl}. Skipping.`);
            results.push({ status: 'error', videoUrl, error: 'Could not extract video ID' });
            continue;
        }

        const isRumble = videoUrl.includes('rumble.com');
        const isYoutube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');

        if (!isRumble && !isYoutube) {
            logger.error(`Unsupported platform for URL: ${videoUrl}. Skipping.`);
            results.push({ status: 'error', videoUrl, videoId, error: 'Unsupported platform' });
            continue;
        }
        
        const watchType = Array.isArray(effectiveInput.watchTypes) && effectiveInput.watchTypes[i]
            ? effectiveInput.watchTypes[i]
            : (typeof effectiveInput.watchTypes === 'string' ? effectiveInput.watchTypes : 'direct');

        const keyword = Array.isArray(effectiveInput.searchKeywordsForEachVideo) && effectiveInput.searchKeywordsForEachVideo[i]
            ? effectiveInput.searchKeywordsForEachVideo[i]
            : (typeof effectiveInput.searchKeywordsForEachVideo === 'string' ? effectiveInput.searchKeywordsForEachVideo : null);


        jobs.push({
            videoId: videoId,
            videoUrl: videoUrl,
            isRumble: isRumble,
            isYoutube: isYoutube,
            isLive: false, // This would need dynamic detection (e.g., from ytdl-core or API)
            duration: null, // Placeholder, can be fetched if needed by selfbot-api or ytdl-core
            keyword: keyword, // For search, if selfbot API supports it
            watchType: watchType,
            // watchTime: effectiveInput.watchTimePercentage // Already in effectiveInput
        });
    }
    
    if (jobs.length === 0) {
        logger.error('No valid jobs to process after parsing input. Exiting.');
        await Apify.Actor.fail('No valid jobs to process.');
        return;
    }

    logger.info(`Created ${jobs.length} job(s) to process.`);

    for (const job of jobs) {
        logger.info(`Processing job for video: ${job.videoUrl} (ID: ${job.videoId})`);
        let proxyUrl = null;
        let proxyConfiguration = null; // Keep a reference to call .retire() if using Apify Proxy per URL

        if (effectiveInput.useProxies) {
            // Example for Apify proxy. Custom proxies would be handled differently.
            // If using custom proxies from a list, you'd pick one here.
             proxyConfiguration = await Apify.Actor.createProxyConfiguration({
                groups: effectiveInput.proxyGroups,
                countryCode: effectiveInput.proxyCountry,
            });
            if (proxyConfiguration) {
                proxyUrl = proxyConfiguration.newUrl(); // Gets a single proxy URL for this job
                logger.info(`Using Apify proxy for this job: ${proxyUrl.split('@')[1] || 'details hidden'}`);
            } else {
                logger.warn('Proxy configuration could not be created. Proceeding without proxy for this job.');
            }
        } else {
            logger.info('Not using proxies for this job.');
        }

        const worker = new Test1111Worker(job, effectiveInput, proxyUrl, logger);
        let jobResult;

        try {
            if (job.isYoutube) {
                await worker.startYoutubeWorker();
            } else if (job.isRumble) {
                await worker.startRumbleWorker();
            } else {
                throw new Error("Job platform not identified for worker start.");
            }

            jobResult = await worker.watchVideo();
            logger.info(`Successfully processed video: ${job.videoUrl}`, jobResult);

        } catch (error) {
            logger.error(`Error processing video ${job.videoUrl}: ${error.message}`, { stack: error.stack, videoId: job.videoId });
            jobResult = {
                status: 'error',
                videoUrl: job.videoUrl,
                videoId: job.videoId,
                error: error.message,
                stack: error.stack
            };
        } finally {
            await worker.kill();
            if (proxyConfiguration && typeof proxyConfiguration.retireUrl === 'function') {
                 // If Apify proxy was used and you want to retire it after use for this job
                 // This depends on whether you get a new proxy per job or use a session
                 // For single URL per job, retiring might not be what you want unless it's a session proxy you're done with.
                 // If newUrl() gives a fresh proxy that's auto-managed, explicit retire might not be needed.
                 // Check Apify proxy docs for best practice with createProxyConfiguration + newUrl().
            }
        }
        results.push(jobResult);
        await Apify.Actor.pushData(jobResult); // Push result for each job

        // Wait between videos if processing multiple and interval is set
        if (effectiveInput.concurrencyInterval > 0 && jobs.indexOf(job) < jobs.length - 1) {
            logger.info(`Waiting for ${effectiveInput.concurrencyInterval}s before next video...`);
            await new Promise(resolve => setTimeout(resolve, effectiveInput.concurrencyInterval * 1000));
        }
    }

    logger.info(`Actor finished. Processed ${results.length} video(s). Final results overview:`, results.map(r => ({ videoUrl: r.videoUrl, status: r.status, error: r.error ? r.error.substring(0,100) : undefined })));
    // Optionally, save all results together at the end
    // await Apify.Actor.setValue('ALL_RESULTS', results);
}

console.log('MAIN.JS: actorMainLogic function fully defined.');

// === APIFY ACTOR ENTRY POINT ===
Apify.main(async () => {
    try {
        // Check if selfbot APIs are loaded before starting main logic
        // This is a simple check; a more robust one might involve a timeout or retry
        if (!youtube_selfbot_api && !rumble_selfbot_api) {
            // Wait a bit for async imports to complete
            console.log('MAIN.JS: Waiting a few seconds for selfbot APIs to potentially load...');
            await new Promise(resolve => setTimeout(resolve, 5000)); 
        }

        if (!youtube_selfbot_api && !rumble_selfbot_api) {
            // Log this, but actorMainLogic also checks and throws
            console.error('MAIN.JS: Selfbot APIs still not loaded after wait. Actor might fail.');
        } else {
            console.log('MAIN.JS: Selfbot APIs appear to be loaded. Proceeding with main logic.');
        }
        await actorMainLogic();
        console.log('MAIN.JS: actorMainLogic completed.');
    } catch (error) {
        // This top-level catch is for errors not caught within actorMainLogic or Apify.main's own handling
        console.error('ACTOR_MAIN_LOGIC: CRITICAL UNHANDLED ERROR IN TOP LEVEL:', error.message);
        console.error('ACTOR_MAIN_LOGIC: Stack:', { message: error.message, stack: error.stack });
        // Exiting explicitly as Apify.main might not always exit on unhandled promise rejections from here
        process.exit(1);
    }
});

console.log('MAIN.JS: Apify.Actor.main is set up.');
console.log('MAIN.JS: Script fully loaded and main execution path determined. (End of script log)');
