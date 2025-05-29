const Apify = require('apify');
const { Actor } = Apify;

// Using plain Playwright as StealthPlugin will be SKIPPED
const playwright = require('playwright'); 
const { v4: uuidv4 } = require('uuid');
const { URL } = require('url');

// --- Fingerprint Profiles ---
Date.prototype.isDstActive = function(tz = "America/New_York") {
    const now = new Date(this.valueOf());
    const currentYear = now.getFullYear();
    if (tz.startsWith('Europe/')) {
        const marchLastSunday = new Date(Date.UTC(currentYear, 2, 31));
        marchLastSunday.setUTCDate(marchLastSunday.getUTCDate() - marchLastSunday.getUTCDay());
        const octoberLastSunday = new Date(Date.UTC(currentYear, 9, 31));
        octoberLastSunday.setUTCDate(octoberLastSunday.getUTCDate() - octoberLastSunday.getUTCDay());
        return now >= marchLastSunday && now < octoberLastSunday;
    }
    if (tz.startsWith('America/')) {
        let marchSecondSunday = new Date(Date.UTC(currentYear, 2, 1));
        let sundayCount = 0;
        for (let i = 1; i <= 14; i++) {
            marchSecondSunday.setUTCDate(i);
            if (marchSecondSunday.getUTCDay() === 0) sundayCount++;
            if (sundayCount === 2) break;
        }
        let novemberFirstSunday = new Date(Date.UTC(currentYear, 10, 1));
        for (let i = 1; i <= 7; i++) {
            novemberFirstSunday.setUTCDate(i);
            if (novemberFirstSunday.getUTCDay() === 0) break;
        }
        return now >= marchSecondSunday && now < novemberFirstSunday;
    }
    return false;
};

function nodeJsRandom(min, max) {
    if (max === undefined) { max = min; min = 0; }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomArrayItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

const FINGERPRINT_PROFILES = {
    'US_CHROME_WIN_NVIDIA': {
        profileKeyName: 'US_CHROME_WIN_NVIDIA',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        acceptLanguage: 'en-US,en;q=0.9',
        platform: 'Win32',
        deviceMemory: 8,
        hardwareConcurrency: getRandomArrayItem([8, 12, 16]),
        vendor: 'Google Inc.',
        plugins: [], mimeTypes: [],
        locale: 'en-US',
        timezoneId: 'America/New_York',
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? 240 : 300; },
        screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
        webGLVendor: 'Google Inc. (NVIDIA)',
        webGLRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
    'GB_CHROME_WIN_AMD': {
        profileKeyName: 'GB_CHROME_WIN_AMD',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        acceptLanguage: 'en-GB,en;q=0.9',
        platform: 'Win32',
        deviceMemory: 16,
        hardwareConcurrency: getRandomArrayItem([6, 8, 12]),
        vendor: 'Google Inc.',
        plugins: [], mimeTypes: [],
        locale: 'en-GB',
        timezoneId: 'Europe/London',
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? -60 : 0; },
        screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
        webGLVendor: 'Google Inc. (AMD)',
        webGLRenderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
    'US_MAC_CHROME_M_SERIES': {
        profileKeyName: 'US_MAC_CHROME_M_SERIES',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        acceptLanguage: 'en-US,en;q=0.9',
        platform: 'MacIntel',
        deviceMemory: 16,
        hardwareConcurrency: getRandomArrayItem([8, 10, 12]),
        vendor: 'Apple Computer, Inc.',
         plugins: [], mimeTypes: [],
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? 420 : 480; },
        screen: { width: 1728, height: 1117, availWidth: 1728, availHeight: 1079, colorDepth: 30, pixelDepth: 30 },
        webGLVendor: 'Apple',
        webGLRenderer: 'Apple M2 Pro',
    },
};

function getRandomProfileKeyName() {
    const keys = Object.keys(FINGERPRINT_PROFILES);
    return keys[Math.floor(Math.random() * keys.length)];
}

function getProfileByCountry(countryCode) {
    const countryUpper = countryCode ? countryCode.toUpperCase() : '';
    const deepCopy = (profile) => JSON.parse(JSON.stringify(profile));
    const matchingProfileKeys = Object.keys(FINGERPRINT_PROFILES).filter(k => k.startsWith(countryUpper + '_'));

    if (matchingProfileKeys.length > 0) {
        const selectedKey = matchingProfileKeys[Math.floor(Math.random() * matchingProfileKeys.length)];
        return deepCopy(FINGERPRINT_PROFILES[selectedKey]);
    }
    const usProfileKeys = Object.keys(FINGERPRINT_PROFILES).filter(k => k.startsWith('US_'));
    if (usProfileKeys.length > 0) {
         const selectedKey = usProfileKeys[Math.floor(Math.random() * usProfileKeys.length)];
         return deepCopy(FINGERPRINT_PROFILES[selectedKey]);
    }
    return deepCopy(FINGERPRINT_PROFILES[getRandomProfileKeyName()]);
}

// StealthPlugin is SKIPPED for this version
console.log('MAIN.JS: StealthPlugin application SKIPPED for v1.9.4 (replicating b0zDz9AEx6U1cx1N2 baseline).');


async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function getSafeLogger(loggerInstance) { /* ... (unchanged) ... */
    const baseConsoleLogger = {
        info: (msg, data) => console.log(`CONSOLE_INFO: ${msg || ''}`, data || ''),
        warn: (msg, data) => console.warn(`CONSOLE_WARN: ${msg || ''}`, data || ''),
        warning: (msg, data) => console.warn(`CONSOLE_WARN: ${msg || ''}`, data || ''),
        error: (msg, data) => console.error(`CONSOLE_ERROR: ${msg || ''}`, data || ''),
        debug: (msg, data) => console.log(`CONSOLE_DEBUG: ${msg || ''}`, data || ''),
        exception: (e, msg, data) => console.error(`CONSOLE_EXCEPTION: ${msg || ''}`, e, data || ''),
        child: function(childOpts) {
            const newPrefix = (this.prefix || 'FALLBACK_CHILD') + (childOpts && childOpts.prefix ? childOpts.prefix : '');
            const childConsoleLogger = { prefix: newPrefix };
            for (const key in this) {
                if (typeof this[key] === 'function' && key !== 'child' && key !== 'prefix') {
                    childConsoleLogger[key] = (m, d) => this[key](`${newPrefix}${m}`, d);
                } else if (key !== 'child' && key !== 'prefix') {
                    childConsoleLogger[key] = this[key];
                }
            }
            childConsoleLogger.child = function(opts) { return baseConsoleLogger.child.call(this, opts); };
            return childConsoleLogger;
        }
    };

    if (loggerInstance &&
        typeof loggerInstance.info === 'function' &&
        (typeof loggerInstance.warn === 'function' || typeof loggerInstance.warning === 'function') &&
        typeof loggerInstance.error === 'function' &&
        typeof loggerInstance.debug === 'function' &&
        typeof loggerInstance.child === 'function'
    ) {
        if (typeof loggerInstance.warn !== 'function' && typeof loggerInstance.warning === 'function') {
            loggerInstance.warn = loggerInstance.warning;
        }
        return loggerInstance;
    }

    if (!getSafeLogger.hasWarnedOnceGetSafeLogger) {
        console.error("GET_SAFE_LOGGER: Provided loggerInstance was invalid or incomplete. Falling back to basic console logger WITH dummy child support.");
        getSafeLogger.hasWarnedOnceGetSafeLogger = true;
    }
    return { ...baseConsoleLogger };
}
getSafeLogger.hasWarnedOnceGetSafeLogger = false;

function extractVideoIdFromUrl(url, logger) { /* ... (unchanged) ... */
    const safeLogger = getSafeLogger(logger);
    try {
        const urlObj = new URL(url);
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const vParam = urlObj.searchParams.get('v');
            if (vParam && vParam.length === 11) return vParam;
            const pathParts = urlObj.pathname.split('/');
            if (urlObj.hostname === 'youtu.be' && pathParts.length > 1 && pathParts[1].length === 11) return pathParts[1];
            if (pathParts.length > 2 && (pathParts[1] === 'shorts' || pathParts[1] === 'embed') && pathParts[2].length === 11) return pathParts[2];
            if (pathParts.length > 1 && pathParts[1].length === 11 && !vParam) return pathParts[1];
        }
    } catch (error) {
        safeLogger.error(`Error extracting video ID from URL ${url}: ${error.message}`);
    }
    (safeLogger.warn || safeLogger.warning).call(safeLogger, `Could not extract valid YouTube video ID from: ${url}`);
    return null;
}
async function handleYouTubeConsent(page, logger) { /* ... (unchanged) ... */
    const safeLogger = getSafeLogger(logger);
    safeLogger.info('Checking for YouTube consent dialog...');
    const consentButtonSelectors = [
        'button[aria-label*="Accept all"]', 'button[aria-label*="Accept the use of cookies"]',
        'button[aria-label*="Agree to all"]', 'button[aria-label*="Agree"]',
        'div[role="dialog"] button:has-text("Accept all")', 'div[role="dialog"] button:has-text("Agree")',
        'ytd-button-renderer:has-text("Accept all")', 'tp-yt-paper-button:has-text("ACCEPT ALL")',
        '#introAgreeButton',
    ];
    const consentVisibilityTimeout = 10000;
    for (const selector of consentButtonSelectors) {
        try {
            const button = page.locator(selector).first();
            if (await button.isVisible({ timeout: consentVisibilityTimeout })) {
                safeLogger.info(`Consent button found: "${selector}". Clicking.`);
                await button.click({ timeout: 5000, force: true });
                await page.waitForTimeout(1500 + nodeJsRandom(500, 1500));
                safeLogger.info('Consent button clicked.');
                const stillVisible = await page.locator('ytd-consent-bump-v2-lightbox, tp-yt-paper-dialog[role="dialog"]').first().isVisible({timeout:1000}).catch(() => false);
                if (!stillVisible) { safeLogger.info('Consent dialog likely dismissed.'); return true; }
                else { (safeLogger.warn || safeLogger.warning).call(safeLogger, 'Clicked consent, but a dialog might still be visible.');}
                return true;
            }
        } catch (e) {
            safeLogger.debug(`Consent selector "${selector}" not actionable/error: ${e.message.split('\n')[0]}`);
        }
    }
    safeLogger.info('No actionable consent dialog found.');
    return false;
}

// Using ABSOLUTE_MINIMAL_ARGS from v1.8.1 successful load state
const ANTI_DETECTION_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--mute-audio',
    '--ignore-certificate-errors',
    // For this specific replication, we are keeping it truly minimal.
    // '--no-first-run',
    // '--no-service-autorun',
    // '--password-store=basic',
    // '--use-mock-keychain',
];

// applyAntiDetectionScripts call will be SKIPPED
async function applyAntiDetectionScripts(pageOrContext, logger, fingerprintProfile) {
    const safeLogger = getSafeLogger(logger);
    safeLogger.info(`Custom anti-detection scripts SKIPPED (v1.9.4 - replicating b0zDz9AEx6U1cx1N2 baseline).`);
}


async function waitForVideoToLoad(page, logger, maxWaitMs = 90000) { /* ... (Unchanged from v1.8.1) ... */
    const safeLogger = getSafeLogger(logger);
    safeLogger.info(`[waitForVideoToLoad] Starting wait for up to ${maxWaitMs / 1000}s.`);
    const startTime = Date.now();
    let lastLoggedRs = -1, lastLoggedNs = -1, lastLoggedDuration = -100, lastLoggedPaused = null;

    while (Date.now() - startTime < maxWaitMs) {
        if (page.isClosed()) {
            safeLogger.warn('[waitForVideoToLoad] Page closed during wait.');
            throw new Error('Page closed while waiting for video load');
        }
        const videoState = await page.evaluate(() => {
            const video = document.querySelector('video.html5-main-video');
            if (!video) return null;
            return {
                readyState: video.readyState, networkState: video.networkState,
                duration: video.duration, error: video.error ? { code: video.error.code, message: video.error.message } : null,
                src: video.currentSrc || video.src, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
                paused: video.paused, currentTime: video.currentTime
            };
        }).catch(e => {
            safeLogger.warn(`[waitForVideoToLoad] Evaluate failed: ${e.message}`);
            return null;
        });

        if (videoState) {
            if (videoState.readyState !== lastLoggedRs || videoState.networkState !== lastLoggedNs ||
                Math.abs((videoState.duration || 0) - (lastLoggedDuration || 0)) > 0.1 ||
                videoState.paused !== lastLoggedPaused) {
                safeLogger.debug(`[waitForVideoToLoad] State: RS=${videoState.readyState}, NS=${videoState.networkState}, Dur=${videoState.duration ? videoState.duration.toFixed(1) : 'N/A'}, CT=${videoState.currentTime?.toFixed(1)}, Paused=${videoState.paused}, Src=${!!videoState.src}, Dim=${videoState.videoWidth}x${videoState.videoHeight}, Err=${videoState.error?.code || 'null'}`);
                lastLoggedRs = videoState.readyState; lastLoggedNs = videoState.networkState;
                lastLoggedDuration = videoState.duration; lastLoggedPaused = videoState.paused;
            }

            if (videoState.error && videoState.error.code) {
                safeLogger.error(`[waitForVideoToLoad] Video player error: Code ${videoState.error.code}, Msg: ${videoState.error.message}`);
                throw new Error(`Video error during load: ${videoState.error.message} (Code: ${videoState.error.code})`);
            }
            if (videoState.readyState >= 3 && videoState.duration > 0 && Number.isFinite(videoState.duration)) {
                safeLogger.info(`[waitForVideoToLoad] Video appears loaded. Duration: ${videoState.duration.toFixed(1)}s, RS: ${videoState.readyState}`);
                if (videoState.paused && videoState.currentTime < 1 && videoState.readyState === 4) {
                     safeLogger.warn("[waitForVideoToLoad] Video has enough data but is paused at start. Will attempt to play it before proceeding.");
                     await page.evaluate(() => document.querySelector('video.html5-main-video')?.play().catch(()=>{})).catch(e => safeLogger.warn(`[waitForVideoToLoad] Error during explicit play attempt: ${e.message}`));
                     await sleep(1000);
                     const newPausedState = await page.evaluate(() => document.querySelector('video.html5-main-video')?.paused).catch(() => true);
                     if (newPausedState === false) {
                         safeLogger.info("[waitForVideoToLoad] Video now playing after explicit play call.");
                         return true;
                     } else {
                         safeLogger.warn("[waitForVideoToLoad] Video still paused after explicit play call during load wait. Proceeding, but playback might need more coaxing.");
                     }
                }
                return true;
            }
        } else {
            safeLogger.warn('[waitForVideoToLoad] Video element not found in evaluate during loop.');
        }
        await sleep(1000);
    }
    safeLogger.error(`[waitForVideoToLoad] Timeout after ${maxWaitMs/1000}s. Last logged: RS=${lastLoggedRs}, NS=${lastLoggedNs}, Dur=${lastLoggedDuration ? lastLoggedDuration.toFixed(1) : 'N/A'}, Paused=${lastLoggedPaused}`);
    throw new Error(`Timeout waiting for video to load after ${maxWaitMs / 1000}s`);
}

async function getVideoDuration(page, logger) { /* ... (unchanged) ... */
    const safeLogger = getSafeLogger(logger);
    safeLogger.info('Confirming video duration...');
    try {
        const duration = await page.evaluate(() => {
            const video = document.querySelector('video.html5-main-video');
            return video ? video.duration : null;
        });
        if (duration && Number.isFinite(duration) && duration > 0) {
            safeLogger.info(`Video duration confirmed: ${duration.toFixed(1)} seconds.`);
            return duration;
        }
        safeLogger.warn(`Could not confirm valid video duration. Found: ${duration}.`);
    } catch (e) {
        safeLogger.error(`Error getting video duration: ${e.message.split('\n')[0]}`);
    }
    return null;
}
async function clickIfExists(page, selector, timeout = 3000, logger) { /* ... (unchanged) ... */
    const safeLogger = getSafeLogger(logger);
    try {
        const element = page.locator(selector).first();
        await element.waitFor({ state: 'visible', timeout });
        await element.click({ timeout: timeout / 2, force: true, noWaitAfter: false });
        safeLogger.info(`Clicked on selector: ${selector}`);
        return true;
    } catch (e) {
        if (page.isClosed()) { (safeLogger.warn || safeLogger.warning).call(safeLogger, `Page closed attempting to click: ${selector} - ${e.message.split('\n')[0]}`); return false;}
        safeLogger.debug(`Selector not found/clickable: ${selector} - Error: ${e.message.split('\n')[0]}`);
        return false;
    }
}

// enableAutoplayWithInteraction function - REMAINS COMMENTED OUT
/*
async function enableAutoplayWithInteraction(page, logger) {
    // ...
}
*/

class YouTubeViewWorker {
    constructor(job, effectiveInput, proxyUrlString, baseLogger) { /* ... (unchanged) ... */
        this.job = job;
        this.effectiveInput = effectiveInput;
        this.proxyUrlString = proxyUrlString;
        this.id = uuidv4();
        const workerPrefix = `WKR-${this.id.substring(0,6)}: `;

        if (baseLogger && typeof baseLogger.child === 'function') {
            this.logger = baseLogger.child({ prefix: workerPrefix });
            if (!(this.logger && typeof this.logger.info === 'function' && (typeof this.logger.warn === 'function' || typeof this.logger.warning === 'function'))) {
                console.error(`WORKER_CONSTRUCTOR_ERROR for ${this.id.substring(0,6)}: baseLogger.child() did NOT return a logger with .info AND .warn/warning. This is unexpected. Falling back to created fallback logger.`);
                this.logger = this.createFallbackLogger(workerPrefix);
            }
        } else {
            console.error(`WORKER_CONSTRUCTOR_ERROR for ${job.id}: baseLogger is invalid or lacked .child(). Using created fallback logger.`);
            this.logger = this.createFallbackLogger(workerPrefix);
        }
        if (this.logger && typeof this.logger.warn !== 'function' && typeof this.logger.warning === 'function') {
            this.logger.warn = this.logger.warning;
        }

        this.fingerprintProfile = getProfileByCountry(effectiveInput.proxyCountry);
        this.logger.info(`Selected Fingerprint Profile: Key Hint=${this.fingerprintProfile.profileKeyName || 'N/A'}, UA=${this.fingerprintProfile.userAgent.substring(0,70)}..., Locale=${this.fingerprintProfile.locale}, TZID=${this.fingerprintProfile.timezoneId}, Vendor=${this.fingerprintProfile.vendor}`);
        
        this.killed = false;
        this.maxTimeReachedThisView = 0;
        this.browser = null; this.context = null; this.page = null;
        this.lastReportedVideoTimeSeconds = 0;
        this.lastLoggedVideoTime = 0;
        
        this.logger.info('Worker instance constructed.');
    }
    createFallbackLogger(prefix) { /* ... (unchanged) ... */
        const self = this;
        return {
            prefix: prefix,
            info: (m, d) => console.log(`INFO ${self.prefix || prefix}${m}`, d || ''),
            warn: (m, d) => console.warn(`WARN ${self.prefix || prefix}${m}`, d || ''),
            warning: (m, d) => console.warn(`WARN ${self.prefix || prefix}${m}`, d || ''),
            error: (m, d) => console.error(`ERROR ${self.prefix || prefix}${m}`, d || ''),
            debug: (m, d) => console.log(`DEBUG ${self.prefix || prefix}${m}`, d || ''),
            child: function(childOpts) {
                const newPrefix = (this.prefix || '') + (childOpts && childOpts.prefix ? childOpts.prefix : '');
                return self.createFallbackLogger(newPrefix);
            }
        };
    }

    async startWorker() {
        this.logger.info(`Launching browser... Proxy: ${this.proxyUrlString ? 'Yes' : 'No'}, Headless: ${this.effectiveInput.headless}`);
        
        const launchOptions = {
            headless: this.effectiveInput.headless,
            args: [
                ...ANTI_DETECTION_ARGS, // Using ABSOLUTE_MINIMAL_ARGS
                `--window-size=${this.fingerprintProfile.screen.width},${this.fingerprintProfile.screen.height}`
            ],
        };
        if (this.proxyUrlString) {
            try {
                const parsedProxy = new URL(this.proxyUrlString);
                launchOptions.proxy = {
                    server: `${parsedProxy.protocol}//${parsedProxy.hostname}:${parsedProxy.port}`,
                    username: parsedProxy.username ? decodeURIComponent(parsedProxy.username) : undefined,
                    password: parsedProxy.password ? decodeURIComponent(parsedProxy.password) : undefined,
                };
                this.logger.info(`Parsed proxy for Playwright: server=${launchOptions.proxy.server}, user=${launchOptions.proxy.username ? 'Present' : 'N/A'}`);
            } catch (e) {
                this.logger.error(`Failed to parse proxy URL: ${this.proxyUrlString}. Error: ${e.message}`);
                throw new Error(`Invalid proxy URL format: ${this.proxyUrlString}`);
            }
        }

        this.browser = await playwright.chromium.launch(launchOptions); // Using plain playwright
        this.logger.info('Browser launched directly with Playwright (StealthPlugin SKIPPED for v1.9.4).');

        this.context = await this.browser.newContext({ // Using SIMPLIFIED context options from v1.8.1 baseline
            userAgent: this.fingerprintProfile.userAgent,
            locale: this.fingerprintProfile.locale,
            timezoneId: this.fingerprintProfile.timezoneId,
            screen: { 
                width: this.fingerprintProfile.screen.width,
                height: this.fingerprintProfile.screen.height
            },
            viewport: {
                width: this.fingerprintProfile.screen.width,
                height: this.fingerprintProfile.screen.height
            },
            ignoreHTTPSErrors: true,
            bypassCSP: true,
            javaScriptEnabled: true,
            permissions: ['geolocation', 'notifications'],
            geolocation: this.effectiveInput.proxyCountry === 'US' ? { latitude: 34.0522, longitude: -118.2437 } :
                         this.effectiveInput.proxyCountry === 'GB' ? { latitude: 51.5074, longitude: 0.1278 } :
                         this.effectiveInput.proxyCountry === 'HU' ? { latitude: 47.4979, longitude: 19.0402 } : undefined,
            deviceScaleFactor: (this.fingerprintProfile.screen.width > 1920 || this.fingerprintProfile.screen.height > 1080) ? 1.5 : 1,
            isMobile: false,
            hasTouch: false,
        });
        this.logger.info(`Browser context created (SIMPLIFIED for v1.9.4). Profile hints: locale=${this.fingerprintProfile.locale}, timezoneId=${this.fingerprintProfile.timezoneId}, UA=${this.fingerprintProfile.userAgent.substring(0,50)}...`);

        // applyAntiDetectionScripts call is SKIPPED
        if (this.effectiveInput.customAntiDetection) {
             await applyAntiDetectionScripts(this.context, this.logger, this.fingerprintProfile); // This function now just logs
        } else {
            this.logger.info('Custom anti-detection scripts SKIPPED as per effectiveInput (v1.9.4).');
        }


        if (this.job.referer) {
            this.logger.info(`Setting referer: ${this.job.referer}`);
            await this.context.setExtraHTTPHeaders({ 'Referer': this.job.referer });
        }
        this.page = await this.context.newPage();
        this.logger.info('New page created.');
        
        this.page.on('console', msg => {
            if (msg.type() === 'error' || msg.type() === 'warn') {
                this.logger.debug(`PAGE_CONSOLE (${msg.type().toUpperCase()}): ${msg.text().substring(0, 250)}`);
            }
        });

        this.logger.info(`Navigating to: ${this.job.videoUrl}`);
        await this.page.goto(this.job.videoUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }); 
        this.logger.info('Navigation (DOM content loaded) complete.');
        
        await handleYouTubeConsent(this.page, this.logger);
        await sleep(nodeJsRandom(2000, 4000));

        this.logger.info('enableAutoplayWithInteraction SKIPPED for stability test (v1.9.4).');


        this.logger.info('Waiting for video to load data (up to 90s)...');
        try {
            await waitForVideoToLoad(this.page, this.logger, 90000);
        } catch (loadError) {
            this.logger.error(`CRITICAL: Video failed to load properly: ${loadError.message}`);
            if (Actor.isAtHome()) {
                try {
                    const failTime = new Date().toISOString().replace(/[:.]/g, '-');
                    const screenshotKey = `LOAD_FAIL_SCREENSHOT_${this.job.videoId}_${this.id.substring(0,8)}_${failTime}`;
                    const screenshotBuffer = await this.page.screenshot({ fullPage: true, timeout: 15000 });
                    await Actor.setValue(screenshotKey, screenshotBuffer, { contentType: 'image/png' });
                    this.logger.info(`Load fail screenshot saved: ${screenshotKey}`);
                } catch (screenshotError) { this.logger.error(`Failed to take load fail screenshot: ${screenshotError.message}`); }
            }
            throw loadError;
        }

        const duration = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.duration || 0);
        if (duration && Number.isFinite(duration) && duration > 0) {
            this.job.video_info.duration = duration;
            this.logger.info(`Video duration confirmed: ${duration.toFixed(1)} seconds.`);
        } else {
            this.logger.error(`CRITICAL: Could not confirm valid video duration after load. Found: ${duration}. Failing.`);
            throw new Error(`Could not confirm valid video duration after load (got ${duration}).`);
        }
        
        this.logger.info('Temporarily SKIPPING video quality setting for stability testing (v1.9.4).');

        const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];
        this.logger.info('Attempting to ensure video is playing after load (quality setting skipped)...');
        // Using Claude's "Ultra Enhanced" v1.6 ensureVideoPlaying, as it was in the successful b0zDz9AEx6U1cx1N2 run
        const initialPlaySuccess = await this.ensureVideoPlaying(playButtonSelectors, 'initial-setup-ultra-enhanced-v1.6-retest'); 
        
        if (!initialPlaySuccess) {
            this.logger.warn('Initial play attempts (Ultra Enhanced ensureVideoPlaying) failed. Attempting playbackRecovery method...');
            const recoverySuccess = await this.attemptPlaybackRecovery();
            if (!recoverySuccess) {
                this.logger.error('All playback attempts failed, including specific recovery. Video may not play.');
                if (Actor.isAtHome()) {
                    try {
                        const failTime = new Date().toISOString().replace(/[:.]/g, '-');
                        const screenshotKey = `PLAY_FAIL_SCREENSHOT_${this.job.videoId}_${this.id.substring(0,8)}_${failTime}`;
                        await Actor.setValue(screenshotKey, await this.page.screenshot({ fullPage: true }), { contentType: 'image/png' });
                        this.logger.info(`Play failure screenshot saved: ${screenshotKey}`);
                    } catch (e) { this.logger.error(`Failed to save play failure screenshot: ${e.message}`); }
                }
                throw new Error('Video playback could not be started after all attempts including specific recovery.');
            }
            this.logger.info('Playback started after specific recovery method.');
        } else {
            this.logger.info('Video confirmed playing after initial setup (Ultra Enhanced ensureVideoPlaying).');
        }

        await sleep(nodeJsRandom(2000, 4500));
        return true;
    }

    async handleAds() { /* ... (unchanged) ... */
        let adWasPlayingThisCheckCycle = false;
        const adPlayingInitially = await this.page.locator('.ytp-ad-player-overlay-instream-info, .video-ads .ad-showing').count() > 0;

        if (!adPlayingInitially) {
            return false;
        }

        this.logger.info('Ad detected! Entering ad handling loop.');
        adWasPlayingThisCheckCycle = true;

        const adSkipCheckInterval = 1500;
        const maxAdWatchDuration = this.effectiveInput.maxSecondsAds * 1000;
        const adLoopStartTime = Date.now();

        while (Date.now() - adLoopStartTime < maxAdWatchDuration) {
            if (this.killed || this.page.isClosed()) break;

            const isAdStillPlaying = await this.page.locator('.ytp-ad-player-overlay-instream-info, .video-ads .ad-showing').count() > 0;
            if (!isAdStillPlaying) {
                this.logger.info('Ad finished or disappeared during handling loop.');
                break;
            }

            const canSkipModern = await this.page.locator('.ytp-ad-skip-button-modern').count() > 0;
            const canSkipLegacy = await this.page.locator('.ytp-ad-skip-button').count() > 0;
            const canSkip = canSkipModern || canSkipLegacy;
            
            const minSkipTimeMs = (this.effectiveInput.skipAdsAfter[0] || 0) * 1000;

            const skipSelector = canSkipModern ? '.ytp-ad-skip-button-modern' : '.ytp-ad-skip-button';

            if (this.effectiveInput.autoSkipAds && canSkip) {
                this.logger.info('AutoSkipAds: Attempting to skip ad.');
                if (await clickIfExists(this.page, skipSelector, 1000, this.logger)) {
                    await sleep(1500 + nodeJsRandom(500));
                    break;
                }
            } else if (canSkip && (Date.now() - adLoopStartTime >= minSkipTimeMs)) {
                this.logger.info(`Ad skippable and min watch time met. Attempting skip.`);
                if (await clickIfExists(this.page, skipSelector, 1000, this.logger)) {
                    await sleep(1500 + nodeJsRandom(500));
                    break;
                }
            }
            await sleep(adSkipCheckInterval);
        }
        if (Date.now() - adLoopStartTime >= maxAdWatchDuration && await this.page.locator('.ytp-ad-player-overlay-instream-info, .video-ads .ad-showing').count() > 0) {
             (this.logger.warn || this.logger.warning).call(this.logger, 'Max ad watch duration reached in ad handling loop, ad might still be playing.');
        }
        this.logger.info('Exiting ad handling loop.');
        return adWasPlayingThisCheckCycle;
    }
    
    // Using Claude's "Ultra Enhanced" ensureVideoPlaying (from v1.7 code / Claude's latest suggestion)
    async ensureVideoPlaying(playButtonSelectors, attemptType = 'general') {
        const logFn = (msg, level = 'info') => {
            const loggerMethod = this.logger[level] || (level === 'warn' && (this.logger.warning || this.logger.warn)) || this.logger.info;
            loggerMethod.call(this.logger, `[ensureVideoPlaying-${attemptType}] ${msg}`);
        };
        logFn(`Ensuring video is playing (v1.6 - Ultra Enhanced)...`);

        try {
            await this.page.bringToFront();
            await this.page.evaluate(() => window.focus());
            logFn('Brought page to front and focused window');
        } catch (e) {
            logFn(`Failed to focus page: ${e.message}`, 'debug');
        }

        for (let attempt = 0; attempt < 3; attempt++) {
            if (this.killed || this.page.isClosed()) return false;

            let isVideoElementPresent = await this.page.locator('video.html5-main-video').count() > 0;
            if (!isVideoElementPresent) {
                logFn('Video element not present on page.', 'warn');
                return false;
            }

            let videoState = await this.page.evaluate(() => {
                const v = document.querySelector('video.html5-main-video');
                if (!v) return { p: true, rs: 0, err: { code: null, message: "No video element found in DOM" }, ended: true, networkState: 3, src: null, videoWidth: 0, videoHeight: 0, muted: true, volume: 0, currentTime: 0 };
                return {
                    p: v.paused, rs: v.readyState,
                    err: v.error ? { code: v.error.code, message: v.error.message } : null,
                    ended: v.ended, networkState: v.networkState,
                    src: v.currentSrc || v.src, videoWidth: v.videoWidth, videoHeight: v.videoHeight,
                    muted: v.muted, volume: v.volume, currentTime: v.currentTime
                };
            }).catch((e) => {
                logFn(`Eval to get video state failed: ${e.message}`, 'warn');
                return { p: true, rs: 0, err: {message: "Eval failed to get video state"}, ended: true, networkState: 3, src: null, videoWidth: 0, videoHeight: 0, muted: true, volume: 0, currentTime: 0 };
            });
            
            if (videoState.err && videoState.err.code) { logFn(`Video element error: Code ${videoState.err.code}, Msg: ${videoState.err.message || 'N/A'}`, 'warn'); }
            if (!videoState.p && videoState.rs >= 3 && !videoState.ended) {
                logFn(`Video is already playing (attempt ${attempt + 1}). RS:${videoState.rs}, NS:${videoState.networkState}, Time:${videoState.currentTime?.toFixed(1)}`);
                return true;
            }

            logFn(`Video state (attempt ${attempt + 1}): Paused=${videoState.p}, Ended=${videoState.ended}, RS=${videoState.rs}, NS=${videoState.networkState}, Muted=${videoState.muted}, Volume=${videoState.volume?.toFixed(2)}, Time=${videoState.currentTime?.toFixed(1)}, Dim=${videoState.videoWidth}x${videoState.videoHeight}. Trying strategies...`);

            if (videoState.muted) {
                try {
                    await this.page.evaluate(() => {
                        const video = document.querySelector('video.html5-main-video');
                        if (video) { video.muted = false; video.volume = 0.5; }
                    });
                    logFn('Attempted to unmute video and set volume to 50%');
                    await sleep(500);
                    const unmutedState = await this.page.evaluate(() => {const v=document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended, m:v.muted} : {p:true,rs:0,e:true,m:true};}).catch(()=>({p:true,rs:0,e:true,m:true}));
                    if (!unmutedState.p && unmutedState.rs >=3 && !unmutedState.e) {
                        logFn('Video started playing after unmute.'); return true;
                    }
                    if (!unmutedState.m) logFn('Video successfully unmuted.'); else logFn('Video still muted after attempt.', 'warn');
                } catch (e) { logFn(`Failed to unmute video: ${e.message}`, 'debug'); }
            }

            const bigPlayButtonSelectors = [ '.ytp-large-play-button', '.ytp-play-button[aria-label="Play"]', '.ytp-cued-thumbnail-overlay', '.ytp-cued-thumbnail-overlay-image', 'button[aria-label="Play"]', '.ytp-large-play-button-bg'];
            for (const selector of bigPlayButtonSelectors) {
                try {
                    const playBtn = this.page.locator(selector).first();
                    if (await playBtn.isVisible({timeout: 500 + (attempt * 100)})) {
                        await playBtn.click({timeout: 2000, force: false, delay: nodeJsRandom(50, 100)});
                        logFn(`Clicked play button: ${selector}`);
                        await sleep(1500 + nodeJsRandom(500));
                        const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                        if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after clicking ${selector}. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                    }
                } catch (e) { logFn(`Failed to click ${selector}: ${e.message.split('\n')[0]}`, 'debug'); }
            }

            try {
                const playerElement = this.page.locator('#movie_player, .html5-video-player, body').first();
                if (await playerElement.isVisible({timeout: 500})) {
                    await playerElement.focus().catch(e => logFn(`Focus failed for playerElement: ${e.message}`, 'debug'));
                    await this.page.keyboard.press('Space');
                    logFn('Focused player/body and pressed Space key');
                    await sleep(1000 + nodeJsRandom(300));
                    const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                    if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after Space key. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                }
            } catch (e) { logFn(`Failed to focus player and press Space: ${e.message.split('\n')[0]}`, 'debug'); }

            try {
                const videoElement = this.page.locator('video.html5-main-video').first();
                if (await videoElement.isVisible({timeout: 500})) {
                    const box = await videoElement.boundingBox();
                    if (box && box.width > 0 && box.height > 0) {
                        await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {delay: nodeJsRandom(50,100)});
                        logFn('Clicked center of video element');
                        await sleep(1200 + nodeJsRandom(300));
                        const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                        if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after center click. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                    } else { logFn('Video element bounding box not valid for click.', 'debug'); }
                }
            } catch (e) { logFn(`Failed to click video center: ${e.message.split('\n')[0]}`, 'debug'); }

            if (videoState.p && !videoState.ended) {
                try {
                    await this.page.evaluate(() => {
                        const video = document.querySelector('video.html5-main-video');
                        if (video) {
                            if (video.muted) { video.muted = false; video.volume = 0.5; }
                            const playPromise = video.play();
                            if (playPromise !== undefined) {
                                playPromise.then(() => { console.log('[In-Page] Video play() initiated via JS'); }).catch(error => { console.warn('[In-Page] Video play() via JS failed:', error.message,'. Trying to click video.'); video.click(); });
                            } else { console.warn('[In-Page] video.play() did not return a promise. Clicking.'); video.click(); }
                        }
                    });
                    await sleep(1500 + nodeJsRandom(300));
                    const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                    if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after JS play()/click combination. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                } catch (e) { logFn(`JS play()/click eval error: ${e.message.split('\n')[0]}`, 'debug'); }
            }

            try { 
                await this.page.locator('body').press('k');
                logFn('Pressed "k" key again to toggle play/pause');
                await sleep(1000 + nodeJsRandom(300));
                const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after second "k" key. Time: ${tempState.ct?.toFixed(1)}`); return true;}
            } catch (e) { logFn(`Failed to press "k" key (second time): ${e.message.split('\n')[0]}`, 'debug'); }

            if (attempt === 2 && videoState.p) {
                logFn('Final attempt in ensureVideoPlaying - trying aggressive overlay removal and dblclick', 'warn');
                await this.page.evaluate(() => {
                    const overlays = document.querySelectorAll('.ytp-gradient-top, .ytp-gradient-bottom, .ytp-chrome-top, .ytp-chrome-bottom, .ytp-impression-link, .ytp-popup');
                    overlays.forEach(el => { el.style.display = 'none'; el.style.pointerEvents = 'none';});
                }).catch((e) => { logFn(`Failed to hide overlays: ${e.message}`, 'debug')});

                try {
                    const videoElement = this.page.locator('video.html5-main-video').first();
                    if (await videoElement.isVisible({timeout: 500})) {
                        await videoElement.dblclick({timeout: 2000, delay: nodeJsRandom(50, 100)});
                        logFn('Double-clicked video element');
                        await sleep(1500);
                         const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                        if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after double click. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                    }
                } catch (e) { logFn(`Double-click failed: ${e.message.split('\n')[0]}`, 'debug'); }
            }

            if (attempt < 2) await sleep(2000 + attempt * 1000);
        }
        
        logFn('Failed to ensure video is playing after multiple attempts.', 'warn');
        return false;
    }

    async attemptPlaybackRecovery() { /* ... (Unchanged from v1.9.1) ... */
        this.logger.warn('Attempting playback recovery by reloading with autoplay parameter...');
        let success = false;
        try {
            const currentUrl = this.page.url();
            const urlObj = new URL(currentUrl);
            urlObj.searchParams.set('autoplay', '1');
            
            this.logger.info(`Navigating to recovery URL: ${urlObj.toString()}`);
            await this.page.goto(urlObj.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(2000 + nodeJsRandom(500));
            
            await handleYouTubeConsent(this.page, this.logger.child({prefix: 'RecoveryConsent: '}));
            await waitForVideoToLoad(this.page, this.logger.child({prefix: 'RecoveryLoad: '}), 45000);

            const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];
            success = await this.ensureVideoPlaying(playButtonSelectors, 'recovery-reload-autoplay'); // Will use Claude's "Ultra Enhanced"
            
            if (success) {
                this.logger.info('Playback recovery successful!');
            }
        } catch (e) {
            this.logger.error(`Playback recovery method itself failed: ${e.message}`);
        }
        
        if(!success) this.logger.warn('Playback recovery method (autoplay reload) did not succeed.');
        return success;
    }

    async watchVideo() { // Using Gemini's refined stall/recovery from v1.9.1, with loopNumber fix
        if (!this.page || this.page.isClosed()) throw new Error('Page not initialized/closed for watching.');

        const videoDurationSeconds = this.job.video_info.duration;
        const targetWatchPercentage = this.effectiveInput.watchTimePercentage;
        const targetVideoPlayTimeSeconds = Math.max(10, (targetWatchPercentage / 100) * videoDurationSeconds);
        const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];

        this.logger.info(`Watch target: ${targetWatchPercentage}% of ${videoDurationSeconds.toFixed(0)}s = ${targetVideoPlayTimeSeconds.toFixed(0)}s. URL: ${this.job.videoUrl}`);

        const overallWatchStartTime = Date.now();
        const maxOverallWatchDurationMs = this.effectiveInput.timeout * 1000 * 0.90;
        const checkIntervalMs = 1000; 

        let consecutiveStallChecks = 0;
        const MAX_STALL_CHECKS_BEFORE_RECOVERY = 2; 
        let recoveryAttemptsThisJob = 0;
        const MAX_RECOVERY_ATTEMPTS_PER_JOB = 2; 

        let lastProgressTimestamp = Date.now();
        let lastKnownGoodVideoTime = 0;
        this.maxTimeReachedThisView = 0;
        let currentActualVideoTime = 0;
        this.lastLoggedVideoTime = -1;

        let adCheckCooldownMs = 0;
        const AD_CHECK_INTERVAL_WHEN_NO_AD = 5000;
        const AD_CHECK_INTERVAL_DURING_AD = 1500;


        while (!this.killed) {
            const loopIterationStartTime = Date.now();
            const loopNumber = Math.floor((Date.now() - overallWatchStartTime) / checkIntervalMs);  // RE-ENABLED loopNumber


            if (this.page.isClosed()) { (this.logger.warn || this.logger.warning).call(this.logger, 'Page closed during watch loop.'); break; }
            if (Date.now() - overallWatchStartTime > maxOverallWatchDurationMs) {
                (this.logger.warn || this.logger.warning).call(this.logger, 'Max watch duration for this video exceeded. Ending.'); break;
            }

            if (Date.now() >= adCheckCooldownMs) {
                this.logger.debug('Checking for ads...');
                const adPlayed = await this.handleAds();
                if (adPlayed) {
                    adCheckCooldownMs = Date.now() + AD_CHECK_INTERVAL_DURING_AD;
                    lastProgressTimestamp = Date.now();
                    lastKnownGoodVideoTime = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime || 0).catch(() => lastKnownGoodVideoTime);
                    consecutiveStallChecks = 0;
                    this.logger.info('Ad cycle handled, resetting stall detection and allowing video to buffer/resume.');
                    await sleep(1000 + nodeJsRandom(500)); 
                } else {
                    adCheckCooldownMs = Date.now() + AD_CHECK_INTERVAL_WHEN_NO_AD;
                }
            }
            
            let videoState = null;
            let isStalledThisCheck = false;

            try {
                videoState = await this.page.evaluate(() => { 
                    const v = document.querySelector('video.html5-main-video');
                    if (!v) return { currentTime: 0, paused: true, ended: true, readyState: 0, networkState: 3, error: null, src: null, videoWidth:0, videoHeight:0 };
                    return {
                        ct: v.currentTime, p: v.paused, e: v.ended,
                        rs: v.readyState, ns: v.networkState,
                        error: v.error ? { code: v.error.code, message: v.error.message } : null,
                        src: v.currentSrc || v.src, videoWidth: v.videoWidth, videoHeight: v.videoHeight
                    };
                });
                if (!videoState) {
                    (this.logger.warn || this.logger.warning).call(this.logger, 'Video element not found in evaluate. Trying to recover or will stall.');
                    await sleep(2000);
                    if (!(await this.page.locator('video.html5-main-video').count() > 0)) {
                        throw new Error('Video element disappeared definitively.');
                    }
                    isStalledThisCheck = true;
                 } else {
                    currentActualVideoTime = videoState.ct || 0;
                    if (currentActualVideoTime > this.maxTimeReachedThisView) {
                        this.maxTimeReachedThisView = currentActualVideoTime;
                    }
                    
                    const videoPlaying = !videoState.p && videoState.rs >= 3 && !videoState.e;
                    if (videoPlaying) {
                        if (currentActualVideoTime > this.lastLoggedVideoTime + 4.5 || this.lastLoggedVideoTime < 0) { 
                            this.logger.info(`Video playing at ${currentActualVideoTime.toFixed(1)}s (max: ${this.maxTimeReachedThisView.toFixed(1)}s) RS:${videoState.rs} NS:${videoState.ns} Dim:${videoState.videoWidth}x${videoState.videoHeight}`);
                            this.lastLoggedVideoTime = currentActualVideoTime;
                        } else {
                            this.logger.debug(`Video playing at ${currentActualVideoTime.toFixed(1)}s`);
                        }
                    } else if (videoState.p && !videoState.e) {
                        this.logger.info(`Video PAUSED at ${currentActualVideoTime.toFixed(1)}s. RS:${videoState.rs} NS:${videoState.ns}. Will attempt to resume.`);
                        this.lastLoggedVideoTime = -1;
                    } else {
                         this.logger.debug(`VidState: time=${currentActualVideoTime.toFixed(1)}, maxReached=${this.maxTimeReachedThisView.toFixed(1)}, p=${videoState.p}, e=${videoState.e}, rs=${videoState.rs}, ns=${videoState.ns}, err=${videoState.error?.code}, src=${!!videoState.src}`);
                    }

                    if (videoState.error && videoState.error.code) {
                        this.logger.error(`Player Error Detected in watch loop: Code ${videoState.error.code}, Msg: ${videoState.error.message}. Triggering recovery.`);
                        isStalledThisCheck = true;
                        if (videoState.error.code === 2 && recoveryAttemptsThisJob < MAX_RECOVERY_ATTEMPTS_PER_JOB) {
                            this.logger.warn("Network error (code 2) in player, will attempt recovery via stall logic.");
                        } else if (videoState.error.code === 3 || videoState.error.code === 4) {
                            this.logger.error(`Fatal player error (Decode/Src). Code: ${videoState.error.code}`);
                            throw new Error(`Fatal Video Player Error Code ${videoState.error.code}: ${videoState.error.message}`);
                        } else { 
                            this.logger.error(`Unhandled or non-recoverable player error. Code: ${videoState.error.code}`);
                            if (recoveryAttemptsThisJob >= MAX_RECOVERY_ATTEMPTS_PER_JOB -1) { 
                                 throw new Error(`Unhandled Video Player Error Code ${videoState.error.code}: ${videoState.error.message} (recovery exhausted)`);
                            }
                        }
                    }
                    
                    if (videoState.rs === 0 && (Date.now() - overallWatchStartTime > 15000)) {
                        if (currentActualVideoTime < 1 && (Date.now() - lastProgressTimestamp) > 5000) {
                             this.logger.warn(`CRITICAL STALL DETECTED: ReadyState 0. CT: ${currentActualVideoTime.toFixed(1)}. Forcing recovery check.`);
                             isStalledThisCheck = true;
                             consecutiveStallChecks = MAX_STALL_CHECKS_BEFORE_RECOVERY;
                        }
                    }

                    if (!isStalledThisCheck) {
                        if (!videoState.p && videoState.rs >= 2 && !videoState.e) { 
                            if (Math.abs(currentActualVideoTime - lastKnownGoodVideoTime) < 0.8 && (Date.now() - lastProgressTimestamp) > 10000) {
                                this.logger.warn(`Normal stall: No progress. CT: ${currentActualVideoTime.toFixed(1)}, LastGood: ${lastKnownGoodVideoTime.toFixed(1)}.`);
                                isStalledThisCheck = true;
                            } else if (currentActualVideoTime > lastKnownGoodVideoTime + 0.2) { 
                                lastKnownGoodVideoTime = currentActualVideoTime;
                                lastProgressTimestamp = Date.now();
                                consecutiveStallChecks = 0; 
                            }
                        } else if (videoState.p && !videoState.e) { 
                            lastProgressTimestamp = Date.now();
                        }
                    }
                 }

                if (videoState && videoState.p && !videoState.e && this.maxTimeReachedThisView < targetVideoPlayTimeSeconds && !isStalledThisCheck) {
                    const playAttemptSuccess = await this.ensureVideoPlaying(playButtonSelectors, 'paused-resume'); // Using Claude's "Ultra Enhanced"
                    if (!playAttemptSuccess) {
                        this.logger.warn(`ensureVideoPlaying failed to resume playback from paused state. RS: ${videoState.rs}, CT: ${currentActualVideoTime.toFixed(1)}s.`);
                        if (videoState.rs === 0 || videoState.networkState === 3) {
                            this.logger.warn(`Critical stall (RS:0 or NS:3) detected by ensureVideoPlaying failure from paused state. Forcing recovery check.`);
                            isStalledThisCheck = true; 
                            consecutiveStallChecks = MAX_STALL_CHECKS_BEFORE_RECOVERY; 
                        } else {
                            isStalledThisCheck = true; 
                        }
                    } else { 
                        isStalledThisCheck = false; 
                        consecutiveStallChecks = 0;
                        lastProgressTimestamp = Date.now();
                        this.lastLoggedVideoTime = -1; 
                    }
                }


                if (isStalledThisCheck) {
                    consecutiveStallChecks++; 
                    (this.logger.warn || this.logger.warning).call(this.logger, `Playback stall detected OR ensureVideoPlaying failed. Stalls checks: ${consecutiveStallChecks}. RS: ${videoState?.rs}, NS: ${videoState?.ns}, CT: ${currentActualVideoTime.toFixed(1)}`);
                    
                    if (Actor.isAtHome()) { // Claude: Simplified screenshot check
                        try {
                            const stallTime = new Date().toISOString().replace(/[:.]/g, '-'); // Claude: Simplified replacement
                            const screenshotKey = `STALL_SCREENSHOT_${this.job.videoId}_${this.id.substring(0,8)}_${stallTime}`;
                            this.logger.info(`Taking screenshot due to stall: ${screenshotKey}`);
                            const screenshotBuffer = await this.page.screenshot({ fullPage: true, timeout: 15000 });
                            await Actor.setValue(screenshotKey, screenshotBuffer, { contentType: 'image/png' });
                            this.logger.info(`Screenshot saved: ${screenshotKey}`);
                        } catch (screenshotError) { 
                            this.logger.error(`Failed to take or save stall screenshot: ${screenshotError.message}`); 
                        }
                    }
                    
                    const ytErrorLocator = this.page.locator('.ytp-error-content, text=/Something went wrong/i, text=/An error occurred/i, div.ytp-error').first();
                    if (await ytErrorLocator.isVisible({timeout: 1000}).catch(()=>false)) {
                        this.logger.warn('YouTube specific error message detected on player. Prioritizing recovery.');
                    }

                    if (consecutiveStallChecks >= MAX_STALL_CHECKS_BEFORE_RECOVERY) {
                        recoveryAttemptsThisJob++;
                        this.logger.warn(`Max stall checks reached (${consecutiveStallChecks}). Attempting recovery ${recoveryAttemptsThisJob}/${MAX_RECOVERY_ATTEMPTS_PER_JOB}...`);
                        consecutiveStallChecks = 0; 

                        let recoveryActionSuccess = false;

                        if (recoveryAttemptsThisJob === 1) {
                            this.logger.info('Recovery 1: Attempting specific playback recovery (reload with autoplay).');
                            recoveryActionSuccess = await this.attemptPlaybackRecovery();
                        } else if (recoveryAttemptsThisJob === 2) {
                            this.logger.info('Recovery 2: Attempting navigate to youtube.com homepage and back.');
                            const currentUrlForRecovery = this.job.videoUrl;
                            const intermediateUrl = 'https://www.youtube.com/';
                            try {
                                await this.page.goto(intermediateUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                                await sleep(nodeJsRandom(2500, 5000));
                                await handleYouTubeConsent(this.page, this.logger.child({prefix: 'RecoveryConsentHomePage:'}));
                                await this.page.goto(currentUrlForRecovery, { waitUntil: 'load', timeout: this.effectiveInput.timeout * 1000 * 0.7 });
                                recoveryActionSuccess = true;
                            } catch (navError) {
                                this.logger.error(`Error during navigate-away recovery: ${navError.message}`);
                                recoveryActionSuccess = false;
                            }
                        }

                        if (!recoveryActionSuccess && recoveryAttemptsThisJob >= MAX_RECOVERY_ATTEMPTS_PER_JOB) {
                             this.logger.error('Video stalled and all recovery attempts exhausted/failed. Failing job.');
                             throw new Error('Video stalled/player error, all recovery attempts exhausted or failed.');
                        }
                        
                        if (recoveryActionSuccess) {
                            this.logger.info(`Recovery attempt ${recoveryAttemptsThisJob} action completed. Re-validating playback...`);
                            await handleYouTubeConsent(this.page, this.logger.child({prefix: 'PostRecoveryConsent:'}));
                            await waitForVideoToLoad(this.page, this.logger.child({prefix: 'PostRecoveryLoad:'}), 60000).catch(e => {
                                this.logger.warn(`Video failed to load properly after recovery action ${recoveryAttemptsThisJob}: ${e.message}`);
                                if (recoveryAttemptsThisJob >= MAX_RECOVERY_ATTEMPTS_PER_JOB) throw new Error(`Video load failed after final recovery attempt ${recoveryAttemptsThisJob}.`);
                                recoveryActionSuccess = false;
                            });
                            
                            if (recoveryActionSuccess) {
                                await sleep(nodeJsRandom(1500, 3000));
                                const playSuccess = await this.ensureVideoPlaying(playButtonSelectors, `post-recovery-${recoveryAttemptsThisJob}`);
                                if (!playSuccess) {
                                    this.logger.error(`Recovery attempt ${recoveryAttemptsThisJob} failed to restart playback definitively after action.`);
                                    if (recoveryAttemptsThisJob >= MAX_RECOVERY_ATTEMPTS_PER_JOB) throw new Error(`Recovery attempt ${recoveryAttemptsThisJob} failed to restart playback.`);
                                } else {
                                    lastKnownGoodVideoTime = 0; this.maxTimeReachedThisView = 0;
                                    currentActualVideoTime = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime || 0).catch(()=>0);
                                    lastKnownGoodVideoTime = currentActualVideoTime; this.maxTimeReachedThisView = currentActualVideoTime;
                                    lastProgressTimestamp = Date.now(); this.lastLoggedVideoTime = -1;
                                    consecutiveStallChecks = 0; 
                                    this.logger.info(`Playback seems to have resumed after recovery ${recoveryAttemptsThisJob}. State: CT: ${currentActualVideoTime.toFixed(1)}s`);
                                    continue; 
                                }
                            }
                        } else if (recoveryAttemptsThisJob < MAX_RECOVERY_ATTEMPTS_PER_JOB) {
                            this.logger.warn(`Recovery action for attempt ${recoveryAttemptsThisJob} did not result in success or failed to execute, will try next recovery method if available.`);
                        } else { 
                             this.logger.error('All recovery actions attempted but failed to restore playback. Failing job.');
                             throw new Error('Video stalled/player error, all recovery actions failed.');
                        }
                    }
                } else { 
                    consecutiveStallChecks = 0;
                }
            } catch (e) {
                if (e.message.includes('Target closed') || e.message.includes('Protocol error')) {
                    (this.logger.warn || this.logger.warning).call(this.logger, `Watch loop error (Target closed/Protocol): ${e.message}`); throw e;
                }
                 (this.logger.warn || this.logger.warning).call(this.logger, `Video state eval/check error: ${e.message.split('\n')[0]}`);
                 if (e.message.includes('all recovery attempts exhausted') || e.message.includes('Recovery by navigation failed definitively') || e.message.includes('failed to restart playback') || e.message.includes('Video Player Error Code') || e.message.includes('Fatal Video Player Error Code')) throw e;
                 await sleep(checkIntervalMs); continue;
            }
            
            if (videoState && videoState.e) { this.logger.info('Video playback naturally ended.'); break; }
            if (this.maxTimeReachedThisView >= targetVideoPlayTimeSeconds) {
                this.logger.info(`Target watch time reached. Max Reached: ${this.maxTimeReachedThisView.toFixed(1)}s`); break;
            }
            
            const interactionRandom = Math.random();
            if (loopNumber > 2 && loopNumber % nodeJsRandom(3,5) === 0 && interactionRandom < 0.6) { /* ... (interaction logic) ... */ }
            if (loopNumber > 5 && loopNumber % nodeJsRandom(6,8) === 0 && interactionRandom < 0.4) { /* ... (interaction logic) ... */ }
            if (loopNumber > 8 && loopNumber % nodeJsRandom(10,12) === 0 && interactionRandom < 0.25) { /* ... (interaction logic) ... */ }
            if (loopNumber > 10 && loopNumber % nodeJsRandom(12,15) === 0 && videoState && !videoState.p && videoState.rs >=3 && !videoState.e && interactionRandom < 0.15) { /* ... (interaction logic) ... */ }

            await sleep(Math.max(0, checkIntervalMs - (Date.now() - loopIterationStartTime)));
        }
        const actualOverallWatchDurationMs = Date.now() - overallWatchStartTime;
        this.logger.info(`Finished watch. Total loop: ${(actualOverallWatchDurationMs / 1000).toFixed(1)}s. Max video time reached: ${this.maxTimeReachedThisView.toFixed(1)}s.`);
        return {
            actualOverallWatchDurationMs,
            lastReportedVideoTimeSeconds: this.maxTimeReachedThisView,
            targetVideoPlayTimeSeconds
        };
    }

    async kill() { /* ... (unchanged) ... */
        this.killed = true;
        this.logger.info('Kill signal. Closing resources.');
        if (this.page && !this.page.isClosed()) { await this.page.close().catch(e => (this.logger.warn || this.logger.warning).call(this.logger, `Page close error: ${e.message}`)); }
        this.page = null;
        if (this.context) { await this.context.close().catch(e => (this.logger.warn || this.logger.warning).call(this.logger, `Context close error: ${e.message}`)); }
        this.context = null;
        if (this.browser) { await this.browser.close().catch(e => (this.logger.warn || this.logger.warning).call(this.logger, `Browser close error: ${e.message}`)); }
        this.browser = null;
        this.logger.info('Resources closed.');
    }
}

// --- Main Actor Logic ---
async function actorMainLogic() { /* ... (unchanged) ... */
    console.log('DEBUG: actorMainLogic started.');
    let actorLog;

    try {
        await Actor.init();
        console.log('DEBUG: Actor.init() completed successfully.');

        if (Actor.log && typeof Actor.log.info === 'function') {
            actorLog = Actor.log;
            console.log('INFO: Logger obtained successfully via standard Actor.log. Testing it...');
            actorLog.info('DEBUG: Standard Actor.log test successful.');
        } else {
            console.warn('DEBUG: Standard Actor.log was undefined or invalid. Attempting fallback via _instance...');
            if (Actor._instance && Actor._instance.apifyClient && Actor._instance.apifyClient.logger && typeof Actor._instance.apifyClient.logger.info === 'function') {
                actorLog = Actor._instance.apifyClient.logger;
                console.log('INFO: Successfully obtained logger from Actor._instance.apifyClient.logger. Testing it...');
                actorLog.info('DEBUG: Logger obtained via Actor._instance.apifyClient.logger and tested.');
            } else {
                console.error('CRITICAL DEBUG: Could not obtain logger from Actor.log OR Actor._instance.apifyClient.logger. Dumping Actor object:');
                console.dir(Actor, { depth: 3 });
                throw new Error("All attempts to obtain a valid Apify logger failed.");
            }
        }
    } catch (initError) {
        console.error('CRITICAL DEBUG: Actor.init() FAILED or subsequent logger acquisition failed:', initError);
        if (Actor && Actor.isAtHome && typeof Actor.isAtHome === 'function' && Actor.fail && typeof Actor.fail === 'function') {
            try { await Actor.fail(`Actor.init() or logger acquisition failed: ${initError.message}`); }
            catch (failError) { console.error('CRITICAL DEBUG: Actor.fail() also failed:', failError); }
        }
        process.exit(1);
    }

    if (!actorLog || typeof actorLog.info !== 'function' || !(typeof actorLog.warn === 'function' || typeof actorLog.warning === 'function')) {
        console.error('CRITICAL DEBUG: actorLog is STILL UNDEFINED or not a valid logger after all attempts!');
        const fallbackLogger = getSafeLogger(undefined);
        fallbackLogger.error("actorMainLogic: Using fallback logger because all attempts to get Apify logger failed (final check).");
        if (typeof Actor.fail === 'function') { await Actor.fail("Apify logger could not be initialized (final check)."); }
        else { console.error("CRITICAL: Actor.fail is not available. Exiting."); process.exit(1); }
        return;
    }
    if (typeof actorLog.warn !== 'function' && typeof actorLog.warning === 'function') {
        actorLog.warn = actorLog.warning;
    }

    actorLog.info('ACTOR_MAIN_LOGIC: Starting YouTube View Bot (v1.9.4 - Replicating b0zDz9AEx6U1cx1N2 + Claude Fixes).');
    const input = await Actor.getInput();
    if (!input) {
        actorLog.error('ACTOR_MAIN_LOGIC: No input provided.');
        await Actor.fail('No input provided.');
        return;
    }
    actorLog.info('ACTOR_MAIN_LOGIC: Actor input received.');

    const defaultInputFromSchema = {
        videoUrls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
        watchTypes: ['direct'], refererUrls: [''], searchKeywordsForEachVideo: ['funny cat videos, cute kittens'],
        watchTimePercentage: 80, useProxies: true, proxyUrls: [], proxyCountry: 'US', proxyGroups: ['RESIDENTIAL'],
        headless: Actor.isAtHome() ? false : true,
        concurrency: 1, concurrencyInterval: 5, timeout: 180,
        maxSecondsAds: 20,
        skipAdsAfter: ["5", "10"],
        autoSkipAds: true, stopSpawningOnOverload: true,
        customAntiDetection: true, 
    };
    const effectiveInput = { ...defaultInputFromSchema, ...input };
    effectiveInput.headless = !!effectiveInput.headless;


    let tempSkipAds = effectiveInput.skipAdsAfter;
    if (Array.isArray(tempSkipAds) && tempSkipAds.length > 0 && tempSkipAds.every(s => typeof s === 'string' || typeof s === 'number')) {
        const parsedSkipAds = tempSkipAds.map(s => parseInt(String(s), 10)).filter(n => !isNaN(n) && n >= 0);
        if (parsedSkipAds.length === 1) effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[0] + 5];
        else if (parsedSkipAds.length >= 2) effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[1]];
        else effectiveInput.skipAdsAfter = [5, 12];
    } else {
        effectiveInput.skipAdsAfter = [5, 12];
    }
    if (typeof input.skipAdsAfterMinSeconds === 'number' && typeof input.skipAdsAfterMaxSeconds === 'number' &&
        !isNaN(input.skipAdsAfterMinSeconds) && !isNaN(input.skipAdsAfterMaxSeconds) &&
        input.skipAdsAfterMinSeconds >= 0 && input.skipAdsAfterMaxSeconds >=0) {
        effectiveInput.skipAdsAfter = [
            input.skipAdsAfterMinSeconds,
            Math.max(input.skipAdsAfterMinSeconds, input.skipAdsAfterMaxSeconds)
        ];
    }
    if (effectiveInput.skipAdsAfter[0] > effectiveInput.skipAdsAfter[1]) {
        effectiveInput.skipAdsAfter[1] = effectiveInput.skipAdsAfter[0] + 5;
    }
    effectiveInput.maxSecondsAds = Number(effectiveInput.maxSecondsAds);
    if(isNaN(effectiveInput.maxSecondsAds) || effectiveInput.maxSecondsAds < 0) {
        effectiveInput.maxSecondsAds = 20;
    }

    actorLog.info('ACTOR_MAIN_LOGIC: Effective input (summary):', { videos: effectiveInput.videoUrls.length, proxy: effectiveInput.proxyCountry, headless: effectiveInput.headless, watchPercent: effectiveInput.watchTimePercentage, customAntiDetect: effectiveInput.customAntiDetection, skipAdsAfter: effectiveInput.skipAdsAfter, maxSecondsAds: effectiveInput.maxSecondsAds, timeout: effectiveInput.timeout });

    if (!effectiveInput.videoUrls || effectiveInput.videoUrls.length === 0) {
        actorLog.error('No videoUrls provided in input.');
        await Actor.fail('No videoUrls provided in input.');
        return;
    }

    let actorProxyConfiguration = null;
    if (effectiveInput.useProxies && !(effectiveInput.proxyUrls && effectiveInput.proxyUrls.length > 0) ) {
        const proxyOpts = { groups: effectiveInput.proxyGroups || ['RESIDENTIAL'] };
        if (effectiveInput.proxyCountry && effectiveInput.proxyCountry.trim() !== "" && effectiveInput.proxyCountry.toUpperCase() !== "ANY") {
            proxyOpts.countryCode = effectiveInput.proxyCountry;
        }
        try {
            actorProxyConfiguration = await Actor.createProxyConfiguration(proxyOpts);
            actorLog.info(`Apify Proxy: Country=${proxyOpts.countryCode || 'Any'}, Groups=${(proxyOpts.groups || []).join(', ')}`);
        } catch (e) { actorLog.error(`Failed Apify Proxy config: ${e.message}.`); actorProxyConfiguration = null; }
    }

    const jobs = [];
    const defaultSearchProfileForUA = getProfileByCountry('US');
    const userAgentStringsForSearch = [
        defaultSearchProfileForUA.userAgent,
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    ];


    for (let i = 0; i < effectiveInput.videoUrls.length; i++) {
        const url = effectiveInput.videoUrls[i];
        const videoId = extractVideoIdFromUrl(url, actorLog);
        if (!videoId) { (actorLog.warn || actorLog.warning).call(actorLog, `Invalid YouTube URL/ID: "${url}". Skipping.`); await Actor.pushData({ url, status: 'error', error: 'Invalid YouTube URL' }); continue; }

        const watchType = (effectiveInput.watchTypes && effectiveInput.watchTypes[i]) || 'direct';
        const refererUrl = (watchType === 'referer' && effectiveInput.refererUrls && effectiveInput.refererUrls[i] && effectiveInput.refererUrls[i].trim() !== "")
            ? effectiveInput.refererUrls[i].trim()
            : null;

        let searchKeywords = [];
        if (watchType === 'search' && effectiveInput.searchKeywordsForEachVideo && typeof effectiveInput.searchKeywordsForEachVideo[i] === 'string') {
            searchKeywords = effectiveInput.searchKeywordsForEachVideo[i].split(',').map(kw => kw.trim()).filter(kw => kw.length > 0);
        }

        jobs.push({
            id: uuidv4(), videoUrl: url, videoId, platform: 'youtube',
            referer: refererUrl, video_info: { duration: 300, isLive: false },
            watch_time: effectiveInput.watchTimePercentage, jobIndex: i,
            watchType, searchKeywords
        });
    }

    if (jobs.length === 0) { actorLog.error('No valid jobs.'); await Actor.fail('No valid jobs.'); return; }
    actorLog.info(`ACTOR_MAIN_LOGIC: Created ${jobs.length} job(s). Concurrency: ${effectiveInput.concurrency}`);

    const overallResults = { totalJobs: jobs.length, successfulJobs: 0, failedJobs: 0, details: [], startTime: new Date().toISOString() };
    const activeWorkers = new Set();
    let jobCounter = 0;

    const processJob = async (job) => {
        const jobLogger = actorLog.child({ prefix: `Job-${job.videoId.substring(0,4)}-${job.id.substring(0,4)}: ` });
        if (typeof jobLogger.warn !== 'function' && typeof jobLogger.warning === 'function') {
            jobLogger.warn = jobLogger.warning;
        }

        jobLogger.info(`Starting job ${job.jobIndex + 1}/${jobs.length}, Type: ${job.watchType}, Referer: ${job.referer || 'None'}`);
        let proxyUrlString = null;
        let proxyInfoForLog = 'None';

        if (effectiveInput.useProxies) {
            if (effectiveInput.proxyUrls && effectiveInput.proxyUrls.length > 0) {
                proxyUrlString = effectiveInput.proxyUrls[job.jobIndex % effectiveInput.proxyUrls.length];
                try {
                    const tempUrl = new URL(proxyUrlString);
                    proxyInfoForLog = `CustomProxy: ${tempUrl.hostname}`;
                } catch { proxyInfoForLog = 'CustomProxy: (unable to parse host)';}
                jobLogger.info(`Using custom proxy: ${proxyInfoForLog}`);
            } else if (actorProxyConfiguration) {
                const sessionId = `session_${job.id.substring(0, 12).replace(/-/g, '')}`;
                try {
                    proxyUrlString = await actorProxyConfiguration.newUrl(sessionId);
                    proxyInfoForLog = `ApifyProxy (Session: ${sessionId}, Country: ${effectiveInput.proxyCountry || 'Any'})`;
                     jobLogger.info(`Using Apify proxy: ${proxyInfoForLog}`);
                } catch (proxyError) {
                    jobLogger.error(`Failed to get new Apify proxy URL: ${proxyError.message}`);
                    proxyUrlString = null; proxyInfoForLog = 'ProxyAcquisitionFailed';
                }
            } else { jobLogger.warn(`Proxies enabled but no configuration found.`); }
        }

        if (job.watchType === 'search' && job.searchKeywords && job.searchKeywords.length > 0) {
            jobLogger.info(`Attempting YouTube search for: "${job.searchKeywords.join(', ')}" to find ID: ${job.videoId}`);
            let searchBrowser = null, searchContext = null, searchPage = null;
            const searchLaunchOptions = { headless: effectiveInput.headless, args: [...ANTI_DETECTION_ARGS] }; 
             if (searchLaunchOptions.args.find(arg => arg.startsWith('--window-size='))) {
                searchLaunchOptions.args = searchLaunchOptions.args.filter(arg => !arg.startsWith('--window-size='));
            }

            if(proxyUrlString) {
                try {
                    const p = new URL(proxyUrlString);
                    searchLaunchOptions.proxy = { server: `${p.protocol}//${p.hostname}:${p.port}`, username: p.username?decodeURIComponent(p.username):undefined, password: p.password?decodeURIComponent(p.password):undefined };
                } catch(e){ jobLogger.warn('Failed to parse proxy for search browser, search will be direct.'); }
            }
            try {
                const searchUserAgent = userAgentStringsForSearch[nodeJsRandom(0, userAgentStringsForSearch.length-1)];
                searchBrowser = await playwright.chromium.launch(searchLaunchOptions);
                
                const searchFingerprintProfile = getProfileByCountry(effectiveInput.proxyCountry);
                searchFingerprintProfile.userAgent = searchUserAgent;
                searchLaunchOptions.args.push(`--window-size=${searchFingerprintProfile.screen.width},${searchFingerprintProfile.screen.height}`);


                searchContext = await searchBrowser.newContext({ 
                    userAgent: searchFingerprintProfile.userAgent,
                    locale: searchFingerprintProfile.locale,
                    timezoneId: searchFingerprintProfile.timezoneId,
                    screen: {
                        width: searchFingerprintProfile.screen.width,
                        height: searchFingerprintProfile.screen.height,
                    },
                    viewport: {
                        width: searchFingerprintProfile.screen.width,
                        height: searchFingerprintProfile.screen.height,
                    },
                    ignoreHTTPSErrors: true,
                });

                // Custom scripts SKIPPED for search in this config
                jobLogger.info('SearchAntiDetect: Custom scripts SKIPPED (v1.9.4 - replicating b0zDz9AEx6U1cx1N2 baseline).');


                searchPage = await searchContext.newPage();

                const searchQuery = job.searchKeywords[nodeJsRandom(0, job.searchKeywords.length - 1)];
                const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
                jobLogger.info(`Navigating to search URL: ${youtubeSearchUrl}`);
                await searchPage.goto(youtubeSearchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }); 
                await handleYouTubeConsent(searchPage, jobLogger.child({prefix: 'SearchConsent: '}));
                
                jobLogger.info('enableAutoplayWithInteraction SKIPPED for search stability test (v1.9.4).');

                const videoLinkSelector = `a#video-title[href*="/watch?v=${job.videoId}"]`;
                jobLogger.info(`Looking for video link: ${videoLinkSelector}`);
                
                const scrollCount = nodeJsRandom(2,4);
                for(let k=0; k < scrollCount; k++) {
                    const scrollRatio = Math.random() * (0.7 - 0.3) + 0.3;
                    await searchPage.evaluate((ratio) => window.scrollBy(0, window.innerHeight * ratio), scrollRatio);
                    await sleep(500 + nodeJsRandom(100, 500));
                }

                const videoLinkElement = searchPage.locator(videoLinkSelector).first();
                if (!await videoLinkElement.isVisible({timeout: 10000})) {
                    jobLogger.info('Direct video link not immediately visible, trying "Videos" filter if present...');
                    const videosFilterButton = searchPage.locator('yt-chip-cloud-chip-renderer:has-text("Videos"), yt-chip-cloud-chip-renderer[aria-label="Search for Videos"]').first();
                    if (await videosFilterButton.isVisible({timeout: 3000})) {
                        await videosFilterButton.click({force: true});
                        await searchPage.waitForTimeout(nodeJsRandom(2000,4000));
                        jobLogger.info('Clicked "Videos" filter. Re-checking for video link.');
                    }
                }

                await videoLinkElement.waitFor({ state: 'visible', timeout: 45000 });

                const href = await videoLinkElement.getAttribute('href');
                if (href) {
                    const fullVideoUrl = (href.startsWith('http') ? href : `https://www.youtube.com${href}`);
                    const currentSearchPageUrl = searchPage.url();
                    const linkTitle = await videoLinkElement.textContent();
                    if (href.includes(job.videoId) || (linkTitle && linkTitle.toLowerCase().includes(job.videoId.toLowerCase()))) {
                        jobLogger.info(`Video found via search: ${fullVideoUrl}. Updating job URL and referer.`);
                        job.videoUrl = fullVideoUrl;
                        job.referer = currentSearchPageUrl;
                    } else {
                         jobLogger.warn(`Found video link element (href: ${href}, title: ${linkTitle}), but ID ${job.videoId} not strongly matched. Proceeding with original/direct URL for safety.`);
                    }
                } else {
                    jobLogger.warn('Found video link element but href was null. Proceeding with original URL.');
                }
            } catch (searchError) {
                jobLogger.error(`YouTube search failed: ${searchError.message}. Falling back to direct URL: ${job.videoUrl}`);
                 if (Actor.isAtHome()) {
                    try {
                        const ssKey = `SEARCH_FAIL_${job.videoId}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
                        if (searchPage && !searchPage.isClosed()) await Actor.setValue(ssKey, await searchPage.screenshot(), { contentType: 'image/png' });
                    } catch (e) { jobLogger.debug(`Failed to save search fail screenshot: ${e.message}`);}
                 }
            } finally {
                if (searchPage && !searchPage.isClosed()) await searchPage.close().catch(e => jobLogger.debug(`Search page close error: ${e.message}`));
                if (searchContext) await searchContext.close().catch(e => jobLogger.debug(`Search context close error: ${e.message}`));
                if (searchBrowser) await searchBrowser.close().catch(e => jobLogger.debug(`Search browser close error: ${e.message}`));
            }
        }

        const worker = new YouTubeViewWorker(job, effectiveInput, proxyUrlString, jobLogger);
        let jobResultData = {
            jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId,
            status: 'initiated', proxyUsed: proxyInfoForLog, refererRequested: job.referer,
            watchTypePerformed: job.watchType,
            fingerprintProfileKey: worker.fingerprintProfile.profileKeyName || 'N/A',
            error: null,
            lastReportedVideoTimeSeconds: 0,
            targetVideoPlayTimeSeconds: 0,
            videoDurationSeconds: 0
        };

        try {
            await worker.startWorker();
            jobResultData.targetVideoPlayTimeSeconds = Math.max(10, (effectiveInput.watchTimePercentage / 100) * worker.job.video_info.duration);
            jobResultData.videoDurationSeconds = worker.job.video_info.duration;

            const watchResult = await worker.watchVideo();
            Object.assign(jobResultData, watchResult);

            if (jobResultData.lastReportedVideoTimeSeconds >= jobResultData.targetVideoPlayTimeSeconds) {
                jobResultData.status = 'success';
                overallResults.successfulJobs++;
                jobLogger.info(`Job success: Watched ${jobResultData.lastReportedVideoTimeSeconds.toFixed(1)}s / ${jobResultData.targetVideoPlayTimeSeconds.toFixed(1)}s`);
            } else {
                jobResultData.status = 'failure_watch_time_not_met';
                const message = `Target watch time ${jobResultData.targetVideoPlayTimeSeconds.toFixed(1)}s not met. Actual: ${jobResultData.lastReportedVideoTimeSeconds.toFixed(1)}s (Max time reached in worker: ${worker.maxTimeReachedThisView.toFixed(1)}s).`;
                jobResultData.error = jobResultData.error ? `${jobResultData.error}; ${message}` : message;
                overallResults.failedJobs++;
                (jobLogger.warning || jobLogger.warn).call(jobLogger, message);
            }

        } catch (error) {
            jobLogger.error(`Job failed with exception: ${error.message}`, { stack: error.stack && error.stack.split('\n').slice(0,7).join(' | ') });
            jobResultData.status = 'failure_exception';
            jobResultData.error = error.message + (error.stack ? ` STACK_TRACE_SNIPPET: ${error.stack.split('\n').slice(0,5).join(' | ')}` : '');
            jobResultData.lastReportedVideoTimeSeconds = worker.maxTimeReachedThisView;
            if (worker.job && worker.job.video_info && worker.job.video_info.duration) {
                 jobResultData.targetVideoPlayTimeSeconds = Math.max(10, (effectiveInput.watchTimePercentage / 100) * worker.job.video_info.duration);
                 jobResultData.videoDurationSeconds = worker.job.video_info.duration;
            }
            overallResults.failedJobs++;
        } finally {
            await worker.kill();
            jobLogger.info(`Finished job. Status: ${jobResultData.status}. Watched: ${(jobResultData.lastReportedVideoTimeSeconds || 0).toFixed(1)}s`);
        }
        overallResults.details.push(jobResultData);
        await Actor.pushData(jobResultData);
    };

    const runPromises = [];
    for (const job of jobs) {
        while (activeWorkers.size >= effectiveInput.concurrency) {
            (actorLog.warning || actorLog.warn).call(actorLog, `Concurrency limit ${effectiveInput.concurrency} reached (active: ${activeWorkers.size}). Waiting for a slot.`);
            try {
                 await Promise.race(Array.from(activeWorkers));
            } catch (e) {
                 actorLog.debug(`Error during Promise.race (worker slot wait), likely already handled: ${e.message.substring(0,100)}`);
            }
        }

        const promise = processJob(job).catch(e => {
            actorLog.error(`Unhandled error directly from processJob promise for ${job.videoId}: ${e.message}`);
            const errorResult = { 
                jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId, 
                status: 'catastrophic_processJob_failure', 
                error: e.message  + (e.stack ? ` | STACK: ${e.stack.substring(0,200)}` : '')
            };
            Actor.pushData(errorResult).catch(pushErr => console.error("Failed to pushData for catastrophic failure:", pushErr));
            overallResults.failedJobs++;
            overallResults.details.push(errorResult);
        }).finally(() => {
            activeWorkers.delete(promise);
            actorLog.debug(`Worker finished for job ${job.videoId.substring(0,4)}. Active workers: ${activeWorkers.size}`);
        });
        activeWorkers.add(promise);
        runPromises.push(promise);

        jobCounter++;
        if (jobCounter < jobs.length && effectiveInput.concurrencyInterval > 0) {
            actorLog.debug(`Waiting ${effectiveInput.concurrencyInterval}s before dispatching next job (active: ${activeWorkers.size}, current job ${jobCounter}/${jobs.length}).`);
            await sleep(effectiveInput.concurrencyInterval * 1000);
        }
    }
    
    actorLog.info(`All ${jobs.length} jobs have been dispatched. Waiting for all to complete... Active workers: ${activeWorkers.size}`);
    await Promise.all(runPromises.map(p => p.catch(e => {
        actorLog.error(`Error caught by final Promise.all on a worker promise (should have been handled earlier): ${e.message}`);
        return e;
    })));

    overallResults.endTime = new Date().toISOString();
    actorLog.info('All jobs processed. Final results:', { summary: { total: overallResults.totalJobs, success: overallResults.successfulJobs, failed: overallResults.failedJobs }, duration: (new Date(overallResults.endTime).getTime() - new Date(overallResults.startTime).getTime())/1000 + 's' });
    await Actor.setValue('OVERALL_RESULTS', overallResults);
    actorLog.info('Actor finished successfully.');
    await Actor.exit();
}

// --- Actor Entry Point ---
Actor.main(actorMainLogic);

console.log('MAIN.JS: Script fully loaded. Actor.main is set up.');
