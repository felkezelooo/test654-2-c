// main.js (Final version, compatible with simple UI)

import { Actor } from 'apify';
import { PlaywrightCrawler, sleep } from 'crawlee';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// --- Helper Functions (No changes needed here) ---
function extractVideoId(url, log) {
    try {
        const urlObj = new URL(url);
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            return urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
        }
        if (url.includes('rumble.com')) {
            const pathParts = urlObj.pathname.split('/');
            const lastPart = pathParts.pop() || pathParts.pop(); // Handle trailing slash
            return lastPart.split('-')[0];
        }
        log.warning('Could not determine platform from URL.', { url });
        return null;
    } catch (error) {
        log.error(`Error extracting video ID from URL: ${url}`, { errorMessage: error.message });
        return null;
    }
}

async function clickIfExists(page, locator, log, timeout = 3000) {
    try {
        await locator.waitFor({ state: 'visible', timeout });
        await locator.click({ timeout: timeout / 2 });
        log.info(`Successfully clicked element.`);
        return true;
    } catch (e) {
        log.debug(`Element not found or not clickable within timeout.`, { error: e.message.split('\n')[0] });
        return false;
    }
}

async function handleConsent(page, log) {
    log.info('Checking for consent dialogs...');
    const consentButtonLocators = [
        page.getByRole('button', { name: /accept all/i }),
        page.getByRole('button', { name: /agree to all/i }),
    ];
    for (const locator of consentButtonLocators) {
        if (await clickIfExists(page, locator, log, 5000)) {
            log.info('Clicked a consent button.');
            await sleep(2000);
            return;
        }
    }
    log.info('No consent dialogs found or handled.');
}

async function handleAds(page, platform, input, log) {
    log.info('Starting ad handling logic.');
    const adCheckIntervalMs = 2500;
    const maxAdWatchTimeMs = (input.maxSecondsAds || 60) * 1000;
    const adLoopStartTime = Date.now();

    while (Date.now() - adLoopStartTime < maxAdWatchTimeMs) {
        const adSelectors = {
            youtube: page.locator('.ad-showing, .ytp-ad-player-overlay-instream-info'),
            rumble: page.locator('.video-ad-indicator, .ima-ad-container :not([style*="display: none"])'),
        };
        const skipSelectors = {
            youtube: page.getByRole('button', { name: /skip ad/i }),
            rumble: page.getByRole('button', { name: /skip ad/i }),
        };

        const isAdPlaying = await adSelectors[platform].count() > 0;

        if (!isAdPlaying) {
            log.info('No ad seems to be playing. Exiting ad handler.');
            return;
        }

        log.info(`Ad detected on ${platform}.`);
        
        if (input.autoSkipAds) {
            if (await clickIfExists(page, skipSelectors[platform], log, 1000)) {
                log.info('Ad skipped due to `autoSkipAds` setting.');
                await sleep(2000);
                continue;
            }
        }

        const skipAfter = input.skipAdsAfter || [5, 10];
        const [minSkip, maxSkip] = skipAfter.map(Number);
        const randomSkipDelay = (minSkip + Math.random() * (maxSkip - minSkip)) * 1000;

        try {
            await skipSelectors[platform].waitFor({ state: 'visible', timeout: randomSkipDelay });
            log.info('Skip button is visible, attempting to click.');
            if (await clickIfExists(page, skipSelectors[platform], log, 1000)) {
                 log.info('Ad skipped after waiting for configured delay.');
                 await sleep(2000);
                 continue;
            }
        } catch (e) {
            log.debug('Skip button not visible within the configured delay.', { error: e.message.split('\n')[0] });
        }

        await sleep(adCheckIntervalMs);
    }
    log.warning('Ad handling timed out.', { maxAdWatchTimeMs });
}

async function ensureVideoPlaying(page, log) {
    log.info('Ensuring video is playing...');
    const videoLocator = page.locator('video.html5-main-video, video.rumble-player-video').first();
    for (let attempt = 0; attempt < 3; attempt++) {
        const isPaused = await videoLocator.evaluate((video) => video.paused).catch(() => true);
        if (!isPaused) {
            log.info(`Video is confirmed to be playing on attempt ${attempt + 1}.`);
            return true;
        }

        log.warning(`Video is paused on attempt ${attempt + 1}. Attempting to play.`);
        await videoLocator.click({ timeout: 2000, force: true, trial: true }).catch((e) => log.debug('Video element click failed.', { error: e.message }));
        await sleep(1000);
    }

    log.error('Failed to ensure video was playing after multiple attempts.');
    return false;
}

// --- Actor Main Execution ---
await Actor.init();

chromium.use(stealthPlugin());

const input = await Actor.getInput();

// *** THIS IS THE NEW LOGIC THAT FIXES THE PROBLEM ***
// It converts the simple input arrays into the structured `tasks` array the crawler uses.
if (!input || !input.videoUrls || input.videoUrls.length === 0) {
    throw new Error('Invalid input: The "videoUrls" array is required and cannot be empty.');
}

// Separate the URL-specific arrays from the global settings
const { 
    videoUrls, 
    watchTypes = [], 
    refererUrls = [], 
    searchKeywordsForEachVideo = [], 
    ...globalSettings 
} = input;

// Create a structured tasks array from the simple inputs
const tasks = videoUrls.map((url, index) => ({
    url,
    watchType: watchTypes[index] || 'direct',
    refererUrl: refererUrls[index] || null,
    searchKeywords: searchKeywordsForEachVideo[index] || null,
}));
// *** END OF NEW LOGIC ***

const requestQueue = await Actor.openRequestQueue();
for (const task of tasks) {
    if (!task.url) {
        Actor.log.warning('Skipping task with no URL provided.', { task });
        continue;
    }
    const videoId = extractVideoId(task.url, Actor.log);
    const platform = task.url.includes('youtube.com') ? 'youtube' : (task.url.includes('rumble.com') ? 'rumble' : 'unknown');

    await requestQueue.addRequest({
        url: task.url,
        // Combine global settings with the specific settings for this task
        userData: {
           ...globalSettings,
           ...task,
            videoId,
            platform,
        },
    });
}

const proxyConfiguration = await Actor.createProxyConfiguration({
   proxyUrls: input.customProxyUrls?.length > 0 ? input.customProxyUrls : undefined,
   groups: input.proxyGroups,
   countryCode: input.proxyCountry,
});

const crawler = new PlaywrightCrawler({
   requestQueue,
   proxyConfiguration,
   launcher: chromium,
   launchContext: {
        useIncognitoPages: true,
        launchOptions: {
            headless: input.headless,
        }
   },
   browserPoolOptions: {
       useFingerprints: true,
   },
   minConcurrency: 1,
   maxConcurrency: input.concurrency,
   navigationTimeoutSecs: input.timeout,
   maxRequestRetries: 3,

   requestHandler: async ({ request, page, log: pageLog, session }) => {
       const { url, userData } = request;
       const { platform, videoId } = userData;
       pageLog.info(`Processing video...`, { url, platform, videoId });

       const result = {
           url,
           videoId,
           platform,
           proxyUsed: session?.getProxyUrl(),
           status: 'processing',
           startTime: new Date().toISOString(),
           endTime: null,
           durationFoundSec: null,
           watchTimeRequestedSec: 0,
           watchTimeActualSec: 0,
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
               const gotoOptions = { timeout: input.timeout * 1000, waitUntil: 'domcontentloaded' };
               if (userData.watchType === 'referer' && userData.refererUrl) {
                   pageLog.info(`Navigating with referer: ${userData.refererUrl}`);
                   await page.setExtraHTTPHeaders({ 'Referer': userData.refererUrl });
               }
               await page.goto(url, gotoOptions);
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

               if (videoState.currentTime >= targetWatchTimeSec) {
                   pageLog.info(`Target watch time reached. Actual: ${videoState.currentTime.toFixed(2)}s`);
                   break;
               }
               if (videoState.ended) {
                   pageLog.info('Video ended before target watch time was reached.');
                   break;
               }
               if (elapsedTime > targetWatchTimeSec * 1.5 + 60) {
                   throw new Error('Watch loop timed out. Video may be stuck or buffering indefinitely.');
               }
               if (videoState.paused) {
                   pageLog.warning('Video became paused during watch loop, attempting to resume.');
                   await ensureVideoPlaying(page, pageLog);
               }

               if (Math.floor(elapsedTime) % 30 === 0 && elapsedTime > 1) {
                   await handleAds(page, platform, userData, pageLog);
               }

               await sleep(5000);
           }

           result.status = 'success';
       } catch (error) {
           pageLog.error('An error occurred during video processing.', { url, error: error.message });
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
