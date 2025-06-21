import { Actor } from 'apify';
import { PlaywrightCrawler, playwrightUtils, log } from 'crawlee';
import playwright from 'playwright';
import { v4 as uuidv4 } from 'uuid';

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

    const proxyConfiguration = useProxies
        ? await Actor.createProxyConfiguration({
            proxyUrls: proxyUrls.length > 0 ? proxyUrls : undefined,
            groups: proxyGroups,
            countryCode: proxyCountry || undefined,
        })
        : undefined;

    if (proxyConfiguration) {
        log.info('Proxy configuration enabled.');
    } else {
        log.info('Running without proxies.');
    }

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

    const crawler = new PlaywrightCrawler({
        requestQueue,
        proxyConfiguration,
        // Instead of launchContext, we define the launcher and its options directly
        launcher: playwright.chromium,
        launchOptions: {
            headless,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-first-run',
                '--disable-infobars',
                '--disable-notifications',
                '--disable-popup-blocking',
                '--mute-audio',
            ],
        },
        // Concurrency settings control how many browsers run at once
        minConcurrency: 1,
        maxConcurrency: concurrency,
        // This is a more direct way to manage pages and lifecycle
        maxPagesPerBrowser: 1,
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
                const keyword = searchKeywords[Math.floor(Math.random() * searchKeywords.length)];
                pageLog.info(`Searching for keyword: "${keyword}"`);
                const searchUrl = platform === 'youtube'
                    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`
                    : `https://rumble.com/search/video?q=${encodeURIComponent(keyword)}`;

                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout });
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
                    throw new Error(`Failed to find or click video link from search for keyword "${keyword}". Retiring with a new session.`);
                }
            }
        },
        // Handles requests that fail after all retries
        failedRequestHandler: async ({ request, log: pageLog }) => {
            pageLog.error(`Request ${request.url} failed. Check logs for details.`);
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
