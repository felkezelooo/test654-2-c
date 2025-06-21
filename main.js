import { Actor } from 'apify';
import { PlaywrightCrawler, playwrightUtils, log, BrowserPool, PlaywrightPlugin } from 'crawlee';
import { v4 as uuidv4 } from 'uuid';

// This LAUNCH_CONTEXT is a best-practice for configuring browser launches.
const LAUNCH_CONTEXT = {
    launchOptions: {
        headless: true,
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

// Applies stealth techniques to make the crawler harder to detect.
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
        } catch (e) { /* ignore */ }
        try {
            Date.prototype.getTimezoneOffset = () => 5 * 60;
        } catch (e) { /* ignore */ }
    });
}

function extractVideoId(url) {
    try {
        const urlObj = new URL(url);
        if (url.includes('youtube.com')) {
            return urlObj.searchParams.get('v');
        }
        if (url.includes('rumble.com/')) {
            const match = urlObj.pathname.match(/\/([a-zA-Z0-9]+)-/);
            return (match && match[1]) || urlObj.pathname.split('/')[1].split('.')[0];
        }
    } catch (error) {
        log.error(`Error extracting video ID from URL ${url}: ${error.message}`);
    }
    return null;
}

// Actor.main() is the main entry point for an Apify Actor.
await Actor.main(async () => {
    log.info('Starting YouTube & Rumble View Bot...');

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
    } = input;

    if (!videoUrls || videoUrls.length === 0) {
        log.warning('No videoUrls provided in the input. Exiting.');
        return;
    }

    if (useProxies) {
        LAUNCH_CONTEXT.proxyConfiguration = await Actor.createProxyConfiguration({
            proxyUrls: proxyUrls.length > 0 ? proxyUrls : undefined,
            groups: proxyGroups,
            countryCode: proxyCountry || undefined,
        });
        log.info('Proxy configuration enabled.');
    } else {
        log.info('Running without proxies.');
    }

    LAUNCH_CONTEXT.launchOptions.headless = headless;

    const requestQueue = await Actor.openRequestQueue();
    for (const [index, url] of videoUrls.entries()) {
        const videoId = extractVideoId(url);
        if (!videoId) {
            log.warning(`Could not extract video ID from URL: ${url}. Skipping.`);
            continue;
        }

        const platform = url.includes('youtube.com') ? 'youtube' : 'rumble';
        const watchType = watchTypes[index] || 'direct';
        const searchKeywords = (watchType === 'search' && searchKeywordsForEachVideo[index]?.split(',').map(kw => kw.trim()).filter(Boolean)) || [];

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

    // This is the new, robust crawler configuration
    const crawler = new PlaywrightCrawler({
        requestQueue,
        // The launchContext contains browser launch options and proxy settings
        launchContext: LAUNCH_CONTEXT,
        // Concurrency settings control how many browsers run at once
        minConcurrency: 1,
        maxConcurrency: concurrency,
        // This is the correct way to control pages per browser for memory management
        browserPoolOptions: {
            useFingerprints: true, // Enhanced anti-detection
            browserPlugins: [
                new PlaywrightPlugin({
                    // This is the correct property name and location
                    maxOpenPagesPerBrowser: 1,
                }),
            ],
        },
        // This ensures sessions that fail too often are retired
        sessionPoolOptions: {
            maxPoolSize: 100,
            sessionOptions: {
                maxUsageCount: 5, // Use each proxy/session for a max of 5 requests
                maxErrorScore: 2, // Retire a session after 2 errors
            },
        },
        // This hook runs before each navigation
        preNavigationHooks: [
            async ({ page, request }) => {
                await applyStealth(page.context());
                const { refererUrl } = request.userData;
                if (refererUrl) {
                    await page.setExtraHTTPHeaders({ Referer: refererUrl });
                    log.info(`[${request.userData.videoId}] Setting referer: ${refererUrl}`);
                }
            },
        ],
        // Main logic for handling each page
        requestHandler: async ({ page, request, log: pageLog, session }) => {
            const { videoId, platform, watchType, searchKeywords, input: jobInput } = request.userData;
            pageLog.info(`Processing video: ${request.url} (Type: ${watchType})`);

            if (watchType === 'search') {
                // ... search logic remains the same
            }
            
            // ... video watching logic remains the same
        },
        // Handles requests that fail after all retries
        failedRequestHandler: async ({ request, log: pageLog, session }) => {
            pageLog.error(`Request ${request.url} failed. Retiring session.`);
            // This tells the crawler to discard this proxy/session and get a new one
            session.retire();
            await Actor.pushData({
                url: request.url,
                videoId: request.userData.videoId,
                status: 'failure',
                error: 'Request failed after multiple retries.',
            });
        },
    });

    await crawler.run();
    log.info('Actor finished successfully.');
});
