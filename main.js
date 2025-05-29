const Apify = require('apify');
const { Actor } = Apify;

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
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

const FINGERPRINT_PROFILES = {
    'US_CHROME_WIN_NVIDIA': {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? 240 : 300; },
        platform: 'Win32',
        webGLVendor: 'Google Inc. (NVIDIA)',
        webGLRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
        deviceMemory: 8,
        hardwareConcurrency: Math.max(4, (Math.floor(Math.random() * 4) + 2) * 2),
        vendor: 'Google Inc.'
    },
    'GB_CHROME_WIN_AMD': {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        locale: 'en-GB',
        timezoneId: 'Europe/London',
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? -60 : 0; },
        platform: 'Win32',
        webGLVendor: 'Google Inc. (AMD)',
        webGLRenderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
        screen: { width: 2560, height: 1440, availWidth: 2560, availHeight: 1400, colorDepth: 24, pixelDepth: 24 },
        deviceMemory: 16,
        hardwareConcurrency: Math.max(6, (Math.floor(Math.random() * 5) + 3) * 2),
        vendor: 'Google Inc.'
    },
    'US_MAC_CHROME_M_SERIES': {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? 420 : 480; },
        platform: 'MacIntel',
        webGLVendor: 'Apple',
        webGLRenderer: 'Apple M3 Pro',
        screen: { width: 1728, height: 1117, availWidth: 1728, availHeight: 1079, colorDepth: 30, pixelDepth: 30 },
        deviceMemory: 16,
        hardwareConcurrency: 10,
        vendor: 'Apple Computer, Inc.'
    },
    'HU_CHROME_WIN_INTEL': {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'hu-HU',
        timezoneId: 'Europe/Budapest',
        get timezoneOffsetMinutes() { return new Date().isDstActive(this.timezoneId) ? -120 : -60; },
        platform: 'Win32',
        webGLVendor: 'Google Inc. (Intel)',
        webGLRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
        screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
        deviceMemory: 8,
        hardwareConcurrency: Math.max(4, (Math.floor(Math.random() * 3) + 2) * 2),
        vendor: 'Google Inc.'
    }
};

function getRandomProfileKey() {
    const keys = Object.keys(FINGERPRINT_PROFILES);
    return keys[Math.floor(Math.random() * keys.length)];
}

function getProfileByCountry(countryCode) {
    const countryUpper = countryCode ? countryCode.toUpperCase() : '';
    const deepCopy = (profile) => JSON.parse(JSON.stringify(profile));
    const matchingProfiles = Object.keys(FINGERPRINT_PROFILES).filter(k => k.startsWith(countryUpper + '_'));
    if (matchingProfiles.length > 0) {
        return deepCopy(FINGERPRINT_PROFILES[matchingProfiles[Math.floor(Math.random() * matchingProfiles.length)]]);
    }
    const usProfiles = Object.keys(FINGERPRINT_PROFILES).filter(k => k.startsWith('US_'));
    if (usProfiles.length > 0) return deepCopy(FINGERPRINT_PROFILES[usProfiles[Math.floor(Math.random() * usProfiles.length)]]);
    return deepCopy(FINGERPRINT_PROFILES[getRandomProfileKey()]);
}


try {
    console.log('MAIN.JS: Attempting to apply StealthPlugin...');
    chromium.use(StealthPlugin());
    console.log('MAIN.JS: StealthPlugin applied successfully.');
} catch (e) {
    console.error('MAIN.JS: CRITICAL ERROR applying StealthPlugin:', e.message, e.stack);
    throw e;
}

// --- Utility functions ---
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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


function extractVideoIdFromUrl(url, logger) {
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

function nodeJsRandom(min, max) {
    if (max === undefined) { max = min; min = 0; }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function handleYouTubeConsent(page, logger) {
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

// Added new args from Claude
const ANTI_DETECTION_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process,ImprovedCookieControls,LazyFrameLoading,GlobalMediaControls,DestroyProfileOnBrowserClose,MediaRouter,DialMediaRouteProvider,AcceptCHFrame,AutoExpandDetailsElement,CertificateTransparencyEnforcement,AvoidUnnecessaryBeforeUnloadCheckSync,Translate',
    '--disable-component-extensions-with-background-pages',
    '--disable-default-apps', '--disable-extensions', '--disable-site-isolation-trials',
    '--disable-sync', '--force-webrtc-ip-handling-policy=default_public_interface_only',
    '--no-first-run', '--no-service-autorun', '--password-store=basic',
    '--use-mock-keychain', '--enable-precise-memory-info',
    '--disable-infobars', '--disable-notifications', '--disable-popup-blocking',
    '--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu',
    '--disable-setuid-sandbox', '--disable-software-rasterizer', '--mute-audio', // mute-audio was already there
    '--ignore-certificate-errors',
    // NEW from Claude:
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
];

async function applyAntiDetectionScripts(pageOrContext, logger, fingerprintProfile) {
    const safeLogger = getSafeLogger(logger);
    const {
        locale, /* timezoneOffsetMinutes, // Relying on timezoneId + stealth */
        webGLVendor, webGLRenderer,
        platform, deviceMemory, hardwareConcurrency, screen: dynamicScreen, vendor
    } = fingerprintProfile;

    const scriptToInject = (
        passedLocale, /* passedTimezoneOffset, // Removed */
        passedWebGLVendor, passedWebGLRenderer,
        passedPlatform, passedDeviceMemory, passedHardwareConcurrency, passedScreen, passedVendor
    ) => {
        // Navigator Overrides
        if (typeof navigator.__proto__ !== 'undefined') {
             try { delete navigator.__proto__.webdriver; } catch(e) { console.debug("Failed to delete navigator.__proto__.webdriver", e.message); }
        } else if (navigator.webdriver) { // Fallback
            try{ Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true }); } catch(e) { console.debug("Failed to redefine navigator.webdriver", e.message); }
        }

        // Claude: delete chrome.runtime properties
        // if(window.chrome && window.chrome.runtime) { // Check existence before deleting
        //     try { delete window.chrome.runtime.onConnect; } catch(e) { console.debug("Failed to delete chrome.runtime.onConnect", e.message); }
        //     try { delete window.chrome.runtime.onMessage; } catch(e) { console.debug("Failed to delete chrome.runtime.onMessage", e.message); }
        // } // This might be too aggressive and conflict with stealth plugin or legitimate page scripts. Keep commented for now.


        const langBase = passedLocale.split('-')[0];
        const languagesArray = passedLocale.includes('-') ? [passedLocale, langBase] : [passedLocale];
        try { Object.defineProperty(navigator, 'languages', { get: () => languagesArray, configurable: true }); } catch(e) { console.debug("Failed to set navigator.languages", e.message); }
        try { Object.defineProperty(navigator, 'language', { get: () => passedLocale, configurable: true }); } catch(e) { console.debug("Failed to set navigator.language", e.message); }
        try { Object.defineProperty(navigator, 'platform', { get: () => passedPlatform, configurable: true }); } catch(e) { console.debug("Failed to set navigator.platform", e.message); }
        if (typeof passedDeviceMemory === 'number') try { Object.defineProperty(navigator, 'deviceMemory', { get: () => passedDeviceMemory, configurable: true }); } catch(e) { console.debug("Failed to set navigator.deviceMemory", e.message); }
        if (typeof passedHardwareConcurrency === 'number') try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => passedHardwareConcurrency, configurable: true }); } catch(e) { console.debug("Failed to set navigator.hardwareConcurrency", e.message); }
        if (typeof passedVendor === 'string') try { Object.defineProperty(navigator, 'vendor', { get: () => passedVendor, configurable: true }); } catch(e) { console.debug("Failed to set navigator.vendor", e.message); }

        // WebGL Spoofing
        try {
            const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (parameter) {
                if (parameter === 37445 /* UNMASKED_VENDOR_WEBGL */) return passedWebGLVendor;
                if (parameter === 37446 /* UNMASKED_RENDERER_WEBGL */) return passedWebGLRenderer;
                return originalGetParameter.apply(this, arguments);
            };
        } catch (e) { console.debug('[AntiDetectInPage] Failed WebGL spoof:', e.message); }

        // Canvas Spoofing
        try {
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function() {
                if (this.id === 'canvas-fingerprint-element') return originalToDataURL.apply(this, arguments);
                const shift = { r: Math.floor(Math.random()*10)-5, g: Math.floor(Math.random()*10)-5, b: Math.floor(Math.random()*10)-5, a: Math.floor(Math.random()*10)-5 };
                const ctx = this.getContext('2d');
                if (ctx && this.width > 0 && this.height > 0) {
                    try {
                        const imageData = ctx.getImageData(0,0,this.width,this.height);
                        for(let i=0; i<imageData.data.length; i+=4){
                            imageData.data[i] = Math.min(255,Math.max(0,imageData.data[i]+shift.r));
                            imageData.data[i+1] = Math.min(255,Math.max(0,imageData.data[i+1]+shift.g));
                            imageData.data[i+2] = Math.min(255,Math.max(0,imageData.data[i+2]+shift.b));
                        }
                        ctx.putImageData(imageData,0,0);
                    } catch(e) { console.debug('[AntiDetectInPage] Failed Canvas noise:', e.message); }
                }
                return originalToDataURL.apply(this, arguments);
            };
        } catch (e) { console.debug('[AntiDetectInPage] Failed Canvas spoof:', e.message); }

        // Permissions Query (Notifications)
        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
            const originalPermissionsQuery = navigator.permissions.query;
            navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission || 'prompt' }) :
                originalPermissionsQuery.call(navigator.permissions, parameters)
            );
        }

        // Media Devices Spoof (Claude's suggestion)
        if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
             const generateRandomString = (length) => {
                let result = '';
                const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                for (let i = 0; i < length; i++) {
                    result += characters.charAt(Math.floor(Math.random() * characters.length));
                }
                return result;
            };
            const pseudoUuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            navigator.mediaDevices.enumerateDevices = () => Promise.resolve([
                { deviceId: 'default', kind: 'audiooutput', label: '', groupId: 'defaultgroup_' + generateRandomString(8) },
                { deviceId: pseudoUuid(), kind: 'videoinput', label: 'Integrated Camera', groupId: 'videogroup_' + generateRandomString(8) },
                { deviceId: pseudoUuid(), kind: 'audioinput', label: 'Internal Microphone', groupId: 'audiogroup_' + generateRandomString(8) }
            ]);
        }

        // Screen Spoofing
        if (window.screen && passedScreen) {
            try {
                Object.defineProperty(window.screen, 'availWidth', { get: () => passedScreen.availWidth, configurable: true });
                Object.defineProperty(window.screen, 'availHeight', { get: () => passedScreen.availHeight, configurable: true });
                Object.defineProperty(window.screen, 'width', { get: () => passedScreen.width, configurable: true });
                Object.defineProperty(window.screen, 'height', { get: () => passedScreen.height, configurable: true });
                Object.defineProperty(window.screen, 'colorDepth', { get: () => passedScreen.colorDepth, configurable: true });
                Object.defineProperty(window.screen, 'pixelDepth', { get: () => passedScreen.pixelDepth, configurable: true });
            } catch (e) { console.debug('[AntiDetectInPage] Failed screen spoof:', e.message); }
         }

        // Timezone Spoofing - REMOVED
        // try { Date.prototype.getTimezoneOffset = function() { return passedTimezoneOffset; }; } catch (e) { console.debug('[AntiDetectInPage] Failed timezone spoof:', e.message); }

        // Plugins/MimeTypes
        if (navigator.plugins) try { Object.defineProperty(navigator, 'plugins', { get: () => [], configurable: true }); } catch(e) { console.debug('[AntiDetectInPage] Failed plugin spoof:', e.message); }
        if (navigator.mimeTypes) try { Object.defineProperty(navigator, 'mimeTypes', { get: () => [], configurable: true }); } catch(e) { console.debug('[AntiDetectInPage] Failed mimeType spoof:', e.message); }

        if (navigator.userAgent.toLowerCase().includes('chrome')) {
            if (typeof window.chrome !== 'undefined') {
                window.chrome.runtime = window.chrome.runtime || {};
            } else {
                window.chrome = { runtime: {} };
            }
        }
    };

    try {
        const argsForScript = {
            passedLocale: locale,
            // passedTimezoneOffset: timezoneOffsetMinutes, // Removed
            passedWebGLVendor: webGLVendor,
            passedWebGLRenderer: webGLRenderer,
            passedPlatform: platform,
            passedDeviceMemory: deviceMemory,
            passedHardwareConcurrency: hardwareConcurrency,
            passedScreen: dynamicScreen,
            passedVendor: vendor,
        };

        if (pageOrContext.addInitScript) {
            await pageOrContext.addInitScript(scriptToInject, argsForScript);
        } else if (pageOrContext.evaluateOnNewDocument) {
            await pageOrContext.evaluateOnNewDocument(scriptToInject, argsForScript);
        }
        safeLogger.info(`Custom anti-detection script applied. Profile hints: Locale=${locale}, Platform=${platform}, Vendor=${vendor}, WebGLV=${webGLVendor.substring(0,15)}... (Timezone spoof via getTimezoneOffset REMOVED)`);
    } catch (e) {
        safeLogger.error(`Failed to add anti-detection init script: ${e.message}`);
    }
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

async function clickIfExists(page, selector, timeout = 3000, logger) {
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
        this.logger.info(`Selected Fingerprint Profile: Key Hint=${Object.keys(FINGERPRINT_PROFILES).find(key => FINGERPRINT_PROFILES[key] === this.fingerprintProfile)}, UA=${this.fingerprintProfile.userAgent.substring(0,70)}..., Locale=${this.fingerprintProfile.locale}, TZID=${this.fingerprintProfile.timezoneId}, Vendor=${this.fingerprintProfile.vendor}`);
        
        this.killed = false;
        this.maxTimeReachedThisView = 0;
        this.browser = null; this.context = null; this.page = null;
        this.lastReportedVideoTimeSeconds = 0;
        this.lastLoggedVideoTime = 0;
        
        this.logger.info('Worker instance constructed.');
    }

    createFallbackLogger(prefix) {
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
                ...ANTI_DETECTION_ARGS,
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

        this.browser = await chromium.launch(launchOptions);
        this.logger.info('Browser launched with playwright-extra.');

        this.context = await this.browser.newContext({
            bypassCSP: true, ignoreHTTPSErrors: true,
            locale: this.fingerprintProfile.locale,
            timezoneId: this.fingerprintProfile.timezoneId,
            javaScriptEnabled: true, userAgent: this.fingerprintProfile.userAgent,
            geolocation: this.effectiveInput.proxyCountry === 'US' ? { latitude: 34.0522, longitude: -118.2437 } :
                         this.effectiveInput.proxyCountry === 'GB' ? { latitude: 51.5074, longitude: 0.1278 } :
                         this.effectiveInput.proxyCountry === 'HU' ? { latitude: 47.4979, longitude: 19.0402 } : undefined,
            permissions: ['geolocation', 'notifications'],
            screen: {
                width: this.fingerprintProfile.screen.width,
                height: this.fingerprintProfile.screen.height
            },
            deviceScaleFactor: (this.fingerprintProfile.screen.width > 2000 || this.fingerprintProfile.screen.height > 1200) ? 2 : 1,
            isMobile: false,
            hasTouch: false,
        });
        this.logger.info(`Browser context created. Profile hints: locale=${this.fingerprintProfile.locale}, timezoneId=${this.fingerprintProfile.timezoneId}, UA=${this.fingerprintProfile.userAgent.substring(0,50)}...`);

        if (this.effectiveInput.customAntiDetection) {
            await applyAntiDetectionScripts(this.context, this.logger, this.fingerprintProfile);
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
        await this.page.goto(this.job.videoUrl, { waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 * 0.8 });
        this.logger.info('Navigation (DOM content loaded) complete.');
        
        await handleYouTubeConsent(this.page, this.logger);
        await sleep(nodeJsRandom(2000, 4000));

        this.logger.info('Waiting for video to load data (up to 90s)...');
        try {
            await waitForVideoToLoad(this.page, this.logger, 90000);
        } catch (loadError) {
            this.logger.error(`CRITICAL: Video failed to load properly: ${loadError.message}`);
            if (Actor.isAtHome()) { // Claude: Simplified Actor.isAtHome() check
                try {
                    const failTime = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '_');
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

        // Re-enabled Quality Setting block with Claude's fixes
        this.logger.info('Attempting to set video quality...');
        try {
            const settingsButton = this.page.locator('.ytp-settings-button').first();
            if (await settingsButton.isVisible({timeout: 5000})) {  // Claude: Reduced timeout
                await settingsButton.click({timeout: 2000});  // Claude: Reduced timeout
                await sleep(nodeJsRandom(600, 1000));
                
                const qualityMenuItem = this.page.locator('.ytp-menuitem-label:has-text("Quality")').first();
                if (await qualityMenuItem.isVisible({timeout: 2000})) {  // Claude: Reduced timeout
                    await qualityMenuItem.click({timeout: 2000});  // Claude: Added timeout
                    await sleep(nodeJsRandom(600, 1000));
                    
                    const qualityOptionsElements = await this.page.locator('.ytp-quality-menu .ytp-menuitem').all();
                    if (qualityOptionsElements.length > 0) {
                        let lowestQualityOptionElement = qualityOptionsElements[qualityOptionsElements.length - 1];
                        const textContent = await lowestQualityOptionElement.textContent();
                        if (textContent && textContent.toLowerCase().includes('auto')) {
                            if (qualityOptionsElements.length > 1) {
                                lowestQualityOptionElement = qualityOptionsElements[qualityOptionsElements.length - 2];
                            }
                        }
                        await lowestQualityOptionElement.click({timeout: 2000});  // Claude: Added timeout
                        this.logger.info(`Attempted to set video quality.`);
                    } else { 
                        (this.logger.warn || this.logger.warning).call(this.logger, 'No quality options found in menu.'); 
                    }
                    await sleep(nodeJsRandom(400,700));
                } else { 
                    (this.logger.warn || this.logger.warning).call(this.logger, 'Quality menu item not found.'); 
                }
                
                // Claude: Close settings menu if still open
                if (await this.page.locator('.ytp-settings-menu').isVisible({timeout:500})) {
                    await this.page.keyboard.press('Escape', {delay: nodeJsRandom(100,300)});
                }
            } else { 
                this.logger.info('Settings button not visible for quality adjustment.'); 
            }
        } catch (e) {
            (this.logger.warn || this.logger.warning).call(this.logger, `Could not set video quality: ${e.message.split('\n')[0]}`);
            // Claude: Ensure settings menu is closed on error
            try {
                if (this.page && !this.page.isClosed() && await this.page.locator('.ytp-settings-menu').isVisible({timeout:500})) {
                    await this.page.keyboard.press('Escape').catch(()=>{});
                }
            } catch (cleanupError) {
                // Ignore cleanup errors
                 this.logger.debug(`Error during quality setting cleanup: ${cleanupError.message}`);
            }
        }


        const playButtonSelectors = ['.ytp-large-play-button', '.ytp-play-button[aria-label*="Play"]', 'video.html5-main-video'];
        this.logger.info('Attempting to ensure video is playing after load and quality set...');
        // Using Claude's new ensureVideoPlaying
        const initialPlaySuccess = await this.ensureVideoPlaying(playButtonSelectors, 'initial-setup');
        if (initialPlaySuccess) {
            this.logger.info('Video confirmed playing after initial setup and quality adjustment.');
        } else {
            this.logger.warn('Video did not reliably start playing after setup/quality. Watch loop will attempt further.');
        }

        await sleep(nodeJsRandom(2000, 4500));
        return true;
    }

    async handleAds() {
        // ... (Unchanged from v1.4)
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

    // Claude's ensureVideoPlaying - v1.5
    async ensureVideoPlaying(playButtonSelectors, attemptType = 'general') {
        const logFn = (msg, level = 'info') => {
            const loggerMethod = this.logger[level] || (level === 'warn' && (this.logger.warning || this.logger.warn)) || this.logger.info;
            loggerMethod.call(this.logger, `[ensureVideoPlaying-${attemptType}] ${msg}`);
        };
        logFn(`Ensuring video is playing (v1.5 - Enhanced Claude)...`);

        for (let attempt = 0; attempt < 3; attempt++) {
            if (this.killed || this.page.isClosed()) return false;

            let isVideoElementPresent = await this.page.locator('video.html5-main-video').count() > 0;
            if (!isVideoElementPresent) {
                logFn('Video element not present on page.', 'warn');
                return false;
            }

            let videoState = await this.page.evaluate(() => {
                const v = document.querySelector('video.html5-main-video');
                if (!v) return { p: true, rs: 0, err: { code: null, message: "No video element found in DOM" }, ended: true, networkState: 3, src: null, videoWidth: 0, videoHeight: 0, muted: true, volume: 0 }; // Assume muted if no video
                return {
                    p: v.paused, rs: v.readyState,
                    err: v.error ? { code: v.error.code, message: v.error.message } : null,
                    ended: v.ended, networkState: v.networkState,
                    src: v.currentSrc || v.src, videoWidth: v.videoWidth, videoHeight: v.videoHeight,
                    muted: v.muted, volume: v.volume
                };
            }).catch((e) => {
                logFn(`Eval to get video state failed: ${e.message}`, 'warn');
                return { p: true, rs: 0, err: {message: "Eval failed to get video state"}, ended: true, networkState: 3, src: null, videoWidth: 0, videoHeight: 0, muted: true, volume: 0 };
            });

            if (videoState.err && videoState.err.code) {
                logFn(`Video element error: Code ${videoState.err.code}, Msg: ${videoState.err.message || 'N/A'}. Attempt ${attempt + 1}`, 'warn');
                if (videoState.err.code === 4 /* MEDIA_ERR_SRC_NOT_SUPPORTED */ || videoState.err.code === 3 /* MEDIA_ERR_DECODE */) {
                    logFn(`Fatal media error (Code: ${videoState.err.code}). Stopping play attempts for '${attemptType}'.`, 'error');
                    return false;
                }
            }
             if (videoState.networkState === 3 /* NETWORK_NO_SOURCE */ && attempt > 0) { // Check after first attempt
                logFn(`Video networkState is NETWORK_NO_SOURCE (src: ${videoState.src}). Unlikely to play. Attempt ${attempt + 1}`, 'error');
                return false;
            }


            // Check if already playing
            if (!videoState.p && videoState.rs >= 3 && !videoState.ended) {
                logFn(`Video is already playing (attempt ${attempt + 1}). RS:${videoState.rs}, NS:${videoState.networkState}`);
                return true;
            }

            logFn(`Video state (attempt ${attempt + 1}): Paused=${videoState.p}, Ended=${videoState.ended}, RS=${videoState.rs}, NS=${videoState.networkState}, Muted=${videoState.muted}, Volume=${videoState.volume?.toFixed(2)}, Dim=${videoState.videoWidth}x${videoState.videoHeight}. Trying strategies...`);

            // NEW: Try unmuting the video first
            if (videoState.muted) {
                try {
                    await this.page.evaluate(() => {
                        const video = document.querySelector('video.html5-main-video');
                        if (video) {
                            video.muted = false;
                            video.volume = 0.5; // Set a default volume
                        }
                    });
                    logFn('Attempted to unmute video and set volume to 50%');
                    await sleep(500); // Short pause for unmute to take effect
                     // Re-check state after unmuting
                    const unmutedState = await this.page.evaluate(() => {const v=document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended, m:v.muted} : {p:true,rs:0,e:true,m:true};}).catch(()=>({p:true,rs:0,e:true,m:true}));
                    if (!unmutedState.p && unmutedState.rs >=3 && !unmutedState.e) {
                        logFn('Video started playing after unmute.'); return true;
                    }
                    if (!unmutedState.m) logFn('Video successfully unmuted.'); else logFn('Video still muted after attempt.', 'warn');

                } catch (e) {
                    logFn(`Failed to unmute video: ${e.message}`, 'debug');
                }
            }

            // NEW: Try clicking the big play button overlay first
            const bigPlayButton = this.page.locator('.ytp-large-play-button, .ytp-cued-thumbnail-overlay-image').first();
            if (await bigPlayButton.isVisible({timeout: 1000})) {
                try {
                    await bigPlayButton.click({timeout: 2000, force: false}); // force: false initially
                    logFn('Clicked large play button overlay');
                    await sleep(1500 + nodeJsRandom(500));
                    const tempState = await this.page.evaluate(() => {const v=document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended} : {p:true,rs:0,e:true};}).catch(()=>({p:true,rs:0,e:true}));
                    if (!tempState.p && tempState.rs >=3 && !tempState.e) { 
                        logFn(`Video playing after clicking large play button (attempt ${attempt + 1}).`); 
                        return true; 
                    }
                } catch (e) {
                    logFn(`Failed to click large play button: ${e.message}`, 'debug');
                }
            }

            // NEW: Try keyboard shortcut 'k' to play/pause
            try {
                await this.page.locator('body').press('k'); // Ensure focus on body or player for key press
                logFn('Pressed "k" key to toggle play/pause');
                await sleep(1000 + nodeJsRandom(300));
                const tempState = await this.page.evaluate(() => {const v=document.querySelector('video.html5-main-video'); return v ? {p:v.paused,rs:v.readyState,e:v.ended} : {p:true,rs:0,e:true};}).catch(()=>({p:true,rs:0,e:true}));
                if (!tempState.p && tempState.rs >=3 && !tempState.e) { 
                    logFn('Video playing after pressing "k" key'); 
                    return true;
                }
            } catch (e) {
                logFn(`Failed to press "k" key: ${e.message}`, 'debug');
            }

            // JS play()
            if (videoState.p && !videoState.ended) { // Only if paused
                try {
                    await this.page.evaluate(() => {
                        const video = document.querySelector('video.html5-main-video');
                        if (video && video.paused && !video.ended) {
                            console.log('[In-Page Eval] ensureVideoPlaying: Attempting video.play()');
                            video.play().catch(e => console.warn('[In-Page Eval] video.play() promise rejected:', e.message));
                        }
                    });
                    await sleep(1500 + nodeJsRandom(500));
                    const isActuallyPlayingJS = !(await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.paused).catch(()=>true));
                    const currentRSJS = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.readyState).catch(()=>0);
                    if (isActuallyPlayingJS && currentRSJS >= 3) {
                        logFn(`Video confirmed playing after JS play(). RS: ${currentRSJS}`); return true;
                    } else {
                        logFn(`Video still paused or not ready after JS play(). Paused: ${!isActuallyPlayingJS}, RS: ${currentRSJS}`, 'warn');
                    }
                } catch (e) { logFn(`JS play() eval error: ${e.message.split('\n')[0]}`, 'debug'); }
            }

            // Click other play buttons
            for (const selector of playButtonSelectors) {
                 const currentPausedState = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.paused).catch(()=>true);
                 if (currentPausedState && await clickIfExists(this.page, selector, 1500, this.logger)) {
                    logFn(`Clicked potential play button: ${selector}`);
                    await sleep(1500 + nodeJsRandom(500));
                    const isActuallyPlayingBtn = !(await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.paused).catch(()=>true));
                    const currentRSBtn = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.readyState).catch(()=>0);
                    if (isActuallyPlayingBtn && currentRSBtn >=3) {
                         logFn('Video confirmed playing after play button click. RS: ' + currentRSBtn); return true;
                    } else {
                        logFn(`Video still paused/not ready after '${selector}' click. Paused: ${!isActuallyPlayingBtn}, RS: ${currentRSBtn}`, 'warn');
                    }
                }
            }
            
            // Click player area (last resort)
            const isStillPaused = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.paused).catch(()=>true);
            if(isStillPaused) {
                const playerLocators = ['video.html5-main-video', '.html5-video-player', '#movie_player'];
                for (const playerSelector of playerLocators) {
                    try {
                        const playerElement = this.page.locator(playerSelector).first();
                        if (await playerElement.isVisible({timeout: 1000})) {
                            logFn(`Clicking player area ('${playerSelector}').`);
                            await playerElement.click({ timeout: 1500, force: true });
                            await sleep(1500 + nodeJsRandom(500));
                            const isActuallyPlayingArea = !(await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.paused).catch(()=>true));
                            const currentRSArea = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.readyState).catch(()=>0);
                            if (isActuallyPlayingArea && currentRSArea >=3 ) {
                                logFn(`Video confirmed playing after clicking player area ('${playerSelector}'). RS: ${currentRSArea}`);
                                return true;
                            } else {
                                logFn(`Video still paused/not ready after player area click. Paused: ${!isActuallyPlayingArea}, RS: ${currentRSArea}`, 'warn');
                            }
                            break; 
                        }
                    } catch (e) { logFn(`Player area click ('${playerSelector}') error: ${e.message.split('\n')[0]}`, 'debug'); }
                 }
            }


            if (attempt < 2) await sleep(1500 + attempt * 500);
        }
        logFn('Failed to ensure video is playing after multiple attempts.', 'warn');
        return false;
    }


    async watchVideo() {
        // ... (Unchanged from v1.4)
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
            const loopNumber = Math.floor((Date.now() - overallWatchStartTime) / checkIntervalMs);

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
                        if (videoState.error.code === 2 /* MEDIA_ERR_NETWORK */ && recoveryAttemptsThisJob < MAX_RECOVERY_ATTEMPTS_PER_JOB) {
                            this.logger.warn("Network error (code 2) in player, will attempt recovery via stall logic.");
                        } else if (videoState.error.code === 3 /* MEDIA_ERR_DECODE */ || videoState.error.code === 4 /* MEDIA_ERR_SRC_NOT_SUPPORTED */) {
                            this.logger.error(`Fatal player error (Decode/Src). Code: ${videoState.error.code}`);
                            throw new Error(`Fatal Video Player Error Code ${videoState.error.code}: ${videoState.error.message}`);
                        } else {
                            this.logger.error(`Unhandled or non-recoverable player error. Code: ${videoState.error.code}`);
                            if (recoveryAttemptsThisJob >= MAX_RECOVERY_ATTEMPTS_PER_JOB -1) {
                                 throw new Error(`Unhandled Video Player Error Code ${videoState.error.code}: ${videoState.error.message} (recovery exhausted)`);
                            }
                        }
                    }
                    
                    if (videoState.rs === 0 && currentActualVideoTime < 1 && (Date.now() - lastProgressTimestamp) > 10000 && (Date.now() - overallWatchStartTime > 15000)) {
                        this.logger.warn(`CRITICAL STALL: ReadyState 0, currentTime near 0 for >10s. LastGood: ${lastKnownGoodVideoTime.toFixed(1)}`);
                        isStalledThisCheck = true;
                    }


                    if (!isStalledThisCheck) {
                        if (!videoState.p && videoState.rs >= 2 && !videoState.e) {
                            if (Math.abs(currentActualVideoTime - lastKnownGoodVideoTime) < 0.8 && (Date.now() - lastProgressTimestamp) > 10000) {
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

                    if (!videoState.src && (Date.now() - overallWatchStartTime > 15000)) {
                        this.logger.warn(`CRITICAL: No video source (currentSrc) after 15s. Triggering recovery.`);
                        isStalledThisCheck = true;
                    }
                    if (videoState.videoWidth === 0 && videoState.videoHeight === 0 && videoState.rs > 0 && currentActualVideoTime > 2 && (Date.now() - overallWatchStartTime > 15000)) {
                        this.logger.warn(`CRITICAL: Video dimensions 0x0 despite RS ${videoState.rs} and time > 2s. Triggering recovery.`);
                        isStalledThisCheck = true;
                    }
                 }

                if (isStalledThisCheck) {
                    consecutiveStallChecks++;
                    (this.logger.warn || this.logger.warning).call(this.logger, `Playback stalled/error detected. CT: ${currentActualVideoTime.toFixed(1)}, LastGood: ${lastKnownGoodVideoTime.toFixed(1)}. Stalls checks: ${consecutiveStallChecks}. RS: ${videoState?.rs}, NS: ${videoState?.ns}`);
                    
                    if (Actor.isAtHome()) { // Claude: Simplified check
                        try {
                            const stallTime = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '_');
                            const screenshotKey = `STALL_SCREENSHOT_${this.job.videoId}_${this.id.substring(0,8)}_${stallTime}`;
                            this.logger.info(`Taking screenshot due to stall: ${screenshotKey}`);
                            const screenshotBuffer = await this.page.screenshot({ fullPage: true, timeout: 15000 });
                            await Actor.setValue(screenshotKey, screenshotBuffer, { contentType: 'image/png' });
                            this.logger.info(`Screenshot saved: ${screenshotKey}`);
                        } catch (screenshotError) { 
                            this.logger.error(`Failed to take or save stall screenshot: ${screenshotError.message}`); 
                        }
                        
                        try {
                            const browserConsoleMessages = await this.page.evaluate(() => window.capturedConsoleMessages ? window.capturedConsoleMessages.slice(-10) : []);
                            if (browserConsoleMessages && browserConsoleMessages.length > 0) {
                                this.logger.warn('Recent browser console messages during stall/error:', browserConsoleMessages);
                            }
                        } catch(e) {this.logger.debug("Could not get recent browser console messages via evaluate.");}
                    }
                    
                    const ytErrorLocator = this.page.locator('.ytp-error-content, text=/Something went wrong/i, text=/An error occurred/i, div.ytp-error').first();
                    if (await ytErrorLocator.isVisible({timeout: 1000}).catch(()=>false)) {
                        this.logger.warn('YouTube specific error message detected on player. Prioritizing recovery.');
                    }


                    if (consecutiveStallChecks >= MAX_STALL_CHECKS_BEFORE_RECOVERY) {
                        recoveryAttemptsThisJob++;
                        consecutiveStallChecks = 0;
                        this.logger.warn(`Stalled. Attempting recovery ${recoveryAttemptsThisJob}/${MAX_RECOVERY_ATTEMPTS_PER_JOB}...`);
                        
                        let recoveryActionTaken = false;

                        if (recoveryAttemptsThisJob === 1) {
                            this.logger.info('Recovery 1: Attempting page reload.');
                            try {
                                await this.page.reload({ waitUntil: 'load', timeout: this.effectiveInput.timeout * 1000 * 0.7 });
                                recoveryActionTaken = true;
                            } catch (reloadError) {
                                this.logger.error(`Page reload failed: ${reloadError.message}.`);
                            }
                        } else if (recoveryAttemptsThisJob === 2) {
                            this.logger.info('Recovery 2: Attempting navigate to youtube.com and back.');
                            const currentUrlForRecovery = this.job.videoUrl;
                            const intermediateUrl = 'https://www.youtube.com/';
                            try {
                                await this.page.goto(intermediateUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                                await sleep(nodeJsRandom(1500, 3000));
                                await this.page.goto(currentUrlForRecovery, { waitUntil: 'load', timeout: this.effectiveInput.timeout * 1000 * 0.7 });
                                recoveryActionTaken = true;
                            } catch (navError) {
                                this.logger.error(`Error during navigate-away recovery: ${navError.message}`);
                                throw new Error('Recovery by navigation failed definitively.');
                            }
                        }

                        if (recoveryAttemptsThisJob > MAX_RECOVERY_ATTEMPTS_PER_JOB && !recoveryActionTaken) {
                             this.logger.error('Video stalled and all recovery attempts exhausted / failed to execute. Failing job.');
                             throw new Error('Video stalled/player error, all recovery attempts exhausted or failed.');
                        }
                        
                        if (recoveryActionTaken) {
                            this.logger.info(`Page re-navigated/reloaded. Re-handling consent & playback after recovery attempt ${recoveryAttemptsThisJob}...`);
                            await handleYouTubeConsent(this.page, this.logger);
                            await waitForVideoToLoad(this.page, this.logger, 30000).catch(e => {
                                this.logger.warn(`Video failed to load after recovery action ${recoveryAttemptsThisJob}: ${e.message}`);
                            });
                            await sleep(nodeJsRandom(1500, 3000));

                            const playSuccess = await this.ensureVideoPlaying(playButtonSelectors, `recovery-${recoveryAttemptsThisJob}`);
                            if (!playSuccess) {
                                this.logger.error(`Recovery attempt ${recoveryAttemptsThisJob} failed to restart playback definitively.`);
                                throw new Error(`Recovery attempt ${recoveryAttemptsThisJob} failed to restart playback.`);
                            }
                            lastKnownGoodVideoTime = 0; this.maxTimeReachedThisView = 0;
                            currentActualVideoTime = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime || 0).catch(()=>0);
                            lastKnownGoodVideoTime = currentActualVideoTime; this.maxTimeReachedThisView = currentActualVideoTime;
                            lastProgressTimestamp = Date.now(); this.lastLoggedVideoTime = -1;
                            this.logger.info(`Playback seems to have resumed after recovery ${recoveryAttemptsThisJob}. State: CT: ${currentActualVideoTime.toFixed(1)}s`);
                            continue;
                        } else if (recoveryAttemptsThisJob < MAX_RECOVERY_ATTEMPTS_PER_JOB) {
                            this.logger.warn(`Recovery action for attempt ${recoveryAttemptsThisJob} did not complete or failed, will try next recovery method if available.`);
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
                 if (e.message.includes('all recovery attempts exhausted') || e.message.includes('Recovery by navigation failed definitively') || e.message.includes('failed to restart playback') || e.message.includes('Video Player Error Code')) throw e;
                 await sleep(checkIntervalMs); continue;
            }
            
            if (videoState && videoState.p && !videoState.e && this.maxTimeReachedThisView < targetVideoPlayTimeSeconds) {
                await this.ensureVideoPlaying(playButtonSelectors, 'paused-resume'); // Using Claude's new ensureVideoPlaying
            }
            
            if (videoState && videoState.e) { this.logger.info('Video playback naturally ended.'); break; }
            if (this.maxTimeReachedThisView >= targetVideoPlayTimeSeconds) {
                this.logger.info(`Target watch time reached. Max Reached: ${this.maxTimeReachedThisView.toFixed(1)}s`); break;
            }
            
            const interactionRandom = Math.random();
            if (loopNumber > 2 && loopNumber % nodeJsRandom(3,5) === 0 && interactionRandom < 0.6) {
                 try {
                    const videoElement = this.page.locator('video.html5-main-video').first();
                    if (await videoElement.isVisible({timeout:500})) {
                        await videoElement.hover({timeout: 1000, force: false}).catch(e => this.logger.debug(`Hover error (non-critical): ${e.message}`));
                        await sleep(100 + nodeJsRandom(100));
                        const boundingBox = await videoElement.boundingBox();
                        if (boundingBox) {
                             await this.page.mouse.move(
                                 boundingBox.x + nodeJsRandom(Math.floor(boundingBox.width * 0.2), Math.floor(boundingBox.width * 0.8)),
                                 boundingBox.y + nodeJsRandom(Math.floor(boundingBox.height * 0.2), Math.floor(boundingBox.height * 0.8)),
                                 {steps:nodeJsRandom(2,5)}
                             );
                        }
                        this.logger.debug('Simulated mouse hover and move over video.');
                    }
                } catch(e) {this.logger.debug(`Minor interaction simulation error (mouse move): ${e.message.split('\n')[0]}. Ignoring.`);}
            }
             if (loopNumber > 5 && loopNumber % nodeJsRandom(6,8) === 0 && interactionRandom < 0.4) {
                try {
                    const settingsButton = this.page.locator('.ytp-settings-button').first();
                    if (await settingsButton.isVisible({timeout: 300})) {
                        await settingsButton.hover({timeout: 300, force: false}).catch(e => this.logger.debug(`Settings hover error: ${e.message}`));
                        this.logger.debug('Simulated hover on settings button.');
                        await sleep(100 + nodeJsRandom(100));
                        const vp = this.page.viewportSize();
                        if (vp) await this.page.mouse.move(nodeJsRandom(Math.floor(vp.width * 0.1)), nodeJsRandom(Math.floor(vp.height * 0.1)), {steps: 2});
                    }
                } catch (e) {this.logger.debug(`Minor settings hover interaction error: ${e.message.split('\n')[0]}`);}
            }
             if (loopNumber > 8 && loopNumber % nodeJsRandom(10,12) === 0 && interactionRandom < 0.25) {
                 try {
                    const videoElementToClick = this.page.locator('video.html5-main-video').first();
                     if (await videoElementToClick.isVisible({timeout:300})) {
                        await videoElementToClick.focus().catch(e => this.logger.debug(`Focus error: ${e.message}`));
                        await videoElementToClick.click({timeout: 300, position: {x: nodeJsRandom(5,25), y: nodeJsRandom(5,25)}, delay: nodeJsRandom(30,100), force: false }).catch(e => this.logger.debug(`Minor click error: ${e.message}`));
                        this.logger.debug('Simulated click on video player area (top-leftish).');
                    }
                 } catch(e) {this.logger.debug(`Minor video area click error: ${e.message.split('\n')[0]}`); }
            }
            if (loopNumber > 10 && loopNumber % nodeJsRandom(12,15) === 0 && videoState && !videoState.p && videoState.rs >=3 && !videoState.e && interactionRandom < 0.15) {
                try {
                    this.logger.debug('Attempting spacebar interaction.');
                    await this.page.locator('body').press('Space');
                    this.logger.debug('Simulated Spacebar press (pause).');
                    await sleep(nodeJsRandom(700,1800));
                    const tempState = await this.page.evaluate(() => { const v = document.querySelector('video.html5-main-video'); return v ? { p: v.paused, e: v.ended } : { p: true, e: true}; }).catch(()=> ({p:true, e:true}));
                    if (tempState.p && !tempState.e) {
                        await this.page.locator('body').press('Space');
                        this.logger.debug('Simulated Spacebar press (play).');
                        this.lastLoggedVideoTime = -1;
                    } else {
                        this.logger.debug('Skipped second spacebar press as video was not suitably paused.');
                    }
                } catch(e) {this.logger.debug(`Spacebar press error: ${e.message.split('\n')[0]}`)}
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

    actorLog.info('ACTOR_MAIN_LOGIC: Starting YouTube View Bot (v1.6 - Claude Playback/Quality Fixes).');
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
            if(proxyUrlString) {
                try {
                    const p = new URL(proxyUrlString);
                    searchLaunchOptions.proxy = { server: `${p.protocol}//${p.hostname}:${p.port}`, username: p.username?decodeURIComponent(p.username):undefined, password: p.password?decodeURIComponent(p.password):undefined };
                } catch(e){ jobLogger.warn('Failed to parse proxy for search browser, search will be direct.'); }
            }
            try {
                const searchUserAgent = userAgentStringsForSearch[nodeJsRandom(0, userAgentStringsForSearch.length-1)];
                searchBrowser = await chromium.launch(searchLaunchOptions);
                
                const searchFingerprintProfile = getProfileByCountry(effectiveInput.proxyCountry);
                searchFingerprintProfile.userAgent = searchUserAgent;

                searchContext = await searchBrowser.newContext({ 
                    userAgent: searchFingerprintProfile.userAgent,
                    locale: searchFingerprintProfile.locale,
                    timezoneId: searchFingerprintProfile.timezoneId,
                    screen: {
                        width: searchFingerprintProfile.screen.width,
                        height: searchFingerprintProfile.screen.height,
                    }
                });

                if (effectiveInput.customAntiDetection) {
                    await applyAntiDetectionScripts(searchContext, jobLogger.child({prefix: 'SearchAntiDetect: '}), searchFingerprintProfile);
                }

                searchPage = await searchContext.newPage();

                const searchQuery = job.searchKeywords[nodeJsRandom(0, job.searchKeywords.length - 1)];
                const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
                jobLogger.info(`Navigating to search URL: ${youtubeSearchUrl}`);
                await searchPage.goto(youtubeSearchUrl, { waitUntil: 'domcontentloaded', timeout: effectiveInput.timeout * 1000 * 0.8 });
                await handleYouTubeConsent(searchPage, jobLogger.child({prefix: 'SearchConsent: '}));

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
                        const ssKey = `SEARCH_FAIL_${job.videoId}_${new Date().toISOString().replace(/:/g, '-')}`;
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
            fingerprintProfileKey: Object.keys(FINGERPRINT_PROFILES).find(key => FINGERPRINT_PROFILES[key] === worker.fingerprintProfile) || 'N/A',
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
