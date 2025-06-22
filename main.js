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

async function handleConsent(page, logInstance) {
    logInstance.info('Checking for consent dialogs...');
    const consentButtonLocators = [
        page.getByRole('button', { name: /accept all/i }),
        page.getByRole('button', { name: /agree to all/i }),
    ];
    for (const locator of consentButtonLocators) {
        try {
            await locator.click({ timeout: 5000 });
            logInstance.info('Clicked a consent button.');
            await sleep(2000);
            return;
        } catch (e) {
            logInstance.debug('Consent button not found or clickable.');
        }
    }
    logInstance.info('No consent dialogs found or handled.');
}

// *** NEW `handleYouTubeAds` function based on your research ***
/**
 * Handles YouTube ads by detecting them and attempting to click the skip button.
 * This function should be called periodically during video playback.
 *
 * @param {import('playwright').Page} page The Playwright page object.
 * @param {import('crawlee').Log} log A logger instance for structured logging.
 * @param {number} maxAdWatchSeconds The maximum time to spend trying to handle an ad.
 */
async function handleYouTubeAds(page, log, maxAdWatchSeconds = 60) {
    const adContainerLocator = page.locator('.ad-showing, .ytp-ad-player-overlay-instream-info');
    // Using the resilient, user-facing locator for the skip button
    const skipButtonLocator = page.getByRole('button', { name: /skip ad/i });

    const adWatchStartTime = Date.now();
    log.info('Starting robust ad handling logic...');

    while ((Date.now() - adWatchStartTime) < (maxAdWatchSeconds * 1000)) {
        const isAdVisible = await adContainerLocator.count() > 0;

        if (!isAdVisible) {
            log.info('No ad container detected. Exiting ad handler.');
            return;
        }

        log.info('Ad is currently playing. Checking for a skippable button...');

        try {
            // Use a short timeout for the click attempt. If the button is not
            // clickable within this time, the loop will continue.
            await skipButtonLocator.click({ timeout: 2000 });
            log.info('Successfully clicked the skip ad button.');
            // Wait a moment for the ad to disappear before the next check.
            await page.waitForTimeout(2500);
            // Continue the loop in case there is another ad immediately after.
            continue;
        } catch (error) {
            // This is expected if the button is not yet visible or clickable.
            log.debug('Skip button not clickable yet. Waiting...');
        }

        // Wait for a short interval before the next check in the loop.
        await page.waitForTimeout(2500);
    }

    log.warning(`Ad handling logic timed out after ${maxAdWatchSeconds} seconds.`);
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

async function getStableVideoDuration(page, logInstance) {
    logInstance.info('Waiting for stable video duration...');
    const videoLocator = page.locator('video.html5-main-video').first();
    let lastDuration = 0;
    for (let i = 0; i < 15; i++) {
        const duration = await videoLocator.evaluate(v => v.duration).catch(() => 0);
        if (duration > 90 && duration === lastDuration) {
            logInstance.info(`Found stable duration: ${duration.toFixed(2)}s`);
            return duration;
        }
        lastDuration = duration;
        await sleep(1000);
    }
    if (lastDuration > 0 && lastDuration !== Infinity) {
        logInstance.warning(`Could not get a stable video duration, proceeding with last known duration: ${lastDuration}`);
        return lastDuration;
    }
    throw new Error('Could not determine a valid video duration after multiple attempts.');
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
   requestHandlerTimeoutSecs: 300,
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
            // Calling the new, robust ad handler
            await handleYouTubeAds(page, pageLog, userData.maxSecondsAds);

            if (!await ensureVideoPlaying(page, pageLog)) {
                throw new Error('Failed to start video playback.');
            }

            await page.locator('video').first().evaluate(video => {
                video.muted = false;
                video.volume = 0.05 + Math.random() * 0.1;
            }).catch(e => pageLog.debug('Could not set volume', { error: e.message }));

            const duration = await getStableVideoDuration(page, pageLog);
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
                if (elapsedTime > targetWatchTimeSec * 1.5 + 120) {
                    throw new Error('Watch loop timed out.');
                }
                if (videoState.paused) {
                    await ensureVideoPlaying(page, pageLog);
                }

                // Check for mid-roll ads
                if (Math.floor(elapsedTime) > 0 && Math.floor(elapsedTime) % 60 === 0) {
                    if (elapsedTime - (result.lastAdCheckTime || 0) > 59) {
                        await handleYouTubeAds(page, pageLog, userData.maxSecondsAds);
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
