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
            const lastPart = pathParts.pop() || pathParts.pop(); // Handle trailing slash
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
        page.getByRole('button', { name: /i agree/i }),
    ];
    for (const locator of consentButtonLocators) {
        try {
            await locator.click({ timeout: 5000 });
            logInstance.info('Clicked a consent button.');
            await sleep(2000); // Wait for the dialog to disappear
            return;
        } catch (e) {
            logInstance.debug('A consent button was not found or clickable.');
        }
    }
    logInstance.info('No consent dialogs found or they were handled.');
}

// ** FIXED & MORE ROBUST AD HANDLING LOGIC **
async function handleAds(page, platform, input, logInstance) {
    if (platform !== 'youtube' || !input.autoSkipAds) {
        return; // Only run for YouTube and if skipping is enabled.
    }

    logInstance.info('Starting robust ad handling logic...');

    const adContainerLocator = page.locator('.ad-showing, .video-ads, .ytp-ad-player-overlay-instream-info');
    const skipButtonLocator = page.locator('.ytp-ad-skip-button-modern, .ytp-ad-skip-button, .ytp-skip-ad-button');

    try {
        // Wait for an ad container to appear, but don't fail if it doesn't within a reasonable time.
        await adContainerLocator.first().waitFor({ state: 'visible', timeout: 7000 });
        logInstance.info('Ad container detected. Monitoring for skip button or ad completion.');
    } catch (e) {
        logInstance.info('No ad container appeared within the initial timeout. Assuming no ads.');
        return;
    }

    const adWatchStartTime = Date.now();
    const maxAdWatchTimeMs = (input.maxSecondsAds || 60) * 1000;

    while (Date.now() - adWatchStartTime < maxAdWatchTimeMs) {
        // Check if the ad container has disappeared, which means the ad is over.
        if ((await adContainerLocator.count()) === 0) {
            logInstance.info('Ad container is no longer visible. Ad has finished.');
            await sleep(1000); // A small pause for the main content to transition in.
            return;
        }

        // Try to click the skip button if it becomes visible.
        try {
            await skipButtonLocator.click({ timeout: 1500 });
            logInstance.info('Successfully clicked the skip ad button.');
            await sleep(2000); // Wait for the main video to load and stabilize.
            return;
        } catch (e) {
            logInstance.debug('Skip button not yet clickable or not found. Continuing to monitor...');
        }

        await sleep(1000); // Wait before the next check.
    }

    logInstance.warning(`Ad handling timed out after ${input.maxSecondsAds} seconds. The ad might be unskippable or the page is stuck.`);
    if ((await adContainerLocator.count()) > 0) {
        logInstance.warning('Ad container is still visible after timeout. Attempting to proceed regardless.');
    }
}

// ** MORE ROBUST PLAYBACK CHECK **
async function ensureVideoPlaying(page, logInstance) {
    logInstance.info('Ensuring video is playing...');
    const videoLocator = page.locator('video.html5-main-video').first();
    const playerErrorLocator = page.locator('.ytp-error');

    if (await playerErrorLocator.isVisible()) {
        const errorMessage = await page.locator('.ytp-error-content-wrap-reason').textContent().catch(() => 'Unknown reason.');
        throw new Error(`Youtubeer error detected: ${errorMessage}`);
    }

    const isPaused = await videoLocator.evaluate((v) => v.paused).catch(() => true);
    if (!isPaused) {
        logInstance.info('Video is already playing.');
        return;
    }

    logInstance.info('Video is paused. Attempting playback strategies...');
    for (const strategy of ['playerClick', 'keyboard']) {
        try {
            if (strategy === 'playerClick') {
                await page.locator('#movie_player').click({ timeout: 3000, position: { x: 10, y: 10 } });
            } else {
                await page.keyboard.press('k');
            }
            await sleep(1500);
            if (!await videoLocator.evaluate((v) => v.paused)) {
                logInstance.info(`SUCCESS: Video started playing via ${strategy} strategy!`);
                return;
            }
        } catch (e) {
            logInstance.debug(`${strategy} strategy failed: ${e.message}`);
        }
    }

    if (await videoLocator.evaluate((v) => v.paused)) {
        throw new Error('Failed to play video after trying multiple strategies.');
    }
}

// ** FIXED DURATION CHECK TO IGNORE ADS **
async function getStableVideoDuration(page, logInstance) {
    logInstance.info('Waiting for stable video duration...');
    const videoLocator = page.locator('video.html5-main-video').first();
    const adContainerLocator = page.locator('.ad-showing, .video-ads');
    let lastDuration = 0;

    for (let i = 0; i < 20; i++) { // Increased attempts for more stability
        if (await adContainerLocator.isVisible({timeout: 1000}).catch(() => false)) {
            logInstance.warning('Ad is still active, delaying duration check...');
            await sleep(2000);
            lastDuration = 0; // Reset duration to avoid false stability from a previous ad
            continue;
        }

        const duration = await videoLocator.evaluate(v => v.duration).catch(() => 0);
        if (duration > 1 && !isNaN(duration) && duration !== Infinity) {
            const stabilityThreshold = duration > 60 ? 1 : 0.5;
            if (Math.abs(duration - lastDuration) < stabilityThreshold) {
                logInstance.info(`Found stable duration: ${duration.toFixed(2)}s`);
                return duration;
            }
        }
        lastDuration = duration;
        await sleep(1000);
    }

    if (lastDuration > 0 && lastDuration !== Infinity) {
        logInstance.warning(`Could not get a fully stable video duration, proceeding with last known: ${lastDuration}`);
        return lastDuration;
    }
    throw new Error('Could not determine a valid video duration after multiple attempts.');
}


// --- Actor Main Execution (No changes below this line) ---
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
    const platform = task.url.includes('youtube.com') || task.url.includes('youtu.be') ? 'youtube' : (task.url.includes('rumble.com') ? 'rumble' : 'unknown');
    await requestQueue.addRequest({ url: task.url, userData: { ...globalSettings, ...task, videoId, platform } });
}
const proxyConfiguration = input.useProxies ? await Actor.createProxyConfiguration({
    proxyUrls: input.customProxyUrls?.length ? input.customProxyUrls : undefined,
    groups: input.proxyGroups,
    countryCode: input.proxyCountry || undefined,
}) : undefined;
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
            const blockedDomains = ['googlesyndication.com', 'googleadservices.com', 'doubleclick.net', 'googletagservices.com', 'google-analytics.com', 'youtubei/v1/log_event'];
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
                await
