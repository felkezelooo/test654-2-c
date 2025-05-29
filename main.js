const Apify = require('apify');
const { Actor } = Apify;

const playwright = require('playwright');
const { v4: uuidv4 } = require('uuid');
const { URL } = require('url');

// --- Fingerprint Profiles ---
Date.prototype.isDstActive = function(tz = "America/New_York") {
    const now = new Date(this.valueOf());
    const currentYear = now.getFullYear();
    if (tz.startsWith('Europe/')) {
        // Europe: DST from last Sunday in March to last Sunday in October
        const marchLastSunday = new Date(Date.UTC(currentYear, 2, 31)); // March 31st
        marchLastSunday.setUTCDate(marchLastSunday.getUTCDate() - marchLastSunday.getUTCDay()); // Backtrack to Sunday
        const octoberLastSunday = new Date(Date.UTC(currentYear, 9, 31)); // October 31st
        octoberLastSunday.setUTCDate(octoberLastSunday.getUTCDate() - octoberLastSunday.getUTCDay()); // Backtrack to Sunday
        return now >= marchLastSunday && now < octoberLastSunday;
    }
    if (tz.startsWith('America/')) { // Covers US and Canada by common rule
        // US & Canada: DST from second Sunday in March to first Sunday in November
        let marchSecondSunday = new Date(Date.UTC(currentYear, 2, 1)); // March 1st
        let sundayCount = 0;
        for (let i = 1; i <= 14; i++) { // Check up to March 14th
            marchSecondSunday.setUTCDate(i);
            if (marchSecondSunday.getUTCDay() === 0) sundayCount++;
            if (sundayCount === 2) break;
        }
        let novemberFirstSunday = new Date(Date.UTC(currentYear, 10, 1)); // November 1st
        for (let i = 1; i <= 7; i++) { // Check up to November 7th
            novemberFirstSunday.setUTCDate(i);
            if (novemberFirstSunday.getUTCDay() === 0) break;
        }
        return now >= marchSecondSunday && now < novemberFirstSunday;
    }
    // Add other regions' DST rules if needed
    return false; // Default: No DST or timezone not recognized for DST
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
        plugins: [], mimeTypes: [], // Empty arrays, as per test1111's likely behavior
        locale: 'en-US',
        timezoneId: 'America/New_York', // Eastern Time
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? 240 : 300; }, // ET is UTC-5, EDT is UTC-4
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
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? -60 : 0; }, // BST is UTC+1, GMT is UTC+0
        screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
        webGLVendor: 'Google Inc. (AMD)',
        webGLRenderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
    'US_MAC_CHROME_M_SERIES': {
        profileKeyName: 'US_MAC_CHROME_M_SERIES',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        acceptLanguage: 'en-US,en;q=0.9',
        platform: 'MacIntel', // Common for macOS
        deviceMemory: 16,
        hardwareConcurrency: getRandomArrayItem([8, 10, 12]), // M-series chips have 8-12 cores commonly
        vendor: 'Apple Computer, Inc.',
         plugins: [], mimeTypes: [],
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles', // Pacific Time
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? 420 : 480; }, // PDT is UTC-7, PST is UTC-8
        screen: { width: 1728, height: 1117, availWidth: 1728, availHeight: 1079, colorDepth: 30, pixelDepth: 30 }, // Common MacBook Pro resolution
        webGLVendor: 'Apple',
        webGLRenderer: 'Apple M2 Pro', // Example, could be M1, M3 etc.
    },
    'HU_CHROME_WIN_INTEL': { // Hungarian profile
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
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? -120 : -60; }, // CEST is UTC+2, CET is UTC+1
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
    const deepCopy = (profile) => JSON.parse(JSON.stringify(profile)); // Ensure a deep copy
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
    // Ultimate fallback to a random profile if no US profiles exist (should not happen with current setup)
    const randomKey = getRandomProfileKeyName();
    console.warn(`No profile for country ${countryCode} or US, falling back to random profile: ${randomKey}`);
    return deepCopy(FINGERPRINT_PROFILES[randomKey]);
}

console.log('MAIN.JS: StealthPlugin application SKIPPED for v1.9.10 (replicating b0zDz9AEx6U1cx1N2 baseline).');


async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function getSafeLogger(loggerInstance) {
    const baseConsoleLogger = {
        info: (msg, data) => console.log(`CONSOLE_INFO: ${msg || ''}`, data || ''),
        warn: (msg, data) => console.warn(`CONSOLE_WARN: ${msg || ''}`, data || ''),
        warning: (msg, data) => console.warn(`CONSOLE_WARN: ${msg || ''}`, data || ''), // Alias for warn
        error: (msg, data) => console.error(`CONSOLE_ERROR: ${msg || ''}`, data || ''),
        debug: (msg, data) => console.log(`CONSOLE_DEBUG: ${msg || ''}`, data || ''), // Or console.debug
        exception: (e, msg, data) => console.error(`CONSOLE_EXCEPTION: ${msg || ''}`, e, data || ''),
        child: function(childOpts) {
            const newPrefix = (this.prefix || 'FALLBACK_CHILD') + (childOpts && childOpts.prefix ? childOpts.prefix : '');
            const childConsoleLogger = { prefix: newPrefix };
            for (const key in this) {
                if (typeof this[key] === 'function' && key !== 'child' && key !== 'prefix') {
                    childConsoleLogger[key] = (m, d) => this[key](`${newPrefix}${m || ''}`, d);
                } else if (key !== 'child' && key !== 'prefix') {
                    childConsoleLogger[key] = this[key];
                }
            }
            childConsoleLogger.child = function(opts) { return baseConsoleLogger.child.call(this, opts); }; // Ensure child can create more children
            return childConsoleLogger;
        }
    };

    if (loggerInstance &&
        typeof loggerInstance.info === 'function' &&
        (typeof loggerInstance.warn === 'function' || typeof loggerInstance.warning === 'function') && // Check for either warn or warning
        typeof loggerInstance.error === 'function' &&
        typeof loggerInstance.debug === 'function' &&
        typeof loggerInstance.child === 'function'
    ) {
        // If loggerInstance has .warning but not .warn, create .warn as an alias
        if (typeof loggerInstance.warn !== 'function' && typeof loggerInstance.warning === 'function') {
            loggerInstance.warn = loggerInstance.warning;
        }
        return loggerInstance;
    }

    // This warning should ideally only appear once if the main logger isn't set up correctly
    if (!getSafeLogger.hasWarnedOnceGetSafeLogger) { // Use a static property on the function to track warning
        console.error("GET_SAFE_LOGGER: Provided loggerInstance was invalid or incomplete. Falling back to basic console logger WITH dummy child support.");
        getSafeLogger.hasWarnedOnceGetSafeLogger = true;
    }
    return { ...baseConsoleLogger }; // Return a new object to prevent modification of the template
}
getSafeLogger.hasWarnedOnceGetSafeLogger = false; // Initialize the static property

function extractVideoIdFromUrl(url, logger) {
    const safeLogger = getSafeLogger(logger);
    try {
        const urlObj = new URL(url);
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            // Standard YouTube watch URL
            const vParam = urlObj.searchParams.get('v');
            if (vParam && vParam.length === 11) return vParam;

            // Shortened youtu.be URL
            const pathParts = urlObj.pathname.split('/');
            if (urlObj.hostname === 'youtu.be' && pathParts.length > 1 && pathParts[1].length === 11) return pathParts[1];

            // YouTube shorts, embed, or live URL
            if (pathParts.length > 2 && (pathParts[1] === 'shorts' || pathParts[1] === 'embed' || pathParts[1] === 'live') && pathParts[2].length === 11) return pathParts[2];

            // Fallback for some direct video paths without 'v' param
            if (pathParts.length > 1 && pathParts[1].length === 11 && !vParam) return pathParts[1];

        } else if (url.includes('rumble.com')) {
            const pathParts = urlObj.pathname.split('/');
            // Rumble URLs like /vXXXXX-video-title.html or /vXXXXX.html
            const videoPart = pathParts.find(part => part.match(/^v[a-zA-Z0-9]+(-.*\.html)?$/));
            if (videoPart) {
                return videoPart.split('-')[0]; // Takes the "vXXXXX" part
            }
        }
    } catch (error) {
        safeLogger.error(`Error extracting video ID from URL ${url}: ${error.message}`);
    }
    (safeLogger.warn || safeLogger.warning).call(safeLogger, `Could not extract valid YouTube/Rumble video ID from: ${url}`);
    return null;
}

async function handleYouTubeConsent(page, logger, attempt = 1, maxAttempts = 3) {
    const safeLogger = getSafeLogger(logger).child({ prefix: `ConsentA${attempt}: `});
    const currentUrl = page.url();
    safeLogger.info(`Checking on URL: ${currentUrl.substring(0, 100)}`);

    const isFullConsentPage = currentUrl.includes('consent.youtube.com');
    let interactionOccurred = false;

    if (isFullConsentPage) {
        safeLogger.info('Full consent page detected.');
        // Try to click "On" for YouTube History if not already selected
        try {
            const historyOnButton = page.locator('button[jsname="lW531d"][aria-pressed="false"]');
            if (await historyOnButton.isVisible({timeout: 2000}).catch(()=>false)) {
                safeLogger.info('Clicking "On" for YouTube History.');
                await historyOnButton.click({timeout: 2000, force: true}); await sleep(500 + nodeJsRandom(200));
            }
        } catch (e) { safeLogger.debug(`History "On" button error: ${e.message}`); }
        
        // Try to click "On" for Ad Personalisation if not already selected
        try {
            const adOnButton = page.locator('button[jsname="D1aKKb"][aria-pressed="false"]');
            if (await adOnButton.isVisible({timeout: 2000}).catch(()=>false)) {
                safeLogger.info('Clicking "On" for Ad Personalisation.');
                await adOnButton.click({timeout: 2000, force: true}); await sleep(500 + nodeJsRandom(200));
            }
        } catch (e) { safeLogger.debug(`Ad "On" button error: ${e.message}`); }

        const confirmSelectors = [
            'form[action*="consent.youtube.com/save"] button[jsname="j6LnYe"]', // "Confirm your settings"
            'form[action*="consent.youtube.com/save"] button:has-text("Confirm")',
            'button[aria-label*="Confirm"]',
            'button[aria-label*="Accept all"]',
            'form[action*="consent.youtube.com"] button[type="submit"]:not([jsname="wsVcxe"])',
        ];
        for (const selector of confirmSelectors) {
            if (await clickIfExists(page, selector, 3000, safeLogger, true)) {
                safeLogger.info(`Clicked main consent action: "${selector}"`);
                interactionOccurred = true;
                try {
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 });
                    safeLogger.info(`Navigated after clicking "${selector}". New URL: ${page.url().substring(0,100)}`);
                    if (!page.url().includes('consent.youtube.com')) return true; // Success
                } catch (navError) {
                    safeLogger.warn(`Navigation timeout/error after "${selector}": ${navError.message}. Current URL: ${page.url().substring(0,100)}`);
                }
                break;
            }
        }
        if (!interactionOccurred) safeLogger.warn('Full consent page, but no confirm/accept button clicked.');
    } else { // Not a full consent page, look for pop-up dialogs
        const popUpDialogSelectors = [
            'ytd-consent-bump-v2-lightbox',
            'tp-yt-paper-dialog[role="dialog"]',
            'div[aria-modal="true"]:has(h1:text-matches(/Before you continue/i))', // General modal structure
            'div[aria-modal="true"]:has(div[role="heading"]:text-matches(/Before you continue to YouTube/i))', // Another structure
        ];
        let dialogFoundAndInteracted = false;

        for (const dialogSelector of popUpDialogSelectors) {
            const consentDialogElement = page.locator(dialogSelector).first();
            if (await consentDialogElement.isVisible({ timeout: 5000 }).catch(() => false)) {
                safeLogger.info(`Pop-up consent dialog element IS visible using selector: "${dialogSelector}".`);
                const popUpAcceptSelectors = [
                    'button[aria-label*="Accept all"]', 'button[aria-label*="Accept the use of cookies"]',
                    'button[aria-label*="Agree to all"]', 'button[aria-label*="Agree"]',
                    'ytd-button-renderer:has-text("Accept all")', 'tp-yt-paper-button:has-text("ACCEPT ALL")',
                    '#introAgreeButton', // From earlier version
                    'button:has-text("Accept all")', // Simpler text match
                    'button:has-text("Agree")'
                ];
                for (const selector of popUpAcceptSelectors) {
                     // Try clicking within the dialog first if the selector is general
                    const buttonInDialog = consentDialogElement.locator(selector);
                    if (await buttonInDialog.count() > 0 && await clickIfExists(page, buttonInDialog.first(), 2000, safeLogger, true)) {
                        safeLogger.info(`Clicked pop-up button "${selector}" *within* dialog "${dialogSelector}".`);
                        interactionOccurred = true; dialogFoundAndInteracted = true; break;
                    }
                    // Then try globally if it's a more specific selector or if dialog click failed
                    if (!selector.startsWith('.')) { // Avoid re-clicking very general selectors if already tried in dialog
                        if (await clickIfExists(page, selector, 2000, safeLogger, true)){
                            safeLogger.info(`Clicked pop-up button "${selector}" *globally*.`);
                            interactionOccurred = true; dialogFoundAndInteracted = true; break;
                        }
                    }
                }
                if (dialogFoundAndInteracted) break; // Break outer loop if dialog was found and interacted with
            }
        }

        if (interactionOccurred && dialogFoundAndInteracted) {
            await sleep(2500 + nodeJsRandom(500)); // Wait for popup to disappear
            const stillVisible = await page.locator(popUpDialogSelectors.join(', ')).first().isVisible({timeout:1500}).catch(()=>false);
            if (!stillVisible) {
                safeLogger.info('Pop-up consent dialog dismissed successfully.');
                return true;
            } else {
                safeLogger.warn('Clicked a consent button, but a consent dialog might still be visible.');
            }
        } else if (!interactionOccurred) { // No dialog container found by any selector
            safeLogger.info('No pop-up consent dialog container found with primary selectors. Trying direct button search (fallback).');
            const fallbackAcceptSelectors = [
                'button[aria-label*="Accept all"]', 'button[aria-label*="Accept the use of cookies"]',
                'button[aria-label*="Agree to all"]', 'button[aria-label*="Agree"]',
                'ytd-button-renderer:has-text("Accept all")', 'tp-yt-paper-button:has-text("ACCEPT ALL")',
                '#introAgreeButton'
            ];
            for (const selector of fallbackAcceptSelectors) {
                if (await clickIfExists(page, selector, 2000, safeLogger, true)) {
                    safeLogger.info(`Clicked fallback consent button: "${selector}".`);
                    interactionOccurred = true;
                    await sleep(2500 + nodeJsRandom(500));
                    const stillVisibleGlobal = await page.locator(popUpDialogSelectors.join(', ')).first().isVisible({timeout:1500}).catch(()=>false);
                    if (!stillVisibleGlobal) {
                        safeLogger.info('Consent dialog dismissed after fallback button click.');
                        return true;
                    }
                    break;
                }
            }
        }
        if (!interactionOccurred) {
            safeLogger.info('No pop-up consent dialog element or direct buttons visible/actionable on this check.');
        }
    }

    if (!interactionOccurred && attempt < maxAttempts) {
        safeLogger.warn(`Consent not fully handled. Retrying (attempt ${attempt + 1}/${maxAttempts}).`);
        await sleep(3000 + nodeJsRandom(1000) * attempt); // Increase sleep for subsequent attempts
        return await handleYouTubeConsent(page, logger, attempt + 1, maxAttempts);
    }
    
    if (page.url().includes('consent.youtube.com')) {
        safeLogger.error(`After all attempts, still on consent page: ${page.url().substring(0,100)}`);
        return false;
    }
    if (interactionOccurred && !page.url().includes('consent.youtube.com')) {
        safeLogger.info("Consent interaction occurred and not on consent page anymore.");
        return true;
    }
    safeLogger.info("Consent handling finished. No interaction occurred or still on consent page if it was a full page.");
    return !page.url().includes('consent.youtube.com'); // True if not on consent page, false otherwise
}


const ANTI_DETECTION_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--mute-audio',
    '--ignore-certificate-errors',
];

async function applyAntiDetectionScripts(pageOrContext, logger, fingerprintProfile) {
    const safeLogger = getSafeLogger(logger);
    safeLogger.info(`Custom anti-detection scripts SKIPPED (v1.9.10).`);
}


async function waitForVideoToLoad(page, logger, maxWaitMs = 90000) {
    const safeLogger = getSafeLogger(logger);
    safeLogger.info(`[waitForVideoToLoad] Starting wait for up to ${maxWaitMs / 1000}s. Current URL: ${page.url().substring(0,100)}`);
    const startTime = Date.now();
    let lastLoggedRs = -1, lastLoggedNs = -1, lastLoggedDuration = -100, lastLoggedPaused = null;

    while (Date.now() - startTime < maxWaitMs) {
        if (page.isClosed()) {
            safeLogger.warn('[waitForVideoToLoad] Page closed during wait.');
            throw new Error('Page closed while waiting for video load');
        }
        if (page.url().includes("consent.youtube.com")) {
            safeLogger.error('[waitForVideoToLoad] FATAL: Page is ON consent.youtube.com. Cannot load video from here.');
            throw new Error('Redirected to consent screen during waitForVideoToLoad - indicates consent was not fully handled before video load attempt.');
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
            // This can happen transiently during navigation or if the page structure is unexpected
            safeLogger.debug('[waitForVideoToLoad] Video element not found in evaluate during loop. Page URL: ' + page.url().substring(0,100));
        }
        await sleep(1000);
    }
    safeLogger.error(`[waitForVideoToLoad] Timeout after ${maxWaitMs/1000}s. Last logged: RS=${lastLoggedRs}, NS=${lastLoggedNs}, Dur=${lastLoggedDuration ? lastLoggedDuration.toFixed(1) : 'N/A'}, Paused=${lastLoggedPaused}. Current URL: ${page.url().substring(0,100)}`);
    throw new Error(`Timeout waiting for video to load after ${maxWaitMs / 1000}s. Current URL: ${page.url().substring(0,100)}`);
}

async function getVideoDuration(page, logger) {
    const safeLogger = getSafeLogger(logger);
    safeLogger.info('Confirming video duration...');
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const duration = await page.evaluate(() => {
                const video = document.querySelector('video.html5-main-video');
                return video ? video.duration : null;
            });
            if (duration && Number.isFinite(duration) && duration > 0) {
                safeLogger.info(`Video duration confirmed: ${duration.toFixed(1)} seconds (attempt ${attempt + 1}).`);
                return duration;
            }
            safeLogger.warn(`Could not confirm valid video duration (attempt ${attempt + 1}). Found: ${duration}. Retrying after delay...`);
            await sleep(1000 + attempt * 500);
        } catch (e) {
            safeLogger.error(`Error getting video duration (attempt ${attempt + 1}): ${e.message.split('\n')[0]}`);
            if (attempt < 2) await sleep(1000 + attempt * 500);
        }
    }
    safeLogger.error('Failed to get valid video duration after multiple attempts.');
    return null;
}
async function clickIfExists(page, locatorOrSelector, timeout = 3000, logger, forceClick = true) {
    const safeLogger = getSafeLogger(logger);
    let element;
    const selectorString = typeof locatorOrSelector === 'string' ? locatorOrSelector : 'LocatorObject';

    try {
        if (typeof locatorOrSelector === 'string') {
            element = page.locator(locatorOrSelector).first();
        } else { // Assuming it's already a Playwright Locator
            element = locatorOrSelector;
        }
        
        await element.waitFor({ state: 'visible', timeout });
        await element.click({ timeout: timeout / 2, force: forceClick, noWaitAfter: false }); // noWaitAfter: false is default, but explicit
        safeLogger.info(`Clicked on selector: ${selectorString} (force: ${forceClick})`);
        return true;
    } catch (e) {
        if (page.isClosed()) { (safeLogger.warn || safeLogger.warning).call(safeLogger, `Page closed attempting to click: ${selectorString} - ${e.message.split('\n')[0]}`); return false;}
        safeLogger.debug(`Selector not found/clickable: ${selectorString} (force: ${forceClick}) - Error: ${e.message.split('\n')[0]}`);
        return false;
    }
}

async function setVideoQualityToLowest(page, logger) {
    const safeLogger = getSafeLogger(logger);
    safeLogger.info('Attempting to set video quality to lowest...');
    const settingsButtonSelector = '.ytp-settings-button';

    let settingsButton;
    try {
        settingsButton = page.locator(settingsButtonSelector);
        await settingsButton.waitFor({ state: 'visible', timeout: 5000 });
        
        // Attempt to hover over player to make controls visible
        const playerLocator = page.locator('#movie_player, .html5-video-player').first();
        if (await playerLocator.count() > 0 && await playerLocator.isVisible({timeout:1000})) {
             await playerLocator.hover({timeout: 1000, force:true }).catch(e => safeLogger.debug(`Player hover for quality failed: ${e.message}`));
             await sleep(300 + nodeJsRandom(200));
        } else {
            safeLogger.debug('Player element not found for hover before quality settings.');
        }

        await settingsButton.click({ timeout: 3000, force: true });
        safeLogger.info('Clicked settings button.');
        await sleep(nodeJsRandom(800, 1300)); // Wait for menu to appear

        // Click "Quality" menu item
        const qualityMenuItem = page.locator('.ytp-menuitem:has(.ytp-menuitem-label:text-matches(/^Quality$/i))').first();
        let qualityMenuClicked = false;
        if (await qualityMenuItem.isVisible({timeout: 5000}).catch(() => false)) {
            await qualityMenuItem.click({ timeout: 3000, force: true });
            safeLogger.info('Clicked "Quality" menu item.');
            qualityMenuClicked = true;
        } else {
            safeLogger.warn('Standard "Quality" menu item not found. Trying alternative selectors...');
             // Fallback selectors for "Quality" if the primary one fails
             const altQualitySelectors = [
                '.ytp-menuitem-label:has-text("Quality")', // Text based
                '.ytp-menuitem[aria-haspopup="true"]:has(.ytp-menuitem-label)', // Generic item with submenu
            ];
            for (const altSelector of altQualitySelectors) {
                const altQualityItem = page.locator(altSelector).first();
                 if (await altQualityItem.isVisible({timeout:1000}).catch(()=>false)) {
                     await altQualityItem.click({timeout:3000, force:true});
                     safeLogger.info(`Clicked alternative quality menu item: ${altSelector}`);
                     qualityMenuClicked = true;
                     break;
                 }
            }
            if (!qualityMenuClicked) {
                safeLogger.warn('Could not click any known "Quality" menu item.');
                // Attempt to close the settings menu if it's still open
                if (await settingsButton.isVisible({timeout:500}).catch(()=>false)) await settingsButton.click({timeout:1000, force:true}).catch(()=>{});
                return false;
            }
        }
        await sleep(nodeJsRandom(800, 1300)); // Wait for quality submenu

        // Select the lowest quality available (preferring 144p or 240p)
        let qualitySet = false;
        const targetQualities = ["144p", "240p"]; // Prioritize these
        const qualityOptionLocators = page.locator('.ytp-quality-menu .ytp-menuitem[role="menuitemradio"]');

        for (const targetQualityText of targetQualities) {
            // Iterate through visible quality options to find the target
            for (let i = 0; i < await qualityOptionLocators.count(); i++) {
                const option = qualityOptionLocators.nth(i);
                const labelText = await option.textContent({timeout: 500}).catch(() => '');
                if (labelText && labelText.includes(targetQualityText)) {
                    if (await option.isVisible({timeout:1000})) {
                        await option.click({ timeout: 2000, force: true });
                        safeLogger.info(`Selected video quality: ${targetQualityText}`);
                        qualitySet = true;
                        break; // Exit inner loop once a target quality is set
                    }
                }
            }
            if (qualitySet) break; // Exit outer loop if quality was set
        }
        

        // Fallback: if specific low qualities not found, click the *last* available non-"Auto" option
        if (!qualitySet) {
            safeLogger.warn('Specific low quality (144p/240p) not found. Attempting to select the last available quality option.');
            const count = await qualityOptionLocators.count();
            safeLogger.debug(`Found ${count} quality options in menu.`);
            if (count > 0) { 
                let lastSelectableItem = null;
                // Iterate from last to first to find a non-"Auto" option
                for (let i = count -1; i >= 0; i--) {
                    const item = qualityOptionLocators.nth(i);
                    const text = await item.textContent({timeout: 200}).catch(() => '');
                    if (text && !text.toLowerCase().includes('auto')) {
                        lastSelectableItem = item;
                        break;
                    }
                    // If only "Auto" is left, or it's the first one, pick it as a last resort if nothing else.
                    if (i === 0 && !lastSelectableItem) lastSelectableItem = item;
                }

                if (lastSelectableItem && await lastSelectableItem.isVisible({timeout: 500})) {
                    await lastSelectableItem.click({ timeout: 2000, force: true });
                    qualitySet = true;
                    safeLogger.info(`Selected fallback quality option: ${await lastSelectableItem.textContent()}`);
                } else if (count > 0 && await qualityOptionLocators.last().isVisible({timeout: 500})) {
                     // If the loop above failed to find a non-Auto, just click the very last one as a final fallback
                     await qualityOptionLocators.last().click({ timeout: 2000, force: true });
                     qualitySet = true;
                     safeLogger.info(`Selected last option (count: ${count}): ${await qualityOptionLocators.last().textContent()}`);
                } else {
                    safeLogger.warn('Not enough quality options to pick the last one, or only "Auto" found/visible.');
                }
            } else {
                 safeLogger.warn('No quality option locators found for fallback.');
            }
        }
        
        // Attempt to close the settings menu
        await sleep(nodeJsRandom(500, 1000)); // Short delay for selection to apply
        if (await settingsButton.isVisible({timeout:500}).catch(() => false) && 
            await page.locator('.ytp-settings-menu').isVisible({timeout:500}).catch(()=>false) ) { // Check if menu is still open
             await settingsButton.click({timeout:1000, force:true}).catch(e => safeLogger.debug(`Failed to close settings menu after quality attempt: ${e.message}`));
        }
        return qualitySet;

    } catch (e) {
        safeLogger.error(`Error setting video quality: ${e.message.split('\n')[0]}`);
        // Attempt to close settings menu if it's open after an error
        if (settingsButton && await settingsButton.isVisible({timeout:500}).catch(() => false) &&
            await page.locator('.ytp-settings-menu').isVisible({timeout:500}).catch(()=>false) ) {
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

        // Try to find the video player element
        const playerElement = page.locator('#movie_player, .html5-video-player, div#player.style-scope.ytd-watch-flexy').first();
        let targetX, targetY;
        let moveWithinPlayer = false;

        if (await playerElement.count() > 0 && await playerElement.isVisible({timeout: 500}).catch(() => false)) {
            const bb = await playerElement.boundingBox({timeout:1000});
            if (bb && bb.width > 100 && bb.height > 100) { // Ensure player is of a reasonable size
                // 70% chance to move within player, 30% chance to move slightly outside/around it
                if (Math.random() < 0.7) {
                    targetX = bb.x + Math.random() * bb.width;
                    targetY = bb.y + Math.random() * bb.height;
                    safeLogger.debug(`Mouse target is within player bounds: ${targetX.toFixed(0)},${targetY.toFixed(0)}`);
                } else {
                    // Move to an area slightly outside but near the player
                    targetX = Math.max(0, Math.min(viewport.width - 1, bb.x + (Math.random() - 0.5) * bb.width * 1.5));
                    targetY = Math.max(0, Math.min(viewport.height - 1, bb.y + (Math.random() - 0.5) * bb.height * 1.5));
                    safeLogger.debug(`Mouse target is near player bounds: ${targetX.toFixed(0)},${targetY.toFixed(0)}`);
                }
                moveWithinPlayer = true;
            }
        }
        
        if (!moveWithinPlayer) { // Fallback to random viewport coordinates if player not found/suitable
            targetX = Math.random() * viewport.width;
            targetY = Math.random() * viewport.height;
            safeLogger.debug(`Mouse target is within viewport (player not suitable): ${targetX.toFixed(0)},${targetY.toFixed(0)}`);
        }
        
        // Ensure coordinates are within viewport
        targetX = Math.max(0, Math.min(viewport.width - 1, targetX));
        targetY = Math.max(0, Math.min(viewport.height - 1, targetY));

        const steps = nodeJsRandom(5, 15);
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

        // Logger setup
        if (baseLogger && typeof baseLogger.child === 'function') {
            this.logger = baseLogger.child({ prefix: workerPrefix });
            // Ensure the child logger has the necessary methods
            if (!(this.logger && typeof this.logger.info === 'function' && (typeof this.logger.warn === 'function' || typeof this.logger.warning === 'function'))) {
                console.error(`WORKER_CONSTRUCTOR_ERROR for ${this.id.substring(0,6)}: baseLogger.child() did NOT return a logger with .info AND .warn/warning. This is unexpected. Falling back to created fallback logger.`);
                this.logger = this.createFallbackLogger(workerPrefix);
            }
        } else {
            console.error(`WORKER_CONSTRUCTOR_ERROR for ${job.id}: baseLogger is invalid or lacked .child(). Using created fallback logger.`);
            this.logger = this.createFallbackLogger(workerPrefix);
        }
        // Standardize warn/warning
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
        const self = this; // Capture 'this' for use in nested functions
        return {
            prefix: prefix,
            info: (m, d) => console.log(`INFO ${self.prefix || prefix}${m || ''}`, d || ''),
            warn: (m, d) => console.warn(`WARN ${self.prefix || prefix}${m || ''}`, d || ''),
            warning: (m, d) => console.warn(`WARN ${self.prefix || prefix}${m || ''}`, d || ''),
            error: (m, d) => console.error(`ERROR ${self.prefix || prefix}${m || ''}`, d || ''),
            debug: (m, d) => console.log(`DEBUG ${self.prefix || prefix}${m || ''}`, d || ''), // Or console.debug
            child: function(childOpts) {
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
                `--window-size=${this.fingerprintProfile.screen.width || 1920},${this.fingerprintProfile.screen.height || 1080}`
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
        this.logger.info('Browser launched directly with Playwright (StealthPlugin SKIPPED for v1.9.10).');

        this.context = await this.browser.newContext({
            userAgent: this.fingerprintProfile.userAgent,
            locale: this.fingerprintProfile.locale,
            timezoneId: this.fingerprintProfile.timezoneId,
            acceptDownloads: false, // Default, good practice
            screen: { 
                width: this.fingerprintProfile.screen.width,
                height: this.fingerprintProfile.screen.height
            },
            viewport: { // Set viewport, especially if headless
                width: this.effectiveInput.headless ? 1920 : this.fingerprintProfile.screen.width,
                height: this.effectiveInput.headless ? 1080 : this.fingerprintProfile.screen.height
            },
            ignoreHTTPSErrors: true,
            bypassCSP: true, // May help with some restrictive sites
            javaScriptEnabled: true, // Default, but explicit
            permissions: ['geolocation', 'notifications'], // Standard permissions
            geolocation: this.effectiveInput.proxyCountry === 'US' ? { latitude: 34.0522, longitude: -118.2437 } : // LA
                         this.effectiveInput.proxyCountry === 'GB' ? { latitude: 51.5074, longitude: 0.1278 } : // London
                         this.effectiveInput.proxyCountry === 'HU' ? { latitude: 47.4979, longitude: 19.0402 } : // Budapest
                         // Fallbacks based on common timezone IDs from profiles
                         this.fingerprintProfile.timezoneId === 'America/New_York' ? { latitude: 40.7128, longitude: -74.0060 } :
                         this.fingerprintProfile.timezoneId === 'America/Los_Angeles' ? { latitude: 34.0522, longitude: -118.2437 } :
                         this.fingerprintProfile.timezoneId === 'Europe/London' ? { latitude: 51.5074, longitude: -0.1278 } :
                         this.fingerprintProfile.timezoneId === 'Europe/Budapest' ? { latitude: 47.4979, longitude: 19.0402 } :
                         undefined, // No specific geolocation if country/tz doesn't match
            deviceScaleFactor: (this.fingerprintProfile.screen.width > 1920 || this.fingerprintProfile.screen.height > 1080) ? 1.5 : 1,
            isMobile: false, // Explicitly not mobile
            hasTouch: false, // Explicitly no touch
            extraHTTPHeaders: this.job.referer ? { 'Referer': this.job.referer } : undefined,
        });
        this.logger.info(`Browser context created. Profile hints: locale=${this.fingerprintProfile.locale}, TZID=${this.fingerprintProfile.timezoneId}, Referer: ${this.job.referer || 'None'}`);

        await applyAntiDetectionScripts(this.context, this.logger, this.fingerprintProfile); // This now just logs

        this.page = await this.context.newPage();
        this.logger.info('New page created.');
        
        this.page.on('console', msg => {
            const type = msg.type();
            const text = msg.text().substring(0, 250); // Truncate long messages
            if (type === 'error' || type === 'warn') {
                this.logger.warn(`PAGE_CONSOLE (${type.toUpperCase()}): ${text}`);
            } else if (['info', 'log', 'debug'].includes(type)) {
                 // Only log these at a higher debug level if needed, can be noisy
                 this.logger.debug(`PAGE_CONSOLE (${type.toUpperCase()}): ${text}`);
            }
        });
        
        // Add init script for more detailed fingerprinting
        await this.page.addInitScript((fp) => {
            try {
                // Basic anti-detection
                Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });

                // Platform and vendor
                if (fp.platform && typeof fp.platform === 'string') {
                    Object.defineProperty(navigator, 'platform', { get: () => fp.platform, configurable: true });
                }
                if (fp.hardwareConcurrency && typeof fp.hardwareConcurrency === 'number') {
                    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency, configurable: true });
                }
                if (fp.deviceMemory && typeof fp.deviceMemory === 'number') { // Added deviceMemory
                     Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.deviceMemory, configurable: true });
                }
                if (fp.vendor && typeof fp.vendor === 'string') {
                    Object.defineProperty(navigator, 'vendor', { get: () => fp.vendor, configurable: true });
                }

                // Plugins and MimeTypes (emulate none, as per profiles)
                Object.defineProperty(navigator, 'plugins', { get: () => [], configurable: true }); // Empty array
                Object.defineProperty(navigator, 'mimeTypes', { get: () => [], configurable: true }); // Empty array

                // WebGL spoofing
                if (fp.webGLVendor && fp.webGLRenderer) {
                    const getParameterOriginal = WebGLRenderingContext.prototype.getParameter;
                    WebGLRenderingContext.prototype.getParameter = function(parameter) {
                        // UNMASKED_VENDOR_WEBGL == 0x9245
                        // UNMASKED_RENDERER_WEBGL == 0x9246
                        if (parameter === this.VENDOR || parameter === 0x9245) return fp.webGLVendor;
                        if (parameter === this.RENDERER || parameter === 0x9246) return fp.webGLRenderer;
                        return getParameterOriginal.apply(this, arguments);
                    };
                    if (typeof WebGL2RenderingContext !== 'undefined' && WebGL2RenderingContext.prototype) { // Check for WebGL2
                        const getParameter2Original = WebGL2RenderingContext.prototype.getParameter;
                        WebGL2RenderingContext.prototype.getParameter = function(parameter) {
                            if (parameter === this.VENDOR || parameter === 0x9245) return fp.webGLVendor;
                            if (parameter === this.RENDERER || parameter === 0x9246) return fp.webGLRenderer;
                            return getParameter2Original.apply(this, arguments);
                        };
                    }
                }

                // Screen properties
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
        await this.page.goto(this.job.videoUrl, { waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 });
        this.logger.info('Navigation (domcontentloaded event) complete.');
        
        // More robust consent handling call
        const consentHandled = await handleYouTubeConsent(this.page, this.logger, 1, 3); // Try up to 3 times
        if (!consentHandled && this.page.url().includes("consent.youtube.com")) {
            this.logger.error(`Failed to navigate away from consent page after all attempts. URL: ${this.page.url().substring(0,100)}. Aborting job.`);
            throw new Error("Consent handling failed definitively.");
        }
        await sleep(nodeJsRandom(2000, 4000)); // Pause after potential consent interaction

        this.logger.info('enableAutoplayWithInteraction SKIPPED for stability test (v1.9.10).');

        this.logger.info('Waiting for video to load data (up to 90s)...');
        try {
            await waitForVideoToLoad(this.page, this.logger, 90000);
        } catch (loadError) {
            this.logger.error(`CRITICAL: Video failed to load properly: ${loadError.message}`);
            if (loadError.message.includes("consent screen")) {
                 this.logger.warn("waitForVideoToLoad aborted due to consent screen. This should have been handled earlier. Recovery might be needed.");
            } else if (Actor.isAtHome()) { // Save screenshot on failure if running on Apify platform
                try {
                    const failTime = new Date().toISOString().replace(/[:.]/g, '-');
                    const screenshotKey = `LOAD_FAIL_SCREENSHOT_${this.job.videoId}_${this.id.substring(0,8)}_${failTime}`;
                    const screenshotBuffer = await this.page.screenshot({ fullPage: true, timeout: 15000 });
                    await Actor.setValue(screenshotKey, screenshotBuffer, { contentType: 'image/png' });
                    this.logger.info(`Load fail screenshot saved: ${screenshotKey}`);
                } catch (screenshotError) { this.logger.error(`Failed to take load fail screenshot: ${screenshotError.message}`); }
            }
            throw loadError; // Re-throw to fail the job
        }

        const duration = await getVideoDuration(this.page, this.logger); // Use refined getVideoDuration
        if (duration && Number.isFinite(duration) && duration > 0) {
            this.job.video_info.duration = duration;
        } else {
            this.logger.error(`CRITICAL: Could not confirm valid video duration after load. Found: ${duration}. Failing.`);
            throw new Error(`Could not confirm valid video duration after load (got ${duration}).`);
        }
        
        // Set video quality AFTER confirming load and duration
        if (this.job.platform === 'youtube') {
            await setVideoQualityToLowest(this.page, this.logger);
        } else {
            this.logger.info(`Skipping video quality setting for non-YouTube platform: ${this.job.platform}`);
        }

        const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];
        this.logger.info('Attempting to ensure video is playing after load and quality set...');
        const initialPlaySuccess = await this.ensureVideoPlaying(playButtonSelectors, 'initial-setup'); 
        
        if (!initialPlaySuccess) {
            this.logger.warn('Initial play attempts failed. Attempting playbackRecovery method...');
            const recoverySuccess = await this.attemptPlaybackRecovery();
            if (!recoverySuccess) {
                this.logger.error('All playback attempts failed, including specific recovery. Video may not play.');
                if (Actor.isAtHome()) { // Screenshot on play failure
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
            this.logger.info('Video confirmed playing after initial setup.');
        }

        await sleep(nodeJsRandom(2000, 4500)); // Give some time for playback to stabilize
        return true; // Successfully started
    }

    async handleAds() {
        let adWasPlayingThisCheckCycle = false;
        const adSelectors = [
            '.ytp-ad-player-overlay-instream-info', // Ad info overlay
            '.video-ads .ad-showing',                // General ad container
            '.ytp-ad-text',                          // "Advertisement" text
            'div[class*="ytp-ad-"][style*="display: block"]', // Generic ad element that's visible
            '.ytp-ad-skip-button-container',         // Container for skip button (even if button itself isn't ready)
            '.ytp-ad-message-container',             // "Your video will play after ad"
        ];
        
        let isAdCurrentlyPlaying = false;
        for (const selector of adSelectors) {
            // Use .first() to avoid issues if multiple elements match (though unlikely for these specific ones)
            if (await this.page.locator(selector).first().isVisible({timeout: 250}).catch(() => false)) {
                isAdCurrentlyPlaying = true;
                this.logger.debug(`Ad indicator "${selector}" visible.`);
                break;
            }
        }

        if (!isAdCurrentlyPlaying) {
            this.logger.debug('No ad indicators found this check.');
            return false; // No ad playing
        }

        this.logger.info('Ad detected! Entering ad handling loop.');
        adWasPlayingThisCheckCycle = true; // Mark that an ad was indeed playing at the start of this cycle

        const adSkipCheckInterval = 1500; // Check for skip button more frequently
        const maxAdWatchDuration = this.effectiveInput.maxSecondsAds * 1000;
        const adLoopStartTime = Date.now();

        while (Date.now() - adLoopStartTime < maxAdWatchDuration) {
            if (this.killed || this.page.isClosed()) break;

            // Re-check if an ad is still present (it might have finished naturally)
            let isAdStillPresent = false;
            for (const selector of adSelectors) {
                 if (await this.page.locator(selector).first().isVisible({timeout: 250}).catch(() => false)) {
                    isAdStillPresent = true;
                    break;
                }
            }
            if (!isAdStillPresent) {
                this.logger.info('Ad finished or disappeared during handling loop (indicators no longer visible).');
                break;
            }

            // Check for skip button
            const skipButtonSelectors = [
                '.ytp-ad-skip-button-modern', // Newer skip button
                '.ytp-ad-skip-button',       // Older skip button
                'button[aria-label*="Skip Ad"]', // More generic, case-insensitive for "Ad"
                'button[aria-label*="Skip ad"]',
                '.videoAdUiSkipButton',      // Another common class
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
            
            const minSkipTimeMs = nodeJsRandom(this.effectiveInput.skipAdsAfter[0] * 1000, this.effectiveInput.skipAdsAfter[1] * 1000);

            if (this.effectiveInput.autoSkipAds && canSkip && skipSelectorToUse) {
                this.logger.info(`AutoSkipAds: Attempting to skip ad with: ${skipSelectorToUse}`);
                if (await clickIfExists(this.page, skipSelectorToUse, 1000, this.logger)) {
                    await sleep(1500 + nodeJsRandom(500)); // Wait for ad to actually disappear
                    break; // Ad skipped, exit loop
                }
            } else if (canSkip && skipSelectorToUse && (Date.now() - adLoopStartTime >= minSkipTimeMs)) {
                this.logger.info(`Ad skippable (${skipSelectorToUse}) and min watch time (${(minSkipTimeMs/1000).toFixed(1)}s) met. Attempting skip.`);
                if (await clickIfExists(this.page, skipSelectorToUse, 1000, this.logger)) {
                    await sleep(1500 + nodeJsRandom(500)); // Wait for ad to actually disappear
                    break; // Ad skipped, exit loop
                }
            }
            await sleep(adSkipCheckInterval);
        }

        // Log if max ad watch duration was reached and ad might still be playing
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
    
    async ensureVideoPlaying(playButtonSelectors, attemptType = 'general') {
        const logFn = (msg, level = 'info') => {
            const loggerMethod = this.logger[level] || (level === 'warn' && (this.logger.warning || this.logger.warn)) || this.logger.info;
            loggerMethod.call(this.logger, `[ensureVideoPlaying-${attemptType}] ${msg}`);
        };
        logFn(`Ensuring video is playing ...`);

        try {
            await this.page.bringToFront().catch(e => logFn(`BringToFront failed: ${e.message}`, 'debug'));
            await this.page.evaluate(() => window.focus()).catch(e => logFn(`Window focus failed: ${e.message}`, 'debug'));
            logFn('Brought page to front and focused window (best effort).');
        } catch (e) {
            logFn(`Failed to focus page: ${e.message}`, 'debug');
        }

        for (let attempt = 0; attempt < 3; attempt++) {
            if (this.killed || this.page.isClosed()) return false;

            let isVideoElementPresent = await this.page.locator('video.html5-main-video').count() > 0;
            if (!isVideoElementPresent) {
                logFn('Video element not present on page.', 'warn');
                if (attempt > 0) return false; // If not present after first check, unlikely to appear
                await sleep(1000); // Give it a moment if it's the first check
                continue;
            }

            // Get comprehensive video state
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
                return { p: true, rs: 0, err: {message: "Eval failed to get video state"}, ended: true, networkState: 3, src: null, videoWidth: 0, videoHeight: 0, muted: true, volume: 0, currentTime: 0 }; // Default to a "not playing" state
            });
            
            if (videoState.err && videoState.err.code) { logFn(`Video element error: Code ${videoState.err.code}, Msg: ${videoState.err.message || 'N/A'}`, 'warn'); }
            if (!videoState.p && videoState.rs >= 3 && !videoState.ended) { // ReadyState 3 (HAVE_FUTURE_DATA) or 4 (HAVE_ENOUGH_DATA)
                logFn(`Video is already playing (attempt ${attempt + 1}). RS:${videoState.rs}, NS:${videoState.networkState}, Time:${videoState.currentTime?.toFixed(1)}`);
                return true;
            }

            logFn(`Video state (attempt ${attempt + 1}): Paused=${videoState.p}, Ended=${videoState.ended}, RS=${videoState.rs}, NS=${videoState.networkState}, Muted=${videoState.muted}, Volume=${videoState.volume?.toFixed(2)}, Time=${videoState.currentTime?.toFixed(1)}, Dim=${videoState.videoWidth}x${videoState.videoHeight}. Trying strategies...`);

            // Strategy 0: If loaded but paused at the very beginning, try a simple JS play()
            if (videoState.p && videoState.rs >= 3 && !videoState.ended && videoState.currentTime < 1) { // Check if it's paused near the start
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

            // Strategy 1: Unmute and set a tiny volume (some browsers require unmuted for autoplay)
            if (videoState.muted) {
                try {
                    await this.page.evaluate(() => {
                        const video = document.querySelector('video.html5-main-video');
                        if (video) { video.muted = false; video.volume = 0.01 + Math.random() * 0.09; } // Tiny, non-zero volume
                    });
                    logFn(`Attempted to unmute video and set volume to ${((await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.volume || 0))*100).toFixed(0)}%`);
                    await sleep(500); // Give it a moment
                    const unmutedState = await this.page.evaluate(() => {const v=document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended, m:v.muted} : {p:true,rs:0,e:true,m:true};}).catch(()=>({p:true,rs:0,e:true,m:true}));
                    if (!unmutedState.p && unmutedState.rs >=3 && !unmutedState.e) {
                        logFn('Video started playing after unmute.'); return true;
                    }
                    if (!unmutedState.m) logFn('Video successfully unmuted.'); else logFn('Video still muted after attempt.', 'warn');
                } catch (e) { logFn(`Failed to unmute video: ${e.message}`, 'debug'); }
            }

            // Strategy 2: Click common play buttons
            const bigPlayButtonSelectors = [ '.ytp-large-play-button', '.ytp-play-button[aria-label="Play"]', '.ytp-cued-thumbnail-overlay', '.ytp-cued-thumbnail-overlay-image', 'button[aria-label="Play"]', '.ytp-large-play-button-bg'];
            for (const selector of bigPlayButtonSelectors) {
                try {
                    const playBtn = this.page.locator(selector).first();
                    if (await playBtn.isVisible({timeout: 500 + (attempt * 100)})) { // Slightly increase timeout for later attempts
                        await playBtn.click({timeout: 2000, force: false, delay: nodeJsRandom(50, 100)}); // Try non-forced click first
                        logFn(`Clicked play button: ${selector}`);
                        await sleep(1500 + nodeJsRandom(500)); // Wait for potential state change
                        const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                        if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after clicking ${selector}. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                    }
                } catch (e) { logFn(`Failed to click ${selector}: ${e.message.split('\n')[0]}`, 'debug'); }
            }

            // Strategy 3: Focus player area and press Space (common play/pause toggle)
            try {
                const playerElement = this.page.locator('#movie_player, .html5-video-player, body').first(); // Include body as fallback focus target
                if (await playerElement.isVisible({timeout: 500})) {
                    await playerElement.focus({timeout: 1000}).catch(e => logFn(`Focus failed for playerElement: ${e.message}`, 'debug'));
                    await this.page.keyboard.press('Space', {delay: nodeJsRandom(50,150)});
                    logFn('Focused player/body and pressed Space key');
                    await sleep(1000 + nodeJsRandom(300));
                    const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                    if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after Space key. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                }
            } catch (e) { logFn(`Failed to focus player and press Space: ${e.message.split('\n')[0]}`, 'debug'); }

            // Strategy 4: Click center of the video element itself
            try {
                const videoElement = this.page.locator('video.html5-main-video').first();
                if (await videoElement.isVisible({timeout: 500})) {
                    const box = await videoElement.boundingBox({timeout:1000});
                    if (box && box.width > 0 && box.height > 0) { // Ensure element has dimensions
                        await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {delay: nodeJsRandom(50,100)});
                        logFn('Clicked center of video element');
                        await sleep(1200 + nodeJsRandom(300));
                        const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                        if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after center click. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                    } else { logFn('Video element bounding box not valid for click.', 'debug'); }
                }
            } catch (e) { logFn(`Failed to click video center: ${e.message.split('\n')[0]}`, 'debug'); }

            // Strategy 5: JS video.play() (more direct if previous failed)
            if (videoState.p && !videoState.ended) { // If still paused and not ended
                try {
                    await this.page.evaluate(() => {
                        const video = document.querySelector('video.html5-main-video');
                        if (video) {
                            if (video.muted) { video.muted = false; video.volume = 0.01 + Math.random() * 0.09; } // Try unmute again
                            const playPromise = video.play();
                            if (playPromise !== undefined) {
                                playPromise.then(() => { console.log('[In-Page] Video play() initiated via JS'); }).catch(error => { console.warn('[In-Page] Video play() via JS failed:', error.message,'. Trying to click video after short delay.'); setTimeout(() => video.click(), 100); });
                            } else { console.warn('[In-Page] video.play() did not return a promise. Clicking.'); video.click(); }
                        }
                    });
                    logFn('Attempted JS video.play() or video.click()');
                    await sleep(1500 + nodeJsRandom(300));
                    const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                    if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after JS play()/click combination. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                } catch (e) { logFn(`JS play()/click eval error: ${e.message.split('\n')[0]}`, 'debug'); }
            }

            // Strategy 6: Press 'k' key again (YouTube keyboard shortcut for play/pause)
            try { 
                await this.page.locator('body').press('k', {delay: nodeJsRandom(50,150)}); // Press 'k' on body
                logFn('Pressed "k" key again to toggle play/pause');
                await sleep(1000 + nodeJsRandom(300));
                const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after second "k" key. Time: ${tempState.ct?.toFixed(1)}`); return true;}
            } catch (e) { logFn(`Failed to press "k" key (second time): ${e.message.split('\n')[0]}`, 'debug'); }

            // Strategy 7 (Final attempt only): Aggressive overlay removal and dblclick
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

            // Wait before next attempt
            if (attempt < 2) await sleep(2000 + attempt * 1000); // Increase delay for subsequent attempts
        }
        
        logFn('Failed to ensure video is playing after multiple attempts.', 'warn');
        return false;
    }

    async attemptPlaybackRecovery() {
        this.logger.warn('Attempting playback recovery...');
        const originalJobUrl = this.job.videoUrl; // Use the original URL from the job
        let success = false;
    
        // Option 1 (Primary): Navigate directly to the VIDEO URL, then handle consent.
        this.logger.info(`Recovery 1: Attempting to navigate directly to job video URL: ${originalJobUrl}`);
        try {
            await this.page.goto(originalJobUrl, { waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 * 0.8 }); // Use 80% of main timeout
            await sleep(3000 + nodeJsRandom(1000)); // Allow page to settle
            await handleYouTubeConsent(this.page, this.logger.child({prefix: 'RecoveryConsentDirectNav:'}), 1, 3); // Try consent again
            
            if (this.page.url().includes("consent.youtube.com")) {
                this.logger.error(`Still on consent page after direct navigation and consent handling. URL: ${this.page.url().substring(0,100)}. Recovery failed for this step.`);
            } else if (this.page.url().includes(this.job.videoId) || (this.job.platform === 'rumble' && this.page.url().includes(this.job.videoId))) { // Check if we are on a video page
                this.logger.info('Navigated to a video page. Checking video load and play...');
                await waitForVideoToLoad(this.page, this.logger.child({ prefix: 'RecoveryLoadDirectNav:' }), 60000); // Shorter timeout for recovery load
                if (this.job.platform === 'youtube') { // Only set quality for YouTube
                    await setVideoQualityToLowest(this.page, this.logger.child({ prefix: 'RecoveryQualityDirectNav:' }));
                }
                success = await this.ensureVideoPlaying(['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'], 'recovery-direct-nav');
                if (success) {
                    this.logger.info('Playback recovery successful via DIRECT NAVIGATION to original URL!');
                    return true;
                }
            } else {
                this.logger.warn(`Direct navigation resulted in unexpected URL: ${this.page.url().substring(0,100)}.`);
            }
        } catch (e) {
            this.logger.error(`Recovery via direct navigation failed: ${e.message}`);
        }
    
        // Option 2: Simple page reload of the CURRENT URL (if direct nav failed)
        if (!success) {
            this.logger.info(`Recovery 2: Attempting page.reload() on current URL: ${this.page.url().substring(0,100)}`);
            try {
                if (this.page.url().includes("consent.youtube.com")) {
                    this.logger.warn("Current URL is a consent page, reload might not be effective. Skipping reload, will let job fail if direct nav didn't work.");
                } else {
                    await this.page.reload({ waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 * 0.6 }); // Shorter timeout
                    await sleep(2500 + nodeJsRandom(1000));
                    await handleYouTubeConsent(this.page, this.logger.child({prefix: 'RecoveryConsentRefresh:'}), 1, 2); // Fewer retries for consent on reload
            
                    if (this.page.url().includes("consent.youtube.com")) {
                         this.logger.warn(`Still on consent page after reload and consent handling. URL: ${this.page.url().substring(0,100)}.`);
                    } else if (this.page.url().includes(this.job.videoId) || (this.job.platform === 'rumble' && this.page.url().includes(this.job.videoId))) {
                        this.logger.info('Reload seems to have kept us on/taken us to a video page.');
                        await waitForVideoToLoad(this.page, this.logger.child({ prefix: 'RecoveryLoadRefresh:' }), 45000); // Shorter still
                        if (this.job.platform === 'youtube') {
                            await setVideoQualityToLowest(this.page, this.logger.child({ prefix: 'RecoveryQualityRefresh:' }));
                        }
                        success = await this.ensureVideoPlaying(['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'], 'recovery-refresh');
                        if (success) {
                            this.logger.info('Playback recovery successful via REFRESH!');
                            return true;
                        }
                    } else {
                         this.logger.warn(`Reload resulted in unexpected URL: ${this.page.url().substring(0,100)}.`);
                    }
                }
                this.logger.warn('Recovery via page.reload() did not resume playback or landed on wrong/consent page.');
            } catch (e) {
                this.logger.error(`Recovery via page.reload() failed: ${e.message}`);
            }
        }
        
        if(!success) this.logger.warn('All playback recovery methods attempted did not succeed.');
        return success;
    }

    async watchVideo() {
        if (!this.page || this.page.isClosed()) throw new Error('Page not initialized/closed for watching.');

        const videoDurationSeconds = this.job.video_info.duration;
        const targetWatchPercentage = this.effectiveInput.watchTimePercentage;
        const targetVideoPlayTimeSeconds = Math.max(10, (targetWatchPercentage / 100) * videoDurationSeconds);

        this.logger.info(`Watch target: ${targetWatchPercentage}% of ${videoDurationSeconds.toFixed(0)}s = ${targetVideoPlayTimeSeconds.toFixed(0)}s. URL: ${this.job.videoUrl}`);

        const overallWatchStartTime = Date.now();
        // Estimate ad cycles more conservatively, e.g., one ad every 2-3 minutes of video
        const estimatedAdCycles = Math.max(1, Math.ceil(targetVideoPlayTimeSeconds / (2.5 * 60))); 
        const maxOverallWatchDurationMs = (targetVideoPlayTimeSeconds * 1000) + (this.effectiveInput.maxSecondsAds * 1000 * estimatedAdCycles) + 60000; // +60s buffer
        this.logger.info(`Calculated maxOverallWatchDurationMs: ${(maxOverallWatchDurationMs/1000).toFixed(0)}s`);

        const checkIntervalMs = 1000; 
        let consecutiveStallChecks = 0;
        const MAX_STALL_CHECKS_BEFORE_RECOVERY = 10; // Allow more checks before recovery
        let recoveryAttemptsThisJob = 0;
        const MAX_RECOVERY_ATTEMPTS_PER_JOB = 1; // Max 1 recovery attempt per job to avoid loops

        let lastProgressTimestamp = Date.now();
        let lastKnownGoodVideoTime = 0;
        this.maxTimeReachedThisView = 0;
        let currentActualVideoTime = 0;
        this.lastLoggedVideoTime = -10; // Initialize to ensure first log

        let adCheckCooldownMs = 0;
        const AD_CHECK_INTERVAL_WHEN_NO_AD = 5000; 
        const AD_CHECK_INTERVAL_DURING_AD = 1500;
        
        let mouseMoveCooldownMs = Date.now() + nodeJsRandom(15000, 30000); // First mouse move after 15-30s

        while (!this.killed) {
            const loopIterationStartTime = Date.now();
            const loopNumber = Math.floor((Date.now() - overallWatchStartTime) / checkIntervalMs);

            if (this.page.isClosed()) { (this.logger.warn || this.logger.warning).call(this.logger, 'Page closed during watch loop.'); break; }
            if (Date.now() - overallWatchStartTime > maxOverallWatchDurationMs) {
                (this.logger.warn || this.logger.warning).call(this.logger, `Max watch duration for this video exceeded (${((Date.now() - overallWatchStartTime)/1000).toFixed(0)}s / ${(maxOverallWatchDurationMs/1000).toFixed(0)}s). Ending.`); break;
            }

            // Ad handling
            if (this.job.platform === 'youtube' && Date.now() >= adCheckCooldownMs) {
                this.logger.debug('Checking for ads...');
                const adPlayed = await this.handleAds();
                if (adPlayed) {
                    adCheckCooldownMs = Date.now() + AD_CHECK_INTERVAL_DURING_AD;
                    // Reset stall detection after ad, as video state might change
                    lastProgressTimestamp = Date.now();
                    lastKnownGoodVideoTime = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime || 0).catch(() => lastKnownGoodVideoTime);
                    consecutiveStallChecks = 0;
                    this.logger.info('Ad cycle handled, resetting stall detection and allowing video to buffer/resume.');
                    await sleep(1000 + nodeJsRandom(500)); // Give a bit of time for main video to resume
                } else {
                    adCheckCooldownMs = Date.now() + AD_CHECK_INTERVAL_WHEN_NO_AD;
                }
            }
            
            // Mouse movement
            if (Date.now() >= mouseMoveCooldownMs) {
                await simulateMouseMovement(this.page, this.logger);
                mouseMoveCooldownMs = Date.now() + nodeJsRandom(20000, 45000); // Next move in 20-45s
            }

            let videoState = null;
            let isStalledThisCheck = false;

            try {
                if (this.page.url().includes("consent.youtube.com")) { // Re-check for consent page
                    this.logger.warn(`WatchVideo loop detected page is on consent.youtube.com. Triggering stall for recovery.`);
                    isStalledThisCheck = true;
                    consecutiveStallChecks = MAX_STALL_CHECKS_BEFORE_RECOVERY; // Force recovery attempt
                } else {
                    // Get video state
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

                    if (!videoState) { // Should not happen if element exists, but defensive
                        (this.logger.warn || this.logger.warning).call(this.logger, 'Video element not found in evaluate during watch loop. This indicates a serious problem or page redirect.');
                        isStalledThisCheck = true; // Treat as stall
                        consecutiveStallChecks = MAX_STALL_CHECKS_BEFORE_RECOVERY; // Force recovery
                     } else {
                        currentActualVideoTime = videoState.ct || 0;
                        if (currentActualVideoTime > this.maxTimeReachedThisView) {
                            this.maxTimeReachedThisView = currentActualVideoTime;
                        }
                        
                        // Logging video state
                        const videoPlaying = !videoState.p && videoState.rs >= 3 && !videoState.e;
                        if (videoPlaying) {
                            if (currentActualVideoTime > this.lastLoggedVideoTime + 4.5 || this.lastLoggedVideoTime < 0) { // Log every ~5s or if just started
                                this.logger.info(`Video playing at ${currentActualVideoTime.toFixed(1)}s (max: ${this.maxTimeReachedThisView.toFixed(1)}s) RS:${videoState.rs} NS:${videoState.ns} Dim:${videoState.videoWidth}x${videoState.videoHeight}`);
                                this.lastLoggedVideoTime = currentActualVideoTime;
                            } else {
                                this.logger.debug(`Video playing at ${currentActualVideoTime.toFixed(1)}s`);
                            }
                        } else if (videoState.p && !videoState.e) {
                            this.logger.info(`Video PAUSED at ${currentActualVideoTime.toFixed(1)}s. RS:${videoState.rs} NS:${videoState.ns}. Will attempt to resume.`);
                            this.lastLoggedVideoTime = -10; // Force log on next play
                        } else { // Other states (ended, error, etc.)
                             this.logger.debug(`VidState: time=${currentActualVideoTime.toFixed(1)}, maxReached=${this.maxTimeReachedThisView.toFixed(1)}, p=${videoState.p}, e=${videoState.e}, rs=${videoState.rs}, ns=${videoState.ns}, err=${videoState.error?.code}, src=${!!videoState.src}`);
                        }

                        // Error handling from video state
                        if (videoState.error && videoState.error.code) {
                            this.logger.error(`Player Error Detected in watch loop: Code ${videoState.error.code}, Msg: ${videoState.error.message}. Triggering recovery.`);
                            isStalledThisCheck = true;
                            if (videoState.error.code === 2 && recoveryAttemptsThisJob < MAX_RECOVERY_ATTEMPTS_PER_JOB) { // Network error
                                this.logger.warn("Network error (code 2) in player, will attempt recovery via stall logic.");
                            } else if (videoState.error.code === 3 || videoState.error.code === 4) { // Decode/Src error
                                this.logger.error(`Fatal player error (Decode/Src). Code: ${videoState.error.code}`);
                                throw new Error(`Fatal Video Player Error Code ${videoState.error.code}: ${videoState.error.message}`);
                            } else { // Other errors
                                this.logger.error(`Unhandled or non-recoverable player error. Code: ${videoState.error.code}`);
                                if (recoveryAttemptsThisJob >= MAX_RECOVERY_ATTEMPTS_PER_JOB -1) { // Check if this is the last attempt to recover
                                     throw new Error(`Unhandled Video Player Error Code ${videoState.error.code}: ${videoState.error.message} (recovery exhausted)`);
                                }
                            }
                        }
                        
                        // Critical stall condition: ReadyState 0 for too long
                        if (videoState.rs === 0 && (Date.now() - overallWatchStartTime > 15000)) { // If RS0 after 15s
                            if (currentActualVideoTime < 1 && (Date.now() - lastProgressTimestamp) > 5000) { // And no progress for 5s
                                 this.logger.warn(`CRITICAL STALL DETECTED: ReadyState 0. CT: ${currentActualVideoTime.toFixed(1)}. Forcing recovery check.`);
                                 isStalledThisCheck = true;
                                 consecutiveStallChecks = MAX_STALL_CHECKS_BEFORE_RECOVERY; // Force recovery
                            }
                        }

                        // Normal stall detection (if not already critically stalled)
                        if (!isStalledThisCheck) {
                            if (!videoState.p && videoState.rs >= 2 && !videoState.e) { // If playing or trying to play (RS>=2 HAVE_METADATA)
                                if (Math.abs(currentActualVideoTime - lastKnownGoodVideoTime) < 0.8 && (Date.now() - lastProgressTimestamp) > 10000) { // No significant progress in 10s
                                    this.logger.warn(`Normal stall: No progress. CT: ${currentActualVideoTime.toFixed(1)}, LastGood: ${lastKnownGoodVideoTime.toFixed(1)}.`);
                                    isStalledThisCheck = true;
                                } else if (currentActualVideoTime > lastKnownGoodVideoTime + 0.2) { // Progress made
                                    lastKnownGoodVideoTime = currentActualVideoTime;
                                    lastProgressTimestamp = Date.now();
                                    consecutiveStallChecks = 0; // Reset stall counter
                                }
                            } else if (videoState.p && !videoState.e) { // If paused but not ended
                                // If paused, don't count it as a stall yet, but reset progress timer
                                lastProgressTimestamp = Date.now();
                            }
                        }
                     } // End of videoState exists block
                } // End of try-catch for videoState evaluation

                // Attempt to resume if paused and not already stalled
                if (videoState && videoState.p && !videoState.e && this.maxTimeReachedThisView < targetVideoPlayTimeSeconds && !isStalledThisCheck) {
                    const playAttemptSuccess = await this.ensureVideoPlaying(['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'], 'paused-resume');
                    if (!playAttemptSuccess) {
                        this.logger.warn(`ensureVideoPlaying failed to resume playback from paused state. RS: ${videoState.rs}, CT: ${currentActualVideoTime.toFixed(1)}s.`);
                        // If ensureVideoPlaying fails from a paused state, it could indicate a deeper issue.
                        if (videoState.rs === 0 || videoState.networkState === 3) { // No data or network error
                            this.logger.warn(`Critical stall (RS:0 or NS:3) detected by ensureVideoPlaying failure from paused state. Forcing recovery check.`);
                            isStalledThisCheck = true; // Treat as stall
                            consecutiveStallChecks = MAX_STALL_CHECKS_BEFORE_RECOVERY; // Force recovery
                        } else {
                            isStalledThisCheck = true; // General stall if play fails
                        }
                    } else { // ensureVideoPlaying succeeded
                        isStalledThisCheck = false; // Not stalled if it started playing
                        consecutiveStallChecks = 0;
                        lastProgressTimestamp = Date.now();
                        this.lastLoggedVideoTime = -10; // Force log on next play
                    }
                }

                // Handle stall recovery
                if (isStalledThisCheck) {
                    consecutiveStallChecks++; 
                    (this.logger.warn || this.logger.warning).call(this.logger, `Playback stall detected OR ensureVideoPlaying failed. Stalls checks: ${consecutiveStallChecks}. RS: ${videoState?.rs}, NS: ${videoState?.ns}, CT: ${currentActualVideoTime.toFixed(1)}`);
                    
                    if (Actor.isAtHome()) { // Save screenshot on stall
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
                    
                    // Check for YouTube specific error messages on the page
                    const ytErrorLocator = this.page.locator('.ytp-error-content, text=/Something went wrong/i, text=/An error occurred/i, div.ytp-error').first();
                    if (await ytErrorLocator.isVisible({timeout: 1000}).catch(()=>false)) {
                        this.logger.warn('YouTube specific error message detected on player. Prioritizing recovery.');
                    }

                    if (consecutiveStallChecks >= MAX_STALL_CHECKS_BEFORE_RECOVERY) {
                        if (recoveryAttemptsThisJob < MAX_RECOVERY_ATTEMPTS_PER_JOB) {
                            recoveryAttemptsThisJob++;
                            this.logger.warn(`Max stall checks reached (${consecutiveStallChecks}). Attempting recovery ${recoveryAttemptsThisJob}/${MAX_RECOVERY_ATTEMPTS_PER_JOB}...`);
                            consecutiveStallChecks = 0; // Reset stall checks for the recovery attempt
                            const recoveryActionSuccess = await this.attemptPlaybackRecovery();

                            if (recoveryActionSuccess) {
                                this.logger.info(`Recovery attempt ${recoveryAttemptsThisJob} action completed. Re-validating playback...`);
                                // After recovery, re-check consent, video load, and try to play again
                                const playSuccess = await this.ensureVideoPlaying(['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'], `post-recovery-${recoveryAttemptsThisJob}`);
                                if (!playSuccess) {
                                    this.logger.error(`Recovery attempt ${recoveryAttemptsThisJob} failed to restart playback definitively after action.`);
                                    if (recoveryAttemptsThisJob >= MAX_RECOVERY_ATTEMPTS_PER_JOB) throw new Error(`Recovery attempt ${recoveryAttemptsThisJob} failed to restart playback.`);
                                } else {
                                    // Reset progress tracking after successful recovery
                                    lastKnownGoodVideoTime = 0; this.maxTimeReachedThisView = 0;
                                    currentActualVideoTime = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime || 0).catch(()=>0);
                                    lastKnownGoodVideoTime = currentActualVideoTime; this.maxTimeReachedThisView = currentActualVideoTime;
                                    lastProgressTimestamp = Date.now(); this.lastLoggedVideoTime = -10;
                                    consecutiveStallChecks = 0; // Reset stall counter
                                    this.logger.info(`Playback seems to have resumed after recovery ${recoveryAttemptsThisJob}. State: CT: ${currentActualVideoTime.toFixed(1)}s`);
                                    continue; // Continue the main watch loop
                                }
                            } else {
                                this.logger.warn(`Recovery action for attempt ${recoveryAttemptsThisJob} did not result in success.`);
                                if (recoveryAttemptsThisJob >= MAX_RECOVERY_ATTEMPTS_PER_JOB) {
                                     this.logger.error('All recovery actions attempted but failed to restore playback. Failing job.');
                                     throw new Error('Video stalled/player error, all recovery actions failed.');
                                }
                            }
                        } else {
                            this.logger.error('All recovery attempts exhausted. Failing job due to persistent stall.');
                            throw new Error('Video stalled, all recovery attempts exhausted.');
                        }
                    }
                } else { // No stall this check
                    consecutiveStallChecks = 0; // Reset if not stalled
                }
            } catch (e) {
                // Handle critical errors that might break the loop or indicate page closure
                if (e.message.includes('Target closed') || e.message.includes('Protocol error') || e.message.includes('Navigation failed')) {
                    (this.logger.warn || this.logger.warning).call(this.logger, `Watch loop error (Target closed/Protocol/Nav): ${e.message}`); throw e;
                }
                 // Log other errors but continue the loop unless it's a re-thrown fatal error
                 (this.logger.warn || this.logger.warning).call(this.logger, `Video state eval/check error: ${e.message.split('\n')[0]}`);
                 // If it's one of the errors we explicitly throw, re-throw it to stop the job
                 if (e.message.includes('all recovery attempts exhausted') || e.message.includes('Recovery by navigation failed definitively') || e.message.includes('failed to restart playback') || e.message.includes('Video Player Error Code') || e.message.includes('Fatal Video Player Error Code') || e.message.includes('Redirected to consent screen')) throw e;
                 await sleep(checkIntervalMs); // Wait before next iteration if a non-fatal error occurred
                 continue;
            }
            
            // Check for video end or target time reached
            if (videoState && videoState.e) { this.logger.info('Video playback naturally ended.'); break; }
            if (this.maxTimeReachedThisView >= targetVideoPlayTimeSeconds) {
                this.logger.info(`Target watch time reached. Max Reached: ${this.maxTimeReachedThisView.toFixed(1)}s`); break;
            }
            
            // Optional: Simulate some minor user interaction periodically if needed
            // if (loopNumber > 3 && loopNumber % nodeJsRandom(15, 25) === 0 && Math.random() < 0.4) { ... }

            await sleep(Math.max(0, checkIntervalMs - (Date.now() - loopIterationStartTime))); // Adjust sleep to maintain interval
        }
        const actualOverallWatchDurationMs = Date.now() - overallWatchStartTime;
        this.logger.info(`Finished watch. Total loop: ${(actualOverallWatchDurationMs / 1000).toFixed(1)}s. Max video time reached: ${this.maxTimeReachedThisView.toFixed(1)}s.`);
        return {
            actualOverallWatchDurationMs,
            lastReportedVideoTimeSeconds: this.maxTimeReachedThisView, // Report the max time actually seen
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

    // Initialize Actor and Logger
    try {
        await Actor.init();
        console.log('DEBUG: Actor.init() completed successfully.');

        // Attempt to get the logger, with fallbacks
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
                console.dir(Actor, { depth: 3 }); // Log Actor object for inspection
                throw new Error("All attempts to obtain a valid Apify logger failed.");
            }
        }
    } catch (initError) {
        console.error('CRITICAL DEBUG: Actor.init() FAILED or subsequent logger acquisition failed:', initError);
        // Attempt to fail the actor run if possible, even if logger init failed
        if (Actor && Actor.isAtHome && typeof Actor.isAtHome === 'function' && Actor.fail && typeof Actor.fail === 'function') {
            try { await Actor.fail(`Actor.init() or logger acquisition failed: ${initError.message}`); }
            catch (failError) { console.error('CRITICAL DEBUG: Actor.fail() also failed:', failError); }
        }
        process.exit(1); // Exit if basic initialization fails
    }

    // Final check for logger, and use fallback if still not valid
    if (!actorLog || typeof actorLog.info !== 'function' || !(typeof actorLog.warn === 'function' || typeof actorLog.warning === 'function')) {
        console.error('CRITICAL DEBUG: actorLog is STILL UNDEFINED or not a valid logger after all attempts!');
        const fallbackLogger = getSafeLogger(undefined); // getSafeLogger now handles its own warning
        fallbackLogger.error("actorMainLogic: Using fallback logger because all attempts to get Apify logger failed (final check).");
        if (typeof Actor.fail === 'function') { await Actor.fail("Apify logger could not be initialized (final check)."); }
        else { console.error("CRITICAL: Actor.fail is not available. Exiting."); process.exit(1); }
        return; // Should not reach here if Actor.fail works
    }
    // Standardize .warn and .warning
    if (typeof actorLog.warn !== 'function' && typeof actorLog.warning === 'function') {
        actorLog.warn = actorLog.warning;
    }

    actorLog.info('ACTOR_MAIN_LOGIC: Starting YouTube View Bot (v1.9.10).');
    const input = await Actor.getInput();
    if (!input) {
        actorLog.error('ACTOR_MAIN_LOGIC: No input provided.');
        await Actor.fail('No input provided.');
        return;
    }
    actorLog.info('ACTOR_MAIN_LOGIC: Actor input received.');

    // --- Effective Input Processing (using defaults from INPUT_SCHEMA) ---
    const defaultInputFromSchema = {
        videoUrls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'], // Default from schema
        watchTypes: ['direct'], // Default from schema
        refererUrls: [''], // Defaulted to empty for direct
        searchKeywordsForEachVideo: ['funny cat videos, cute kittens'], // Default from schema
        watchTimePercentage: 80, // Default from schema
        useProxies: true, // Default from schema
        proxyUrls: [], // Default from schema
        proxyCountry: 'US', // Default is "Any country" in schema, but 'US' is a good fallback
        proxyGroups: ['RESIDENTIAL'], // Default from schema
        headless: Actor.isAtHome() ? false : true, // Headless on platform if not specified otherwise by user
        concurrency: 1, // Default from schema
        concurrencyInterval: 5, // Default from schema
        timeout: 120, // Default from schema
        maxSecondsAds: 20, // Default from schema (was 15, using user provided 20)
        skipAdsAfter: ["5", "10"], // Default from schema
        autoSkipAds: true, // Default from schema
        stopSpawningOnOverload: true, // Default from schema
        useAV1: false, // Default from schema
    };
    const effectiveInput = { ...defaultInputFromSchema, ...input };
    effectiveInput.headless = !!effectiveInput.headless; // Ensure boolean

    // Process skipAdsAfter to be an array of two numbers
    let tempSkipAds = effectiveInput.skipAdsAfter;
    if (Array.isArray(tempSkipAds) && tempSkipAds.length > 0 && tempSkipAds.every(s => typeof s === 'string' || typeof s === 'number')) {
        const parsedSkipAds = tempSkipAds.map(s => parseInt(String(s), 10)).filter(n => !isNaN(n) && n >= 0);
        if (parsedSkipAds.length === 1) effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[0] + 5]; // If one, make a range
        else if (parsedSkipAds.length >= 2) effectiveInput.skipAdsAfter = [parsedSkipAds[0], parsedSkipAds[1]];
        else effectiveInput.skipAdsAfter = [5, 12]; // Fallback if parsing fails
    } else {
        effectiveInput.skipAdsAfter = [5, 12]; // Default fallback
    }
    // Ensure min is not greater than max for skipAdsAfter
    if (effectiveInput.skipAdsAfter[0] > effectiveInput.skipAdsAfter[1]) {
        effectiveInput.skipAdsAfter[1] = effectiveInput.skipAdsAfter[0] + 5; // Ensure max is at least min + 5
    }
    effectiveInput.maxSecondsAds = Number(effectiveInput.maxSecondsAds);
    if(isNaN(effectiveInput.maxSecondsAds) || effectiveInput.maxSecondsAds < 0) {
        effectiveInput.maxSecondsAds = 20; // Default if invalid
    }


    actorLog.info('ACTOR_MAIN_LOGIC: Effective input (summary):', { videos: effectiveInput.videoUrls.length, proxy: effectiveInput.proxyCountry, headless: effectiveInput.headless, watchPercent: effectiveInput.watchTimePercentage, skipAdsAfter: effectiveInput.skipAdsAfter, maxSecondsAds: effectiveInput.maxSecondsAds, timeout: effectiveInput.timeout });

    if (!effectiveInput.videoUrls || effectiveInput.videoUrls.length === 0) {
        actorLog.error('No videoUrls provided in input.');
        await Actor.fail('No videoUrls provided in input.');
        return;
    }

    // --- Proxy Configuration ---
    let actorProxyConfiguration = null;
    if (effectiveInput.useProxies && !(effectiveInput.proxyUrls && effectiveInput.proxyUrls.length > 0) ) { // Only use Apify proxy if custom URLs are not provided
        const proxyOpts = { groups: effectiveInput.proxyGroups || ['RESIDENTIAL'] };
        if (effectiveInput.proxyCountry && effectiveInput.proxyCountry.trim() !== "" && effectiveInput.proxyCountry.toUpperCase() !== "ANY") {
            proxyOpts.countryCode = effectiveInput.proxyCountry;
        }
        try {
            actorProxyConfiguration = await Actor.createProxyConfiguration(proxyOpts);
            actorLog.info(`Apify Proxy: Country=${proxyOpts.countryCode || 'Any'}, Groups=${(proxyOpts.groups || []).join(', ')}`);
        } catch (e) { actorLog.error(`Failed Apify Proxy config: ${e.message}. Continuing without Apify system proxy for this run.`); actorProxyConfiguration = null; }
    }

    // --- Job Creation ---
    const jobs = [];
    const defaultSearchProfileForUA = getProfileByCountry('US'); // Get a default US profile for sensible UA
    const userAgentStringsForSearch = [ // A small pool of UAs for search
        defaultSearchProfileForUA.userAgent, // Use one from our profiles
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36', // A recent generic one
    ];


    for (let i = 0; i < effectiveInput.videoUrls.length; i++) {
        const url = effectiveInput.videoUrls[i];
        const videoId = extractVideoIdFromUrl(url, actorLog); // Use the refined extractor
        if (!videoId) {
            (actorLog.warn || actorLog.warning).call(actorLog, `Invalid YouTube/Rumble URL/ID: "${url}". Skipping.`);
            await Actor.pushData({ url, status: 'error', error: 'Invalid Video URL' });
            continue;
        }

        const watchType = (effectiveInput.watchTypes && effectiveInput.watchTypes[i]) || 'direct';
        const refererUrl = (watchType === 'referer' && effectiveInput.refererUrls && effectiveInput.refererUrls[i] && effectiveInput.refererUrls[i].trim() !== "")
            ? effectiveInput.refererUrls[i].trim()
            : null; // Default to null if not applicable or empty

        let searchKeywords = [];
        if (watchType === 'search' && effectiveInput.searchKeywordsForEachVideo && typeof effectiveInput.searchKeywordsForEachVideo[i] === 'string') {
            searchKeywords = effectiveInput.searchKeywordsForEachVideo[i].split(',').map(kw => kw.trim()).filter(kw => kw.length > 0);
        }

        jobs.push({
            id: uuidv4(), videoUrl: url, videoId, platform: url.includes('rumble.com') ? 'rumble' : 'youtube',
            referer: refererUrl, video_info: { duration: 300, isLive: false }, // Default duration, will be updated
            watch_time: effectiveInput.watchTimePercentage, jobIndex: i, // Pass job index
            watchType, searchKeywords
        });
    }

    if (jobs.length === 0) { actorLog.error('No valid jobs to process.'); await Actor.fail('No valid jobs to process.'); return; }
    actorLog.info(`ACTOR_MAIN_LOGIC: Created ${jobs.length} job(s). Concurrency: ${effectiveInput.concurrency}`);

    // --- Job Processing ---
    const overallResults = { totalJobs: jobs.length, successfulJobs: 0, failedJobs: 0, details: [], startTime: new Date().toISOString() };
    const activeWorkers = new Set();
    let jobCounter = 0;

    const processJob = async (job) => {
        const jobLogger = actorLog.child({ prefix: `Job-${job.videoId.substring(0,4)}-${job.id.substring(0,4)}: ` });
        if (typeof jobLogger.warn !== 'function' && typeof jobLogger.warning === 'function') { // Ensure .warn exists
            jobLogger.warn = jobLogger.warning;
        }

        jobLogger.info(`Starting job ${job.jobIndex + 1}/${jobs.length}, Platform: ${job.platform}, Type: ${job.watchType}, Referer: ${job.referer || 'None'}`);
        let proxyUrlString = null;
        let proxyInfoForLog = 'None'; // For logging

        if (effectiveInput.useProxies) {
            if (effectiveInput.proxyUrls && effectiveInput.proxyUrls.length > 0) {
                proxyUrlString = effectiveInput.proxyUrls[job.jobIndex % effectiveInput.proxyUrls.length]; // Cycle through custom proxies
                try {
                    const tempUrl = new URL(proxyUrlString);
                    proxyInfoForLog = `CustomProxy: ${tempUrl.hostname}`;
                } catch { proxyInfoForLog = 'CustomProxy: (unable to parse host)';}
                jobLogger.info(`Using custom proxy: ${proxyInfoForLog}`);
            } else if (actorProxyConfiguration) {
                const sessionId = `session_${job.id.substring(0, 12).replace(/-/g, '')}`; // Unique session for proxy rotation
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
        // --- YouTube Search Logic (if watchType is 'search') ---
        let youtubeSearchUrl = ''; // To store the search URL for logging
        if (job.platform === 'youtube' && job.watchType === 'search' && job.searchKeywords && job.searchKeywords.length > 0) {
            jobLogger.info(`Attempting YouTube search for: "${job.searchKeywords.join(', ')}" to find ID: ${job.videoId}`);
            let searchBrowser = null, searchContext = null, searchPage = null;
            const searchLaunchOptions = { headless: effectiveInput.headless, args: [...ANTI_DETECTION_ARGS] }; 
             // Ensure no conflicting window size if already set by profile for main browser
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
                const searchUserAgent = userAgentStringsForSearch[nodeJsRandom(0, userAgentStringsForSearch.length-1)]; // Pick a random UA for search
                
                // Use a distinct fingerprint profile for the search to vary parameters
                const searchFingerprintProfile = getProfileByCountry(effectiveInput.proxyCountry);
                searchFingerprintProfile.userAgent = searchUserAgent; // Override UA for this specific search
                if (!searchLaunchOptions.args.some(arg => arg.startsWith('--window-size'))) { // Only add if not already present
                    searchLaunchOptions.args.push(`--window-size=${searchFingerprintProfile.screen.width || 1920},${searchFingerprintProfile.screen.height || 1080}`);
                }

                searchBrowser = await playwright.chromium.launch(searchLaunchOptions);

                searchContext = await searchBrowser.newContext({ 
                    userAgent: searchFingerprintProfile.userAgent,
                    locale: searchFingerprintProfile.locale,
                    timezoneId: searchFingerprintProfile.timezoneId,
                    // Use viewport from fingerprint, or fallback if headless
                    screen: {
                        width: searchFingerprintProfile.screen.width,
                        height: searchFingerprintProfile.screen.height,
                    },
                    viewport: {
                        width: effectiveInput.headless ? 1920 : searchFingerprintProfile.screen.width,
                        height: effectiveInput.headless ? 1080 : searchFingerprintProfile.screen.height,
                    },
                    ignoreHTTPSErrors: true,
                });

                // applyAntiDetectionScripts call is SKIPPED
                jobLogger.info('SearchAntiDetect: Custom scripts SKIPPED (v1.9.10).');


                searchPage = await searchContext.newPage();

                const searchQuery = job.searchKeywords[nodeJsRandom(0, job.searchKeywords.length - 1)]; // Pick one keyword
                youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
                jobLogger.info(`Navigating to search URL: ${youtubeSearchUrl}`);
                await searchPage.goto(youtubeSearchUrl, { waitUntil: 'domcontentloaded', timeout: effectiveInput.timeout * 1000 }); 
                await handleYouTubeConsent(searchPage, jobLogger.child({prefix: 'SearchConsent: '}), 1, 2); // Fewer retries for search consent
                
                jobLogger.info('enableAutoplayWithInteraction SKIPPED for search stability test (v1.9.10).');

                // More specific selector for the video link
                const videoLinkSelector = `a#video-title[href*="/watch?v=${job.videoId}"]`;
                jobLogger.info(`Looking for video link: ${videoLinkSelector}`);
                
                // Scroll a bit to load more results if necessary
                const scrollCount = nodeJsRandom(2,4); // Scroll 2 to 4 times
                for(let k=0; k < scrollCount; k++) {
                    const scrollRatio = Math.random() * (0.7 - 0.3) + 0.3; // Scroll 30-70% of viewport height
                    await searchPage.evaluate((ratio) => window.scrollBy(0, window.innerHeight * ratio), scrollRatio);
                    await sleep(500 + nodeJsRandom(100, 500));
                }

                const videoLinkElement = searchPage.locator(videoLinkSelector).first();
                let videoLinkVisible = false;
                try {
                    await videoLinkElement.waitFor({ state: 'visible', timeout: 10000 }); // Wait up to 10s
                    videoLinkVisible = true;
                } catch {
                    jobLogger.info('Direct video link not immediately visible, trying "Videos" filter if present...');
                    const videosFilterButton = searchPage.locator('yt-chip-cloud-chip-renderer:has-text("Videos"), yt-chip-cloud-chip-renderer[aria-label="Search for Videos"]').first();
                     if (await videosFilterButton.isVisible({timeout: 3000}).catch(() => false)) {
                        await videosFilterButton.click({force: true, timeout: 3000}).catch(e => jobLogger.warn(`Failed to click Videos filter: ${e.message}`));
                        await searchPage.waitForTimeout(nodeJsRandom(2000,4000)); // Wait for filter to apply
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
                        const linkTitle = await videoLinkElement.textContent({timeout: 2000}).catch(() => 'N/A');
                        // Ensure the extracted ID from the found link matches the target job.videoId
                        if (href.includes(job.videoId)) {
                            jobLogger.info(`Video found via search: ${fullVideoUrl}. Title: ${linkTitle}. Updating job URL and referer.`);
                            job.videoUrl = fullVideoUrl; // Update the job's URL to the one found by search
                            job.referer = currentSearchPageUrl; // Set the search results page as the referer
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
                 jobLogger.error(`YouTube search navigation to "${youtubeSearchUrl || 'undefined URL'}" failed: ${searchError.message}. Call log: ${searchError.stack ? searchError.stack.split('\n').slice(0,3).join(' | ') : 'N/A'}. Falling back to direct URL: ${job.videoUrl}`);
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

        // --- End YouTube Search Logic ---


        const worker = new YouTubeViewWorker(job, effectiveInput, proxyUrlString, jobLogger);
        let jobResultData = {
            jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId,
            platform: job.platform, // Added platform
            status: 'initiated', proxyUsed: proxyInfoForLog, refererRequested: job.referer,
            watchTypePerformed: job.watchType, // Log the actual watch type used
            fingerprintProfileKey: worker.fingerprintProfile.profileKeyName || 'N/A',
            error: null,
            lastReportedVideoTimeSeconds: 0,
            targetVideoPlayTimeSeconds: 0, // Will be updated after duration is known
            videoDurationSeconds: 0 // Will be updated after duration is known
        };

        try {
            await worker.startWorker(); // This now includes consent, quality, and initial play
            jobResultData.targetVideoPlayTimeSeconds = Math.max(10, (effectiveInput.watchTimePercentage / 100) * worker.job.video_info.duration);
            jobResultData.videoDurationSeconds = worker.job.video_info.duration;

            const watchResult = await worker.watchVideo();
            Object.assign(jobResultData, watchResult); // Merge results like lastReportedVideoTimeSeconds

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
            jobResultData.lastReportedVideoTimeSeconds = worker.maxTimeReachedThisView; // Store max time reached even on failure
            if (worker.job && worker.job.video_info && worker.job.video_info.duration) { // If duration was known
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

    // --- Concurrency Management and Job Execution ---
    const runPromises = [];
    for (const job of jobs) {
        // Wait if concurrency limit is reached
        while (activeWorkers.size >= effectiveInput.concurrency) {
            (actorLog.warning || actorLog.warn).call(actorLog, `Concurrency limit ${effectiveInput.concurrency} reached (active: ${activeWorkers.size}). Waiting for a slot.`);
            try {
                 await Promise.race(Array.from(activeWorkers)); // Wait for any active worker to finish
            } catch (e) {
                 // This catch is important if a worker promise rejects,
                 // Promise.race would reject immediately. We log it but continue trying to fill slots.
                 actorLog.debug(`Error during Promise.race (worker slot wait), likely already handled: ${e.message.substring(0,100)}`);
            }
        }

        // Stop spawning if system overload is detected (Apify platform specific)
        if (effectiveInput.stopSpawningOnOverload && Actor.isAtHome() && await Actor.isAtCapacity()) {
            actorLog.warn('Apify platform is at capacity. Stopping further job spawning.');
            break; 
        }
        
        const promise = processJob(job).catch(e => {
            // This catch block is for errors that might escape from processJob despite its own try/catch/finally
            actorLog.error(`Unhandled error directly from processJob promise for ${job.videoId}: ${e.message}`);
            const errorResult = { 
                jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId, 
                status: 'catastrophic_processJob_failure', 
                error: e.message  + (e.stack ? ` | STACK: ${e.stack.substring(0,200)}` : '')
            };
            Actor.pushData(errorResult).catch(pushErr => console.error("Failed to pushData for catastrophic failure:", pushErr));
            overallResults.failedJobs++;
            // Ensure the error result is added if not already present from within processJob
            if (!overallResults.details.find(d => d.jobId === job.id)) {
                overallResults.details.push(errorResult);
            }
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
        // This is a final safety net. Errors should ideally be caught and handled within processJob.
        actorLog.error(`Error caught by final Promise.all on a worker promise (should have been handled earlier): ${e.message}`);
        return e; // Return error to prevent Promise.all from rejecting prematurely if one worker fails badly
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
