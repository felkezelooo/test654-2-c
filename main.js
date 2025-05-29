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
        const marchLastSunday = new Date(Date.UTC(currentYear, 2, 31)); // Month is 0-indexed, so 2 is March
        marchLastSunday.setUTCDate(marchLastSunday.getUTCDate() - marchLastSunday.getUTCDay());
        const octoberLastSunday = new Date(Date.UTC(currentYear, 9, 31)); // 9 is October
        octoberLastSunday.setUTCDate(octoberLastSunday.getUTCDate() - octoberLastSunday.getUTCDay());
        return now >= marchLastSunday && now < octoberLastSunday;
    }
    if (tz.startsWith('America/')) {
        // DST starts on the second Sunday in March
        let marchSecondSunday = new Date(Date.UTC(currentYear, 2, 1)); // March 1st
        let sundayCount = 0;
        for (let i = 1; i <= 14; i++) { // Check up to the 14th
            marchSecondSunday.setUTCDate(i);
            if (marchSecondSunday.getUTCDay() === 0) sundayCount++;
            if (sundayCount === 2) break;
        }
        // DST ends on the first Sunday in November
        let novemberFirstSunday = new Date(Date.UTC(currentYear, 10, 1)); // November 1st
        for (let i = 1; i <= 7; i++) { // Check up to the 7th
            novemberFirstSunday.setUTCDate(i);
            if (novemberFirstSunday.getUTCDay() === 0) break;
        }
        return now >= marchSecondSunday && now < novemberFirstSunday;
    }
    // Default for non-European/American timezones or if logic is incomplete
    return false; // Or implement specific logic for other regions
};

function nodeJsRandom(min, max) {
    if (max === undefined) { max = min; min = 0; }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomArrayItem(arr) {
    if (!arr || arr.length === 0) return undefined;
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
        plugins: [], mimeTypes: [], // Empty arrays as per your spec
        locale: 'en-US',
        timezoneId: 'America/New_York',
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? 240 : 300; }, // UTC-4 (EDT) / UTC-5 (EST)
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
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? -60 : 0; }, // UTC+1 (BST) / UTC+0 (GMT)
        screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
        webGLVendor: 'Google Inc. (AMD)',
        webGLRenderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
    'US_MAC_CHROME_M_SERIES': {
        profileKeyName: 'US_MAC_CHROME_M_SERIES',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        acceptLanguage: 'en-US,en;q=0.9',
        platform: 'MacIntel', // Common for Macs
        deviceMemory: 16, // Common for M-series Macs
        hardwareConcurrency: getRandomArrayItem([8, 10, 12]), // M-series Macs have 8, 10, 12 core CPUs
        vendor: 'Apple Computer, Inc.', // Changed from Google Inc.
         plugins: [], mimeTypes: [],
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? 420 : 480; }, // UTC-7 (PDT) / UTC-8 (PST)
        screen: { width: 1728, height: 1117, availWidth: 1728, availHeight: 1079, colorDepth: 30, pixelDepth: 30 }, // Common MacBook Pro M1/M2 res
        webGLVendor: 'Apple',
        webGLRenderer: 'Apple M2 Pro', // Or Apple M1, Apple M3 etc.
    },
    'HU_CHROME_WIN_INTEL': {
        profileKeyName: 'HU_CHROME_WIN_INTEL',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        acceptLanguage: 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7',
        platform: 'Win32',
        deviceMemory: 8,
        hardwareConcurrency: getRandomArrayItem([4, 8, 12]),
        vendor: 'Google Inc.',
        plugins: [], mimeTypes: [],
        locale: 'hu-HU',
        timezoneId: 'Europe/Budapest',
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? -120 : -60; }, // UTC+2 (CEST) / UTC+1 (CET)
        screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
        webGLVendor: 'Google Inc. (Intel)',
        webGLRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
};

function getRandomProfileKeyName() {
    const keys = Object.keys(FINGERPRINT_PROFILES);
    return keys[Math.floor(Math.random() * keys.length)];
}

function getProfileByCountry(countryCode) {
    const countryUpper = countryCode ? countryCode.toUpperCase() : '';
    const deepCopy = (profile) => JSON.parse(JSON.stringify(profile)); // Simple deep copy for plain objects
    const matchingProfileKeys = Object.keys(FINGERPRINT_PROFILES).filter(k => k.startsWith(countryUpper + '_'));

    if (matchingProfileKeys.length > 0) {
        const selectedKey = matchingProfileKeys[Math.floor(Math.random() * matchingProfileKeys.length)];
        return deepCopy(FINGERPRINT_PROFILES[selectedKey]);
    }
    // Fallback to US if specific country not found
    const usProfileKeys = Object.keys(FINGERPRINT_PROFILES).filter(k => k.startsWith('US_'));
    if (usProfileKeys.length > 0) {
         const selectedKey = usProfileKeys[Math.floor(Math.random() * usProfileKeys.length)];
         console.warn(`No profile for country ${countryCode}, falling back to US profile: ${selectedKey}`);
         return deepCopy(FINGERPRINT_PROFILES[selectedKey]);
    }
    // Fallback to random if US also not found (should not happen if US_ profiles exist)
    const randomKey = getRandomProfileKeyName();
    console.warn(`No profile for country ${countryCode} or US, falling back to random profile: ${randomKey}`);
    return deepCopy(FINGERPRINT_PROFILES[randomKey]);
}

// StealthPlugin is SKIPPED for this version
console.log('MAIN.JS: StealthPlugin application SKIPPED for v1.9.5 (replicating b0zDz9AEx6U1cx1N2 baseline).');


async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function getSafeLogger(loggerInstance) {
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
            // Ensure all logging methods are correctly bound and prefixed
            for (const key in this) {
                if (typeof this[key] === 'function' && key !== 'child' && key !== 'prefix') {
                    childConsoleLogger[key] = (m, d) => this[key](`${newPrefix}${m || ''}`, d);
                } else if (key !== 'child' && key !== 'prefix') {
                    // Copy non-function properties if any (e.g., level, though not standard here)
                    childConsoleLogger[key] = this[key];
                }
            }
            // Ensure the child method itself is correctly propagated
            childConsoleLogger.child = function(opts) { return baseConsoleLogger.child.call(this, opts); };
            return childConsoleLogger;
        }
    };

    if (loggerInstance &&
        typeof loggerInstance.info === 'function' &&
        (typeof loggerInstance.warn === 'function' || typeof loggerInstance.warning === 'function') && // Check for either warn or warning
        typeof loggerInstance.error === 'function' &&
        typeof loggerInstance.debug === 'function' && // Added debug check
        typeof loggerInstance.child === 'function' // Ensure child method exists
    ) {
        // If warn is missing but warning exists, alias it
        if (typeof loggerInstance.warn !== 'function' && typeof loggerInstance.warning === 'function') {
            loggerInstance.warn = loggerInstance.warning;
        }
        return loggerInstance;
    }

    // This warning should only appear once if the Apify logger isn't available as expected
    if (!getSafeLogger.hasWarnedOnceGetSafeLogger) {
        console.error("GET_SAFE_LOGGER: Provided loggerInstance was invalid or incomplete. Falling back to basic console logger WITH dummy child support.");
        getSafeLogger.hasWarnedOnceGetSafeLogger = true;
    }
    return { ...baseConsoleLogger }; // Return a new instance of the fallback
}
getSafeLogger.hasWarnedOnceGetSafeLogger = false; // Static property for one-time warning

function extractVideoIdFromUrl(url, logger) {
    const safeLogger = getSafeLogger(logger);
    try {
        const urlObj = new URL(url); // Use URL constructor for robust parsing
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const vParam = urlObj.searchParams.get('v');
            if (vParam && vParam.length === 11) return vParam;

            const pathParts = urlObj.pathname.split('/');
            if (urlObj.hostname === 'youtu.be' && pathParts.length > 1 && pathParts[1].length === 11) return pathParts[1];
            // Handle /shorts/VIDEO_ID, /embed/VIDEO_ID, /live/VIDEO_ID
            if (pathParts.length > 2 && (pathParts[1] === 'shorts' || pathParts[1] === 'embed' || pathParts[1] === 'live') && pathParts[2].length === 11) return pathParts[2];
            // Handle youtube.com/VIDEO_ID (less common, but possible if no other params)
            if (pathParts.length > 1 && pathParts[1].length === 11 && !vParam) return pathParts[1];

        } else if (url.includes('rumble.com')) {
            const pathParts = urlObj.pathname.split('/');
            // Example: https://rumble.com/v2j3hyu-example-video.html -> v2j3hyu
            // Or: https://rumble.com/vsomeid/live-stream-title.html -> vsomeid
            const videoPart = pathParts.find(part => part.match(/^v[a-zA-Z0-9]+(-.*\.html)?$/));
            if (videoPart) {
                return videoPart.split('-')[0]; // Takes the part before the first hyphen
            }
        }
    } catch (error) {
        safeLogger.error(`Error extracting video ID from URL ${url}: ${error.message}`);
    }
    (safeLogger.warn || safeLogger.warning).call(safeLogger, `Could not extract valid YouTube/Rumble video ID from: ${url}`);
    return null;
}
async function handleYouTubeConsent(page, logger, attempt = 1, maxAttempts = 2) {
    const safeLogger = getSafeLogger(logger);
    safeLogger.info(`Checking for YouTube consent dialog (attempt ${attempt}/${maxAttempts})...`);
    const consentButtonSelectors = [
        'button[aria-label*="Accept all"]', 'button[aria-label*="Accept the use of cookies"]',
        'button[aria-label*="Agree to all"]', 'button[aria-label*="Agree"]',
        'div[role="dialog"] button:has-text("Accept all")', 'div[role="dialog"] button:has-text("Agree")', // More specific
        'ytd-button-renderer:has-text("Accept all")', 'tp-yt-paper-button:has-text("ACCEPT ALL")',
        '#introAgreeButton',
        // More general selectors that might catch other variations
        'form[action*="consent.youtube.com"] button[type="submit"]', // Common form submission
        'div[class*="consent"] button[class*="accept"]', // Generic class names
        'button:has(span:text-is("Accept all"))', // Playwright specific, potentially slower
        'button:has(span:text-is("Reject all")) + button', // Button next to a "Reject all"
    ];
    // More robust dialog selector
    const consentDialogSelector = 'ytd-consent-bump-v2-lightbox, tp-yt-paper-dialog[role="dialog"], div[aria-modal="true"]:has(h1:text-is("Before you continue to YouTube"))';
    const consentVisibilityTimeout = 7000; // Reduced from 10s to 7s for quicker check

    let consentDialog = page.locator(consentDialogSelector).first();
    let dialogInitiallyVisible = false;
    try {
        dialogInitiallyVisible = await consentDialog.isVisible({ timeout: consentVisibilityTimeout });
    } catch (e) {
        safeLogger.debug(`Consent dialog visibility check timed out or failed: ${e.message.split('\n')[0]}`);
    }

    if (dialogInitiallyVisible) {
        safeLogger.info('Consent dialog element IS visible.');
        for (const selector of consentButtonSelectors) {
            try {
                const button = page.locator(selector).first();
                if (await button.isVisible({ timeout: consentVisibilityTimeout / 2 })) { // Shorter timeout per button
                    safeLogger.info(`Consent button found: "${selector}". Attempting to click.`);
                    await button.click({ timeout: 3000, force: true, noWaitAfter: false });
                    await page.waitForTimeout(1500 + nodeJsRandom(500, 1500)); // Wait for action to process
                    safeLogger.info('Consent button clicked.');
                    
                    // Re-check if dialog is gone more reliably
                    consentDialog = page.locator(consentDialogSelector).first(); // Re-fetch locator
                    if (!await consentDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
                        safeLogger.info('Consent dialog successfully dismissed.');
                        return true;
                    } else {
                        (safeLogger.warn || safeLogger.warning).call(safeLogger, 'Clicked consent, but a dialog might still be visible after click. This might be a partial dismissal.');
                    }
                    return true; // Assume click was effective even if dialog check is flaky
                }
            } catch (e) {
                safeLogger.debug(`Consent selector "${selector}" not actionable/error: ${e.message.split('\n')[0]}`);
            }
        }
        (safeLogger.warn || safeLogger.warning).call(safeLogger, 'Consent dialog was visible, but no known accept button was found or clickable.');
        if (attempt < maxAttempts) {
            safeLogger.info(`Retrying consent check after a small delay (attempt ${attempt + 1}).`);
            await sleep(2000 + nodeJsRandom(500));
            return await handleYouTubeConsent(page, logger, attempt + 1, maxAttempts);
        }
        return false; // Dialog present, but couldn't handle after retries
    }
    
    safeLogger.info('No actionable consent dialog found (dialog element not visible on this check).');
    return false; // No dialog to handle on this check
}

// Using ABSOLUTE_MINIMAL_ARGS from v1.8.1 successful load state
const ANTI_DETECTION_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox', // Required in Apify environment
    '--disable-dev-shm-usage', // Common for Docker
    '--disable-gpu', // Often good for headless/server
    '--mute-audio',
    '--ignore-certificate-errors',
    // '--no-first-run', // Consider re-adding if startup is slow
    // '--no-service-autorun',
    // '--password-store=basic',
    // '--use-mock-keychain',
    '--disable-features=IsolateOrigins,site-per-process,Translate,OptimizationHints,PrivacySandboxAdsAPIsOverride', // Added for more isolation/less tracking
    '--disable-site-isolation-trials',
    '--flag-switches-begin --disable-smooth-scrolling --flag-switches-end' // More fine-tuning
];

// applyAntiDetectionScripts call will be SKIPPED
async function applyAntiDetectionScripts(pageOrContext, logger, fingerprintProfile) {
    const safeLogger = getSafeLogger(logger);
    safeLogger.info(`Custom anti-detection scripts SKIPPED (v1.9.5 - replicating b0zDz9AEx6U1cx1N2 baseline).`);
}


async function waitForVideoToLoad(page, logger, maxWaitMs = 90000) {
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
            if (videoState.readyState >= 3 && videoState.duration > 0 && Number.isFinite(videoState.duration)) { // HAVE_FUTURE_DATA or more
                safeLogger.info(`[waitForVideoToLoad] Video appears loaded. Duration: ${videoState.duration.toFixed(1)}s, RS: ${videoState.readyState}`);
                if (videoState.paused && videoState.currentTime < 1 && videoState.readyState === 4) { // HAVE_ENOUGH_DATA
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

async function getVideoDuration(page, logger) {
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

async function clickIfExists(page, selector, timeout = 3000, logger, forceClick = true) { // Added forceClick param
    const safeLogger = getSafeLogger(logger);
    try {
        const element = page.locator(selector).first();
        await element.waitFor({ state: 'visible', timeout });
        await element.click({ timeout: timeout / 2, force: forceClick, noWaitAfter: false });
        safeLogger.info(`Clicked on selector: ${selector} (force: ${forceClick})`);
        return true;
    } catch (e) {
        if (page.isClosed()) { (safeLogger.warn || safeLogger.warning).call(safeLogger, `Page closed attempting to click: ${selector} - ${e.message.split('\n')[0]}`); return false;}
        safeLogger.debug(`Selector not found/clickable: ${selector} (force: ${forceClick}) - Error: ${e.message.split('\n')[0]}`);
        return false;
    }
}

async function setVideoQualityToLowest(page, logger) {
    const safeLogger = getSafeLogger(logger);
    safeLogger.info('Attempting to set video quality to lowest...');
    const settingsButtonSelector = '.ytp-settings-button';
    // More robust selector for Quality menu item, looking for the text specifically.
    const qualityMenuItemSelector = '.ytp-menuitem:has(.ytp-menuitem-label:text-matches(/^Quality$/i))';
    const qualityOptionsSelectors = [
        '.ytp-menuitem[role="menuitemradio"]:has-text(/^144p/)', // Prioritize 144p
        '.ytp-menuitem[role="menuitemradio"]:has-text(/^240p/)'  // Fallback to 240p
    ];

    let settingsButton;
    try {
        settingsButton = page.locator(settingsButtonSelector);
        await settingsButton.waitFor({ state: 'visible', timeout: 5000 });
        // Hover over player to ensure controls are visible
        const playerLocator = page.locator('#movie_player, .html5-video-player').first();
        if (await playerLocator.count() > 0 && await playerLocator.isVisible({timeout:1000})) {
             await playerLocator.hover({timeout: 1000, force:true }).catch(e => safeLogger.debug(`Player hover for quality failed: ${e.message}`));
             await sleep(300 + nodeJsRandom(200)); // Give controls time to appear
        } else {
            safeLogger.debug('Player element not found for hover before quality settings.');
        }

        await settingsButton.click({ timeout: 3000, force: true }); // force: true if needed
        safeLogger.info('Clicked settings button.');
        await sleep(nodeJsRandom(800, 1300)); // Wait for menu to open

        const qualityMenuItem = page.locator(qualityMenuItemSelector);
        if (!await qualityMenuItem.isVisible({timeout: 5000})) {
            safeLogger.warn('Quality menu item not visible after clicking settings.');
             await settingsButton.click({timeout:1000, force:true}).catch(()=>{}); // Try to close
            return false;
        }
        await qualityMenuItem.click({ timeout: 3000, force: true });
        safeLogger.info('Clicked "Quality" menu item.');
        await sleep(nodeJsRandom(800, 1300)); // Wait for quality options to load

        let qualitySet = false;
        for (const selector of qualityOptionsSelectors) {
            const option = page.locator(selector).first();
            if (await option.isVisible({ timeout: 2000 })) {
                await option.click({ timeout: 2000, force: true });
                safeLogger.info(`Selected video quality using selector: ${selector}`);
                qualitySet = true;
                break;
            }
        }

        if (!qualitySet) {
            safeLogger.warn('Specific low quality (144p/240p) not found. Attempting to select the last available quality option.');
            const allQualityItems = page.locator('.ytp-quality-menu .ytp-menuitem[role="menuitemradio"]'); // More specific
            const count = await allQualityItems.count();
            safeLogger.debug(`Found ${count} quality options in menu.`);
            if (count > 1) { // Ensure there's more than just "Auto" or a single option
                // YouTube lists qualities from highest to lowest. We want the last one.
                await allQualityItems.nth(count - 1).click({ timeout: 2000, force: true });
                qualitySet = true;
                safeLogger.info('Selected last available quality option (assumed lowest).');
            } else {
                safeLogger.warn('Not enough quality options to pick the last one, or only "Auto" found.');
            }
        }
        
        await sleep(nodeJsRandom(500, 1000)); // Allow quality change to apply
        // Try to close settings menu by clicking settings button again, regardless of success/failure of setting quality
        await settingsButton.click({timeout:1000, force:true}).catch(e => safeLogger.debug(`Failed to close settings menu: ${e.message}`));
        return qualitySet;

    } catch (e) {
        safeLogger.error(`Error setting video quality: ${e.message}`);
        // Attempt to close settings menu if it's still open to prevent interference
        if (settingsButton && await settingsButton.isVisible({timeout:500}).catch(()=>false) ) {
             await settingsButton.click({timeout:1000, force:true}).catch(err => safeLogger.debug(`Error trying to close settings menu after quality error: ${err.message}`));
        }
        return false;
    }
}

async function simulateMouseMovement(page, logger) {
    const safeLogger = getSafeLogger(logger);
    try {
        const viewport = page.viewportSize();
        if (!viewport) {
            safeLogger.debug('Cannot simulate mouse movement, viewport size unknown.');
            return;
        }

        const playerElement = page.locator('#movie_player, .html5-video-player, div#player.style-scope.ytd-watch-flexy').first(); // More generic player container
        let targetX, targetY;

        let moveWithinPlayer = false;
        if (await playerElement.count() > 0 && await playerElement.isVisible({timeout: 500}).catch(() => false)) {
            const bb = await playerElement.boundingBox();
            if (bb && bb.width > 100 && bb.height > 100) { // Ensure player has reasonable dimensions
                // 70% chance to move within player, 30% outside but near
                if (Math.random() < 0.7) {
                    targetX = bb.x + Math.random() * bb.width;
                    targetY = bb.y + Math.random() * bb.height;
                    safeLogger.debug(`Mouse target is within player bounds: ${targetX.toFixed(0)},${targetY.toFixed(0)}`);
                } else {
                    targetX = Math.max(0, Math.min(viewport.width - 1, bb.x + (Math.random() - 0.5) * bb.width * 1.5));
                    targetY = Math.max(0, Math.min(viewport.height - 1, bb.y + (Math.random() - 0.5) * bb.height * 1.5));
                    safeLogger.debug(`Mouse target is near player bounds: ${targetX.toFixed(0)},${targetY.toFixed(0)}`);
                }
                moveWithinPlayer = true;
            }
        }
        
        if (!moveWithinPlayer) { // Fallback if player not found or too small
            targetX = Math.random() * viewport.width;
            targetY = Math.random() * viewport.height;
            safeLogger.debug(`Mouse target is within viewport (player not suitable): ${targetX.toFixed(0)},${targetY.toFixed(0)}`);
        }
        
        const steps = nodeJsRandom(5, 15); // Realistic number of steps
        safeLogger.debug(`Simulating mouse move to (${targetX.toFixed(0)}, ${targetY.toFixed(0)}) over ${steps} steps.`);
        await page.mouse.move(targetX, targetY, { steps });
        await sleep(nodeJsRandom(100, 300)); // Small pause after move
    } catch (e) {
        safeLogger.warn(`Error during mouse movement: ${e.message.split('\n')[0]}`);
    }
}


class YouTubeViewWorker {
    constructor(job, effectiveInput, proxyUrlString, baseLogger) {
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
        this.lastLoggedVideoTime = -10; // Initialize to ensure first log
        
        this.logger.info('Worker instance constructed.');
    }
    createFallbackLogger(prefix) {
        const self = this; // Capture 'this' for use in method definitions
        return {
            prefix: prefix,
            info: (m, d) => console.log(`INFO ${self.prefix || prefix}${m || ''}`, d || ''),
            warn: (m, d) => console.warn(`WARN ${self.prefix || prefix}${m || ''}`, d || ''),
            warning: (m, d) => console.warn(`WARN ${self.prefix || prefix}${m || ''}`, d || ''), // Alias for warn
            error: (m, d) => console.error(`ERROR ${self.prefix || prefix}${m || ''}`, d || ''),
            debug: (m, d) => console.log(`DEBUG ${self.prefix || prefix}${m || ''}`, d || ''),
            child: function(childOpts) { // Use standard function to allow 'this'
                const newPrefix = (this.prefix || '') + (childOpts && childOpts.prefix ? childOpts.prefix : '');
                return self.createFallbackLogger(newPrefix); // Use captured 'self'
            }
        };
    }

    async startWorker() {
        this.logger.info(`Launching browser... Proxy: ${this.proxyUrlString ? 'Yes' : 'No'}, Headless: ${this.effectiveInput.headless}`);
        
        const launchOptions = {
            headless: this.effectiveInput.headless,
            args: [
                ...ANTI_DETECTION_ARGS,
                `--window-size=${this.fingerprintProfile.screen.width},${this.fingerprintProfile.screen.height}`
                // Potentially add: '--disable-features=WebRtcHideLocalIpsWithMdns'
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

        this.browser = await playwright.chromium.launch(launchOptions);
        this.logger.info('Browser launched directly with Playwright (StealthPlugin SKIPPED for v1.9.5).');

        this.context = await this.browser.newContext({
            userAgent: this.fingerprintProfile.userAgent,
            locale: this.fingerprintProfile.locale,
            timezoneId: this.fingerprintProfile.timezoneId,
            acceptDownloads: false, // Generally don't need downloads
            screen: { 
                width: this.fingerprintProfile.screen.width,
                height: this.fingerprintProfile.screen.height
            },
            viewport: { // Ensure viewport matches screen for non-headless, or a common desktop for headless
                width: this.effectiveInput.headless ? 1920 : this.fingerprintProfile.screen.width,
                height: this.effectiveInput.headless ? 1080 : this.fingerprintProfile.screen.height
            },
            ignoreHTTPSErrors: true,
            bypassCSP: true, // Can help with some site restrictions
            javaScriptEnabled: true,
            permissions: ['geolocation', 'notifications'], // Standard permissions
            geolocation: this.effectiveInput.proxyCountry === 'US' ? { latitude: 34.0522, longitude: -118.2437 } : // LA
                         this.effectiveInput.proxyCountry === 'GB' ? { latitude: 51.5074, longitude: 0.1278 } :  // London
                         this.effectiveInput.proxyCountry === 'HU' ? { latitude: 47.4979, longitude: 19.0402 } : // Budapest
                         this.fingerprintProfile.timezoneId === 'America/New_York' ? { latitude: 40.7128, longitude: -74.0060 } : // NYC fallback for NY timezone
                         this.fingerprintProfile.timezoneId === 'America/Los_Angeles' ? { latitude: 34.0522, longitude: -118.2437 } : // LA fallback for LA timezone
                         this.fingerprintProfile.timezoneId === 'Europe/London' ? { latitude: 51.5074, longitude: -0.1278 } : // London fallback
                         undefined, // No specific geolocation for other countries for now
            deviceScaleFactor: (this.fingerprintProfile.screen.width > 1920 || this.fingerprintProfile.screen.height > 1080) ? 1.5 : 1,
            isMobile: false,
            hasTouch: false,
        });
        this.logger.info(`Browser context created (SIMPLIFIED for v1.9.5). Profile hints: locale=${this.fingerprintProfile.locale}, timezoneId=${this.fingerprintProfile.timezoneId}, UA=${this.fingerprintProfile.userAgent.substring(0,50)}...`);

        // applyAntiDetectionScripts call is SKIPPED
        await applyAntiDetectionScripts(this.context, this.logger, this.fingerprintProfile); // This function now just logs

        if (this.job.referer) {
            this.logger.info(`Setting referer: ${this.job.referer}`);
            await this.context.setExtraHTTPHeaders({ 'Referer': this.job.referer });
        }
        this.page = await this.context.newPage();
        this.logger.info('New page created.');
        
        this.page.on('console', msg => {
            const type = msg.type();
            const text = msg.text().substring(0, 250); // Limit log length
            if (type === 'error' || type === 'warn') {
                this.logger.warn(`PAGE_CONSOLE (${type.toUpperCase()}): ${text}`);
            } else if (type === 'info' || type === 'log' || type === 'debug') {
                 this.logger.debug(`PAGE_CONSOLE (${type.toUpperCase()}): ${text}`);
            }
        });
        
        // Override specific navigator properties using page.addInitScript
        await this.page.addInitScript((fp) => {
            try {
                Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true }); // Common anti-bot check
                if (fp.platform && typeof fp.platform === 'string') {
                    Object.defineProperty(navigator, 'platform', { get: () => fp.platform, configurable: true });
                }
                if (fp.hardwareConcurrency && typeof fp.hardwareConcurrency === 'number') {
                    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency, configurable: true });
                }
                if (fp.deviceMemory && typeof fp.deviceMemory === 'number') {
                     Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.deviceMemory, configurable: true });
                }
                if (fp.vendor && typeof fp.vendor === 'string') {
                    Object.defineProperty(navigator, 'vendor', { get: () => fp.vendor, configurable: true });
                }
                Object.defineProperty(navigator, 'plugins', { get: () => [], configurable: true });
                Object.defineProperty(navigator, 'mimeTypes', { get: () => [], configurable: true });

                if (fp.webGLVendor && fp.webGLRenderer) {
                    const getParameterOriginal = WebGLRenderingContext.prototype.getParameter;
                    WebGLRenderingContext.prototype.getParameter = function(parameter) {
                        if (parameter === this.VENDOR) return fp.webGLVendor;
                        if (parameter === this.RENDERER) return fp.webGLRenderer;
                        if (parameter === this.UNMASKED_VENDOR_WEBGL) return fp.webGLVendor; // Also spoof unmasked
                        if (parameter === this.UNMASKED_RENDERER_WEBGL) return fp.webGLRenderer; // Also spoof unmasked
                        return getParameterOriginal.apply(this, arguments);
                    };
                    if (typeof WebGL2RenderingContext !== 'undefined' && WebGL2RenderingContext.prototype) {
                        const getParameter2Original = WebGL2RenderingContext.prototype.getParameter;
                        WebGL2RenderingContext.prototype.getParameter = function(parameter) {
                            if (parameter === this.VENDOR) return fp.webGLVendor;
                            if (parameter === this.RENDERER) return fp.webGLRenderer;
                            if (parameter === this.UNMASKED_VENDOR_WEBGL) return fp.webGLVendor;
                            if (parameter === this.UNMASKED_RENDERER_WEBGL) return fp.webGLRenderer;
                            return getParameter2Original.apply(this, arguments);
                        };
                    }
                }
                // Screen properties are usually better handled by Playwright's context/viewport options
                // but reinforcing them here can sometimes help with certain detection scripts.
                if (fp.screen) {
                    ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth'].forEach(prop => {
                        if (typeof fp.screen[prop] === 'number') {
                            Object.defineProperty(screen, prop, { get: () => fp.screen[prop], configurable: true });
                        }
                    });
                }
            } catch (e) { console.warn('Error applying init script fingerprint overrides:', e.message); }
        }, this.fingerprintProfile);
        this.logger.info('Fingerprint override script added via addInitScript.');


        this.logger.info(`Navigating to: ${this.job.videoUrl}`);
        // Use 'networkidle' for the main video page to allow more resources to load, might help stability.
        await this.page.goto(this.job.videoUrl, { waitUntil: 'networkidle', timeout: this.effectiveInput.timeout * 1000 });
        this.logger.info('Navigation (network idle) complete.');
        
        await handleYouTubeConsent(this.page, this.logger, 1, 2); // Allow 2 attempts
        await sleep(nodeJsRandom(2000, 4000)); // Allow page to settle after consent

        this.logger.info('enableAutoplayWithInteraction SKIPPED for stability test (v1.9.5).');


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

        const duration = await getVideoDuration(this.page, this.logger);
        if (duration && Number.isFinite(duration) && duration > 0) {
            this.job.video_info.duration = duration;
        } else {
            this.logger.error(`CRITICAL: Could not confirm valid video duration after load. Found: ${duration}. Failing.`);
            throw new Error(`Could not confirm valid video duration after load (got ${duration}).`);
        }
        
        if (this.job.platform === 'youtube') { // Only attempt quality setting for YouTube
            await setVideoQualityToLowest(this.page, this.logger);
        } else {
            this.logger.info('Skipping quality setting for non-YouTube platform.');
        }


        const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];
        this.logger.info('Attempting to ensure video is playing after load and quality set...');
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

    async handleAds() {
        let adWasPlayingThisCheckCycle = false;
        // More comprehensive ad detection selectors
        const adSelectors = [
            '.ytp-ad-player-overlay-instream-info', // Modern ad info overlay
            '.video-ads .ad-showing',                // General ad container showing
            '.ytp-ad-text',                          // "Ad" text itself
            'div[class*="ytp-ad-"][style*="display: block"]', // Generic ad container visible
            '.ytp-ad-skip-button-container', // Container for skip button often appears with ad
            '.ytp-ad-message-container',      // Container for messages like "Ad · 1 of 2"
        ];
        
        let isAdCurrentlyPlaying = false;
        for (const selector of adSelectors) {
            // Use a very short timeout for visibility check as we are polling
            if (await this.page.locator(selector).first().isVisible({timeout: 250}).catch(() => false)) {
                isAdCurrentlyPlaying = true;
                this.logger.debug(`Ad indicator "${selector}" visible.`);
                break;
            }
        }

        if (!isAdCurrentlyPlaying) {
            this.logger.debug('No ad indicators found this check.');
            return false; // No ad currently detected
        }

        this.logger.info('Ad detected! Entering ad handling loop.');
        adWasPlayingThisCheckCycle = true; // An ad was detected in this cycle

        const adSkipCheckInterval = 1500; // How often to check for skip button/ad end
        const maxAdWatchDuration = this.effectiveInput.maxSecondsAds * 1000; // Max time to spend on this ad
        const adLoopStartTime = Date.now();

        while (Date.now() - adLoopStartTime < maxAdWatchDuration) {
            if (this.killed || this.page.isClosed()) break; // Worker or page killed

            // Check if ad is *still* playing
            let isAdStillPresent = false;
            for (const selector of adSelectors) {
                 if (await this.page.locator(selector).first().isVisible({timeout: 250}).catch(() => false)) {
                    isAdStillPresent = true;
                    break;
                }
            }
            if (!isAdStillPresent) {
                this.logger.info('Ad finished or disappeared during handling loop (indicators no longer visible).');
                break; // Ad is gone
            }

            // Look for skip buttons
            const skipButtonSelectors = [
                '.ytp-ad-skip-button-modern', // Newer skip button
                '.ytp-ad-skip-button',       // Older skip button
                'button[aria-label*="Skip Ad"]',
                'button[aria-label*="Skip ad"]', // Case variations
                '.videoAdUiSkipButton', // Common class name found on some sites
            ];
            
            let canSkip = false;
            let skipSelectorToUse = null;

            for (const selector of skipButtonSelectors) {
                 if (await this.page.locator(selector).first().isVisible({timeout: 250}).catch(() => false)) {
                    canSkip = true;
                    skipSelectorToUse = selector;
                    this.logger.debug(`Skip button found with selector: ${skipSelectorToUse}`);
                    break;
                }
            }
            
            // Decide whether to skip
            const minSkipTimeMs = nodeJsRandom(this.effectiveInput.skipAdsAfter[0] * 1000, this.effectiveInput.skipAdsAfter[1] * 1000);

            if (this.effectiveInput.autoSkipAds && canSkip && skipSelectorToUse) {
                this.logger.info(`AutoSkipAds: Attempting to skip ad with: ${skipSelectorToUse}`);
                if (await clickIfExists(this.page, skipSelectorToUse, 1000, this.logger)) {
                    await sleep(1500 + nodeJsRandom(500)); // Wait for ad to transition
                    break; // Exit ad loop
                }
            } else if (canSkip && skipSelectorToUse && (Date.now() - adLoopStartTime >= minSkipTimeMs)) {
                this.logger.info(`Ad skippable (${skipSelectorToUse}) and min watch time (${(minSkipTimeMs/1000).toFixed(1)}s) met. Attempting skip.`);
                if (await clickIfExists(this.page, skipSelectorToUse, 1000, this.logger)) {
                    await sleep(1500 + nodeJsRandom(500)); // Wait for ad to transition
                    break; // Exit ad loop
                }
            }
            await sleep(adSkipCheckInterval);
        }

        // Check if ad is still playing after the loop (e.g., if maxAdWatchDuration was reached)
        if (Date.now() - adLoopStartTime >= maxAdWatchDuration) {
            let isAdStillPresentAfterTimeout = false;
            for (const selector of adSelectors) {
                 if (await this.page.locator(selector).first().isVisible({timeout: 250}).catch(() => false)) {
                    isAdStillPresentAfterTimeout = true;
                    break;
                }
            }
            if (isAdStillPresentAfterTimeout) {
                 (this.logger.warn || this.logger.warning).call(this.logger, 'Max ad watch duration reached in ad handling loop, ad might still be playing.');
            } else {
                 this.logger.info('Ad handling loop ended (max duration or ad disappeared), ad indicators no longer visible.');
            }
        }
        this.logger.info('Exiting ad handling logic for this cycle.');
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
            if (!videoState.p && videoState.rs >= 3 && !videoState.ended) { // Playing and has data
                logFn(`Video is already playing (attempt ${attempt + 1}). RS:${videoState.rs}, NS:${videoState.networkState}, Time:${videoState.currentTime?.toFixed(1)}`);
                return true;
            }

            logFn(`Video state (attempt ${attempt + 1}): Paused=${videoState.p}, Ended=${videoState.ended}, RS=${videoState.rs}, NS=${videoState.networkState}, Muted=${videoState.muted}, Volume=${videoState.volume?.toFixed(2)}, Time=${videoState.currentTime?.toFixed(1)}, Dim=${videoState.videoWidth}x${videoState.videoHeight}. Trying strategies...`);

            // Strategy 0: If paused at start with enough data, try JS play first
            if (videoState.p && videoState.rs >= 3 && !videoState.ended && videoState.currentTime < 1) {
                logFn('Video loaded but paused at start. Attempting JS play().');
                await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.play().catch(e => console.warn("JS play() initial error:", e.message)));
                await sleep(500 + nodeJsRandom(300));
                let stillPaused = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.paused).catch(() => true);
                if (!stillPaused) {
                    logFn('Video now playing after initial JS play() for paused-at-start.');
                    return true;
                }
                logFn('Still paused after initial JS play(). Proceeding with other strategies.');
            }


            if (videoState.muted) { // Strategy 1: Unmute
                try {
                    await this.page.evaluate(() => {
                        const video = document.querySelector('video.html5-main-video');
                        if (video) { video.muted = false; video.volume = 0.01 + Math.random() * 0.09; } // Low, non-zero volume
                    });
                    logFn(`Attempted to unmute video and set volume to ${((await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.volume || 0))*100).toFixed(0)}%`);
                    await sleep(500);
                    const unmutedState = await this.page.evaluate(() => {const v=document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended, m:v.muted} : {p:true,rs:0,e:true,m:true};}).catch(()=>({p:true,rs:0,e:true,m:true}));
                    if (!unmutedState.p && unmutedState.rs >=3 && !unmutedState.e) {
                        logFn('Video started playing after unmute.'); return true;
                    }
                    if (!unmutedState.m) logFn('Video successfully unmuted.'); else logFn('Video still muted after attempt.', 'warn');
                } catch (e) { logFn(`Failed to unmute video: ${e.message}`, 'debug'); }
            }

            // Strategy 2: Click known play buttons
            const bigPlayButtonSelectors = [ '.ytp-large-play-button', '.ytp-play-button[aria-label="Play"]', '.ytp-cued-thumbnail-overlay', '.ytp-cued-thumbnail-overlay-image', 'button[aria-label="Play"]', '.ytp-large-play-button-bg'];
            for (const selector of bigPlayButtonSelectors) {
                try {
                    const playBtn = this.page.locator(selector).first();
                    if (await playBtn.isVisible({timeout: 500 + (attempt * 100)})) {
                        await playBtn.click({timeout: 2000, force: false, delay: nodeJsRandom(50, 100)}); // Try non-forced click
                        logFn(`Clicked play button: ${selector}`);
                        await sleep(1500 + nodeJsRandom(500));
                        const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                        if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after clicking ${selector}. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                    }
                } catch (e) { logFn(`Failed to click ${selector}: ${e.message.split('\n')[0]}`, 'debug'); }
            }

            // Strategy 3: Focus player and press Space
            try {
                const playerElement = this.page.locator('#movie_player, .html5-video-player, body').first(); // Include body as last resort
                if (await playerElement.isVisible({timeout: 500})) {
                    await playerElement.focus({timeout: 1000}).catch(e => logFn(`Focus failed for playerElement: ${e.message}`, 'debug'));
                    await this.page.keyboard.press('Space', {delay: nodeJsRandom(50,150)});
                    logFn('Focused player/body and pressed Space key');
                    await sleep(1000 + nodeJsRandom(300));
                    const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                    if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after Space key. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                }
            } catch (e) { logFn(`Failed to focus player and press Space: ${e.message.split('\n')[0]}`, 'debug'); }

            // Strategy 4: Click center of video element
            try {
                const videoElement = this.page.locator('video.html5-main-video').first();
                if (await videoElement.isVisible({timeout: 500})) {
                    const box = await videoElement.boundingBox({timeout:1000});
                    if (box && box.width > 0 && box.height > 0) {
                        await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {delay: nodeJsRandom(50,100)});
                        logFn('Clicked center of video element');
                        await sleep(1200 + nodeJsRandom(300));
                        const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                        if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after center click. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                    } else { logFn('Video element bounding box not valid for click.', 'debug'); }
                }
            } catch (e) { logFn(`Failed to click video center: ${e.message.split('\n')[0]}`, 'debug'); }

            // Strategy 5: Direct JS play() if paused
            if (videoState.p && !videoState.ended) {
                try {
                    await this.page.evaluate(() => {
                        const video = document.querySelector('video.html5-main-video');
                        if (video) {
                            if (video.muted) { video.muted = false; video.volume = 0.01 + Math.random() * 0.09; } // Ensure unmuted with low volume
                            const playPromise = video.play();
                            if (playPromise !== undefined) {
                                playPromise.then(() => { console.log('[In-Page] Video play() initiated via JS'); }).catch(error => { console.warn('[In-Page] Video play() via JS failed:', error.message,'. Trying to click video after short delay.'); setTimeout(() => video.click(), 100); });
                            } else { console.warn('[In-Page] video.play() did not return a promise. Clicking.'); video.click(); }
                        }
                    });
                    logFn('Attempted JS video.play() or video.click()');
                    await sleep(1500 + nodeJsRandom(300)); // Increased delay for JS play to take effect
                    const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                    if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after JS play()/click combination. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                } catch (e) { logFn(`JS play()/click eval error: ${e.message.split('\n')[0]}`, 'debug'); }
            }

            // Strategy 6: Press "k" key again (if not already playing)
            try { 
                await this.page.locator('body').press('k', {delay: nodeJsRandom(50,150)}); // Press 'k' to toggle play/pause
                logFn('Pressed "k" key again to toggle play/pause');
                await sleep(1000 + nodeJsRandom(300));
                const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after second "k" key. Time: ${tempState.ct?.toFixed(1)}`); return true;}
            } catch (e) { logFn(`Failed to press "k" key (second time): ${e.message.split('\n')[0]}`, 'debug'); }

            // Strategy 7 (Final attempt in loop): Aggressive overlay removal and double click
            if (attempt === 2 && videoState.p) { // Only on the last attempt if still paused
                logFn('Final attempt in ensureVideoPlaying - trying aggressive overlay removal and dblclick', 'warn');
                await this.page.evaluate(() => {
                    const overlays = document.querySelectorAll('.ytp-gradient-top, .ytp-gradient-bottom, .ytp-chrome-top, .ytp-chrome-bottom, .ytp-impression-link, .ytp-popup, .ytp-cued-thumbnail-overlay');
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

            if (attempt < 2) await sleep(2000 + attempt * 1000); // Wait longer between attempts
        }
        
        logFn('Failed to ensure video is playing after multiple attempts.', 'warn');
        return false;
    }

    async attemptPlaybackRecovery() {
        this.logger.warn('Attempting playback recovery by reloading with autoplay parameter...');
        let success = false;
        try {
            const currentUrl = this.page.url();
            const urlObj = new URL(currentUrl);
            urlObj.searchParams.set('autoplay', '1'); // Common autoplay param
            urlObj.searchParams.set('mute', '0');     // Attempt to unmute
            
            this.logger.info(`Navigating to recovery URL: ${urlObj.toString()}`);
            // Use 'load' or 'networkidle' for recovery to ensure more complete page state
            await this.page.goto(urlObj.toString(), { waitUntil: 'networkidle', timeout: this.effectiveInput.timeout * 1000 * 0.8 });
            await sleep(2000 + nodeJsRandom(1000)); // Longer sleep after full reload
            
            await handleYouTubeConsent(this.page, this.logger.child({prefix: 'RecoveryConsent: '}), 1, 2); // Re-check consent, allow retries
            await waitForVideoToLoad(this.page, this.logger.child({prefix: 'RecoveryLoad: '}), 60000); // Increased timeout

            const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];
            success = await this.ensureVideoPlaying(playButtonSelectors, 'recovery-reload-autoplay');
            
            if (success) {
                this.logger.info('Playback recovery successful!');
                 await setVideoQualityToLowest(this.page, this.logger.child({prefix: 'RecoveryQuality: '})); // Set quality after successful recovery
            }
        } catch (e) {
            this.logger.error(`Playback recovery method itself failed: ${e.message}`);
        }
        
        if(!success) this.logger.warn('Playback recovery method (autoplay reload) did not succeed.');
        return success;
    }

    async watchVideo() {
        if (!this.page || this.page.isClosed()) throw new Error('Page not initialized/closed for watching.');

        const videoDurationSeconds = this.job.video_info.duration;
        const targetWatchPercentage = this.effectiveInput.watchTimePercentage;
        const targetVideoPlayTimeSeconds = Math.max(10, (targetWatchPercentage / 100) * videoDurationSeconds);
        const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];

        this.logger.info(`Watch target: ${targetWatchPercentage}% of ${videoDurationSeconds.toFixed(0)}s = ${targetVideoPlayTimeSeconds.toFixed(0)}s. URL: ${this.job.videoUrl}`);

        const overallWatchStartTime = Date.now();
        // Adjusted maxOverallWatchDurationMs
        const estimatedAdCycles = Math.max(1, Math.ceil(targetVideoPlayTimeSeconds / 90));
        const maxOverallWatchDurationMs = (targetVideoPlayTimeSeconds * 1000) + (this.effectiveInput.maxSecondsAds * 1000 * estimatedAdCycles) + 60000; // Target + N ad cycles + 1 min buffer
        this.logger.info(`Calculated maxOverallWatchDurationMs: ${(maxOverallWatchDurationMs/1000).toFixed(0)}s`);


        const checkIntervalMs = 1000; 

        let consecutiveStallChecks = 0;
        const MAX_STALL_CHECKS_BEFORE_RECOVERY = 10; 
        let recoveryAttemptsThisJob = 0;
        const MAX_RECOVERY_ATTEMPTS_PER_JOB = 2; 

        let lastProgressTimestamp = Date.now();
        let lastKnownGoodVideoTime = 0;
        this.maxTimeReachedThisView = 0;
        let currentActualVideoTime = 0;
        this.lastLoggedVideoTime = -10; // Initialize to ensure first proper log

        let adCheckCooldownMs = 0;
        const AD_CHECK_INTERVAL_WHEN_NO_AD = 5000; 
        const AD_CHECK_INTERVAL_DURING_AD = 1500;
        
        let mouseMoveCooldownMs = Date.now() + nodeJsRandom(15000, 30000); // Initial mouse move after some time


        while (!this.killed) {
            const loopIterationStartTime = Date.now();
            const loopNumber = Math.floor((Date.now() - overallWatchStartTime) / checkIntervalMs);


            if (this.page.isClosed()) { (this.logger.warn || this.logger.warning).call(this.logger, 'Page closed during watch loop.'); break; }
            if (Date.now() - overallWatchStartTime > maxOverallWatchDurationMs) {
                (this.logger.warn || this.logger.warning).call(this.logger, `Max watch duration for this video exceeded (${((Date.now() - overallWatchStartTime)/1000).toFixed(0)}s / ${(maxOverallWatchDurationMs/1000).toFixed(0)}s). Ending.`); break;
            }

            // Ad Handling
            if (this.job.platform === 'youtube' && Date.now() >= adCheckCooldownMs) {
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
            
            // Mouse Movement
            if (Date.now() >= mouseMoveCooldownMs) {
                await simulateMouseMovement(this.page, this.logger);
                mouseMoveCooldownMs = Date.now() + nodeJsRandom(20000, 45000); // Next mouse move
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
                        this.lastLoggedVideoTime = -10;
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
                    const playAttemptSuccess = await this.ensureVideoPlaying(playButtonSelectors, 'paused-resume');
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
                        this.lastLoggedVideoTime = -10; 
                    }
                }

                if (isStalledThisCheck) {
                    consecutiveStallChecks++; 
                    (this.logger.warn || this.logger.warning).call(this.logger, `Playback stall detected OR ensureVideoPlaying failed. Stalls checks: ${consecutiveStallChecks}. RS: ${videoState?.rs}, NS: ${videoState?.ns}, CT: ${currentActualVideoTime.toFixed(1)}`);
                    
                    if (Actor.isAtHome()) {
                        try {
                            const stallTime = new Date().toISOString().replace(/[:.]/g, '-');
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
                            if(recoveryActionSuccess) await handleYouTubeConsent(this.page, this.logger.child({prefix: 'PostRecovery1Consent:'}), 1, 2);
                        } else if (recoveryAttemptsThisJob === 2) {
                            this.logger.info('Recovery 2: Attempting navigate to youtube.com homepage and back.');
                            const currentUrlForRecovery = this.job.videoUrl;
                            const intermediateUrl = 'https://www.youtube.com/';
                            try {
                                await this.page.goto(intermediateUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                                await sleep(nodeJsRandom(2500, 5000));
                                await handleYouTubeConsent(this.page, this.logger.child({prefix: 'RecoveryConsentHomePage:'}), 1, 2);
                                await this.page.goto(currentUrlForRecovery, { waitUntil: 'networkidle', timeout: this.effectiveInput.timeout * 1000 * 0.7 });
                                await handleYouTubeConsent(this.page, this.logger.child({prefix: 'PostRecovery2Consent:'}), 1, 2);
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
                            // No need to call handleYouTubeConsent here if called within recovery method
                            await waitForVideoToLoad(this.page, this.logger.child({prefix: 'PostRecoveryLoad:'}), 60000).catch(e => {
                                this.logger.warn(`Video failed to load properly after recovery action ${recoveryAttemptsThisJob}: ${e.message}`);
                                if (recoveryAttemptsThisJob >= MAX_RECOVERY_ATTEMPTS_PER_JOB) throw new Error(`Video load failed after final recovery attempt ${recoveryAttemptsThisJob}.`);
                                recoveryActionSuccess = false;
                            });
                            
                            if (recoveryActionSuccess) {
                                await sleep(nodeJsRandom(1500, 3000));
                                if (this.job.platform === 'youtube') { // Set quality again after recovery
                                    await setVideoQualityToLowest(this.page, this.logger.child({prefix: 'PostRecoveryQuality:'}));
                                }
                                const playSuccess = await this.ensureVideoPlaying(playButtonSelectors, `post-recovery-${recoveryAttemptsThisJob}`);
                                if (!playSuccess) {
                                    this.logger.error(`Recovery attempt ${recoveryAttemptsThisJob} failed to restart playback definitively after action.`);
                                    if (recoveryAttemptsThisJob >= MAX_RECOVERY_ATTEMPTS_PER_JOB) throw new Error(`Recovery attempt ${recoveryAttemptsThisJob} failed to restart playback.`);
                                } else {
                                    lastKnownGoodVideoTime = 0; this.maxTimeReachedThisView = 0;
                                    currentActualVideoTime = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime || 0).catch(()=>0);
                                    lastKnownGoodVideoTime = currentActualVideoTime; this.maxTimeReachedThisView = currentActualVideoTime;
                                    lastProgressTimestamp = Date.now(); this.lastLoggedVideoTime = -10;
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
                if (e.message.includes('Target closed') || e.message.includes('Protocol error') || e.message.includes('Navigation failed')) {
                    (this.logger.warn || this.logger.warning).call(this.logger, `Watch loop error (Target closed/Protocol/Nav): ${e.message}`); throw e;
                }
                 (this.logger.warn || this.logger.warning).call(this.logger, `Video state eval/check error: ${e.message.split('\n')[0]}`);
                 if (e.message.includes('all recovery attempts exhausted') || e.message.includes('Recovery by navigation failed definitively') || e.message.includes('failed to restart playback') || e.message.includes('Video Player Error Code') || e.message.includes('Fatal Video Player Error Code')) throw e;
                 await sleep(checkIntervalMs); continue;
            }
            
            if (videoState && videoState.e) { this.logger.info('Video playback naturally ended.'); break; }
            if (this.maxTimeReachedThisView >= targetVideoPlayTimeSeconds) {
                this.logger.info(`Target watch time reached. Max Reached: ${this.maxTimeReachedThisView.toFixed(1)}s`); break;
            }
            
            // Random mouse movements - adjusted frequency
            if (loopNumber > 3 && loopNumber % nodeJsRandom(15, 25) === 0 && Math.random() < 0.4) {
                await simulateMouseMovement(this.page, this.logger);
            }

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

    async kill() {
        this.killed = true;
        this.logger.info('Kill signal received. Closing resources.');
        try {
            if (this.page && !this.page.isClosed()) {
                await this.page.close({timeout: 5000}).catch(e => (this.logger.warn || this.logger.warning).call(this.logger, `Page close error: ${e.message}`));
            }
        } catch(e){ (this.logger.warn || this.logger.warning).call(this.logger, `Error during page close: ${e.message}`); }
        this.page = null;
        try {
            if (this.context) {
                await this.context.close().catch(e => (this.logger.warn || this.logger.warning).call(this.logger, `Context close error: ${e.message}`));
            }
        } catch(e){ (this.logger.warn || this.logger.warning).call(this.logger, `Error during context close: ${e.message}`); }
        this.context = null;
        try {
            if (this.browser) {
                await this.browser.close({timeout: 10000}).catch(e => (this.logger.warn || this.logger.warning).call(this.logger, `Browser close error: ${e.message}`));
            }
        } catch(e){ (this.logger.warn || this.logger.warning).call(this.logger, `Error during browser close: ${e.message}`); }
        this.browser = null;
        this.logger.info('Resources attempted to be closed.');
    }
}

// --- Main Actor Logic ---
async function actorMainLogic() {
    console.log('DEBUG: actorMainLogic started.');
    let actorLog; // Declare here, assign after Actor.init()

    try {
        await Actor.init(); // Initialize Actor first
        console.log('DEBUG: Actor.init() completed successfully.');

        // Now try to get the logger
        if (Actor.log && typeof Actor.log.info === 'function') {
            actorLog = Actor.log;
            console.log('INFO: Logger obtained successfully via standard Actor.log. Testing it...');
            actorLog.info('DEBUG: Standard Actor.log test successful.');
        } else {
            // Fallback if Actor.log is not what we expect (e.g., in some local testing environments)
            console.warn('DEBUG: Standard Actor.log was undefined or invalid. Attempting fallback via _instance...');
            if (Actor._instance && Actor._instance.apifyClient && Actor._instance.apifyClient.logger && typeof Actor._instance.apifyClient.logger.info === 'function') {
                actorLog = Actor._instance.apifyClient.logger;
                console.log('INFO: Successfully obtained logger from Actor._instance.apifyClient.logger. Testing it...');
                actorLog.info('DEBUG: Logger obtained via Actor._instance.apifyClient.logger and tested.');
            } else {
                console.error('CRITICAL DEBUG: Could not obtain logger from Actor.log OR Actor._instance.apifyClient.logger. Dumping Actor object:');
                console.dir(Actor, { depth: 3 }); // Log the Actor object for inspection
                throw new Error("All attempts to obtain a valid Apify logger failed.");
            }
        }
    } catch (initError) {
        console.error('CRITICAL DEBUG: Actor.init() FAILED or subsequent logger acquisition failed:', initError);
        // Attempt to fail the actor run if Actor.fail is available
        if (Actor && Actor.isAtHome && typeof Actor.isAtHome === 'function' && Actor.fail && typeof Actor.fail === 'function') {
            try { await Actor.fail(`Actor.init() or logger acquisition failed: ${initError.message}`); }
            catch (failError) { console.error('CRITICAL DEBUG: Actor.fail() also failed:', failError); }
        }
        process.exit(1); // Exit if init fails catastrophically
    }

    // Final check for logger validity
    if (!actorLog || typeof actorLog.info !== 'function' || !(typeof actorLog.warn === 'function' || typeof actorLog.warning === 'function')) {
        console.error('CRITICAL DEBUG: actorLog is STILL UNDEFINED or not a valid logger after all attempts!');
        const fallbackLogger = getSafeLogger(undefined); // Use the safe fallback
        fallbackLogger.error("actorMainLogic: Using fallback logger because all attempts to get Apify logger failed (final check).");
        if (typeof Actor.fail === 'function') { await Actor.fail("Apify logger could not be initialized (final check)."); }
        else { console.error("CRITICAL: Actor.fail is not available. Exiting."); process.exit(1); }
        return; // Should not be reached if Actor.fail works or process.exit works
    }
    // Ensure .warn is available, aliasing .warning if needed
    if (typeof actorLog.warn !== 'function' && typeof actorLog.warning === 'function') {
        actorLog.warn = actorLog.warning;
    }


    actorLog.info('ACTOR_MAIN_LOGIC: Starting YouTube View Bot (v1.9.5 - Enhanced).');
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
        headless: Actor.isAtHome() ? false : true, // Default headless based on Apify env
        concurrency: 1, concurrencyInterval: 5, timeout: 180, // Increased default timeout
        maxSecondsAds: 20, // Default
        skipAdsAfter: ["5", "10"], // Default range
        autoSkipAds: true, stopSpawningOnOverload: true,
        // customAntiDetection: true, // This was in your original schema, fingerprinting now more integrated
        useAV1: false, // Default from schema
    };
    const effectiveInput = { ...defaultInputFromSchema, ...input };
    effectiveInput.headless = !!effectiveInput.headless; // Ensure boolean


    // Parse skipAdsAfter carefully
    let tempSkipAds = effectiveInput.skipAdsAfter;
    if (Array.isArray(tempSkipAds) && tempSkipAds.length > 0 && tempSkipAds.every(s => typeof s === 'string' || typeof s === 'number')) {
        const parsedSkipAds = tempSkipAds.map(s => parseInt(String(s), 10)).filter(n => !isNaN(n) && n >= 0);
        if (parsedSkipAds.length === 1) effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[0] + 5];
        else if (parsedSkipAds.length >= 2) effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[1]];
        else effectiveInput.skipAdsAfter = [5, 12]; // Fallback default
    } else {
        effectiveInput.skipAdsAfter = [5, 12]; // Fallback default if input is malformed
    }
    // Ensure min is not greater than max
    if (effectiveInput.skipAdsAfter[0] > effectiveInput.skipAdsAfter[1]) {
        effectiveInput.skipAdsAfter[1] = effectiveInput.skipAdsAfter[0] + 5;
    }
    effectiveInput.maxSecondsAds = Number(effectiveInput.maxSecondsAds);
    if(isNaN(effectiveInput.maxSecondsAds) || effectiveInput.maxSecondsAds < 0) {
        effectiveInput.maxSecondsAds = 20; // Default if invalid
    }

    actorLog.info('ACTOR_MAIN_LOGIC: Effective input (summary):', { videos: effectiveInput.videoUrls.length, proxy: effectiveInput.proxyCountry, headless: effectiveInput.headless, watchPercent: effectiveInput.watchTimePercentage, skipAdsAfter: effectiveInput.skipAdsAfter, maxSecondsAds: effectiveInput.maxSecondsAds, timeout: effectiveInput.timeout, useAV1: effectiveInput.useAV1 });

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
        } catch (e) { actorLog.error(`Failed Apify Proxy config: ${e.message}. Continuing without Apify system proxy for this run.`); actorProxyConfiguration = null; }
    }

    const jobs = [];
    const defaultSearchProfileForUA = getProfileByCountry('US'); // For a generic search UA
    const userAgentStringsForSearch = [ // A small pool for variation
        defaultSearchProfileForUA.userAgent,
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        // Add more diverse but common UAs if needed
    ];


    for (let i = 0; i < effectiveInput.videoUrls.length; i++) {
        const url = effectiveInput.videoUrls[i];
        const videoId = extractVideoIdFromUrl(url, actorLog); // Updated to handle Rumble
        if (!videoId) { (actorLog.warn || actorLog.warning).call(actorLog, `Invalid YouTube/Rumble URL/ID: "${url}". Skipping.`); await Actor.pushData({ url, status: 'error', error: 'Invalid Video URL' }); continue; }

        const watchType = (effectiveInput.watchTypes && effectiveInput.watchTypes[i]) || 'direct';
        const refererUrl = (watchType === 'referer' && effectiveInput.refererUrls && effectiveInput.refererUrls[i] && effectiveInput.refererUrls[i].trim() !== "")
            ? effectiveInput.refererUrls[i].trim()
            : null;

        let searchKeywords = [];
        if (watchType === 'search' && effectiveInput.searchKeywordsForEachVideo && typeof effectiveInput.searchKeywordsForEachVideo[i] === 'string') {
            searchKeywords = effectiveInput.searchKeywordsForEachVideo[i].split(',').map(kw => kw.trim()).filter(kw => kw.length > 0);
        }

        jobs.push({
            id: uuidv4(), videoUrl: url, videoId, platform: url.includes('rumble.com') ? 'rumble' : 'youtube',
            referer: refererUrl, video_info: { duration: 300, isLive: false }, // Duration will be updated
            watch_time: effectiveInput.watchTimePercentage, jobIndex: i,
            watchType, searchKeywords
        });
    }

    if (jobs.length === 0) { actorLog.error('No valid jobs to process.'); await Actor.fail('No valid jobs to process.'); return; }
    actorLog.info(`ACTOR_MAIN_LOGIC: Created ${jobs.length} job(s). Concurrency: ${effectiveInput.concurrency}`);

    const overallResults = { totalJobs: jobs.length, successfulJobs: 0, failedJobs: 0, details: [], startTime: new Date().toISOString() };
    const activeWorkers = new Set();
    let jobCounter = 0;

    const processJob = async (job) => {
        const jobLogger = actorLog.child({ prefix: `Job-${job.videoId.substring(0,4)}-${job.id.substring(0,4)}: ` });
        if (typeof jobLogger.warn !== 'function' && typeof jobLogger.warning === 'function') {
            jobLogger.warn = jobLogger.warning;
        }

        jobLogger.info(`Starting job ${job.jobIndex + 1}/${jobs.length}, Platform: ${job.platform}, Type: ${job.watchType}, Referer: ${job.referer || 'None'}`);
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
                const sessionId = `session_${job.id.substring(0, 12).replace(/-/g, '')}`; // Create a more unique session ID
                try {
                    proxyUrlString = await actorProxyConfiguration.newUrl(sessionId);
                    proxyInfoForLog = `ApifyProxy (Session: ${sessionId}, Country: ${effectiveInput.proxyCountry || 'Any'})`;
                     jobLogger.info(`Using Apify proxy: ${proxyInfoForLog}`);
                } catch (proxyError) {
                    jobLogger.error(`Failed to get new Apify proxy URL: ${proxyError.message}`);
                    proxyUrlString = null; proxyInfoForLog = 'ProxyAcquisitionFailed';
                }
            } else { jobLogger.warn(`Proxies enabled but no configuration found or failed to init.`); }
        }

        if (job.platform === 'youtube' && job.watchType === 'search' && job.searchKeywords && job.searchKeywords.length > 0) {
            jobLogger.info(`Attempting YouTube search for: "${job.searchKeywords.join(', ')}" to find ID: ${job.videoId}`);
            let searchBrowser = null, searchContext = null, searchPage = null;
            const searchLaunchOptions = { headless: effectiveInput.headless, args: [...ANTI_DETECTION_ARGS] }; 
             // Remove default window size if it was set by ANTI_DETECTION_ARGS to allow profile-specific one
             if (searchLaunchOptions.args.find(arg => arg.startsWith('--window-size='))) {
                searchLaunchOptions.args = searchLaunchOptions.args.filter(arg => !arg.startsWith('--window-size='));
            }

            if(proxyUrlString) { // Use the same proxy for search if available
                try {
                    const p = new URL(proxyUrlString);
                    searchLaunchOptions.proxy = { server: `${p.protocol}//${p.hostname}:${p.port}`, username: p.username?decodeURIComponent(p.username):undefined, password: p.password?decodeURIComponent(p.password):undefined };
                } catch(e){ jobLogger.warn('Failed to parse proxy for search browser, search will be direct.'); }
            }
            try {
                const searchUserAgent = userAgentStringsForSearch[nodeJsRandom(0, userAgentStringsForSearch.length-1)];
                
                // Use a specific fingerprint profile for search, but override UA for variation
                const searchFingerprintProfile = getProfileByCountry(effectiveInput.proxyCountry);
                searchFingerprintProfile.userAgent = searchUserAgent; // Override for this search
                searchLaunchOptions.args.push(`--window-size=${searchFingerprintProfile.screen.width},${searchFingerprintProfile.screen.height}`);
                
                searchBrowser = await playwright.chromium.launch(searchLaunchOptions);


                searchContext = await searchBrowser.newContext({ 
                    userAgent: searchFingerprintProfile.userAgent,
                    locale: searchFingerprintProfile.locale,
                    timezoneId: searchFingerprintProfile.timezoneId,
                    screen: { // Match profile
                        width: searchFingerprintProfile.screen.width,
                        height: searchFingerprintProfile.screen.height,
                    },
                    viewport: { // Adjust for headless or match screen
                        width: effectiveInput.headless ? 1920 : searchFingerprintProfile.screen.width,
                        height: effectiveInput.headless ? 1080 : searchFingerprintProfile.screen.height,
                    },
                    ignoreHTTPSErrors: true,
                });

                // Custom scripts SKIPPED for search in this config
                jobLogger.info('SearchAntiDetect: Custom scripts SKIPPED (v1.9.5 - replicating b0zDz9AEx6U1cx1N2 baseline).');


                searchPage = await searchContext.newPage();

                const searchQuery = job.searchKeywords[nodeJsRandom(0, job.searchKeywords.length - 1)];
                const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
                jobLogger.info(`Navigating to search URL: ${youtubeSearchUrl}`);
                await searchPage.goto(youtubeSearchUrl, { waitUntil: 'domcontentloaded', timeout: effectiveInput.timeout * 1000 }); 
                await handleYouTubeConsent(searchPage, jobLogger.child({prefix: 'SearchConsent: '}), 1, 2);
                
                jobLogger.info('enableAutoplayWithInteraction SKIPPED for search stability test (v1.9.5).');

                const videoLinkSelector = `a#video-title[href*="/watch?v=${job.videoId}"]`;
                jobLogger.info(`Looking for video link: ${videoLinkSelector}`);
                
                // Scroll a few times to load more results
                const scrollCount = nodeJsRandom(2,4);
                for(let k=0; k < scrollCount; k++) {
                    const scrollRatio = Math.random() * (0.7 - 0.3) + 0.3; // Scroll 30-70% of viewport height
                    await searchPage.evaluate((ratio) => window.scrollBy(0, window.innerHeight * ratio), scrollRatio);
                    await sleep(500 + nodeJsRandom(100, 500));
                }

                const videoLinkElement = searchPage.locator(videoLinkSelector).first();
                let videoLinkVisible = false;
                try {
                    await videoLinkElement.waitFor({ state: 'visible', timeout: 10000 }); // Wait for link
                    videoLinkVisible = true;
                } catch {
                    jobLogger.info('Direct video link not immediately visible, trying "Videos" filter if present...');
                    const videosFilterButton = searchPage.locator('yt-chip-cloud-chip-renderer:has-text("Videos"), yt-chip-cloud-chip-renderer[aria-label="Search for Videos"]').first();
                     if (await videosFilterButton.isVisible({timeout: 3000}).catch(() => false)) {
                        await videosFilterButton.click({force: true, timeout: 3000}).catch(e => jobLogger.warn(`Failed to click Videos filter: ${e.message}`));
                        await searchPage.waitForTimeout(nodeJsRandom(2000,4000)); // wait for filter to apply
                        jobLogger.info('Clicked "Videos" filter. Re-checking for video link.');
                        await videoLinkElement.waitFor({ state: 'visible', timeout: 15000 }); // Longer wait after filter
                        videoLinkVisible = true;
                    } else {
                         jobLogger.warn('"Videos" filter not found.');
                    }
                }
                
                if (videoLinkVisible) {
                    const href = await videoLinkElement.getAttribute('href');
                    if (href) {
                        const fullVideoUrl = (href.startsWith('http') ? href : `https://www.youtube.com${href}`);
                        const currentSearchPageUrl = searchPage.url();
                        const linkTitle = await videoLinkElement.textContent().catch(() => 'N/A');
                        // More robust check: exact ID match in href
                        if (href.includes(job.videoId)) {
                            jobLogger.info(`Video found via search: ${fullVideoUrl}. Title: ${linkTitle}. Updating job URL and referer.`);
                            job.videoUrl = fullVideoUrl; // Update the job's URL to the one found
                            job.referer = currentSearchPageUrl; // Set referer to the search results page
                        } else {
                             jobLogger.warn(`Found video link (href: ${href}, title: ${linkTitle}), but ID ${job.videoId} not matched in href. Proceeding with original/direct URL for safety.`);
                        }
                    } else {
                        jobLogger.warn('Found video link element but href was null. Proceeding with original URL.');
                    }
                } else {
                     jobLogger.warn(`Video link with ID ${job.videoId} not found after search and optional filtering.`);
                }

            } catch (searchError) {
                jobLogger.error(`YouTube search failed: ${searchError.message}. Falling back to direct URL: ${job.videoUrl}`);
                 if (Actor.isAtHome()) { // Save screenshot only on Apify platform
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
            platform: job.platform,
            status: 'initiated', proxyUsed: proxyInfoForLog, refererRequested: job.referer,
            watchTypePerformed: job.watchType,
            fingerprintProfileKey: worker.fingerprintProfile.profileKeyName || 'N/A',
            error: null,
            lastReportedVideoTimeSeconds: 0,
            targetVideoPlayTimeSeconds: 0,
            videoDurationSeconds: 0
        };

        try {
            await worker.startWorker(); // This will throw if it critically fails (e.g., duration not found)
            // video_info.duration is now set within startWorker if successful
            jobResultData.targetVideoPlayTimeSeconds = Math.max(10, (effectiveInput.watchTimePercentage / 100) * worker.job.video_info.duration);
            jobResultData.videoDurationSeconds = worker.job.video_info.duration;

            const watchResult = await worker.watchVideo();
            Object.assign(jobResultData, watchResult); // Merge results from watchVideo

            // Check if watch time target was met
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
            jobResultData.lastReportedVideoTimeSeconds = worker.maxTimeReachedThisView; // Report max time even on error
            if (worker.job && worker.job.video_info && worker.job.video_info.duration) { // Ensure duration is available
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
        // Concurrency control
        while (activeWorkers.size >= effectiveInput.concurrency) {
            (actorLog.warning || actorLog.warn).call(actorLog, `Concurrency limit ${effectiveInput.concurrency} reached (active: ${activeWorkers.size}). Waiting for a slot.`);
            try {
                 await Promise.race(Array.from(activeWorkers)); // Wait for any active worker to finish
            } catch (e) {
                 // This error is from a worker that already failed and was handled.
                 actorLog.debug(`Error during Promise.race (worker slot wait), likely already handled: ${e.message.substring(0,100)}`);
            }
        }

        const promise = processJob(job).catch(e => {
            // This catch is a safety net for unhandled rejections directly from processJob
            actorLog.error(`Unhandled error directly from processJob promise for ${job.videoId}: ${e.message}`);
            const errorResult = { 
                jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId, 
                status: 'catastrophic_processJob_failure', 
                error: e.message  + (e.stack ? ` | STACK: ${e.stack.substring(0,200)}` : '')
            };
            Actor.pushData(errorResult).catch(pushErr => console.error("Failed to pushData for catastrophic failure:", pushErr));
            overallResults.failedJobs++; // Ensure this is counted even if not pushed to details correctly
            if (!overallResults.details.find(d => d.jobId === job.id)) { // Avoid duplicates if already pushed
                overallResults.details.push(errorResult);
            }
        }).finally(() => {
            activeWorkers.delete(promise); // Remove from active set when done
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
        // Log again here just in case some errors were missed or re-thrown
        actorLog.error(`Error caught by final Promise.all on a worker promise (should have been handled earlier): ${e.message}`);
        return e; // Ensure Promise.all doesn't reject prematurely
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
