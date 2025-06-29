import { Actor } from 'apify';
import { PlaywrightCrawler, sleep, log } from 'crawlee';
import { chromium } from 'playwright';

// ======================================================================================
//
//  ANTI-FINGERPRINTING AND HELPER FUNCTIONS
//
// ======================================================================================

/**
 * Generates a highly diverse and consistent "persona" for a single browser session.
 * This ensures all spoofed values are logically coherent to evade detection.
 * @returns {object} An object containing all the spoofed values for the session.
 */
function generatePersona() {
    log.info('Generating new, diverse browser persona...');
    const os = Math.random() > 0.3 ? 'windows' : 'macos'; // Windows is more common

    // Expanded profiles for more diversity, based on real-world data.
    const hardwareProfiles = [
        { concurrency: 4, memory: 8 }, { concurrency: 8, memory: 8 }, { concurrency: 8, memory: 16 },
        { concurrency: 12, memory: 16 }, { concurrency: 16, memory: 16 }, { concurrency: 16, memory: 32 },
        { concurrency: 4, memory: 16 }, { concurrency: 6, memory: 12 }, { concurrency: 12, memory: 24 },
    ];
    const screenProfiles = [
        { width: 1920, height: 1080, availMargin: 40 }, { width: 1366, height: 768, availMargin: 40 },
        { width: 1536, height: 864, availMargin: 40 }, { width: 1440, height: 900, availMargin: 40 },
        { width: 2560, height: 1440, availMargin: 60 }, { width: 1600, height: 900, availMargin: 40 },
    ];
    const webglWindowsProfiles = [
        { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
        { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
        { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
        { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    ];
    const webglMacosProfiles = [
        { vendor: 'Apple Inc.', renderer: 'Apple M2' }, { vendor: 'Apple Inc.', renderer: 'Apple M1 Pro' }, { vendor: 'Apple Inc.', renderer: 'Apple M1' },
    ];
    const windowsFonts = ['Arial', 'Calibri', 'Cambria', 'Comic Sans MS', 'Courier New', 'Georgia', 'Impact', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Verdana'];
    const macosFonts = ['Arial', 'American Typewriter', 'Avenir', 'Courier New', 'Georgia', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Impact', 'Menlo', 'San Francisco', 'Times New Roman'];

    const hardware = hardwareProfiles[Math.floor(Math.random() * hardwareProfiles.length)];
    const screen = screenProfiles[Math.floor(Math.random() * screenProfiles.length)];
    const webglProfile = os === 'windows'
        ? webglWindowsProfiles[Math.floor(Math.random() * webglWindowsProfiles.length)]
        : webglMacosProfiles[Math.floor(Math.random() * webglMacosProfiles.length)];

    return {
        navigator: {
            hardwareConcurrency: hardware.concurrency,
            deviceMemory: hardware.memory,
            platform: os === 'windows' ? 'Win32' : 'MacIntel',
            languages: ['en-US', 'en'],
        },
        screen: {
            width: screen.width,
            height: screen.height,
            availWidth: screen.width,
            availHeight: screen.height - screen.availMargin,
            colorDepth: 24,
            pixelDepth: 24,
        },
        webgl: webglProfile,
        fonts: os === 'windows' ? windowsFonts : macosFonts,
        timezoneOffset: (3 + Math.floor(Math.random() * 5)) * 60, // Mimic UTC-3 to UTC-7
        canvasNoise: { r: Math.floor(Math.random() * 10) - 5, g: Math.floor(Math.random() * 10) - 5, b: Math.floor(Math.random() * 10) - 5 },
        audioNoise: (Math.random() - 0.5) * 1e-7,
    };
}

/**
 * Applies a comprehensive suite of anti-fingerprinting measures to a Playwright page.
 * @param {import('playwright').Page} page The Playwright page object to modify.
 */
async function applyAntiFingerprinting(page) {
    const persona = generatePersona();
    await page.addInitScript((p) => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = window.chrome || {};
        window.chrome.runtime = window.chrome.runtime || {};
        const originalChromeRuntime = window.chrome.runtime;
        window.chrome.runtime = { ...originalChromeRuntime, connect: () => ({ onMessage: { addListener: () => {} }, disconnect: () => {} }), sendMessage: () => {} };

        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(...args) {
            const dataURL = originalToDataURL.apply(this, args);
            if (this.width < 200 || this.height < 200) {
                try {
                    const context = this.getContext('2d');
                    if (context) {
                        const imageData = context.getImageData(0, 0, this.width, this.height);
                        for (let i = 0; i < imageData.data.length; i += 4) {
                            imageData.data[i] = Math.min(255, Math.max(0, imageData.data[i] + p.canvasNoise.r));
                            imageData.data[i + 1] = Math.min(255, Math.max(0, imageData.data[i + 1] + p.canvasNoise.g));
                            imageData.data[i + 2] = Math.min(255, Math.max(0, imageData.data[i + 2] + p.canvasNoise.b));
                        }
                        context.putImageData(imageData, 0, 0);
                        return originalToDataURL.apply(this, args);
                    }
                } catch (e) { /* ignore */ }
            }
            return dataURL;
        };

        const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return p.webgl.vendor;
            if (parameter === 37446) return p.webgl.renderer;
            return originalGetParameter.apply(this, arguments);
        };
        if (typeof WebGL2RenderingContext !== 'undefined') {
            const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
            WebGL2RenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) return p.webgl.vendor;
                if (parameter === 37446) return p.webgl.renderer;
                return originalGetParameter2.apply(this, arguments);
            };
        }

        try { Date.prototype.getTimezoneOffset = function() { return p.timezoneOffset; }; } catch (e) { /* ignore */ }

        const originalFontCheck = Document.prototype.fonts.check;
        Document.prototype.fonts.check = function(font) {
            if (p.fonts.includes(font.split(' ')[0].replace(/"/g, ''))) return true;
            return originalFontCheck.apply(this, arguments);
        };

        const originalPermissionsQuery = navigator.permissions.query;
        navigator.permissions.query = (parameters) => {
            if (['notifications', 'geolocation', 'camera', 'microphone'].includes(parameters.name)) {
                return Promise.resolve({ state: 'prompt', onchange: null });
            }
            return originalPermissionsQuery(parameters);
        };

        Object.defineProperties(navigator, {
            hardwareConcurrency: { get: () => p.navigator.hardwareConcurrency },
            deviceMemory: { get: () => p.navigator.deviceMemory },
            platform: { get: () => p.navigator.platform },
            languages: { get: () => p.navigator.languages },
            plugins: { get: () => ({ length: 0 }) }, // Return empty but valid PluginArray
            mimeTypes: { get: () => ({ length: 0 }) }, // Return empty but valid MimeTypeArray
        });

        Object.defineProperties(screen, {
            width: { get: () => p.screen.width }, height: { get: () => p.screen.height },
            availWidth: { get: () => p.screen.availWidth }, availHeight: { get: () => p.screen.availHeight },
            colorDepth: { get: () => p.screen.colorDepth }, pixelDepth: { get: () => p.screen.pixelDepth },
        });

    }, persona);
}

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
        page.getByRole('button', { name: /accept all/i }), page.getByRole('button', { name: /agree to all/i }), page.getByRole('button', { name: /i agree/i }),
    ];
    for (const locator of consentButtonLocators) {
        try {
            await locator.click({ timeout: 5000 });
            logInstance.info('Clicked a consent button.');
            await sleep(2000);
            return;
        } catch (e) {
            logInstance.debug('A consent button was not found or clickable.');
        }
    }
    logInstance.info('No consent dialogs found or they were handled.');
}

async function handleAds(page, platform, input, logInstance) {
    if (platform !== 'youtube' || !input.autoSkipAds) return;
    logInstance.info('Starting robust ad handling logic...');
    const adContainerLocator = page.locator('.ad-showing, .video-ads, .ytp-ad-player-overlay-instream-info');
    const skipButtonLocator = page.locator('.ytp-ad-skip-button-modern, .ytp-ad-skip-button, .ytp-skip-ad-button');
    try {
        await adContainerLocator.first().waitFor({ state: 'visible', timeout: 7000 });
        logInstance.info('Ad container detected.');
    } catch (e) {
        logInstance.info('No ad container appeared. Assuming no ads.');
        return;
    }
    const adWatchStartTime = Date.now();
    const maxAdWatchTimeMs = (input.maxSecondsAds || 60) * 1000;
    while (Date.now() - adWatchStartTime < maxAdWatchTimeMs) {
        if ((await adContainerLocator.count()) === 0) {
            logInstance.info('Ad container disappeared. Ad finished.');
            await sleep(1000);
            return;
        }
        try {
            await skipButtonLocator.click({ timeout: 1500 });
            logInstance.info('Successfully clicked the skip ad button.');
            await sleep(2000);
            return;
        } catch (e) { logInstance.debug('Skip button not yet clickable.'); }
        await sleep(1000);
    }
    logInstance.warning('Ad handling timed out.');
}

async function getStableVideoDuration(page, logInstance) {
    logInstance.info('Waiting for stable video duration...');
    const videoLocator = page.locator('video.html5-main-video').first();
    const adContainerLocator = page.locator('.ad-showing, .video-ads');
    let lastDuration = 0;
    for (let i = 0; i < 20; i++) {
        if (await adContainerLocator.isVisible({ timeout: 1000 }).catch(() => false)) {
            logInstance.warning('Ad is still active, delaying duration check.');
            await sleep(2000);
            lastDuration = 0;
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
    if (lastDuration > 0 && lastDuration !== Infinity) return lastDuration;
    throw new Error('Could not determine a valid video duration.');
}

async function startPlayback(page, logInstance) {
    logInstance.info('Attempting to start video playback...');
    const videoLocator = page.locator('video.html5-main-video').first();
    const playerErrorLocator = page.locator('.ytp-error');
    if (await playerErrorLocator.isVisible()) throw new Error('Player error was present before playback could even start.');
    await videoLocator.evaluate(video => { video.muted = false; video.volume = 0.05 + Math.random() * 0.1; }).catch(e => logInstance.debug('Could not set volume', { error: e.message }));
    if (!await videoLocator.evaluate((v) => v.paused).catch(() => true)) {
        logInstance.info('Video is already playing.');
        return;
    }
    await page.keyboard.press('k').catch(() => {});
    await sleep(500);
    if (await videoLocator.evaluate((v) => v.paused).catch(() => true)) {
        await page.locator('#movie_player').click({ timeout: 2000, position: { x: 10, y: 10 } }).catch(() => {});
    }
    await sleep(1500);
    if (await videoLocator.evaluate((v) => v.paused).catch(() => true)) throw new Error('Failed to start video playback.');
    logInstance.info('Video playback successfully initiated.');
}

async function simulateHumanInteraction(page, logInstance) {
    logInstance.info('Simulating gentle human-like interaction...');
    try {
        const videoPlayerLocator = page.locator('#movie_player');
        const bb = await videoPlayerLocator.boundingBox();
        if (bb) {
            await page.mouse.move(
                bb.x + (Math.random() * bb.width),
                bb.y + (Math.random() * bb.height),
                { steps: 15 + Math.floor(Math.random() * 15) },
            );
        }
    } catch (e) {
        logInstance.debug(`Human interaction simulation failed: ${e.message}`);
    }
}

// ======================================================================================
//  ACTOR MAIN EXECUTION
// ======================================================================================

await Actor.init();
const input = await Actor.getInput();
if (!input || !input.videoUrls || input.videoUrls.length === 0) throw new Error('Invalid input: "videoUrls" is required.');

const { videoUrls, watchTypes = [], refererUrls = [], searchKeywordsForEachVideo = [], ...globalSettings } = input;
const tasks = videoUrls.map((url, index) => ({ url, watchType: watchTypes[index] || 'direct', refererUrl: refererUrls[index] || null, searchKeywords: searchKeywordsForEachVideo[index] || null }));
const requestQueue = await Actor.openRequestQueue();
for (const task of tasks) {
    const videoId = extractVideoId(task.url, log);
    const platform = task.url.includes('youtube.com') ? 'youtube' : (task.url.includes('rumble.com') ? 'rumble' : 'unknown');
    await requestQueue.addRequest({ url: task.url, userData: { ...globalSettings, ...task, videoId, platform } });
}

const proxyConfiguration = input.useProxies ? await Actor.createProxyConfiguration({ proxyUrls: input.customProxyUrls?.length ? input.customProxyUrls : undefined, groups: input.proxyGroups, countryCode: input.proxyCountry || undefined }) : undefined;

const crawler = new PlaywrightCrawler({
    requestQueue,
    proxyConfiguration,
    launchContext: {
        launcher: chromium,
        useIncognitoPages: true,
        launchOptions: {
            headless: input.headless,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process,ImprovedCookieControls,LazyFrameLoading,GlobalMediaControls,DestroyProfileOnBrowserClose,MediaRouter,DialMediaRouteProvider,AcceptCHFrame,AutoExpandDetailsElement,CertificateTransparencyEnforcement,AvoidUnnecessaryBeforeUnloadCheckSync,Translate',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-site-isolation-trials',
                '--disable-sync',
                '--force-webrtc-ip-handling-policy=default_public_interface_only',
                '--no-first-run',
                '--no-service-autorun',
                '--password-store=basic',
                '--use-mock-keychain',
                '--enable-precise-memory-info',
            ],
        },
    },
    preNavigationHooks: [
        async ({ page, log: pageLog }) => {
            pageLog.info('Applying custom anti-fingerprinting measures...');
            await applyAntiFingerprinting(page);
            pageLog.info('Anti-fingerprinting measures applied.');
        },
    ],
    minConcurrency: 1,
    maxConcurrency: input.concurrency,
    requestHandlerTimeoutSecs: 450,
    navigationTimeoutSecs: input.timeout,
    maxRequestRetries: 3,
    requestHandler: async ({ request, page, log: pageLog, session }) => {
        const { url, userData } = request;
        const result = { url, videoId: userData.videoId, platform: userData.platform, proxyUsed: session?.proxyUrl, status: 'processing', startTime: new Date().toISOString(), endTime: null, durationFoundSec: null, watchTimeRequestedSec: 0, watchTimeActualSec: 0, error: null };
        try {
            if (userData.watchType === 'search' && userData.searchKeywords) {
                pageLog.info(`Navigating to search results for keyword: "${userData.searchKeywords}"`);
                await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(userData.searchKeywords)}`);
                const videoLinkLocator = page.locator(`a#video-title[href*="${userData.videoId}"]`).first();
                await videoLinkLocator.waitFor({ state: 'visible', timeout: 30000 });
                pageLog.info('Found video link in search results, clicking...');
                await videoLinkLocator.click();
            } else {
                if (userData.watchType === 'referer' && userData.refererUrl) await page.setExtraHTTPHeaders({ Referer: userData.refererUrl });
                await page.goto(url, { timeout: input.timeout * 1000, waitUntil: 'domcontentloaded' });
            }
            await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => pageLog.warning('Network idle timeout reached...'));
            await handleConsent(page, pageLog);
            await handleAds(page, userData.platform, userData, pageLog);
            await startPlayback(page, pageLog);
            const duration = await getStableVideoDuration(page, pageLog);
            result.durationFoundSec = duration;
            const targetWatchTimeSec = duration * (userData.watchTimePercentage / 100);
            result.watchTimeRequestedSec = targetWatchTimeSec;
            pageLog.info(`Now watching for ${targetWatchTimeSec.toFixed(2)} seconds...`);

            const watchIntervalMs = 25 * 1000;
            const numIntervals = Math.ceil((targetWatchTimeSec * 1000) / watchIntervalMs);
            for (let i = 0; i < numIntervals; i++) {
                const sleepDuration = (i === numIntervals - 1) ? (targetWatchTimeSec * 1000) % watchIntervalMs || watchIntervalMs : watchIntervalMs;
                await sleep(sleepDuration);
                if (i < numIntervals - 1) {
                    await simulateHumanInteraction(page, pageLog);
                }
            }

            pageLog.info('Finished waiting for the specified duration.');
            const finalVideoTime = await page.locator('video.html5-main-video').first().evaluate(v => v.currentTime).catch(() => 0);
            result.watchTimeActualSec = finalVideoTime;
            const playerErrorLocator = page.locator('.ytp-error');
            if (await playerErrorLocator.isVisible()) throw new Error('YouTube player error detected after the watch period.');
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
    failedRequestHandler: async ({ request, log: pageLog }) => {
        pageLog.error(`Request failed too many times, giving up.`, { url: request.url });
        await Actor.pushData({ url: request.url, videoId: request.userData.videoId, platform: request.userData.platform, status: 'terminal_failure', error: `Request failed after ${request.retryCount} retries.`, log: request.errorMessages });
    },
});

await crawler.run();
await Actor.exit();
