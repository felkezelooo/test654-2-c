import { Actor } from 'apify';
import { PlaywrightCrawler, sleep, log } from 'crawlee';
import { chromium } from 'playwright';

// --- Deliverable 2: The Anti-Fingerprinting Implementation ---

/**
 * Generates a consistent, randomized "persona" for a single browser session.
 * This ensures all spoofed values are logically coherent to evade detection.
 * @returns {object} An object containing all the spoofed values for the session.
 */
function generatePersona() {
    log.info('Generating new browser persona...');
    const os = Math.random() > 0.3 ? 'windows' : 'macos';

    const hardwareProfiles = [
        { concurrency: 4, memory: 8 }, { concurrency: 8, memory: 16 },
        { concurrency: 12, memory: 16 }, { concurrency: 16, memory: 32 },
    ];
    const screenProfiles = [
        { width: 1920, height: 1080, availMargin: 40 }, { width: 1536, height: 864, availMargin: 40 },
        { width: 1440, height: 900, availMargin: 40 }, { width: 1366, height: 768, availMargin: 40 },
    ];
    const hardware = hardwareProfiles[Math.floor(Math.random() * hardwareProfiles.length)];
    const screen = screenProfiles[Math.floor(Math.random() * screenProfiles.length)];

    const webglWindowsProfiles = [
        { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
        { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    ];
    const webglMacosProfiles = [
        { vendor: 'Apple Inc.', renderer: 'Apple M2' }, { vendor: 'Apple Inc.', renderer: 'Apple M1 Pro' },
    ];
    const webglProfile = os === 'windows'
        ? webglWindowsProfiles[Math.floor(Math.random() * webglWindowsProfiles.length)]
        : webglMacosProfiles[Math.floor(Math.random() * webglMacosProfiles.length)];

    const windowsFonts = ['Arial', 'Calibri', 'Cambria', 'Comic Sans MS', 'Courier New', 'Georgia', 'Impact', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Verdana'];
    const macosFonts = ['Arial', 'American Typewriter', 'Avenir', 'Courier New', 'Georgia', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Impact', 'Menlo', 'San Francisco', 'Times New Roman'];

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
        canvasNoise: {
            r: Math.floor(Math.random() * 2) - 1,
            g: Math.floor(Math.random() * 2) - 1,
            b: Math.floor(Math.random() * 2) - 1,
        },
        audioNoise: (Math.random() - 0.5) * 1e-7,
    };
}

/**
 * Applies a comprehensive suite of anti-fingerprinting measures to a Playwright page
 * based on the provided research document.
 * @param {import('playwright').Page} page The Playwright page object to modify.
 */
async function applyAntiFingerprinting(page) {
    const persona = generatePersona();
    await page.addInitScript((p) => {
        // --- Core Automation Flag Mitigations ---
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = window.chrome || {};
        window.chrome.runtime = window.chrome.runtime || {};
        const originalChromeRuntime = window.chrome.runtime;
        window.chrome.runtime = { ...originalChromeRuntime, connect: () => ({ onMessage: { addListener: () => {} }, disconnect: () => {} }), sendMessage: () => {} };

        // --- High-Entropy Rendering Mitigations ---
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(...args) {
            const dataURL = originalToDataURL.apply(this, args);
            if (this.width < 200 || this.height < 200) {
                try {
                    const context = this.getContext('2d');
                    if (context) {
                        const imageData = context.getImageData(0, 0, this.width, this.height);
                        for (let i = 0; i < imageData.data.length; i += 4) {
                            imageData.data[i] = imageData.data[i] + p.canvasNoise.r;
                            imageData.data[i + 1] = imageData.data[i + 1] + p.canvasNoise.g;
                            imageData.data[i + 2] = imageData.data[i + 2] + p.canvasNoise.b;
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

        const originalGetChannelData = AudioBuffer.prototype.getChannelData;
        AudioBuffer.prototype.getChannelData = function(...args) {
            const data = originalGetChannelData.apply(this, args);
            try {
                for (let i = 0; i < data.length; i++) {
                    data[i] += p.audioNoise;
                }
            } catch (e) { /* ignore */ }
            return data;
        };

        // --- API and Environment Mitigations ---
        const originalFontCheck = Document.prototype.fonts.check;
        Document.prototype.fonts.check = function(font) {
            if (p.fonts.includes(font.split(' ')[0].replace(/"/g, ''))) {
                return true;
            }
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
        });

        Object.defineProperties(screen, {
            width: { get: () => p.screen.width },
            height: { get: () => p.screen.height },
            availWidth: { get: () => p.screen.availWidth },
            availHeight: { get: () => p.screen.availHeight },
            colorDepth: { get: () => p.screen.colorDepth },
            pixelDepth: { get: () => p.screen.pixelDepth },
        });

    }, persona); // Pass the generated persona to the script
}

// --- Original Helper Functions (No changes below this point) ---
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
    if (await videoLocator.evaluate((v) => v.paused).catch(() => true)) throw new Error('Failed to start video playback after trying multiple methods.');
    logInstance.info('Video playback successfully initiated.');
}

// --- Main Actor Execution Logic ---
await Actor.init();
const input = await Actor.getInput();
if (!input || !input.videoUrls || input.videoUrls.length === 0) throw new Error('Invalid input: The "videoUrls" array is required and cannot be empty.');

const { videoUrls, watchTypes = [], refererUrls = [], searchKeywordsForEachVideo = [], ...globalSettings } = input;
const tasks = videoUrls.map((url, index) => ({ url, watchType: watchTypes[index] || 'direct', refererUrl: refererUrls[index] || null, searchKeywords: searchKeywordsForEachVideo[index] || null }));
const requestQueue = await Actor.openRequestQueue();
for (const task of tasks) {
    const videoId = extractVideoId(task.url, log);
    const platform = task.url.includes('youtube.com') || task.url.includes('youtu.be') ? 'youtube' : (task.url.includes('rumble.com') ? 'rumble' : 'unknown');
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
            args: ['--disable-blink-features=AutomationControlled', '--disable-infobars'],
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
                    await page.setExtraHTTPHeaders({ Referer: userData.refererUrl });
                }
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
            await sleep(targetWatchTimeSec * 1000);
            pageLog.info('Finished waiting for the specified duration.');
            const finalVideoTime = await page.locator('video.html5-main-video').first().evaluate(v => v.currentTime).catch(() => 0);
            result.watchTimeActualSec = finalVideoTime;
            const playerErrorLocator = page.locator('.ytp-error');
            if (await playerErrorLocator.isVisible()) {
                throw new Error('YouTube player error detected after the watch period.');
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
    failedRequestHandler: async ({ request, log: pageLog }) => {
        pageLog.error(`Request failed too many times, giving up.`, { url: request.url });
        await Actor.pushData({
            url: request.url, videoId: request.userData.videoId,
            platform: request.userData.platform, status: 'terminal_failure',
            error: `Request failed after ${request.retryCount} retries.`,
            log: request.errorMessages,
        });
    },
});

await crawler.run();
await Actor.exit();
