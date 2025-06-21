// MAIN.JS: Modernized Apify Actor Script
// Using ES6 modules for better readability and modern standards.
import { Actor } from 'apify';
import { playwrightUtils, PlaywrightCrawler } from 'crawlee';
import playwright from 'playwright';
import { v4 as uuidv4 } from 'uuid';

// --- Improved Anti-Detection & Browser Launching ---
// The original repository uses sophisticated anti-detection.
// Crawlee/Apify SDK's `launchPlaywright` and playwrightUtils already incorporate many
// anti-detection features. We will rely on them and supplement with key flags.
// This is more maintainable than a large, static list of arguments.
const LAUNCH_CONTEXT = {
    // Let Apify/Crawlee manage the launch options for better integration.
    // We can still add essential args if needed.
    launchOptions: {
        headless: true, // This will be overridden by input.
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--disable-infobars',
            '--disable-notifications',
            '--disable-popup-blocking',
            '--mute-audio', // Muting audio is a good practice for viewers.
        ],
    },
    // Using Apify's recommended way to handle proxies.
    proxyConfiguration: undefined, // Will be set in main logic.
};

/**
 * Applies stealth techniques to the browser context.
 * This is a simplified version of the manual anti-detection script,
 * focusing on the most critical parts. Crawlee's default fingerprinting
 * already handles many of these.
 * @param {import('playwright').BrowserContext} context
 */
async function applyStealth(context) {
    await playwrightUtils.injectFile(context, playwrightUtils.getStealthUtils());
    await context.addInitScript(() => {
        // Spoof WebGL vendor and renderer
        try {
            const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (parameter) {
                if (parameter === 37445) return 'Google Inc. (Intel)';
                if (parameter === 37446) return 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 640, OpenGL 4.1)';
                return originalGetParameter.apply(this, arguments);
            };
        } catch (e) {
            console.debug('Failed WebGL spoof:', e.message);
        }
        // Spoof timezone
        try {
            Date.prototype.getTimezoneOffset = function() { return 5 * 60; }; // Simulating UTC-5
        } catch (e) {
            console.debug('Failed timezone spoof:', e.message);
        }
    });
}

/**
 * Extracts a video ID from a YouTube or Rumble URL.
 * @param {string} url
 * @returns {string|null}
 */
function extractVideoId(url) {
    try {
        const urlObj = new URL(url);
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            return urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
        }
        if (url.includes('rumble.com')) {
            const pathParts = urlObj.pathname.split('/');
            const lastPart = pathParts.pop();
            return lastPart.split('.html')[0].split('-')[0] || lastPart;
        }
    } catch (error) {
        Actor.log.error(`Error extracting video ID from URL ${url}: ${error.message}`);
    }
    return null;
}


// --- Main Actor Logic ---
async function main() {
    await Actor.init();
    Actor.log.info('Starting YouTube & Rumble View Bot Actor (Improved Version).');

    const input = await Actor.getInput();
    const {
        videoUrls = ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
        watchTypes = ['direct'],
        refererUrls = [],
        searchKeywordsForEachVideo = [],
        watchTimePercentage = 80,
        useProxies = true,
        proxyUrls = [],
        proxyCountry,
        proxyGroups = ['RESIDENTIAL'],
        headless = true,
        concurrency = 1,
        timeout = 120,
        maxSecondsAds = 15,
        autoSkipAds = true,
    } = input;

    // --- Proxy Configuration ---
    if (useProxies) {
        const proxyConfiguration = await Actor.createProxyConfiguration({
            proxyUrls: proxyUrls.length > 0 ? proxyUrls : undefined,
            groups: proxyGroups,
            countryCode: proxyCountry || undefined,
        });
        LAUNCH_CONTEXT.proxyConfiguration = proxyConfiguration;
        Actor.log.info('Proxy configuration enabled.');
    } else {
        Actor.log.info('Running without proxies.');
    }
    
    LAUNCH_CONTEXT.launchOptions.headless = headless;

    const requestQueue = await Actor.openRequestQueue();
    // --- Create Jobs ---
    for (const [index, url] of videoUrls.entries()) {
        const videoId = extractVideoId(url);
        const platform = url.includes('youtube') ? 'youtube' : 'rumble';
        if (!videoId) {
            Actor.log.warning(`Could not extract video ID from URL: ${url}. Skipping.`);
            continue;
        }
        
        const watchType = watchTypes[index] || 'direct';
        const searchKeywords = (watchType === 'search' && searchKeywordsForEachVideo[index]?.split(',').map(kw => kw.trim()).filter(Boolean)) || [];
        
        if (watchType === 'search' && searchKeywords.length === 0) {
            Actor.log.warning(`Watch type is 'search' for ${url} but no keywords provided. Defaulting to 'direct'.`);
        }
        
        await requestQueue.addRequest({
            url: url,
            uniqueKey: `${videoId}_${uuidv4()}`,
            userData: {
                videoId,
                platform,
                watchType: (watchType === 'search' && searchKeywords.length > 0) ? 'search' : 'direct',
                refererUrl: (watchType === 'referer' && refererUrls[index]) || null,
                searchKeywords,
                input, // Pass all input settings to the handler
            },
        });
    }

    // Using PlaywrightCrawler for better session and error management.
    const crawler = new PlaywrightCrawler({
        requestQueue,
        launchContext: LAUNCH_CONTEXT,
        minConcurrency: 1,
        maxConcurrency: concurrency,
        navigationTimeoutSecs: timeout,

        preNavigationHooks: [
            async ({ page, request }, session) => {
                await applyStealth(page.context());
                
                // Set referer if needed
                const { refererUrl } = request.userData;
                if (refererUrl) {
                    await page.setExtraHTTPHeaders({ 'Referer': refererUrl });
                    Actor.log.info(`[${request.userData.videoId}] Setting referer: ${refererUrl}`);
                }
            },
        ],

        requestHandler: async ({ page, request, log, session }) => {
            const { videoId, platform, watchType, searchKeywords, input: jobInput } = request.userData;
            log.info(`Processing video: ${request.url} (Type: ${watchType})`);

            // --- Navigation Logic ---
            if (watchType === 'search') {
                const keyword = searchKeywords[Math.floor(Math.random() * searchKeywords.length)];
                log.info(`Searching for keyword: "${keyword}"`);
                const searchUrl = platform === 'youtube'
                    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`
                    : `https://rumble.com/search/video?q=${encodeURIComponent(keyword)}`;
                
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
                const videoLinkSelector = platform === 'youtube' 
                    ? `a[href*="/watch?v=${videoId}"]`
                    : `a.video-item--a[href*="${videoId}"]`;

                try {
                    const videoLink = page.locator(videoLinkSelector).first();
                    await videoLink.waitFor({ state: 'visible', timeout: 45000 });
                    await videoLink.click();
                    await page.waitForURL(`**/*${videoId}*`, { timeout: 45000 });
                    log.info('Successfully navigated from search results.');
                } catch (e) {
                    session.retire();
                    throw new Error(`Failed to find or click video link from search. Retrying with a new session.`);
                }
            } else {
                // For 'direct' or 'referer', the crawler already navigates to request.url
            }
            
            // --- Consent & Ad Handling ---
            // Simplified consent handling.
            try {
                const consentButton = page.locator('button[aria-label*="Accept all"], button[aria-label*="Agree to all"]');
                await consentButton.click({ timeout: 7000 });
                log.info('Consent button clicked.');
            } catch (e) {
                log.debug('No consent button found or clickable.');
            }

            // --- Watch Logic ---
            const videoElement = page.locator('video.html5-main-video, video.rumble-player-video');
            await videoElement.waitFor({ state: 'visible', timeout: 60000 });

            // Ensure video plays
            if (await videoElement.evaluate(v => v.paused)) {
                await videoElement.click({ trial: true }).catch(()=>{}); // Try to play
            }
            
            const duration = await videoElement.evaluate(v => v.duration);
            if (!duration || !isFinite(duration) || duration <= 0) {
                throw new Error('Could not determine a valid video duration.');
            }
            
            const targetWatchTimeSec = duration * (jobInput.watchTimePercentage / 100);
            log.info(`Video duration: ${duration.toFixed(2)}s. Target watch time: ${targetWatchTimeSec.toFixed(2)}s.`);

            let currentWatchTime = 0;
            const startTime = Date.now();
            
            while (currentWatchTime < targetWatchTimeSec) {
                if (Date.now() - startTime > (targetWatchTimeSec + 60) * 1000) { // Add a 60s buffer
                    log.warning('Watch time loop exceeded target time + buffer. Exiting loop.');
                    break;
                }
                
                // Ad handling
                if (jobInput.autoSkipAds) {
                    const skipButton = page.locator('.ytp-ad-skip-button, .videoAdUiSkipButton').first();
                    if (await skipButton.isVisible()) {
                        await skipButton.click({ trial: true }).catch(()=>{});
                        log.info('Ad skip button clicked.');
                    }
                }
                
                const state = await videoElement.evaluate(v => ({ paused: v.paused, ended: v.ended, currentTime: v.currentTime }));

                if (state.ended) {
                    log.info('Video ended before target watch time was reached.');
                    break;
                }
                if (state.paused) {
                    log.info('Video is paused. Attempting to play...');
                    await videoElement.click({ trial: true }).catch(()=>{});
                }
                
                currentWatchTime = state.currentTime;
                log.debug(`Current watch time: ${currentWatchTime.toFixed(2)}s`);
                
                await page.waitForTimeout(5000); // Check every 5 seconds
            }

            const finalResult = {
                videoId,
                url: request.url,
                platform,
                watchType,
                durationFoundSec: duration,
                watchTimeRequestedSec: targetWatchTimeSec,
                watchTimeActualSec: currentWatchTime,
                status: 'success',
            };

            await Actor.pushData(finalResult);
        },

        failedRequestHandler: async ({ request, log }) => {
            log.error(`Request ${request.url} failed. Check logs for details.`);
            await Actor.pushData({
                url: request.url,
                videoId: request.userData.videoId,
                status: 'failure',
                error: 'Request failed after multiple retries.',
            });
        },
    });

    await crawler.run();
    await Actor.exit();
}

// Check if running on Apify platform and call main
if (process.env.APIFY_IS_AT_HOME) {
    main();
} else {
    // This allows local testing without the full Apify environment
    console.log("Not running on Apify platform. To run locally, you would typically use `apify run`.");
    // You could call main() here for local debugging if desired.
}
