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

async function clickIfExists(page, locator, logInstance, timeout = 3000) {
    try {
        await locator.waitFor({ state: 'visible', timeout });
        await locator.click({ timeout: timeout / 2 });
        logInstance.info(`Successfully clicked element: ${locator}`);
        return true;
    } catch (e) {
        logInstance.debug(`Element not found or not clickable within timeout: ${locator}`, { error: e.message.split('\n')[0] });
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

// *** NEW, MORE ROBUST `handleAds` FUNCTION ***
async function handleAds(page, platform, input, logInstance) {
    logInstance.info('Starting ad handling logic.');
    const maxAdWatchTimeMs = (input.maxSecondsAds || 90) * 1000;
    const adLoopStartTime = Date.now();

    // This loop will run for a maximum of `maxAdWatchTimeMs`
    while (Date.now() - adLoopStartTime < maxAdWatchTimeMs) {
        const adShowingLocator = page.locator('.ad-showing, .video-ads.ytp-ad-module');
        const isAdVisible = await adShowingLocator.isVisible();

        // If no ad container is visible, the ad is over.
        if (!isAdVisible) {
            logInstance.info('Ad container no longer visible. Assuming ad is finished.');
            return;
        }

        logInstance.info('Ad is currently visible.');

        // Try to click the skip button if it appears
        const skipButtonLocator = page.locator('.ytp-ad-skip-button, .ytp-ad-skip-button-modern');
        if (await skipButtonLocator.isVisible()) {
            logInstance.info('Skip button is visible. Attempting to click.');
            await clickIfExists(page, skipButtonLocator, logInstance, 1000);
            await sleep(2000); // Give time for the ad to disappear
            continue; // Go to the top of the loop to re-evaluate
        }

        // Wait for a short interval before checking again
        await sleep(2500);
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
   // Increased timeout to give ad handler more time
   requestHandlerTimeoutSecs: 180,
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
                if (elapsedTime > targetWatchTimeSec * 1.5 + 60) {
                    throw new Error('Watch loop timed out.');
                }
                if (videoState.paused) {
                    await ensureVideoPlaying(page, pageLog);
                }

                if (Math.floor(elapsedTime) > 0 && Math.floor(elapsedTime) % 30 === 0) {
                    await handleAds(page, platform, userData, pageLog);
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
