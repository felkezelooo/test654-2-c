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
    const maxAdWatchTimeMs = (input.maxSecondsAds || 45) * 1000;

    while (Date.now() - adWatchStartTime < maxAdWatchTimeMs) {
        if ((await adContainerLocator.count()) === 0) {
            logInstance.info('Ad container no longer visible. Concluding ad handler.');
            return;
        }
        logInstance.info('Ad is visible. Attempting aggressive player state manipulation.');
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
            continue;
        } catch (error) {
            logInstance.debug('Skip button was not immediately clickable.');
        }
        await sleep(1000);
    }
    logInstance.warning(`Ad handling logic timed out after ${maxAdWatchTimeMs / 1000} seconds.`);
}

async function ensureVideoPlaying(page, logInstance) {
    logInstance.info('Ensuring video is playing...');
    const videoLocator = page.locator('video.html5-main-video').first();

    for (let attempt = 1; attempt <= 4; attempt++) {
        if (!await videoLocator.evaluate((v) => v.paused).catch(() => true)) {
            logInstance.info(`Video is confirmed to be playing on attempt ${attempt}.`);
            return;
        }
        logInstance.warning(`Video is paused on attempt ${attempt}. Trying keyboard press...`);
        try {
            await page.locator('#movie_player').click({ timeout: 2000 });
            await page.keyboard.press('k');
            logInstance.info(`Sent 'k' keyboard press.`);
            await sleep(2000);
        } catch (e) {
            logInstance.error(`Failed to send keyboard press: ${e.message}`);
        }
        if (!await videoLocator.evaluate((v) => v.paused).catch(() => true)) {
            logInstance.info('Video started playing after keyboard press!');
            return;
        }
    }
    throw new Error('Failed to ensure video was playing after multiple attempts.');
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
    preNavigationHooks: [
        async ({ page, log: pageLog }) => {
            const blockedDomains = [
                'googlesyndication.com', 'googleadservices.com',
                'doubleclick.net', 'googletagservices.com',
                'google-analytics.com',
            ];
            await page.route('**/*', (route) => {
                const url = route.request().url();
                if (blockedDomains.some(domain => url.includes(domain))) {
                    return route.abort().catch(() => {});
                }
                return route.continue().catch(() => {});
            });
        },
    ],
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
                const videoLinkLocator = page.locator(`a#video-title[href*="${videoId}"]`).first();
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

            await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => pageLog.warning('Network idle timeout reached...'));
            await handleConsent(page, pageLog);
            await handleAds(page, platform, userData, pageLog);
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
            let lastMouseX = 500;
            let lastMouseY = 300;

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

                // *** NEW: Human-like interaction during watch loop ***
                if (Math.floor(elapsedTime) > 0 && Math.floor(elapsedTime) % 25 === 0) {
                    if (elapsedTime - (result.lastInteractionTime || 0) > 24) {
                        pageLog.info('Simulating human-like mouse movement to prevent idle timeout...');
                        const newX = lastMouseX + (Math.random() - 0.5) * 200;
                        const newY = lastMouseY + (Math.random() - 0.5) * 200;
                        await page.mouse.move(newX, newY, { steps: 20 });
                        lastMouseX = newX;
                        lastMouseY = newY;
                        result.lastInteractionTime = elapsedTime;
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
