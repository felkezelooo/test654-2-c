// main.js (Refactored with Crawlee and Best Practices)

import { Actor } from 'apify';
import { PlaywrightCrawler, sleep } from 'crawlee';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// --- Helper Functions (Refined and Modularized) ---

/**
* Extracts a video ID from a YouTube or Rumble URL.
* @param {string} url The video URL.
* @param {import('crawlee').Log} log Crawlee logger instance.
* @returns {string | null} The extracted video ID or null on error.
*/
function extractVideoId(url, log) {
   try {
       const urlObj = new URL(url);
       if (url.includes('youtube.com') || url.includes('youtu.be')) {
           return urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
       }
       if (url.includes('rumble.com')) {
           const pathParts = urlObj.pathname.split('/');
           // Handles both "v123-foo.html" and "/v123/" style URLs
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

/**
* Clicks an element if it exists and is visible.
* @param {import('playwright').Page} page The Playwright page object.
* @param {import('playwright').Locator} locator The Playwright locator for the element.
* @param {import('crawlee').Log} log Crawlee logger instance.
* @param {number} timeout Timeout in milliseconds.
* @returns {Promise<boolean>} True if clicked, false otherwise.
*/
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

/**
* Handles consent dialogs that may appear on first visit.
* @param {import('playwright').Page} page The Playwright page object.
* @param {import('crawlee').Log} log Crawlee logger instance.
*/
async function handleConsent(page, log) {
   log.info('Checking for consent dialogs...');
   // Using resilient, user-facing locators
   const consentButtonLocators = [
       page.getByRole('button', { name: /accept all/i }),
       page.getByRole('button', { name: /agree to all/i }),
   ];
   for (const locator of consentButtonLocators) {
       if (await clickIfExists(page, locator, log, 5000)) {
           log.info('Clicked a consent button.');
           await sleep(2000); // Wait for the dialog to disappear
           return;
       }
   }
   log.info('No consent dialogs found or handled.');
}

/**
* Handles ad sequences before and during video playback.
* @param {import('playwright').Page} page The Playwright page object.
* @param {string} platform 'youtube' or 'rumble'.
* @param {object} input The user input object for the current task.
* @param {import('crawlee').Log} log Crawlee logger instance.
*/
async function handleAds(page, platform, input, log) {
   log.info('Starting ad handling logic.');
   const adCheckIntervalMs = 2500;
   const maxAdWatchTimeMs = input.maxSecondsAds * 1000;
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

       const [minSkip, maxSkip] = input.skipAdsAfter.map(Number);
       const randomSkipDelay = (minSkip + Math.random() * (maxSkip - minSkip)) * 1000;

       try {
           // Wait for the skip button to appear for a random duration
           await skipSelectors[platform].waitFor({ state: 'visible', timeout: randomSkipDelay });
           log.info('Skip button is visible, attempting to click.');
           if (await clickIfExists(page, skipSelectors[platform], log, 1000)) {
                log.info('Ad skipped after waiting for configured delay.');
                await sleep(2000);
                continue; // Re-check for another ad immediately
           }
       } catch (e) {
           log.debug('Skip button not visible within the configured delay.', { error: e.message.split('\n')[0] });
       }

       await sleep(adCheckIntervalMs);
   }
   log.warning('Ad handling timed out.', { maxAdWatchTimeMs });
}

/**
* Ensures the main video is playing, attempting to click play if paused.
* @param {import('playwright').Page} page The Playwright page object.
* @param {import('crawlee').Log} log Crawlee logger instance.
* @returns {Promise<boolean>} True if video is playing, false otherwise.
*/
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

// Use playwright-extra with the stealth plugin for enhanced anti-detection
chromium.use(stealthPlugin());

const input = await Actor.getInput();
if (!input || !input.tasks || input.tasks.length === 0) {
   throw new Error('Invalid input: The "tasks" array is required and cannot be empty.');
}

const { tasks, ...globalSettings } = input;

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
       userData: {
          ...globalSettings, // Pass global settings
          ...task, // Override with task-specific settings
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
   // This is the correct way to configure the launcher
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
