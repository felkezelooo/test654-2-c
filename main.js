// The main change is on this first line: 'apify' is now 'crawlee'
import { Actor, log } from 'crawlee';
import { playwrightUtils, PlaywrightCrawler } from 'crawlee';
import { v4 as uuidv4 } from 'uuid';

// --- Improved Anti-Detection & Browser Launching ---
const LAUNCH_CONTEXT = {
    launchOptions: {
        headless: true, // This will be overridden by input.
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--disable-infobars',
            '--disable-notifications',
            '--disable-popup-blocking',
            '--mute-audio',
        ],
    },
    proxyConfiguration: undefined,
};

async function applyStealth(context) {
    await playwrightUtils.injectFile(context, playwrightUtils.getStealthUtils());
    await context.addInitScript(() => {
        try {
            const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (parameter) {
                if (parameter === 37445) return 'Google Inc. (Intel)';
                if (parameter === 37446) return 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 640, OpenGL 4.1)';
                return originalGetParameter.apply(this, arguments);
            };
        } catch (e) {
            console.debug('Failed WebGL spoof:', e.message);
        }
        try {
            Date.prototype.getTimezoneOffset = function() { return 5 * 60; };
        } catch (e) {
            console.debug('Failed timezone spoof:', e.message);
        }
    });
}

function extractVideoId(url) {
    try {
        const urlObj = new URL(url);
        if (url.includes('youtube.com/watch')) {
            return urlObj.searchParams.get('v');
        }
        if (url.includes('rumble.com')) {
            const pathParts = urlObj.pathname.split('/');
            const lastPart = pathParts.pop();
            return lastPart.split('.html')[0].split('-')[0] || lastPart;
        }
    } catch (error) {
        log.error(`Error extracting video ID from URL ${url}: ${error.message}`);
    }
    return null;
}

// --- Main Actor Logic ---
// The Actor.main() function is the main entry point for the actor.
// It is wrapped in a main() function to allow for top-level await.
Actor.main(async () => {
    log.info('Starting YouTube & Rumble View Bot (Crawlee Version).');

    const input = await Actor.getInput();
    const {
        videoUrls = [],
        watchTypes = ['direct'],
        refererUrls = [],
        searchKeywordsForEachVideo = [],
        watchTimePercentage = 80,
        useProxies = true,
        proxyUrls = [],
        proxyCountry,
        proxyGroups = ['RESIDENTIAL'],
        headless = true,
        concurrency = 1,
        timeout = 120,
        maxSecondsAds = 15,
        autoSkipAds = true,
    } = input;

    if (!videoUrls || videoUrls.length === 0) {
        log.warning('No videoUrls provided in the input. Exiting.');
        await Actor.exit();
        return;
    }
    
    // --- Proxy Configuration ---
    if (useProxies) {
        const proxyConfiguration = await Actor.createProxyConfiguration({
            proxyUrls: proxyUrls.length > 0 ? proxyUrls : undefined,
            groups: proxyGroups,
            countryCode: proxyCountry || undefined,
        });
        LAUNCH_CONTEXT.proxyConfiguration = proxyConfiguration;
        log.info('Proxy configuration enabled.');
    } else {
        log.info('Running without proxies.');
    }
    
    LAUNCH_CONTEXT.launchOptions.headless = headless;

    const requestQueue = await Actor.openRequestQueue();
    // --- Create Jobs ---
    for (const [index, url] of videoUrls.entries()) {
        const videoId = extractVideoId(url);
        if (!videoId) {
            log.warning(`Could not extract video ID from URL: ${url}. Skipping.`);
            continue;
        }

        const platform = url.includes('youtube') ? 'youtube' : 'rumble';
        const watchType = watchTypes[index] || 'direct';
        const searchKeywords = (watchType === 'search' && searchKeywordsForEachVideo[index]?.split(',').map(kw => kw.trim()).filter(Boolean)) || [];
        
        if (watchType === 'search' && searchKeywords.length === 0) {
            log.warning(`Watch type is 'search' for ${url} but no keywords provided. Defaulting to 'direct'.`);
        }
        
        await requestQueue.addRequest({
            url: url,
            uniqueKey: `${videoId}_${uuidv4()}`,
            userData: {
                videoId,
                platform,
                watchType: (watchType === 'search' && searchKeywords.length > 0) ? 'search' : 'direct',
                refererUrl: (watchType === 'referer' && refererUrls[index]) || null,
                searchKeywords,
                input,
            },
        });
    }

    const crawler = new PlaywrightCrawler({
        requestQueue,
        launchContext: LAUNCH_CONTEXT,
        minConcurrency: 1,
        maxConcurrency: concurrency,
        navigationTimeoutSecs: timeout,
        maxConcurrentPagesPerBrowser: 1,

        preNavigationHooks: [
            async ({ page, request }) => {
                await applyStealth(page.context());
                const { refererUrl } = request.userData;
                if (refererUrl) {
                    await page.setExtraHTTPHeaders({ 'Referer': refererUrl });
                    log.info(`[${request.userData.videoId}] Setting referer: ${refererUrl}`);
                }
            },
        ],

        requestHandler: async ({ page, request, log: pageLog, session }) => {
            const { videoId, platform, watchType, searchKeywords, input: jobInput } = request.userData;
            pageLog.info(`Processing video: ${request.url} (Type: ${watchType})`);

            if (watchType === 'search') {
                const keyword = searchKeywords[Math.floor(Math.random() * searchKeywords.length)];
                pageLog.info(`Searching for keyword: "${keyword}"`);
                const searchUrl = platform === 'youtube'
                    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`
                    : `https://rumble.com/search/video?q=${encodeURIComponent(keyword)}`;
                
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
                const videoLinkSelector = platform === 'youtube' 
                    ? `a#video-title[href*="/watch?v=${videoId}"]`
                    : `a.video-item--a[href*="${videoId}"]`;

                try {
                    const videoLink = page.locator(videoLinkSelector).first();
                    await videoLink.waitFor({ state: 'visible', timeout: 45000 });
                    await videoLink.click();
                    await page.waitForURL(`**/*${videoId}*`, { timeout: 45000 });
                    pageLog.info('Successfully navigated from search results.');
                } catch (e) {
                    session.retire();
                    throw new Error(`Failed to find or click video link from search for keyword "${keyword}". Retrying with a new session.`);
                }
            }
            
            try {
                const consentButton = page.locator('button[aria-label*="Accept all"], button[aria-label*="Agree to all"]');
                await consentButton.click({ timeout: 7000 });
                pageLog.info('Consent button clicked.');
            } catch (e) {
                pageLog.debug('No consent button found or clickable.');
            }

            const videoElement = page.locator('video.html5-main-video, video.rumble-player-video');
            await videoElement.waitFor({ state: 'visible', timeout: 60000 });

            if (await videoElement.evaluate(v => v.paused)) {
                await videoElement.click({ trial: true }).catch(()=>{});
            }
            
            const duration = await videoElement.evaluate(v => v.duration);
            if (!duration || !isFinite(duration) || duration <= 0) {
                throw new Error('Could not determine a valid video duration.');
            }
            
            const targetWatchTimeSec = duration * (jobInput.watchTimePercentage / 100);
            pageLog.info(`Video duration: ${duration.toFixed(2)}s. Target watch time: ${targetWatchTimeSec.toFixed(2)}s.`);

            let currentWatchTime = 0;
            const startTime = Date.now();
            
            while (currentWatchTime < targetWatchTimeSec) {
                if (Date.now() - startTime > (targetWatchTimeSec + 60) * 1000) {
                    pageLog.warning('Watch time loop exceeded target time + buffer. Exiting loop.');
                    break;
                }
                
                if (jobInput.autoSkipAds) {
                    const skipButton = page.locator('.ytp-ad-skip-button, .videoAdUiSkipButton').first();
                    if (await skipButton.isVisible()) {
                        await skipButton.click({ trial: true }).catch(()=>{});
                        pageLog.info('Ad skip button clicked.');
                    }
                }
                
                const state = await videoElement.evaluate(v => ({ paused: v.paused, ended: v.ended, currentTime: v.currentTime }));

                if (state.ended) {
                    pageLog.info('Video ended before target watch time was reached.');
                    break;
                }
                if (state.paused) {
                    pageLog.info('Video is paused. Attempting to play...');
                    await videoElement.click({ trial: true }).catch(()=>{});
                }
                
                currentWatchTime = state.currentTime;
                pageLog.debug(`Current watch time: ${currentWatchTime.toFixed(2)}s`);
                
                await page.waitForTimeout(5000);
            }

            await Actor.pushData({
                videoId,
                url: request.url,
                platform,
                watchType,
                durationFoundSec: duration,
                watchTimeRequestedSec: targetWatchTimeSec,
                watchTimeActualSec: currentWatchTime,
                status: 'success',
            });
        },

        failedRequestHandler: async ({ request }) => {
            log.error(`Request ${request.url} failed. Check logs for details.`);
            await Actor.pushData({
                url: request.url,
                videoId: request.userData.videoId,
                status: 'failure',
                error: 'Request failed after multiple retries.',
            });
        },
    });

    await crawler.run();
});
