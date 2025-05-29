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
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? -120 : -60; },
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
    const deepCopy = (profile) => JSON.parse(JSON.stringify(profile));
    const matchingProfileKeys = Object.keys(FINGERPRINT_PROFILES).filter(k => k.startsWith(countryUpper + '_'));

    if (matchingProfileKeys.length > 0) {
        const selectedKey = matchingProfileKeys[Math.floor(Math.random() * matchingProfileKeys.length)];
        return deepCopy(FINGERPRINT_PROFILES[selectedKey]);
    }
    const usProfileKeys = Object.keys(FINGERPRINT_PROFILES).filter(k => k.startsWith('US_'));
    if (usProfileKeys.length > 0) {
         const selectedKey = usProfileKeys[Math.floor(Math.random() * usProfileKeys.length)];
         console.warn(`No profile for country ${countryCode}, falling back to US profile: ${selectedKey}`);
         return deepCopy(FINGERPRINT_PROFILES[selectedKey]);
    }
    const randomKey = getRandomProfileKeyName();
    console.warn(`No profile for country ${countryCode} or US, falling back to random profile: ${randomKey}`);
    return deepCopy(FINGERPRINT_PROFILES[randomKey]);
}

console.log('MAIN.JS: StealthPlugin application SKIPPED for v1.9.7 (replicating b0zDz9AEx6U1cx1N2 baseline).');


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
            for (const key in this) {
                if (typeof this[key] === 'function' && key !== 'child' && key !== 'prefix') {
                    childConsoleLogger[key] = (m, d) => this[key](`${newPrefix}${m || ''}`, d);
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

function extractVideoIdFromUrl(url, logger) {
    const safeLogger = getSafeLogger(logger);
    try {
        const urlObj = new URL(url);
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const vParam = urlObj.searchParams.get('v');
            if (vParam && vParam.length === 11) return vParam;
            const pathParts = urlObj.pathname.split('/');
            if (urlObj.hostname === 'youtu.be' && pathParts.length > 1 && pathParts[1].length === 11) return pathParts[1];
            if (pathParts.length > 2 && (pathParts[1] === 'shorts' || pathParts[1] === 'embed' || pathParts[1] === 'live') && pathParts[2].length === 11) return pathParts[2];
            if (pathParts.length > 1 && pathParts[1].length === 11 && !vParam) return pathParts[1];
        } else if (url.includes('rumble.com')) {
            const pathParts = urlObj.pathname.split('/');
            const videoPart = pathParts.find(part => part.match(/^v[a-zA-Z0-9]+(-.*\.html)?$/));
            if (videoPart) {
                return videoPart.split('-')[0];
            }
        }
    } catch (error) {
        safeLogger.error(`Error extracting video ID from URL ${url}: ${error.message}`);
    }
    (safeLogger.warn || safeLogger.warning).call(safeLogger, `Could not extract valid YouTube/Rumble video ID from: ${url}`);
    return null;
}

async function handleYouTubeConsent(page, logger, attempt = 1, maxAttempts = 3) { // maxAttempts increased
    const safeLogger = getSafeLogger(logger);
    safeLogger.info(`Checking for YouTube consent dialog (attempt ${attempt}/${maxAttempts})... Current URL: ${page.url().substring(0,100)}`);
    
    // More specific selectors first, then broader ones.
    // Added selectors for the "Confirm your settings" flow based on provided HTML.
    const consentButtonSelectors = [
        // Standard "Accept All" type buttons
        'button[aria-label*="Accept all"]', 
        'button[aria-label*="Accept the use of cookies"]',
        'button[aria-label*="Agree to all"]', 
        'button[aria-label*="Agree"]',
        'ytd-button-renderer:has-text("Accept all")', 
        'tp-yt-paper-button:has-text("ACCEPT ALL")',
        '#introAgreeButton',
        // For "Confirm your settings" flow
        'form[action="https://consent.youtube.com/save"] button:has(span:text-is("Confirm your settings"))', // Exact match from HTML
        'form[action*="consent.youtube.com/save"] button[jsname="j6LnYe"]', // jsname from "Confirm"
        'button:has-text("Confirm")', // More generic confirm
        // Generic fallback if others fail (could be risky)
        'form[action*="consent.youtube.com"] button[type="submit"]',
        'div[class*="consent"] button[class*="accept"]',
        'button:has(span:text-is("Accept all"))', 
    ];
    // Broader dialog selector
    const consentDialogSelector = 'ytd-consent-bump-v2-lightbox, tp-yt-paper-dialog[role="dialog"], div[aria-modal="true"]:has(h1:text-matches(/Before you continue/i)), div[class*="consent-form"], form[action*="consent.youtube.com/save"]';
    const consentVisibilityTimeout = 7000;

    let consentDialog = page.locator(consentDialogSelector).first();
    let dialogInitiallyVisible = false;
    try {
        // Try to switch to an iframe if the main dialog isn't found.
        // This is a very basic iframe check; more robust iframe handling might be needed.
        const iframes = page.frames();
        let foundInIframe = false;
        for (const frame of iframes) {
            try {
                consentDialog = frame.locator(consentDialogSelector).first();
                if (await consentDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
                    safeLogger.info('Consent dialog detected within an iframe.');
                    page = frame; // Switch page context to the iframe
                    dialogInitiallyVisible = true;
                    foundInIframe = true;
                    break;
                }
            } catch (iframeError) {
                safeLogger.debug(`Error checking iframe for consent: ${iframeError.message.split('\n')[0]}`);
            }
        }
        if (!foundInIframe) {
            consentDialog = page.locator(consentDialogSelector).first(); // Reset to main page if not in iframe
            dialogInitiallyVisible = await consentDialog.isVisible({ timeout: consentVisibilityTimeout });
        }

    } catch (e) {
        safeLogger.debug(`Consent dialog visibility check timed out or failed: ${e.message.split('\n')[0]}`);
    }

    if (dialogInitiallyVisible) {
        safeLogger.info('Consent dialog element IS visible.');
        for (const selector of consentButtonSelectors) {
            try {
                const button = page.locator(selector).first(); // page context might be an iframe here
                if (await button.isVisible({ timeout: consentVisibilityTimeout / 2 })) {
                    safeLogger.info(`Consent button found: "${selector}". Attempting to click.`);
                    await button.click({ timeout: 3000, force: true, noWaitAfter: false }); // noWaitAfter:false might be safer here
                    await page.waitForTimeout(2000 + nodeJsRandom(500, 1500)); // Longer wait after click
                    safeLogger.info('Consent button clicked.');
                    
                    // Re-check if dialog is gone more reliably from the main page context
                    const mainPageConsentDialog = (page.parentFrame() || page).locator(consentDialogSelector).first();
                    if (!await mainPageConsentDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
                        safeLogger.info('Consent dialog successfully dismissed.');
                        return true;
                    } else {
                        (safeLogger.warn || safeLogger.warning).call(safeLogger, 'Clicked consent, but a dialog (or part of it) might still be visible after click.');
                    }
                    return true; 
                }
            } catch (e) {
                safeLogger.debug(`Consent selector "${selector}" not actionable/error: ${e.message.split('\n')[0]}`);
            }
        }
        (safeLogger.warn || safeLogger.warning).call(safeLogger, 'Consent dialog was visible, but no known accept/confirm button was found or clickable.');
        if (attempt < maxAttempts) {
            safeLogger.info(`Retrying consent check after a small delay (attempt ${attempt + 1}).`);
            await sleep(2500 + nodeJsRandom(500));
            return await handleYouTubeConsent(page.parentFrame() || page, logger, attempt + 1, maxAttempts); // Ensure we use main page context for retry
        }
        return false;
    }
    
    safeLogger.info('No actionable consent dialog found (dialog element not visible on this check).');
    return false;
}

const ANTI_DETECTION_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--mute-audio',
    '--ignore-certificate-errors',
    // '--disable-features=IsolateOrigins,site-per-process,Translate,OptimizationHints,PrivacySandboxAdsAPIsOverride',
    // '--disable-site-isolation-trials',
    // '--flag-switches-begin --disable-smooth-scrolling --flag-switches-end'
];

async function applyAntiDetectionScripts(pageOrContext, logger, fingerprintProfile) {
    const safeLogger = getSafeLogger(logger);
    safeLogger.info(`Custom anti-detection scripts SKIPPED (v1.9.7). Fingerprinting primarily via context & initScript.`);
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
async function clickIfExists(page, selector, timeout = 3000, logger, forceClick = true) {
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

    let settingsButton;
    try {
        settingsButton = page.locator(settingsButtonSelector);
        await settingsButton.waitFor({ state: 'visible', timeout: 5000 });
        
        const playerLocator = page.locator('#movie_player, .html5-video-player').first();
        if (await playerLocator.count() > 0 && await playerLocator.isVisible({timeout:1000})) {
             await playerLocator.hover({timeout: 1000, force:true }).catch(e => safeLogger.debug(`Player hover for quality failed: ${e.message}`));
             await sleep(300 + nodeJsRandom(200));
        } else {
            safeLogger.debug('Player element not found for hover before quality settings.');
        }

        await settingsButton.click({ timeout: 3000, force: true });
        safeLogger.info('Clicked settings button.');
        await sleep(nodeJsRandom(800, 1300));

        // Use a more reliable way to find the "Quality" menu item, considering localization might affect text.
        // This looks for a menu item that contains a div with "Quality" (or its translation if YouTube changes structure).
        const qualityMenuItem = page.locator('.ytp-menuitem:has(.ytp-menuitem-label:text-matches(/^Quality$/i))').first();
        let qualityMenuClicked = false;
        if (await qualityMenuItem.isVisible({timeout: 5000}).catch(() => false)) {
            await qualityMenuItem.click({ timeout: 3000, force: true });
            safeLogger.info('Clicked "Quality" menu item.');
            qualityMenuClicked = true;
        } else {
            safeLogger.warn('Standard "Quality" menu item not found. Trying alternative selectors...');
             const altQualitySelectors = [
                '.ytp-menuitem-label:has-text("Quality")', // Simpler label check
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
                if (await settingsButton.isVisible({timeout:500}).catch(()=>false)) await settingsButton.click({timeout:1000, force:true}).catch(()=>{});
                return false;
            }
        }
        await sleep(nodeJsRandom(800, 1300));

        let qualitySet = false;
        const targetQualities = ["144p", "240p"]; // Prioritize these
        const qualityOptionLocators = page.locator('.ytp-quality-menu .ytp-menuitem[role="menuitemradio"]');

        for (const targetQualityText of targetQualities) {
            for (let i = 0; i < await qualityOptionLocators.count(); i++) {
                const option = qualityOptionLocators.nth(i);
                const labelText = await option.textContent({timeout: 500}).catch(() => '');
                if (labelText && labelText.includes(targetQualityText)) {
                    if (await option.isVisible({timeout:1000})) {
                        await option.click({ timeout: 2000, force: true });
                        safeLogger.info(`Selected video quality: ${targetQualityText}`);
                        qualitySet = true;
                        break;
                    }
                }
            }
            if (qualitySet) break;
        }
        

        if (!qualitySet) {
            safeLogger.warn('Specific low quality (144p/240p) not found. Attempting to select the last available quality option.');
            const count = await qualityOptionLocators.count();
            safeLogger.debug(`Found ${count} quality options in menu.`);
            if (count > 0) { 
                let lastSelectableItem = null;
                for (let i = count -1; i >= 0; i--) { // Iterate backwards
                    const item = qualityOptionLocators.nth(i);
                    const text = await item.textContent({timeout: 200}).catch(() => '');
                    // Avoid "Auto" if possible, otherwise take the absolute last one
                    if (text && !text.toLowerCase().includes('auto')) {
                        lastSelectableItem = item;
                        break;
                    }
                    if (i === 0 && !lastSelectableItem) lastSelectableItem = item; // Fallback to first if only Auto or nothing else found
                }
                if (lastSelectableItem && await lastSelectableItem.isVisible({timeout: 500})) {
                    await lastSelectableItem.click({ timeout: 2000, force: true });
                    qualitySet = true;
                    safeLogger.info(`Selected fallback quality option: ${await lastSelectableItem.textContent()}`);
                } else {
                    safeLogger.warn('Could not select a fallback quality option.');
                }
            } else {
                 safeLogger.warn('No quality option locators found for fallback.');
            }
        }
        
        await sleep(nodeJsRandom(500, 1000));
        // Ensure settings menu is closed if it was opened
        if (await settingsButton.isVisible({timeout:500}).catch(() => false) && 
            await page.locator('.ytp-settings-menu').isVisible({timeout:500}).catch(()=>false)) {
             await settingsButton.click({timeout:1000, force:true}).catch(e => safeLogger.debug(`Failed to close settings menu after quality attempt: ${e.message}`));
        }
        return qualitySet;

    } catch (e) {
        safeLogger.error(`Error setting video quality: ${e.message.split('\n')[0]}`);
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

        const playerElement = page.locator('#movie_player, .html5-video-player, div#player.style-scope.ytd-watch-flexy').first();
        let targetX, targetY;
        let moveWithinPlayer = false;

        if (await playerElement.count() > 0 && await playerElement.isVisible({timeout: 500}).catch(() => false)) {
            const bb = await playerElement.boundingBox({timeout:1000});
            if (bb && bb.width > 100 && bb.height > 100) {
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
        
        if (!moveWithinPlayer) {
            targetX = Math.random() * viewport.width;
            targetY = Math.random() * viewport.height;
            safeLogger.debug(`Mouse target is within viewport (player not suitable): ${targetX.toFixed(0)},${targetY.toFixed(0)}`);
        }
        
        targetX = Math.max(0, Math.min(viewport.width - 1, targetX));
        targetY = Math.max(0, Math.min(viewport.height - 1, targetY));

        const steps = nodeJsRandom(5, 15);
        safeLogger.debug(`Simulating mouse move to (${targetX.toFixed(0)}, ${targetY.toFixed(0)}) over ${steps} steps.`);
        await page.mouse.move(targetX, targetY, { steps });
        await sleep(nodeJsRandom(100, 300));
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
        this.lastLoggedVideoTime = -10;
        
        this.logger.info('Worker instance constructed.');
    }
    createFallbackLogger(prefix) {
        const self = this;
        return {
            prefix: prefix,
            info: (m, d) => console.log(`INFO ${self.prefix || prefix}${m || ''}`, d || ''),
            warn: (m, d) => console.warn(`WARN ${self.prefix || prefix}${m || ''}`, d || ''),
            warning: (m, d) => console.warn(`WARN ${self.prefix || prefix}${m || ''}`, d || ''),
            error: (m, d) => console.error(`ERROR ${self.prefix || prefix}${m || ''}`, d || ''),
            debug: (m, d) => console.log(`DEBUG ${self.prefix || prefix}${m || ''}`, d || ''),
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
        this.logger.info('Browser launched directly with Playwright (StealthPlugin SKIPPED for v1.9.7).');

        this.context = await this.browser.newContext({
            userAgent: this.fingerprintProfile.userAgent,
            locale: this.fingerprintProfile.locale,
            timezoneId: this.fingerprintProfile.timezoneId,
            acceptDownloads: false,
            screen: { 
                width: this.fingerprintProfile.screen.width,
                height: this.fingerprintProfile.screen.height
            },
            viewport: {
                width: this.effectiveInput.headless ? 1920 : this.fingerprintProfile.screen.width,
                height: this.effectiveInput.headless ? 1080 : this.fingerprintProfile.screen.height
            },
            ignoreHTTPSErrors: true,
            bypassCSP: true,
            javaScriptEnabled: true,
            permissions: ['geolocation', 'notifications'],
            geolocation: this.effectiveInput.proxyCountry === 'US' ? { latitude: 34.0522, longitude: -118.2437 } :
                         this.effectiveInput.proxyCountry === 'GB' ? { latitude: 51.5074, longitude: 0.1278 } :
                         this.effectiveInput.proxyCountry === 'HU' ? { latitude: 47.4979, longitude: 19.0402 } :
                         this.fingerprintProfile.timezoneId === 'America/New_York' ? { latitude: 40.7128, longitude: -74.0060 } :
                         this.fingerprintProfile.timezoneId === 'America/Los_Angeles' ? { latitude: 34.0522, longitude: -118.2437 } :
                         this.fingerprintProfile.timezoneId === 'Europe/London' ? { latitude: 51.5074, longitude: -0.1278 } :
                         this.fingerprintProfile.timezoneId === 'Europe/Budapest' ? { latitude: 47.4979, longitude: 19.0402 } :
                         undefined,
            deviceScaleFactor: (this.fingerprintProfile.screen.width > 1920 || this.fingerprintProfile.screen.height > 1080) ? 1.5 : 1,
            isMobile: false,
            hasTouch: false,
            extraHTTPHeaders: this.job.referer ? { 'Referer': this.job.referer } : undefined,
        });
        this.logger.info(`Browser context created. Profile hints: locale=${this.fingerprintProfile.locale}, TZID=${this.fingerprintProfile.timezoneId}, Referer: ${this.job.referer || 'None'}`);

        await applyAntiDetectionScripts(this.context, this.logger, this.fingerprintProfile);

        this.page = await this.context.newPage();
        this.logger.info('New page created.');
        
        this.page.on('console', msg => {
            const type = msg.type();
            const text = msg.text().substring(0, 250);
            if (type === 'error' || type === 'warn') {
                this.logger.warn(`PAGE_CONSOLE (${type.toUpperCase()}): ${text}`);
            } else if (['info', 'log', 'debug'].includes(type)) {
                 this.logger.debug(`PAGE_CONSOLE (${type.toUpperCase()}): ${text}`);
            }
        });
        
        await this.page.addInitScript((fp) => {
            try {
                Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
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
                        if (parameter === this.UNMASKED_VENDOR_WEBGL) return fp.webGLVendor;
                        if (parameter === this.UNMASKED_RENDERER_WEBGL) return fp.webGLRenderer;
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
        
        await handleYouTubeConsent(this.page, this.logger, 1, 3); // Increased maxAttempts for consent
        await sleep(nodeJsRandom(2000, 4000));

        this.logger.info('enableAutoplayWithInteraction SKIPPED for stability test (v1.9.7).');

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
        
        if (this.job.platform === 'youtube') {
            await setVideoQualityToLowest(this.page, this.logger);
        } else {
            this.logger.info(`Skipping video quality setting for non-YouTube platform: ${this.job.platform}`);
        }

        const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];
        this.logger.info('Attempting to ensure video is playing after load and quality set...');
        const initialPlaySuccess = await this.ensureVideoPlaying(playButtonSelectors, 'initial-setup-ultra-enhanced-v1.6-retest'); 
        
        if (!initialPlaySuccess) {
            this.logger.warn('Initial play attempts failed. Attempting playbackRecovery method...');
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
            this.logger.info('Video confirmed playing after initial setup.');
        }

        await sleep(nodeJsRandom(2000, 4500));
        return true;
    }

    async handleAds() {
        let adWasPlayingThisCheckCycle = false;
        const adSelectors = [
            '.ytp-ad-player-overlay-instream-info',
            '.video-ads .ad-showing',
            '.ytp-ad-text',
            'div[class*="ytp-ad-"][style*="display: block"]',
            '.ytp-ad-skip-button-container',
            '.ytp-ad-message-container',
        ];
        
        let isAdCurrentlyPlaying = false;
        for (const selector of adSelectors) {
            if (await this.page.locator(selector).first().isVisible({timeout: 250}).catch(() => false)) {
                isAdCurrentlyPlaying = true;
                this.logger.debug(`Ad indicator "${selector}" visible.`);
                break;
            }
        }

        if (!isAdCurrentlyPlaying) {
            this.logger.debug('No ad indicators found this check.');
            return false;
        }

        this.logger.info('Ad detected! Entering ad handling loop.');
        adWasPlayingThisCheckCycle = true;

        const adSkipCheckInterval = 1500;
        const maxAdWatchDuration = this.effectiveInput.maxSecondsAds * 1000;
        const adLoopStartTime = Date.now();

        while (Date.now() - adLoopStartTime < maxAdWatchDuration) {
            if (this.killed || this.page.isClosed()) break;

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

            const skipButtonSelectors = [
                '.ytp-ad-skip-button-modern',
                '.ytp-ad-skip-button',
                'button[aria-label*="Skip Ad"]',
                'button[aria-label*="Skip ad"]',
                '.videoAdUiSkipButton',
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
                    await sleep(1500 + nodeJsRandom(500));
                    break;
                }
            } else if (canSkip && skipSelectorToUse && (Date.now() - adLoopStartTime >= minSkipTimeMs)) {
                this.logger.info(`Ad skippable (${skipSelectorToUse}) and min watch time (${(minSkipTimeMs/1000).toFixed(1)}s) met. Attempting skip.`);
                if (await clickIfExists(this.page, skipSelectorToUse, 1000, this.logger)) {
                    await sleep(1500 + nodeJsRandom(500));
                    break;
                }
            }
            await sleep(adSkipCheckInterval);
        }

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

            if (videoState.muted) {
                try {
                    await this.page.evaluate(() => {
                        const video = document.querySelector('video.html5-main-video');
                        if (video) { video.muted = false; video.volume = 0.01 + Math.random() * 0.09; }
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
                    await playerElement.focus({timeout: 1000}).catch(e => logFn(`Focus failed for playerElement: ${e.message}`, 'debug'));
                    await this.page.keyboard.press('Space', {delay: nodeJsRandom(50,150)});
                    logFn('Focused player/body and pressed Space key');
                    await sleep(1000 + nodeJsRandom(300));
                    const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                    if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after Space key. Time: ${tempState.ct?.toFixed(1)}`); return true; }
                }
            } catch (e) { logFn(`Failed to focus player and press Space: ${e.message.split('\n')[0]}`, 'debug'); }

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

            if (videoState.p && !videoState.ended) {
                try {
                    await this.page.evaluate(() => {
                        const video = document.querySelector('video.html5-main-video');
                        if (video) {
                            if (video.muted) { video.muted = false; video.volume = 0.01 + Math.random() * 0.09; }
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

            try { 
                await this.page.locator('body').press('k', {delay: nodeJsRandom(50,150)});
                logFn('Pressed "k" key again to toggle play/pause');
                await sleep(1000 + nodeJsRandom(300));
                const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended,ct:v.currentTime} : {p:true,rs:0,e:true,ct:0}; }).catch(()=>({p:true,rs:0,e:true,ct:0}));
                if (!tempState.p && tempState.rs >= 3 && !tempState.e) { logFn(`Video playing after second "k" key. Time: ${tempState.ct?.toFixed(1)}`); return true;}
            } catch (e) { logFn(`Failed to press "k" key (second time): ${e.message.split('\n')[0]}`, 'debug'); }

            if (attempt === 2 && videoState.p) {
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

            if (attempt < 2) await sleep(2000 + attempt * 1000);
        }
        
        logFn('Failed to ensure video is playing after multiple attempts.', 'warn');
        return false;
    }

    async attemptPlaybackRecovery() { // Simplified recovery
        this.logger.warn('Attempting playback recovery...');
        let success = false;
        try {
            // Option 1: Simple Refresh
            this.logger.info('Recovery: Attempting page.reload()');
            await this.page.reload({ waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 * 0.7 });
            await sleep(2000 + nodeJsRandom(1000));
            await handleYouTubeConsent(this.page, this.logger.child({prefix: 'RecoveryConsentRefresh:'}), 1, 2);
            await waitForVideoToLoad(this.page, this.logger.child({prefix: 'RecoveryLoadRefresh:'}), 60000);
            if (this.job.platform === 'youtube') {
                await setVideoQualityToLowest(this.page, this.logger.child({prefix: 'RecoveryQualityRefresh:'}));
            }
            success = await this.ensureVideoPlaying(['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'], 'recovery-refresh');
            if (success) {
                this.logger.info('Playback recovery successful via REFRESH!');
                return true;
            }

            // Option 2: Navigate to original URL again (if refresh failed)
            this.logger.info(`Recovery: Refresh failed. Attempting to re-navigate to original job URL: ${this.job.videoUrl}`);
            await this.page.goto(this.job.videoUrl, { waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 * 0.8 });
            await sleep(2000 + nodeJsRandom(1000));
            await handleYouTubeConsent(this.page, this.logger.child({prefix: 'RecoveryConsentReNav:'}), 1, 2);
            await waitForVideoToLoad(this.page, this.logger.child({prefix: 'RecoveryLoadReNav:'}), 60000);
            if (this.job.platform === 'youtube') {
                await setVideoQualityToLowest(this.page, this.logger.child({prefix: 'RecoveryQualityReNav:'}));
            }
            success = await this.ensureVideoPlaying(['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'], 'recovery-re-navigate');
            
            if (success) {
                this.logger.info('Playback recovery successful via RE-NAVIGATION!');
            }

        } catch (e) {
            this.logger.error(`Playback recovery method itself failed: ${e.message}`);
        }
        
        if(!success) this.logger.warn('Playback recovery method did not succeed.');
        return success;
    }

    async watchVideo() {
        if (!this.page || this.page.isClosed()) throw new Error('Page not initialized/closed for watching.');

        const videoDurationSeconds = this.job.video_info.duration;
        const targetWatchPercentage = this.effectiveInput.watchTimePercentage;
        const targetVideoPlayTimeSeconds = Math.max(10, (targetWatchPercentage / 100) * videoDurationSeconds);

        this.logger.info(`Watch target: ${targetWatchPercentage}% of ${videoDurationSeconds.toFixed(0)}s = ${targetVideoPlayTimeSeconds.toFixed(0)}s. URL: ${this.job.videoUrl}`);

        const overallWatchStartTime = Date.now();
        const estimatedAdCycles = Math.max(1, Math.ceil(targetVideoPlayTimeSeconds / 90));
        const maxOverallWatchDurationMs = (targetVideoPlayTimeSeconds * 1000) + (this.effectiveInput.maxSecondsAds * 1000 * estimatedAdCycles) + 60000;
        this.logger.info(`Calculated maxOverallWatchDurationMs: ${(maxOverallWatchDurationMs/1000).toFixed(0)}s`);

        const checkIntervalMs = 1000; 
        let consecutiveStallChecks = 0;
        const MAX_STALL_CHECKS_BEFORE_RECOVERY = 10;
        let recoveryAttemptsThisJob = 0;
        const MAX_RECOVERY_ATTEMPTS_PER_JOB = 1; // Reduced to 1 primary recovery type

        let lastProgressTimestamp = Date.now();
        let lastKnownGoodVideoTime = 0;
        this.maxTimeReachedThisView = 0;
        let currentActualVideoTime = 0;
        this.lastLoggedVideoTime = -10;

        let adCheckCooldownMs = 0;
        const AD_CHECK_INTERVAL_WHEN_NO_AD = 5000; 
        const AD_CHECK_INTERVAL_DURING_AD = 1500;
        
        let mouseMoveCooldownMs = Date.now() + nodeJsRandom(15000, 30000);

        while (!this.killed) {
            const loopIterationStartTime = Date.now();
            const loopNumber = Math.floor((Date.now() - overallWatchStartTime) / checkIntervalMs);

            if (this.page.isClosed()) { (this.logger.warn || this.logger.warning).call(this.logger, 'Page closed during watch loop.'); break; }
            if (Date.now() - overallWatchStartTime > maxOverallWatchDurationMs) {
                (this.logger.warn || this.logger.warning).call(this.logger, `Max watch duration for this video exceeded (${((Date.now() - overallWatchStartTime)/1000).toFixed(0)}s / ${(maxOverallWatchDurationMs/1000).toFixed(0)}s). Ending.`); break;
            }

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
            
            if (Date.now() >= mouseMoveCooldownMs) {
                await simulateMouseMovement(this.page, this.logger);
                mouseMoveCooldownMs = Date.now() + nodeJsRandom(20000, 45000);
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
                    const playAttemptSuccess = await this.ensureVideoPlaying(['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'], 'paused-resume');
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
                        if (recoveryAttemptsThisJob < MAX_RECOVERY_ATTEMPTS_PER_JOB) {
                            recoveryAttemptsThisJob++;
                            this.logger.warn(`Max stall checks reached (${consecutiveStallChecks}). Attempting PRIMARY recovery ${recoveryAttemptsThisJob}/${MAX_RECOVERY_ATTEMPTS_PER_JOB}...`);
                            consecutiveStallChecks = 0;
                            const recoveryActionSuccess = await this.attemptPlaybackRecovery(); // This now includes consent & quality set

                            if (recoveryActionSuccess) {
                                this.logger.info(`Primary recovery attempt ${recoveryAttemptsThisJob} action completed. Re-validating playback...`);
                                const playSuccess = await this.ensureVideoPlaying(['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'], `post-primary-recovery-${recoveryAttemptsThisJob}`);
                                if (!playSuccess) {
                                    this.logger.error(`Primary recovery attempt ${recoveryAttemptsThisJob} failed to restart playback definitively after action.`);
                                    if (recoveryAttemptsThisJob >= MAX_RECOVERY_ATTEMPTS_PER_JOB) throw new Error(`Primary recovery attempt ${recoveryAttemptsThisJob} failed to restart playback.`);
                                } else {
                                    lastKnownGoodVideoTime = 0; this.maxTimeReachedThisView = 0;
                                    currentActualVideoTime = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime || 0).catch(()=>0);
                                    lastKnownGoodVideoTime = currentActualVideoTime; this.maxTimeReachedThisView = currentActualVideoTime;
                                    lastProgressTimestamp = Date.now(); this.lastLoggedVideoTime = -10;
                                    consecutiveStallChecks = 0; 
                                    this.logger.info(`Playback seems to have resumed after primary recovery ${recoveryAttemptsThisJob}. State: CT: ${currentActualVideoTime.toFixed(1)}s`);
                                    continue; 
                                }
                            } else {
                                this.logger.warn(`Primary recovery action for attempt ${recoveryAttemptsThisJob} did not result in success.`);
                                if (recoveryAttemptsThisJob >= MAX_RECOVERY_ATTEMPTS_PER_JOB) {
                                     this.logger.error('All primary recovery actions attempted but failed to restore playback. Failing job.');
                                     throw new Error('Video stalled/player error, all primary recovery actions failed.');
                                }
                            }
                        } else {
                            this.logger.error('All recovery attempts exhausted. Failing job due to persistent stall.');
                            throw new Error('Video stalled, all recovery attempts exhausted.');
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

    actorLog.info('ACTOR_MAIN_LOGIC: Starting YouTube View Bot (v1.9.7).');
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
        concurrency: 1, concurrencyInterval: 5, timeout: 120, // Default from schema for page navigations
        maxSecondsAds: 20,
        skipAdsAfter: ["5", "10"],
        autoSkipAds: true, stopSpawningOnOverload: true,
        useAV1: false,
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
    if (effectiveInput.skipAdsAfter[0] > effectiveInput.skipAdsAfter[1]) {
        effectiveInput.skipAdsAfter[1] = effectiveInput.skipAdsAfter[0] + 5;
    }
    effectiveInput.maxSecondsAds = Number(effectiveInput.maxSecondsAds);
    if(isNaN(effectiveInput.maxSecondsAds) || effectiveInput.maxSecondsAds < 0) {
        effectiveInput.maxSecondsAds = 20;
    }

    actorLog.info('ACTOR_MAIN_LOGIC: Effective input (summary):', { videos: effectiveInput.videoUrls.length, proxy: effectiveInput.proxyCountry, headless: effectiveInput.headless, watchPercent: effectiveInput.watchTimePercentage, skipAdsAfter: effectiveInput.skipAdsAfter, maxSecondsAds: effectiveInput.maxSecondsAds, timeout: effectiveInput.timeout });

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
    const defaultSearchProfileForUA = getProfileByCountry('US');
    const userAgentStringsForSearch = [
        defaultSearchProfileForUA.userAgent,
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    ];


    for (let i = 0; i < effectiveInput.videoUrls.length; i++) {
        const url = effectiveInput.videoUrls[i];
        const videoId = extractVideoIdFromUrl(url, actorLog);
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
            referer: refererUrl, video_info: { duration: 300, isLive: false },
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
                const sessionId = `session_${job.id.substring(0, 12).replace(/-/g, '')}`;
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
             if (searchLaunchOptions.args.find(arg => arg.startsWith('--window-size='))) {
                searchLaunchOptions.args = searchLaunchOptions.args.filter(arg => !arg.startsWith('--window-size='));
            }

            if(proxyUrlString) {
                try {
                    const p = new URL(proxyUrlString);
                    searchLaunchOptions.proxy = { server: `${p.protocol}//${p.hostname}:${p.port}`, username: p.username?decodeURIComponent(p.username):undefined, password: p.password?decodeURIComponent(p.password):undefined };
                } catch(e){ jobLogger.warn('Failed to parse proxy for search browser, search will be direct.'); }
            }
            let youtubeSearchUrl = ''; // Define here for wider scope for logging
            try {
                const searchUserAgent = userAgentStringsForSearch[nodeJsRandom(0, userAgentStringsForSearch.length-1)];
                
                const searchFingerprintProfile = getProfileByCountry(effectiveInput.proxyCountry);
                searchFingerprintProfile.userAgent = searchUserAgent;
                if (!searchLaunchOptions.args.some(arg => arg.startsWith('--window-size'))) {
                    searchLaunchOptions.args.push(`--window-size=${searchFingerprintProfile.screen.width || 1920},${searchFingerprintProfile.screen.height || 1080}`);
                }

                searchBrowser = await playwright.chromium.launch(searchLaunchOptions);

                searchContext = await searchBrowser.newContext({ 
                    userAgent: searchFingerprintProfile.userAgent,
                    locale: searchFingerprintProfile.locale,
                    timezoneId: searchFingerprintProfile.timezoneId,
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

                jobLogger.info('SearchAntiDetect: Custom scripts SKIPPED (v1.9.7).');

                searchPage = await searchContext.newPage();

                const searchQuery = job.searchKeywords[nodeJsRandom(0, job.searchKeywords.length - 1)];
                youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
                jobLogger.info(`Navigating to search URL: ${youtubeSearchUrl}`);
                await searchPage.goto(youtubeSearchUrl, { waitUntil: 'domcontentloaded', timeout: effectiveInput.timeout * 1000 }); 
                await handleYouTubeConsent(searchPage, jobLogger.child({prefix: 'SearchConsent: '}), 1, 2);
                
                jobLogger.info('enableAutoplayWithInteraction SKIPPED for search stability test (v1.9.7).');

                const videoLinkSelector = `a#video-title[href*="/watch?v=${job.videoId}"]`;
                jobLogger.info(`Looking for video link: ${videoLinkSelector}`);
                
                const scrollCount = nodeJsRandom(2,4);
                for(let k=0; k < scrollCount; k++) {
                    const scrollRatio = Math.random() * (0.7 - 0.3) + 0.3;
                    await searchPage.evaluate((ratio) => window.scrollBy(0, window.innerHeight * ratio), scrollRatio);
                    await sleep(500 + nodeJsRandom(100, 500));
                }

                const videoLinkElement = searchPage.locator(videoLinkSelector).first();
                let videoLinkVisible = false;
                try {
                    await videoLinkElement.waitFor({ state: 'visible', timeout: 10000 });
                    videoLinkVisible = true;
                } catch {
                    jobLogger.info('Direct video link not immediately visible, trying "Videos" filter if present...');
                    const videosFilterButton = searchPage.locator('yt-chip-cloud-chip-renderer:has-text("Videos"), yt-chip-cloud-chip-renderer[aria-label="Search for Videos"]').first();
                     if (await videosFilterButton.isVisible({timeout: 3000}).catch(() => false)) {
                        await videosFilterButton.click({force: true, timeout: 3000}).catch(e => jobLogger.warn(`Failed to click Videos filter: ${e.message}`));
                        await searchPage.waitForTimeout(nodeJsRandom(2000,4000));
                        jobLogger.info('Clicked "Videos" filter. Re-checking for video link.');
                        await videoLinkElement.waitFor({ state: 'visible', timeout: 15000 });
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
                        if (href.includes(job.videoId)) {
                            jobLogger.info(`Video found via search: ${fullVideoUrl}. Title: ${linkTitle}. Updating job URL and referer.`);
                            job.videoUrl = fullVideoUrl;
                            job.referer = currentSearchPageUrl;
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
        actorLog.error(`Error caught by final Promise.all on a worker promise (should have been handled earlier): ${e.message}`);
        return e;
    })));

    overallResults.endTime = new Date().toISOString();
    actorLog.info('All jobs processed. Final results:', { summary: { total: overallResults.totalJobs, success: overallResults.successfulJobs, failed: overallResults.failedJobs }, duration: (new Date(overallResults.endTime).getTime() - new Date(overallResults.startTime).getTime())/1000 + 's' });
    await Actor.setValue('OVERALL_RESULTS', overallResults);
    actorLog.info('Actor finished successfully.');
    await Actor.exit();
}

Actor.main(actorMainLogic);

console.log('MAIN.JS: Script fully loaded. Actor.main is set up.');
