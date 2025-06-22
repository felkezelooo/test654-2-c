import { Actor } from 'apify';
import { PlaywrightCrawler, sleep, log } from 'crawlee';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// --- Helper Functions ---
function extractVideoId(url, logInstance) {
    try {
        const urlObj = new URL(url);
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            return urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
        }
        if (url.includes('rumble.com')) {
            const pathParts = urlObj.pathname.split('/');
            const lastPart = pathParts.pop() || pathParts.pop();
            return lastPart.split('-')[0];
        }
        logInstance.warning('Could not determine platform from URL.', { url });
        return null;
    } catch (error) {
        logInstance.error(`Error extracting video ID from URL: ${url}`, { errorMessage: error.message });
        return null;
    }
}

async function clickIfExists(page, locator, logInstance, timeout = 1000) {
    try {
        await locator.waitFor({ state: 'visible', timeout });
        await locator.click({ timeout });
        logInstance.info('Successfully clicked skip button.');
        return true;
    } catch (e) {
        logInstance.debug(`Skip button not found or clickable within timeout.`, { error: e.message.split('\n')[0] });
        return false;
    }
}

async function handleConsent(page, logInstance) {
    logInstance.info('Checking for consent dialogs...');
    const consentButtonLocators = [
        page.getByRole('button', { name: /accept all/i }),
        page.getByRole('button', { name: /agree to all/i }),
    ];
    for (const locator of consentButtonLocators) {
        if (await clickIfExists(page, locator, logInstance, 5000)) {
            logInstance.info('Clicked a consent button.');
            await sleep(2000);
            return;
        }
    }
    logInstance.info('No consent dialogs found or handled.');
}

// *** FINAL, PRODUCTION-GRADE `handleAds` FUNCTION ***
async function handleAds(page, platform, input, logInstance) {
    if (platform !== 'youtube') return; // This logic is specific to YouTube ads

    logInstance.info('Starting ad handling logic.');
    const maxAdWatchTimeMs = (input.maxSecondsAds || 60) * 1000;
    const adLoopStartTime = Date.now();

    while (Date.now() - adLoopStartTime < maxAdWatchTimeMs) {
        const adShowingLocator = page.locator('.ad-showing, .video-ads.ytp-ad-module');
        const mainVideo = page.locator('video.html5-main-video');

        // Check for multiple "skip" buttons
        const skipButtonLocators = [
             page.locator('.ytp-ad-skip-button-modern'),
             page.locator('.ytp-ad-skip-button'),
        ];

        // If the main video is playing with sound, the ad is likely over.
        const mainVideoTime = await mainVideo.evaluate((v) => v.currentTime).catch(() => 0);
        if (mainVideoTime > 1) {
            logInstance.info('Main video is playing. Assuming ads are finished.');
            return;
        }
        
        // If no ad container is visible, the ad is over.
        if ((await adShowingLocator.count()) === 0) {
            logInstance.info('Ad container no longer detected. Assuming ad is finished.');
            return;
        }

        logInstance.info('Ad is currently present. Checking for skip button...');

        // Try to click any of the potential skip buttons
        for (const locator of skipButtonLocators) {
            if (await clickIfExists(page, locator, logInstance)) {
                await sleep(2000); // Give time for ad to disappear
                return; // Exit the function successfully
            }
        }
        
        await sleep(2000); // Wait before checking again
    }

    logInstance.warning('Ad handling timed out. Proceeding with video playback attempt.');
}


async function ensureVideoPlaying(page, logInstance) {
    logInstance.info('Ensuring video is playing...');
    const videoLocator = page.locator('video.html5-main-video, video.rumble-player-video').first();
    for (let attempt = 0; attempt < 3; attempt++) {
        if (!await videoLocator.evaluate((v) => v.paused).catch(() => true)) {
            logInstance.info(`Video is confirmed to be playing on attempt ${attempt + 1}.`);
            return true;
        }
        logInstance.warning(`Video is paused on attempt ${attempt + 1}. Attempting to play.`);
        await videoLocator.click({ timeout: 2000, force: true, trial: true }).catch((e) => logInstance.debug('Video click failed.', { e: e.message }));
        await sleep(1000);
    }
    logInstance.error('Failed to ensure video was playing after multiple attempts.');
    return false;
}

// --- Actor Main Execution ---
await Actor.init();

chromium.use(stealthPlugin());

const input = await Actor.getInput();
if (!input || !input.videoUrls || input.videoUrls.length === 0) {
    throw new Error('Invalid input: The "videoUrls" array is required and cannot be empty.');
}

const {
    videoUrls,
    watchTypes = [],
    refererUrls = [],
    searchKeywordsForEachVideo = [],
    ...globalSettings
} = input;

const tasks = videoUrls.map((url, index) => ({
    url,
    watchType: watchTypes[index] || 'direct',
    refererUrl: refererUrls[index] || null,
    searchKeywords: searchKeywordsForEachVideo[index] || null,
}));

const requestQueue = await Actor.openRequestQueue();
for (const task of tasks) {
    const videoId = extractVideoId(task.url, log);
    const platform = task.url.includes('youtube.com') ? 'youtube' : (task.url.includes('rumble.com') ? 'rumble' : 'unknown');
    await requestQueue.addRequest({
        url: task.url,
        userData: { ...globalSettings, ...task, videoId, platform },
    });
}

const proxyConfiguration = await Actor.createProxyConfiguration({
   proxyUrls: input.customProxyUrls?.length ? input.customProxyUrls : undefined,
   groups: input.proxyGroups,
   countryCode: input.proxyCountry,
});

const crawler = new PlaywrightCrawler({
   requestQueue,
   proxyConfiguration,
   launchContext: {
       launcher: chromium,
       useIncognitoPages: true,
       launchOptions: {
           headless: input.headless,
       },
   },
   minConcurrency: 1,
   maxConcurrency: input.concurrency,
   requestHandlerTimeoutSecs: 300, // Increased timeout for more complex videos
   navigationTimeoutSecs: input.timeout,
   maxRequestRetries: 3,

    requestHandler: async ({ request, page, log: pageLog, session }) => {
        const { url, userData } = request;
        const { platform, videoId } = userData;
        pageLog.info(`Processing video...`, { url, platform, videoId });

        const result = {
            url, videoId, platform,
            proxyUsed: session?.proxyUrl,
            status: 'processing',
            startTime: new Date().toISOString(), endTime: null,
            durationFoundSec: null, watchTimeRequestedSec: 0, watchTimeActualSec: 0,
            error: null,
        };

        try {
            if (userData.watchType === 'search' && userData.searchKeywords) {
                const keyword = userData.searchKeywords;
                const searchUrl = platform === 'youtube'
                    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`
                    : `https://rumble.com/search/video?q=${encodeURIComponent(keyword)}`;
                pageLog.info(`Navigating to search results for keyword: "${keyword}"`, { searchUrl });
                await page.goto(searchUrl);
                await handleConsent(page, pageLog);

                const videoLinkLocator = page.locator(`a[href*="${videoId}"]`).first();
                await videoLinkLocator.waitFor({ state: 'visible', timeout: 30000 });
                pageLog.info('Found video link in search results, clicking...');
                await videoLinkLocator.click();
            } else {
                if (userData.watchType === 'referer' && userData.refererUrl) {
                    pageLog.info(`Navigating with referer: ${userData.refererUrl}`);
                    await page.setExtraHTTPHeaders({ 'Referer': userData.refererUrl });
                }
                await page.goto(url, { timeout: input.timeout * 1000, waitUntil: 'domcontentloaded' });
            }

            await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => pageLog.warning('Network idle timeout reached, continuing...'));
            await handleConsent(page, pageLog);
            await handleAds(page, platform, userData, pageLog);

            if (!await ensureVideoPlaying(page, pageLog)) {
                throw new Error('Failed to start video playback.');
            }

            await page.locator('video').first().evaluate(video => {
                video.muted = false;
                video.volume = 0.05 + Math.random() * 0.1;
            }).catch(e => pageLog.debug('Could not set volume', { error: e.message }));

            const duration = await page.locator('video').first().evaluate(v => v.duration);
            if (!duration || duration === Infinity) throw new Error('Could not determine video duration.');
            result.durationFoundSec = duration;

            const targetWatchTimeSec = duration * (userData.watchTimePercentage / 100);
            result.watchTimeRequestedSec = targetWatchTimeSec;
            pageLog.info(`Target watch time: ${targetWatchTimeSec.toFixed(2)}s of ${duration.toFixed(2)}s total.`);

            const watchStartTime = Date.now();
            while (true) {
                const elapsedTime = (Date.now() - watchStartTime) / 1000;
                const videoState = await page.locator('video').first().evaluate(v => ({
                    currentTime: v.currentTime,
                    paused: v.paused,
                    ended: v.ended,
                })).catch(() => ({ currentTime: 0, paused: true, ended: false }));
                result.watchTimeActualSec = videoState.currentTime;

                if (videoState.currentTime >= targetWatchTimeSec || videoState.ended) {
                    log.info(`Watch condition met. Ended: ${videoState.ended}, Time: ${videoState.currentTime.toFixed(2)}s`);
                    break;
                }
                if (elapsedTime > targetWatchTimeSec * 1.5 + 120) { // More generous timeout
                    throw new Error('Watch loop timed out.');
                }
                if (videoState.paused) {
                    await ensureVideoPlaying(page, pageLog);
                }
                
                // Only check for mid-roll ads every 60 seconds to be less disruptive
                if (Math.floor(elapsedTime) > 0 && Math.floor(elapsedTime) % 60 === 0) {
                     // Check for ads only once per minute to avoid getting stuck
                    if (elapsedTime - (result.lastAdCheckTime || 0) > 59) {
                        await handleAds(page, platform, userData, pageLog);
                        result.lastAdCheckTime = elapsedTime;
                    }
                }

                await sleep(5000);
            }
            result.status = 'success';
        } catch (error) {
            pageLog.error('An error occurred during video processing.', { url, error: error.stack });
            result.status = 'failure';
            result.error = error.stack;
        } finally {
            result.endTime = new Date().toISOString();
            await Actor.pushData(result);
        }
    },

    failedRequestHandler({ request, log: pageLog }) {
        pageLog.error(`Request failed too many times, giving up.`, { url: request.url });
        Actor.pushData({
            url: request.url,
            videoId: request.userData.videoId,
            platform: request.userData.platform,
            status: 'terminal_failure',
            error: `Request failed after ${request.retryCount} retries.`,
            log: request.errorMessages,
        });
    },
});

await crawler.run();

await Actor.exit();
