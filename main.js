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

async function handleAds(page, platform, input, logInstance) {
    if (platform !== 'youtube') return;
    logInstance.info('Starting aggressive ad handling logic.');
    const adContainerLocator = page.locator('.ad-showing, .ytp-ad-player-overlay-instream-info');
    const adVideoLocator = page.locator('video.html5-main-video');
    const skipButtonLocator = page.getByRole('button', { name: /skip ad/i });
    const adWatchStartTime = Date.now();
    const maxAdWatchTimeMs = (input.maxSecondsAds || 30) * 1000;

    while (Date.now() - adWatchStartTime < maxAdWatchTimeMs) {
        if ((await adContainerLocator.count()) === 0) {
            logInstance.info('Ad container no longer visible. Concluding ad handler.');
            return;
        }
        try {
            await adVideoLocator.evaluate((video) => {
                if (video && video.duration > 0 && !isNaN(video.duration)) {
                    video.muted = true;
                    video.playbackRate = 16;
                    video.currentTime = video.duration;
                }
            });
        } catch (e) {
            logInstance.debug(`Could not manipulate ad video state: ${e.message}`);
        }
        try {
            await skipButtonLocator.click({ timeout: 1000 });
            logInstance.info('Successfully clicked the skip ad button post-manipulation.');
            await sleep(1500);
            return;
        } catch (error) {
            logInstance.debug('Skip button was not immediately clickable.');
        }
        await sleep(1000);
    }
    logInstance.warning(`Ad handling logic timed out.`);
}

// *** THE DEFINITIVE `ensureVideoPlaying` with ERROR DETECTION ***
async function ensureVideoPlaying(page, logInstance) {
    logInstance.info('Ensuring video is playing...');
    const videoLocator = page.locator('video.html5-main-video').first();
    const playerErrorLocator = page.locator('.ytp-error');

    // ** THE FINAL FIX IS HERE **
    // Before trying to play, we check if YouTube has thrown a player error.
    if (await playerErrorLocator.isVisible()) {
        const errorMessage = await page.locator('.ytp-error-content-wrap-reason').textContent().catch(() => 'Unknown reason.');
        logInstance.error(`Youtubeer has an error overlay: "${errorMessage}". This session is likely blocked.`);
        // We throw a specific error to stop the process for this video gracefully.
        throw new Error(`Youtubeer error detected: ${errorMessage}`);
    }

    // If no error overlay, proceed with trying to play the video.
    if (!await videoLocator.evaluate((v) => v.paused).catch(() => true)) {
        logInstance.info('Video is already playing.');
        return;
    }

    try {
        logInstance.info('Video is paused. Attempting to play with keyboard press...');
        await page.locator('#movie_player').click({ timeout: 2000 });
        await page.keyboard.press('k');
        await sleep(2000);

        if (!await videoLocator.evaluate((v) => v.paused)) {
            logInstance.info('SUCCESS: Video started playing after keyboard press!');
            return;
        }
    } catch (e) {
        logInstance.warning(`Playback strategy failed: ${e.message}`);
    }

    throw new Error('Failed to ensure video was playing.');
}


async function getStableVideoDuration(page, logInstance) {
    logInstance.info('Waiting for stable video duration...');
    const videoLocator = page.locator('video.html5-main-video').first();
    let lastDuration = 0;
    for (let i = 0; i < 15; i++) {
        const duration = await videoLocator.evaluate(v => v.duration).catch(() => 0);
        if (duration > 60 && Math.abs(duration - lastDuration) < 1) {
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
const { videoUrls, watchTypes = [], refererUrls = [], searchKeywordsForEachVideo = [], ...globalSettings } = input;
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
    await requestQueue.addRequest({ url: task.url, userData: { ...globalSettings, ...task, videoId, platform } });
}
const proxyConfiguration = await Actor.createProxyConfiguration({
   proxyUrls: input.customProxyUrls?.length ? input.customProxyUrls : undefined,
   groups: input.proxyGroups,
   countryCode: input.proxyCountry,
});
const crawler = new PlaywrightCrawler({
   requestQueue,
   proxyConfiguration,
   launchContext: { launcher: chromium, useIncognitoPages: true, launchOptions: { headless: input.headless } },
   minConcurrency: 1,
   maxConcurrency: input.concurrency,
   requestHandlerTimeoutSecs: 450,
   navigationTimeoutSecs: input.timeout,
   maxRequestRetries: 3,
    preNavigationHooks: [ async ({ page }) => {
            const blockedDomains = ['googlesyndication.com', 'googleadservices.com', 'doubleclick.net', 'googletagservices.com', 'google-analytics.com'];
            await page.route('**/*', (route) => (blockedDomains.some(domain => route.request().url().includes(domain)) ? route.abort() : route.continue()).catch(() => {}));
        },
    ],
    requestHandler: async ({ request, page, log: pageLog, session }) => {
        const { url, userData } = request;
        const result = {
            url, videoId: userData.videoId, platform: userData.platform,
            proxyUsed: session?.proxyUrl, status: 'processing',
            startTime: new Date().toISOString(), endTime: null,
            durationFoundSec: null, watchTimeRequestedSec: 0, watchTimeActualSec: 0,
            error: null,
        };
        try {
            if (userData.watchType === 'search' && userData.searchKeywords) {
                pageLog.info(`Navigating to search results for keyword: "${userData.searchKeywords}"`);
                await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(userData.searchKeywords)}`);
                const videoLinkLocator = page.locator(`a#video-title[href*="${userData.videoId}"]`).first();
                await videoLinkLocator.waitFor({ state: 'visible', timeout: 30000 });
                pageLog.info('Found video link in search results, clicking...');
                await videoLinkLocator.click();
            } else {
                if (userData.watchType === 'referer' && userData.refererUrl) {
                    await page.setExtraHTTPHeaders({ 'Referer': userData.refererUrl });
                }
                await page.goto(url, { timeout: input.timeout * 1000, waitUntil: 'domcontentloaded' });
            }
            await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => pageLog.warning('Network idle timeout reached...'));
            await handleConsent(page, pageLog);
            await handleAds(page, userData.platform, userData, pageLog);
            await ensureVideoPlaying(page, pageLog);
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
            let lastInteractionTime = 0;
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
                if (elapsedTime > targetWatchTimeSec * 1.5 + 120) throw new Error('Watch loop timed out.');
                if (videoState.paused) await ensureVideoPlaying(page, pageLog);
                if (elapsedTime - lastInteractionTime > 30) {
                    pageLog.info('Simulating human-like mouse movement to prevent idle timeout...');
                    await page.mouse.move(Math.random() * 500 + 100, Math.random() * 300 + 100, { steps: 20 });
                    lastInteractionTime = elapsedTime;
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
