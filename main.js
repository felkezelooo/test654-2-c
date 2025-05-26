// Initial console logs
console.log('MAIN.JS: Script execution started.');
console.log(`MAIN.JS: Node.js version: ${process.version}`);

const ApifyModule = require('apify');
const playwright = require('playwright');
const { v4: uuidv4 } = require('uuid');

// --- NEW BROWSER LAUNCH ARGUMENTS ---
const ANTI_DETECTION_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote', // Important for some environments
    '--disable-gpu',
    // Throttling and backgrounding
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    // Core anti-detection
    '--disable-blink-features=AutomationControlled',
    // Features and components
    '--disable-features=VizDisplayCompositor,ImprovedCookieControls,LazyFrameLoading,GlobalMediaControls,DestroyProfileOnBrowserClose,MediaRouter,DialMediaRouteProvider,AcceptCHFrame,AutoExpandDetailsElement,CertificateTransparencyEnforcement,AvoidUnnecessaryBeforeUnloadCheckSync,Translate',
    '--disable-ipc-flooding-protection',
    '--disable-background-networking', // Can help if proxy causes issues
    '--disable-default-apps',
    '--disable-extensions', // Crucial
    '--disable-sync',
    '--disable-translate',
    '--hide-scrollbars',
    '--metrics-recording-only',
    '--mute-audio', // Already had this, good.
    '--no-default-browser-check',
    '--safebrowsing-disable-auto-update',
    '--disable-client-side-phishing-detection',
    '--disable-component-extensions-with-background-pages',
    '--disable-hang-monitor',
    '--disable-prompt-on-repost',
    // Security relaxations (use with caution, but can help with certain sites/bot detection)
    // '--disable-web-security', // This is quite broad, enable if strictly necessary
    // '--allow-running-insecure-content', // If dealing with mixed content
    // Media stream fakes
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    // Added from original list that seemed useful
    '--password-store=basic',
    '--use-mock-keychain',
    '--enable-precise-memory-info', // Could be a fingerprinting vector if not typical
    '--force-webrtc-ip-handling-policy=default_public_interface_only',
    '--disable-site-isolation-trials', // Recommended by some anti-fingerprinting guides
];
// Randomized window size will be set in launch options directly

let GlobalLogger;

// --- GEO HELPER FUNCTIONS --- (Maintained from previous)
function getTimezoneForProxy(proxyCountry, useProxiesSetting) { /* ... */ }
function getLocaleForCountry(countryCode) { /* ... */ }
function getYouTubeSearchUrl(keyword, countryCode, detectedLocale) { /* ... */ }
// (Full implementations of geo helpers are in the previous complete code block, assuming they are still correct)

async function setPreventiveConsentCookies(page, loggerToUse) { /* ... Maintained ... */ }
async function debugPageState(page, loggerToUse, context = '') { /* ... Maintained ... */ }
async function debugClickElement(page, selector, loggerToUse) { /* ... Maintained ... */ }


// --- NEW COMPREHENSIVE ANTI-DETECTION SCRIPT ---
async function applyAntiDetectionScripts(pageOrContext, detectedTimezoneId) {
    const comprehensiveAntiDetectionScript = (timezoneId) => {
        // Webdriver Traces
        try {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            delete navigator.__proto__.webdriver; // If navigator.__proto__ is accessible
        } catch (e) { /* console.debug('Failed basic webdriver spoof:', e.message); */ }
        try { // More robust deletion
            if (navigator.webdriver) delete navigator.webdriver;
        } catch (e) { /* console.debug('Failed direct delete navigator.webdriver:', e.message); */ }


        // Automation Detection Overrides (Chrome specific properties)
        try {
            if (typeof window.chrome !== 'object') window.chrome = {};
            window.chrome.runtime = window.chrome.runtime || {};
            // Prevent weird errors by ensuring these exist if scripts try to access them.
            const props = [' สิงห์ ', 'csi', 'loadTimes', 'app']; // Common properties checked by some detection scripts
            for (const prop of props) if(typeof window.chrome[prop] === 'undefined') window.chrome[prop] = () => {};

        } catch (e) { /* console.debug('Failed Chrome object spoof:', e.message); */ }

        // Plugins Spoofing
        try {
            const plugins = [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimeTypes: [{ type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' }] },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', mimeTypes: [{ type: 'application/pdf', suffixes: 'pdf', description: '' }] },
                { name: 'Native Client', filename: 'internal-nacl-plugin', description: 'Native Client', mimeTypes: [{ type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },{ type: 'application/x-pnacl', suffixes: '', description: 'Portable Native Client Executable' }] }
            ];
            plugins.forEach(plugin => { plugin.length = plugin.mimeTypes.length; plugin.__proto__ = Plugin.prototype; plugin.item = i => plugin.mimeTypes[i]; plugin.namedItem = name => plugin.mimeTypes.find(m => m.type === name); });
            plugins.__proto__ = PluginArray.prototype;
            Object.defineProperty(navigator, 'plugins', { get: () => plugins, configurable: true, enumerable: true });

            const mimeTypes = plugins.flatMap(p => p.mimeTypes);
            mimeTypes.forEach(mime => { mime.__proto__ = MimeType.prototype; mime.enabledPlugin = plugins.find(p => p.mimeTypes.includes(mime)); });
            mimeTypes.__proto__ = MimeTypeArray.prototype;
            Object.defineProperty(navigator, 'mimeTypes', { get: () => mimeTypes, configurable: true, enumerable: true });
        } catch (e) { /* console.debug('Failed plugin/mimeType spoof:', e.message); */ }

        // Languages Spoofing
        try { Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en-US', 'en'], configurable: true }); } catch (e) {} // Default to en-GB primary as per context
        try { Object.defineProperty(navigator, 'language', { get: () => 'en-GB', configurable: true }); } catch (e) {}

        // Permissions API Spoofing (grant common safe permissions)
        try {
            const originalPermissionsQuery = navigator.permissions.query;
            navigator.permissions.query = (descriptor) => {
                const commonSafePermissions = ['geolocation', 'notifications', 'camera', 'microphone', 'persistent-storage'];
                if (commonSafePermissions.includes(descriptor.name)) {
                    return Promise.resolve({ state: 'prompt', name: descriptor.name, onchange: null }); // 'prompt' is often safer than 'granted'
                }
                // For 'midi' with sysex, it might be 'denied' or 'prompt'
                if (descriptor.name === 'midi' && descriptor.sysex) {
                    return Promise.resolve({ state: 'prompt', name: descriptor.name, onchange: null });
                }
                if (descriptor.name === 'midi' && !descriptor.sysex) {
                     return Promise.resolve({ state: 'granted', name: descriptor.name, onchange: null }); // MIDI without sysex is often granted
                }
                return originalPermissionsQuery.call(navigator.permissions, descriptor);
            };
        } catch (e) { /* console.debug('Failed permissions spoof:', e.message); */ }


        // Canvas Fingerprinting Protection
        try {
            const originalGetContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(type, ...args) {
                const context = originalGetContext.apply(this, [type, ...args]);
                if (type === '2d' && context) {
                    const originalFillText = context.fillText;
                    context.fillText = function(text, x, y, maxWidth) {
                        const noise = (Math.random() - 0.5) * 0.001; // Tiny noise
                        return originalFillText.call(this, text, x + noise, y + noise, maxWidth);
                    };
                    const originalStrokeText = context.strokeText;
                    context.strokeText = function(text, x, y, maxWidth) {
                        const noise = (Math.random() - 0.5) * 0.001;
                        return originalStrokeText.call(this, text, x + noise, y + noise, maxWidth);
                    };
                    // Add slight noise to image data if toDataURL is called
                    const originalGetImageData = context.getImageData;
                     context.getImageData = function (sx, sy, sw, sh) {
                        const imageData = originalGetImageData.apply(this, arguments);
                        for (let i = 0; i < imageData.data.length; i += Math.floor(Math.random() * 20) + 4) { // Randomly skip some pixels
                            imageData.data[i] = imageData.data[i] ^ (Math.floor(Math.random() * 3)); // Tiny XOR bit noise
                        }
                        return imageData;
                    };
                }
                return context;
            };
        } catch (e) { /* console.debug('Failed canvas spoof:', e.message); */ }

        // WebGL Fingerprinting Protection
        try {
            const webGLSpoof = {
                // Common parameters and their typical spoofed values
                37445: 'Google Inc. (Intel)', // UNMASKED_VENDOR_WEBGL
                37446: 'ANGLE (Intel, Intel Iris OpenGL Engine, OpenGL 4.1)', // UNMASKED_RENDERER_WEBGL
                7937: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)', // VERSION
                7936: 'Google Inc.', // VENDOR
                35724: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)', // SHADING_LANGUAGE_VERSION
                // Add more if needed, but be careful not to break rendering
            };
            const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (webGLSpoof.hasOwnProperty(parameter)) return webGLSpoof[parameter];
                return originalGetParameter.call(this, parameter);
            };
            // For WebGL2
            if (typeof WebGL2RenderingContext !== 'undefined') {
                const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
                 WebGL2RenderingContext.prototype.getParameter = function(parameter) {
                    if (webGLSpoof.hasOwnProperty(parameter)) return webGLSpoof[parameter];
                    // WebGL2 specific spoofs if any could go here
                    return originalGetParameter2.call(this, parameter);
                };
            }
        } catch (e) { /* console.debug('Failed WebGL spoof:', e.message); */ }

        // AudioContext Fingerprinting
        try {
            const audioContextOriginal = window.AudioContext || window.webkitAudioContext;
            if (audioContextOriginal) {
                const originalCreateOscillator = audioContextOriginal.prototype.createOscillator;
                audioContextOriginal.prototype.createOscillator = function () {
                    const oscillator = originalCreateOscillator.apply(this, arguments);
                    const originalStart = oscillator.start;
                    oscillator.start = function (when) {
                        // Slightly alter frequency for fingerprinting resistance
                        this.frequency.setValueAtTime(this.frequency.value + (Math.random() - 0.5) * 0.1, this.context.currentTime);
                        return originalStart.apply(this, arguments);
                    };
                    return oscillator;
                };
            }
        } catch (e) { /* console.debug('Failed AudioContext spoof:', e.message); */ }

        // Mouse and Keyboard Event Enhancement (more for detection scripts that check for these)
        try {
            Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + Math.floor(Math.random() * 20) + 80, configurable: true }); // Smaller, more realistic offset
            Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth + Math.floor(Math.random() * 5), configurable: true }); // Very small offset for width
        } catch (e) { /* console.debug('Failed outerHeight/Width spoof:', e.message); */ }

        // Timezone and Intl Spoofing
        try {
            const getOffsetForTargetTimezone = (targetTimezoneIdString) => { /* ... (same as before) ... */ };
            const targetOffsetMinutes = getOffsetForTargetTimezone(timezoneId);
            Date.prototype.getTimezoneOffset = function() { return targetOffsetMinutes; };

            if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
                const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
                Intl.DateTimeFormat.prototype.resolvedOptions = function() {
                    const options = originalResolvedOptions.call(this);
                    options.timeZone = timezoneId; // Align Intl with spoofed timezone
                    return options;
                };
            }
        } catch (e) { /* console.debug('Failed timezone/Intl spoof:', e.message); */ }

        // Notification Permission
        try { Object.defineProperty(Notification, 'permission', { get: () => 'default', configurable: true }); } catch (e) {}

        // Screen Properties (more realistic availHeight)
        try {
            const screenHeight = screen.height;
            const screenWidth = screen.width;
            Object.defineProperty(screen, 'availHeight', { get: () => screenHeight - (Math.floor(Math.random() * 20) + 40), configurable: true }); // Realistic taskbar height
            Object.defineProperty(screen, 'availWidth', { get: () => screenWidth, configurable: true }); // Usually full width available
        } catch (e) { /* console.debug('Failed screen avail spoof:', e.message); */ }

        // Device Memory and Hardware Concurrency
        try {
            if (navigator.deviceMemory === undefined || navigator.deviceMemory > 16 || navigator.deviceMemory < 2) {
                Object.defineProperty(navigator, 'deviceMemory', { get: () => [4, 8, 16][Math.floor(Math.random() * 3)], configurable: true });
            }
            if (navigator.hardwareConcurrency === undefined || navigator.hardwareConcurrency > 16 || navigator.hardwareConcurrency < 2) {
                Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => [2, 4, 8][Math.floor(Math.random() * 3)], configurable: true });
            }
        } catch (e) { /* console.debug('Failed memory/concurrency spoof:', e.message); */ }

        // Battery API Spoofing
        try {
            if (navigator.getBattery) {
                 navigator.getBattery = () => Promise.resolve({
                    charging: Math.random() > 0.5,
                    chargingTime: Math.random() > 0.5 ? 0 : Math.floor(Math.random() * 10000),
                    dischargingTime: Math.random() > 0.5 ? Infinity : Math.floor(Math.random() * 10000) + 3600,
                    level: Math.random() * 0.4 + 0.6, // Usually > 60%
                    onchargingchange: null,
                    onchargingtimechange: null,
                    ondischargingtimechange: null,
                    onlevelchange: null
                });
            }
        } catch(e) { /* console.debug('Failed battery API spoof: ', e.message); */ }

        // Hide console evaluation traces
        try {
            const originalConsoleLog = console.log;
            console.log = function() {
                if (arguments.length === 1 && typeof arguments[0] === 'string' && arguments[0].includes(' NAVIGATOR_USER_AGENT ')) return; // Suppress specific Playwright log
                return originalConsoleLog.apply(console, arguments);
            };
        } catch(e) {}

    }; // End of comprehensiveAntiDetectionScript

    (GlobalLogger || console).debug(`[AntiDetection] Injecting COMPREHENSIVE anti-detection script with dynamic timezoneId: ${detectedTimezoneId}`);
    if (pageOrContext.addInitScript) {
        await pageOrContext.addInitScript(comprehensiveAntiDetectionScript, detectedTimezoneId);
    } else if (pageOrContext.evaluateOnNewDocument) {
        const scriptString = `(${comprehensiveAntiDetectionScript.toString()})(${JSON.stringify(detectedTimezoneId)});`;
        await pageOrContext.evaluateOnNewDocument(scriptString);
    }
}
// --- END NEW COMPREHENSIVE ANTI-DETECTION SCRIPT ---

// --- NEW HUMAN BEHAVIOR SIMULATION ---
async function simulateHumanBehavior(page, loggerToUse, stage = 'general') {
    loggerToUse.debug(`Simulating human behavior (stage: ${stage})...`);
    try {
        const viewport = page.viewportSize();
        if (!viewport) {
            loggerToUse.warn('Viewport not available for human behavior simulation.');
            return;
        }

        // Random mouse movements
        for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) { // Reduced number of movements
            await page.mouse.move(
                Math.random() * viewport.width * 0.8 + viewport.width * 0.1, // Confine to inner 80%
                Math.random() * viewport.height * 0.8 + viewport.height * 0.1,
                { steps: 5 + Math.floor(Math.random() * 5) } // Fewer steps
            );
            await page.waitForTimeout(150 + Math.random() * 300); // Shorter delays
        }

        // Random scrolling (less aggressive)
        if (Math.random() > 0.5) { // Only scroll sometimes
            const scrollAmount = (Math.random() - 0.5) * viewport.height * 0.3; // Smaller, can be up or down
            await page.mouse.wheel(0, scrollAmount);
            await page.waitForTimeout(300 + Math.random() * 700);
        }
        loggerToUse.debug(`Human behavior simulation (stage: ${stage}) completed.`);
    } catch (e) {
        loggerToUse.debug(`Human behavior simulation (stage: ${stage}) failed: ${e.message}`);
    }
}
// --- END NEW HUMAN BEHAVIOR SIMULATION ---


function extractVideoId(url) { /* ... Maintained ... */ }
async function getVideoDuration(page, loggerToUse = GlobalLogger) { /* ... Maintained ... */ }
async function clickIfExists(pageOrFrame, selector, timeout = 3000, loggerToUse = GlobalLogger, isFrameContext = false) { /* ... Maintained ... */ }
async function handleAds(page, platform, effectiveInput, loggerToUse = GlobalLogger) { /* ... Maintained ... */ }
async function ensureVideoPlaying(page, playButtonSelectors, loggerToUse) { /* ... Maintained ... */ }
async function watchVideoOnPage(page, job, effectiveInput, loggerToUse = GlobalLogger) { /* ... Maintained ... */ }
async function handleYouTubeConsent(page, loggerToUse = GlobalLogger) { /* ... Maintained, uses updated checkForConsentIndicators internally ... */ }
async function waitForVideoPlayer(page, loggerToUse) { /* ... Maintained, uses updated consent handling if needed ... */ }


// --- runSingleJob with new Anti-Detection Measures ---
async function runSingleJob(job, effectiveInput, actorProxyConfiguration, customProxyPool, logger) {
    const jobScopedLogger = { /* ... as before ... */ };
    const jobResult = { /* ... as before ... */ };
    const logEntry = (msg, level = 'info') => { /* ... as before ... */ };

    logEntry(`Starting job for URL: ${job.url} with watchType: ${job.watchType}`);
    let browser; let context; let page;
    const detectedTimezone = getTimezoneForProxy(effectiveInput.proxyCountry, effectiveInput.useProxies);
    const detectedLocale = getLocaleForCountry(effectiveInput.proxyCountry);
    logEntry(`Geo settings: Timezone='${detectedTimezone}', Locale='${detectedLocale}' (ProxyCountry: '${effectiveInput.proxyCountry || 'N/A'}')`);

    // Dynamic window size for launch options
    const randomWidth = 1200 + Math.floor(Math.random() * 720); // Between 1200 and 1920
    const randomHeight = 700 + Math.floor(Math.random() * 380); // Between 700 and 1080
    const dynamicWindowSizeArg = `--window-size=${randomWidth},${randomHeight}`;

    const currentLaunchArgs = [...ANTI_DETECTION_ARGS, dynamicWindowSizeArg]; // Use new ANTI_DETECTION_ARGS

    try {
        const launchOptions = {
            headless: effectiveInput.headless,
            args: currentLaunchArgs, // Use the new comprehensive args + dynamic window size
            // proxy: will be set below if needed
        };

        if (effectiveInput.useProxies) { /* Proxy setup logic from previous */ }

        logEntry(`Attempting to launch browser with args: ${JSON.stringify(currentLaunchArgs.slice(0, 5))}... + ${currentLaunchArgs.length - 5} more`); // Log first few args
        browser = (typeof ApifyModule !== 'undefined' && ApifyModule.Actor && ApifyModule.Actor.isAtHome && ApifyModule.Actor.isAtHome() && ApifyModule.Actor.launchPlaywright)
            ? await ApifyModule.Actor.launchPlaywright(launchOptions)
            : await playwright.chromium.launch(launchOptions);
        logEntry('Browser launched.');

        // --- NEW Context Configuration ---
        context = await browser.newContext({
            bypassCSP: true,
            ignoreHTTPSErrors: true,
            viewport: { // This will be the actual viewport, distinct from window size if needed
                width: Math.min(1920, 1200 + Math.floor(Math.random() * 320)), // Cap at 1920
                height: Math.min(1080, 700 + Math.floor(Math.random() * 280))  // Cap at 1080
            },
            locale: detectedLocale,
            timezoneId: detectedTimezone,
            javaScriptEnabled: true,
            extraHTTPHeaders: { // From Claude's suggestion
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': `${detectedLocale.replace('_', '-')},en;q=0.9`, // Already had this, good.
                'Accept-Encoding': 'gzip, deflate, br', // Standard
                // 'Cache-Control': 'max-age=0', // Can sometimes be problematic, make optional if issues
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none', // For initial navigation
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                // User-Agent set via launch args or Playwright's userAgent option in newContext for better control
            },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', // Standard modern UA
            permissions: ['geolocation', 'notifications'], // Granting some common permissions
            colorScheme: 'light', // Common default
            // geolocation: { latitude: ..., longitude: ... } // Could be spoofed based on proxy country
            // deviceScaleFactor: 1 or 2 based on typical displays
        });
        // --- END NEW Context Configuration ---

        await applyAntiDetectionScripts(context, detectedTimezone); // Uses the new comprehensive script

        if (job.watchType === 'referer' && job.refererUrl) { /* ... (maintained, ensure it merges with new extraHTTPHeaders correctly) ... */ }

        page = await context.newPage();
        // Viewport might be redundant if set in context, but explicit set is fine
        await page.setViewportSize({
            width: Math.min(1920, 1200 + Math.floor(Math.random() * 120)),
            height: Math.min(1080, 700 + Math.floor(Math.random() * 80))
        });

        await setPreventiveConsentCookies(page, jobScopedLogger);
        await page.waitForTimeout(500 + Math.random() * 1000); // Small pause after setting cookies

        if (job.watchType === 'search' && job.searchKeywords && job.searchKeywords.length > 0) {
            const keyword = job.searchKeywords[Math.floor(Math.random() * job.searchKeywords.length)];
            logEntry(`Performing search for keyword: "${keyword}" to find video ID: ${job.videoId}`);

            // --- NEW Google Search Referer Chain ---
            logEntry('Navigating to Google for organic search...');
            await page.goto('https://www.google.com/search?q=', { timeout: effectiveInput.timeout * 1000, waitUntil: 'domcontentloaded' }); // Go to empty search to avoid pre-filled query issues
            await page.waitForTimeout(1000 + Math.random() * 1500); // Wait for Google to fully load
            await simulateHumanBehavior(page, jobScopedLogger, 'google-home');

            logEntry(`Filling Google search with: "${keyword} site:youtube.com"`);
            await page.fill('textarea[name="q"], input[name="q"]', `${keyword} site:youtube.com`); // Try textarea first, then input
            await page.waitForTimeout(300 + Math.random() * 700); // Simulate typing pause
            await page.keyboard.press('Enter');
            logEntry('Google search submitted. Waiting for results...');
            await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
            await page.waitForTimeout(2000 + Math.random() * 2000); // Wait for results to render
            await simulateHumanBehavior(page, jobScopedLogger, 'google-serp');
            // --- END Google Search Referer Chain ---

            // Now on Google SERP, find the link to the YouTube video
            // This selector needs to be robust for Google's SERP structure
            const googleServVideoLinkSelector = `a[href*="youtube.com/watch?v=${job.videoId}"]`;
            logEntry(`Looking for YouTube link on Google SERP: ${googleServVideoLinkSelector}`);

            const googleVideoLink = page.locator(googleServVideoLinkSelector).first();
            try {
                await googleVideoLink.waitFor({ state: 'visible', timeout: 30000 });
                logEntry('YouTube video link found on Google SERP. Scrolling and clicking...');
                await googleVideoLink.scrollIntoViewIfNeeded({ timeout: 5000 });
                await page.waitForTimeout(500 + Math.random() * 500);
                const navigationPromise = page.waitForURL(`**/watch?v=${job.videoId}**`, { timeout: 25000, waitUntil: 'domcontentloaded' });
                await googleVideoLink.click({ delay: 100 + Math.random() * 100 });
                await navigationPromise;
                logEntry(`Successfully navigated from Google SERP to YouTube video page: ${page.url()}`);
            } catch (googleSearchError) {
                logEntry(`Could not find or click YouTube link on Google SERP for video ID ${job.videoId}. Error: ${googleSearchError.message.split('\n')[0]}`, 'error');
                logEntry('Falling back to direct navigation to video URL as search from Google failed.');
                 await page.goto(job.url, { timeout: 30000, waitUntil: 'domcontentloaded' }); // Direct nav fallback
            }
             await simulateHumanBehavior(page, jobScopedLogger, 'youtube-video-page-loaded-from-search');

        } else { // Direct or standard Referer navigation
            logEntry(`Navigating (direct/referer) to ${job.url}.`);
            await page.goto(job.url, { timeout: effectiveInput.timeout * 1000, waitUntil: 'domcontentloaded' });
            logEntry(`Initial navigation to ${job.url} (domcontentloaded) complete.`);
            await page.waitForTimeout(1500 + Math.random() * 2000); // Realistic load delay
            await simulateHumanBehavior(page, jobScopedLogger, 'youtube-video-page-loaded-direct');
        }

        // Consent handling on the (now hopefully loaded) video page
        await debugPageState(page, jobScopedLogger, 'before consent (video page)');
        logEntry('Handling consent on video page...');
        const videoPageConsentHandled = await handleYouTubeConsent(page, jobScopedLogger);
        await debugPageState(page, jobScopedLogger, 'after consent (video page)');
        if (!videoPageConsentHandled) logEntry('Consent handling uncertain on video page, proceeding with caution.', 'warn');
        else logEntry('Consent handling on video page returned true.');
        await page.waitForTimeout(1000 + Math.random() * 1000); // Pause after consent handling

        // Aggressive overlay removal attempt before player detection
        logEntry('Aggressively removing any potential consent/other overlays before player detection...');
        await page.evaluate(() => { /* ... (Aggressive removal script from Claude) ... */ }).catch(e => logger.warning(`Error during aggressive overlay removal: ${e.message}`));
        await page.waitForTimeout(1000);

        const visiblePlayerSelector = await waitForVideoPlayer(page, jobScopedLogger);
        logEntry(`Video player ready with selector: ${visiblePlayerSelector}`);
        await page.waitForTimeout(500 + Math.random() * 1500); // Pause before starting playback interactions

        const watchResult = await watchVideoOnPage(page, job, effectiveInput, jobScopedLogger);
        Object.assign(jobResult, watchResult);

    } catch (e) { /* ... Error handling (maintained, includes screenshot/HTML) ... */ }
    finally { /* ... Cleanup (maintained) ... */ }
    return jobResult;
}

async function actorMainLogic() { /* ... Maintained from previous ... */ }
// Ensure full implementations of geo helpers, actorMainLogic, etc., are present from the previous complete code block.

// Full implementations of helper functions that were previously summarized:
// (getTimezoneForProxy, getLocaleForCountry, getYouTubeSearchUrl, setPreventiveConsentCookies,
//  debugPageState, debugClickElement, extractVideoId, getVideoDuration, clickIfExists,
//  handleAds, ensureVideoPlaying, watchVideoOnPage, handleYouTubeConsent, waitForVideoPlayer,
//  actorMainLogic, and the if block for Actor.main)
// These are assumed to be complete as per the prior "complete" code block.
// The new ANTI_DETECTION_ARGS and comprehensiveAntiDetectionScript are at the top.
// The runSingleJob is significantly updated.

if (ApifyModule.Actor && typeof ApifyModule.Actor.main === 'function') {
    ApifyModule.Actor.main(actorMainLogic);
} else {
    console.error('CRITICAL: Apify.Actor.main is not defined. Running actorMainLogic directly.');
    actorMainLogic().catch(err => {
        console.error('CRITICAL: Error in direct actorMainLogic execution:', err);
        process.exit(1);
    });
}
console.log('MAIN.JS: Script fully loaded and main execution path determined.');
