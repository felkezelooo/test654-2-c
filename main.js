const Apify = require('apify');
const { Actor, log } = Apify; // Using Actor.log for consistency
const playwright = require('playwright-core'); // playwright-core for Apify
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { to } = require('await-to-js');
const { v4: uuidv4 } = require('uuid');

chromium.use(StealthPlugin());

function extractVideoId(url) {
    if (!url || typeof url !== 'string') return null;
    const patterns = [
        /[?&]v=([a-zA-Z0-9_-]{11})/,
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

function random(min, max) {
    if (max === undefined) { max = min; min = 0; }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Simplified consent handler
async function handleYouTubeConsent(page, logger) {
    logger.info('Checking for YouTube consent dialog...');
    const consentButtonSelectors = [
        'button[aria-label*="Accept all"]', // Common variations
        'button[aria-label*="Accept the use of cookies"]',
        'button[aria-label*="Agree"]',
        'div[role="dialog"] button:has-text("Accept all")', // More generic
        'div[role="dialog"] button:has-text("Agree")',
        'ytd-button-renderer:has-text("Accept all")', // YouTube specific
        'tp-yt-paper-button:has-text("ACCEPT ALL")',
        '#introAgreeButton', // Older consent forms
    ];

    for (const selector of consentButtonSelectors) {
        try {
            const button = page.locator(selector).first(); // Take the first match
            if (await button.isVisible({ timeout: 7000 })) { // Increased timeout slightly
                logger.info(`Consent button found with selector: "${selector}". Attempting to click.`);
                await button.click({ timeout: 5000, force: true }); // Force true can help with overlays
                await page.waitForTimeout(1500 + random(500, 1500)); // Wait for dialog to process/disappear
                logger.info('Consent button clicked.');
                const stillVisible = await page.locator('ytd-consent-bump-v2-lightbox, tp-yt-paper-dialog[role="dialog"]').first().isVisible({timeout:1000}).catch(() => false);
                if (!stillVisible) {
                    logger.info('Consent dialog likely dismissed.');
                    return true;
                } else {
                    logger.warn('Clicked consent button, but a dialog might still be visible.');
                }
                return true; 
            }
        } catch (e) {
            logger.debug(`Consent button selector "${selector}" not found or failed: ${e.message.split('\n')[0]}`);
        }
    }
    logger.info('No actionable consent dialog found or handled after checking all selectors.');
    return false;
}


class YouTubeViewWorker {
    constructor(job, effectiveInput, proxyUrl, baseLogger) {
        this.job = job;
        this.effectiveInput = effectiveInput;
        this.proxyUrl = proxyUrl;
        this.logger = baseLogger.child({ prefix: `Worker-${job.videoId.substring(0, 6)}` });
        this.id = uuidv4();
        this.browser = null;
        this.context = null;
        this.page = null;
        this.killed = false;
        this.adWatchState = {
            isWatchingAd: false,
            timeToWatchThisAdBeforeSkip: 0,
            adPlayedForEnoughTime: false,
            adStartTime: 0,
        };
        this.lastReportedVideoTimeSeconds = 0;
    }

    async startWorker() {
        this.logger.info(`Launching browser... Proxy: ${this.proxyUrl ? 'Yes' : 'No'}, Headless: ${this.effectiveInput.headless}`);
        const launchOptions = {
            headless: this.effectiveInput.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                 // Consider adding more args from your original script if stealth isn't enough
                '--disable-blink-features=AutomationControlled',
            ],
        };
        if (this.proxyUrl) {
            launchOptions.proxy = { server: this.proxyUrl };
        }

        this.browser = await Actor.launchPlaywright(launchOptions, { launcher: chromium });
        this.logger.info('Browser launched.');

        const userAgentStrings = [ // A small list of common user agents
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0'
        ];
        const selectedUserAgent = userAgentStrings[random(userAgentStrings.length - 1)];


        this.context = await this.browser.newContext({
            bypassCSP: true,
            ignoreHTTPSErrors: true,
            viewport: { width: 1280 + random(0, 640), height: 720 + random(0, 360) },
            locale: ['en-US', 'en-GB', 'en', 'hu-HU', 'hu'][random(4)],
            timezoneId: ['America/New_York', 'Europe/London', 'Europe/Budapest'][random(2)],
            javaScriptEnabled: true,
            userAgent: selectedUserAgent, // Apply a common user agent
        });
        this.logger.info('Browser context created.');

        if (this.job.referer) {
            this.logger.info(`Setting referer to: ${this.job.referer}`);
            await this.context.setExtraHTTPHeaders({ 'Referer': this.job.referer });
        }

        this.page = await this.context.newPage();
        this.logger.info('New page created.');
        
        this.logger.info(`Navigating to video URL: ${this.job.videoUrl}`);
        // Increased navigation timeout slightly and split into two parts
        await this.page.goto(this.job.videoUrl, { waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 * 0.7 });
        this.logger.info('Navigation to domcontentloaded complete.');
        try {
            await this.page.waitForLoadState('load', { timeout: this.effectiveInput.timeout * 1000 * 0.3 });
            this.logger.info('Page fully loaded.');
        } catch (e) {
            this.logger.warn(`Page 'load' state timed out or failed: ${e.message.split('\n')[0]}. Continuing...`);
        }


        await handleYouTubeConsent(this.page, this.logger);
        await this.page.waitForTimeout(random(1500,3500)); 

        try {
            await this.page.waitForSelector('video.html5-main-video', { timeout: 25000, state: 'attached' });
            this.logger.info('Video element is attached.');

            await this.page.evaluate(async () => { // Wait for metadata within page context
                const video = document.querySelector('video.html5-main-video');
                if (video && video.readyState < 1) { 
                    return new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => reject(new Error('Video metadata timeout')), 15000);
                        video.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
                        video.onerror = (e) => {clearTimeout(timeout); reject(new Error('Video error on metadata load: ' + (e.target?.error?.message || 'Unknown video error'))); };
                    });
                }
            }).catch(e => this.logger.warn(`Error or timeout waiting for video metadata in page: ${e.message}`));

            const duration = await this.page.evaluate(() => {
                const video = document.querySelector('video.html5-main-video');
                return video ? video.duration : null;
            });

            if (duration && !isNaN(duration) && isFinite(duration)) {
                this.job.video_info.duration = Math.round(duration);
                this.logger.info(`Video duration: ${this.job.video_info.duration}s`);
            } else {
                this.logger.warn(`Invalid video duration (${duration}), using default 300s.`);
                this.job.video_info.duration = 300;
            }
        } catch (e) {
            this.logger.warn(`Error fetching video duration: ${e.message}. Using default 300s.`);
            this.job.video_info.duration = 300;
        }
        
        try {
            await this.page.click('.ytp-settings-button', {timeout: 10000});
            await this.page.waitForTimeout(random(500, 900));
            const qualityMenuItem = this.page.locator('.ytp-menuitem-label:has-text("Quality")').first();
            if (await qualityMenuItem.isVisible({timeout: 4000})) {
                await qualityMenuItem.click();
                await this.page.waitForTimeout(random(500, 900));
                const qualityOptions = await this.page.locator('.ytp-quality-menu .ytp-menuitem').all(); // Get all menu items
                if (qualityOptions.length > 0) {
                    let lowestQualityOptionElement = qualityOptions[qualityOptions.length - 1]; // The last one is usually lowest
                     const text = await lowestQualityOptionElement.textContent();
                     if (text && text.toLowerCase().includes('auto')) { // If last is "Auto", try second to last
                         if (qualityOptions.length > 1) lowestQualityOptionElement = qualityOptions[qualityOptions.length - 2];
                     }
                    await lowestQualityOptionElement.click();
                    this.logger.info('Attempted to set lowest video quality.');
                } else { this.logger.warn('No quality options found.');}
                await this.page.waitForTimeout(random(400,700));
            } else {this.logger.warn('Quality menu item not found.');}
            if (await this.page.locator('.ytp-settings-menu').isVisible({timeout:500})) { // Ensure settings menu is closed
                await this.page.keyboard.press('Escape', {delay: random(100,300)});
            }
        } catch (e) {
            this.logger.warn(`Could not set video quality: ${e.message.split('\n')[0]}`);
            if (await this.page.locator('.ytp-settings-menu').isVisible({timeout:500})) {
                 await this.page.keyboard.press('Escape').catch(()=>{});
            }
        }
        
        try {
            // More robust play button clicking
            const playSelectors = [
                'button.ytp-large-play-button[aria-label*="Play"]',
                'button.ytp-play-button[aria-label*="Play"]',
                '.ytp-play-button:not([aria-label*="Pause"])', // Generic play
                'div[role="button"][aria-label*="Play"]'
            ];
            let playClicked = false;
            for(const selector of playSelectors) {
                const button = this.page.locator(selector).first();
                if(await button.isVisible({timeout: 2000})) {
                    await button.click({timeout: 2000, force: true});
                    this.logger.info(`Clicked play button via selector: ${selector}`);
                    playClicked = true;
                    break;
                }
            }
            if (!playClicked) {
                 this.logger.info('No standard play button found, attempting JS play.');
                 await this.page.evaluate(() => {
                    const video = document.querySelector('video.html5-main-video');
                    if (video && video.paused) video.play().catch(e => console.warn("JS play() failed in startWorker:", e.message));
                });
            }
        } catch(e) {
            this.logger.warn(`Error trying to play video: ${e.message.split('\n')[0]}. Video might autoplay or be unstartable.`);
        }
        await this.page.waitForTimeout(random(2000, 4000)); // Longer pause for playback to stabilize

        return true;
    }

    async handleAds() { /* ... same as before ... */ }
    async watchVideo() { /* ... same as before ... */ }
    async kill() { /* ... same as before ... */ }
}


async function actorMainLogic() { /* ... same as before ... */ }

// Apify Actor entry point
Actor.main(async () => {
    try {
        await actorMainLogic();
    } catch (error) {
        const loggerInstance = (typeof log !== 'undefined' && log.exception) ? log : console;
        loggerInstance.error('CRITICAL UNHANDLED ERROR IN Actor.main:', { message: error.message, stack: error.stack });
        
        if (Actor.isAtHome && typeof Actor.isAtHome === 'function' && Actor.isAtHome()) {
            await Actor.fail(`Critical error in Actor.main: ${error.message}`);
        } else {
            console.error("Exiting due to critical error in local/non-Apify environment.");
            process.exit(1);
        }
    }
});

console.log('MAIN.JS: Script fully loaded. Actor.main is set up.');
