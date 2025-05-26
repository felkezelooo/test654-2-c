const Apify = require('apify');
const { Actor, log, ProxyConfiguration } = Apify;
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { to } = require('await-to-js');
const { v4: uuidv4 } = require('uuid');

chromium.use(StealthPlugin());

function getSafeLogger(loggerInstance) {
    const defaultLogger = {
        info: console.log,
        warn: console.warn,
        error: console.error,
        debug: console.log,
        child: () => defaultLogger, // Return self for child if main logger is bad
    };
    if (loggerInstance && typeof loggerInstance.info === 'function') {
        return loggerInstance;
    }
    console.error("APIFY LOGGER WAS NOT AVAILABLE, FALLING BACK TO CONSOLE");
    return defaultLogger;
}


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

async function handleYouTubeConsent(page, logger) {
    const safeLogger = getSafeLogger(logger);
    safeLogger.info('Checking for YouTube consent dialog...');
    const consentButtonSelectors = [
        'button[aria-label*="Accept all"]', 
        'button[aria-label*="Accept the use of cookies"]',
        'button[aria-label*="Agree"]',
        'div[role="dialog"] button:has-text("Accept all")', 
        'div[role="dialog"] button:has-text("Agree")',
        'ytd-button-renderer:has-text("Accept all")', 
        'tp-yt-paper-button:has-text("ACCEPT ALL")',
        '#introAgreeButton',
    ];

    for (const selector of consentButtonSelectors) {
        try {
            const button = page.locator(selector).first(); 
            if (await button.isVisible({ timeout: 7000 })) { 
                safeLogger.info(`Consent button found: "${selector}". Clicking.`);
                await button.click({ timeout: 5000, force: true }); 
                await page.waitForTimeout(1500 + random(500, 1500));
                safeLogger.info('Consent button clicked.');
                const stillVisible = await page.locator('ytd-consent-bump-v2-lightbox, tp-yt-paper-dialog[role="dialog"]').first().isVisible({timeout:1000}).catch(() => false);
                if (!stillVisible) {
                    safeLogger.info('Consent dialog likely dismissed.');
                    return true;
                } else {
                    safeLogger.warn('Clicked consent button, but a dialog might still be visible.');
                }
                return true; 
            }
        } catch (e) {
            safeLogger.debug(`Consent selector "${selector}" not actionable or error: ${e.message.split('\n')[0]}`);
        }
    }
    safeLogger.info('No actionable consent dialog found.');
    return false;
}

class YouTubeViewWorker {
    constructor(job, effectiveInput, proxyUrl, baseLogger) {
        this.job = job;
        this.effectiveInput = effectiveInput;
        this.proxyUrl = proxyUrl;
        this.logger = getSafeLogger(baseLogger).child({ prefix: `Worker-${job.videoId.substring(0, 6)}` });
        this.id = uuidv4();
        this.browser = null;
        this.context = null;
        this.page = null;
        this.killed = false;
        this.adWatchState = { /* ... */ };
        this.lastReportedVideoTimeSeconds = 0;
    }

    async startWorker() {
        this.logger.info(`Launching browser... Proxy: ${this.proxyUrl ? 'Yes' : 'No'}, Headless: ${this.effectiveInput.headless}`);
        const userAgentStrings = [ /* ... user agents ... */ ];
        const selectedUserAgent = userAgentStrings[random(userAgentStrings.length - 1)];
        const launchOptions = {
            headless: this.effectiveInput.headless,
            args: [ /* ... args ... */
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
                '--disable-gpu', '--disable-blink-features=AutomationControlled',
                `--window-size=${1280 + random(0, 640)},${720 + random(0, 360)}`
            ],
        };
        if (this.proxyUrl) {
            launchOptions.proxy = { server: this.proxyUrl };
        }
        
        this.browser = await chromium.launch(launchOptions); // Use playwright-extra's launch
        this.logger.info('Browser launched with playwright-extra.');

        this.context = await this.browser.newContext({ // Create context from playwright-extra browser
            bypassCSP: true, ignoreHTTPSErrors: true,
            locale: ['en-US', 'en-GB', 'hu-HU'][random(2)], 
            timezoneId: ['America/New_York', 'Europe/London', 'Europe/Budapest'][random(2)],
            javaScriptEnabled: true, userAgent: selectedUserAgent,
        });
        this.logger.info('Browser context created.');

        if (this.job.referer) {
            this.logger.info(`Setting referer: ${this.job.referer}`);
            await this.context.setExtraHTTPHeaders({ 'Referer': this.job.referer });
        }
        this.page = await this.context.newPage();
        this.logger.info('New page created.');
        
        if (this.effectiveInput.customAntiDetection) {
            await applyAntiDetectionScripts(this.page, this.logger);
        }
        
        this.logger.info(`Navigating to: ${this.job.videoUrl}`);
        await this.page.goto(this.job.videoUrl, { waitUntil: 'domcontentloaded', timeout: this.effectiveInput.timeout * 1000 * 0.7 });
        this.logger.info('Navigation (domcontentloaded) complete.');
        await this.page.waitForLoadState('load', { timeout: this.effectiveInput.timeout * 1000 * 0.3 }).catch(e => this.logger.warn(`Page 'load' state timeout: ${e.message.split('\n')[0]}`));
        this.logger.info('Page load state reached.');

        await handleYouTubeConsent(this.page, this.logger);
        await this.page.waitForTimeout(random(2000,4000));

        try { // Get video duration
            await this.page.waitForSelector('video.html5-main-video', { timeout: 25000, state: 'attached' });
            this.logger.info('Video element attached.');
            await this.page.evaluate(async () => { 
                const video = document.querySelector('video.html5-main-video');
                if (video && video.readyState < 1) { 
                    return new Promise((resolve, reject) => {
                        const tid = setTimeout(() => reject(new Error('Video metadata load timeout (15s)')), 15000);
                        video.onloadedmetadata = () => { clearTimeout(tid); resolve(undefined); }; 
                        video.onerror = (e) => {clearTimeout(tid); reject(new Error('Video element error on metadata: ' + (e.target?.error?.message || 'Unknown'))); };
                    });
                }
            }).catch(e => this.logger.warn(`Video metadata script error: ${e.message}`));

            const duration = await this.page.evaluate(() => document.querySelector('video.html5-main-video')?.duration);
            if (duration && !isNaN(duration) && isFinite(duration)) {
                this.job.video_info.duration = Math.round(duration);
                this.logger.info(`Video duration: ${this.job.video_info.duration}s`);
            } else {
                this.logger.warn(`Invalid/Unavailable video duration (${duration}), using default 300s.`);
                this.job.video_info.duration = 300;
            }
        } catch (e) {
            this.logger.warn(`Error during video duration check: ${e.message}. Using default 300s.`);
            this.job.video_info.duration = 300;
        }
        
        try { // Set quality
            if (await this.page.locator('.ytp-settings-button').first().isVisible({timeout: 10000})) {
                await this.page.click('.ytp-settings-button');
                await this.page.waitForTimeout(random(600, 1000));
                const qualityMenuItem = this.page.locator('.ytp-menuitem-label:has-text("Quality")').first();
                if (await qualityMenuItem.isVisible({timeout: 4000})) {
                    await qualityMenuItem.click();
                    await this.page.waitForTimeout(random(600, 1000));
                    const qualityOptions = await this.page.locator('.ytp-quality-menu .ytp-menuitem').all(); 
                    if (qualityOptions.length > 0) {
                        let lowestQualityOptionElement = qualityOptions[qualityOptions.length - 1]; 
                         const text = await lowestQualityOptionElement.textContent();
                         if (text && text.toLowerCase().includes('auto')) { 
                             if (qualityOptions.length > 1) lowestQualityOptionElement = qualityOptions[qualityOptions.length - 2];
                         }
                        await lowestQualityOptionElement.click();
                        this.logger.info(`Attempted to set video quality.`);
                    } else { this.logger.warn('No quality options found in menu.'); }
                    await this.page.waitForTimeout(random(400,700));
                } else { this.logger.warn('Quality menu item not found.'); }
                if (await this.page.locator('.ytp-settings-menu').isVisible({timeout:500})) {
                    await this.page.keyboard.press('Escape', {delay: random(100,300)});
                }
            } else { this.logger.info('Settings button not visible for quality adjustment.'); }
        } catch (e) {
            this.logger.warn(`Could not set video quality: ${e.message.split('\n')[0]}`);
            if (await this.page.locator('.ytp-settings-menu').isVisible({timeout:500})) {
                 await this.page.keyboard.press('Escape').catch(()=>{});
            }
        }
        
        try { // Play video
            const playSelectors = [ /* ... */ ];
            let playClicked = false;
            for(const selector of playSelectors) {
                // ... (same play logic)
            }
            if (!playClicked) { /* ... JS play ... */ }
        } catch(e) { this.logger.warn(`Error trying to play video: ${e.message.split('\n')[0]}`); }
        await this.page.waitForTimeout(random(2000, 4500));
        return true;
    }

    async handleAds() { /* ... same as before ... */ }
    async watchVideo() { /* ... same as before ... */ }
    async kill() { /* ... same as before ... */ }
}

async function applyAntiDetectionScripts(page, loggerToUse) {
    const safeLogger = getSafeLogger(loggerToUse);
    const script = () => { /* ... your original anti-detection script from the prompt ... */ };
    try {
        await page.addInitScript(script);
        safeLogger.info('Custom anti-detection script applied via addInitScript.');
    } catch (e) {
        safeLogger.error(`Failed to add init script: ${e.message}`);
    }
}

async function actorMainLogic() {
    const actorLog = getSafeLogger(log); // Use safe logger from the start
    await Actor.init(); 
    actorLog.info('Starting YouTube View Bot (Custom Playwright with Stealth).');

    const input = await Actor.getInput();
    if (!input) { actorLog.error('No input provided.'); await Actor.fail('No input provided.'); return; }

    const defaultInput = {
        videoUrls: [], refererUrls: [], watchTimePercentage: 85,
        useProxies: true, proxyCountry: 'US', proxyGroups: ['RESIDENTIAL'],
        headless: true, autoSkipAds: true, skipAdsAfterMinSeconds: 5, skipAdsAfterMaxSeconds: 12,
        timeout: 120, concurrency: 1, concurrencyInterval: 5,
        customAntiDetection: true,
    };
    const effectiveInput = { ...defaultInput, ...input };
    effectiveInput.skipAdsAfter = [
        Math.max(0, effectiveInput.skipAdsAfterMinSeconds || 0),
        Math.max(effectiveInput.skipAdsAfterMinSeconds || 0, effectiveInput.skipAdsAfterMaxSeconds || (effectiveInput.skipAdsAfterMinSeconds || 0) + 7)
    ];
    actorLog.info('Effective input (summary):', { videos: effectiveInput.videoUrls.length, proxy: effectiveInput.proxyCountry, headless: effectiveInput.headless, watchPercent: effectiveInput.watchTimePercentage });

    if (!effectiveInput.videoUrls || effectiveInput.videoUrls.length === 0) {
        actorLog.error('No videoUrls provided.'); await Actor.fail('No videoUrls provided.'); return;
    }

    let actorProxyConfiguration = null;
    if (effectiveInput.useProxies) {
        const proxyOpts = { groups: effectiveInput.proxyGroups || ['RESIDENTIAL'] };
        if (effectiveInput.proxyCountry && effectiveInput.proxyCountry !== "ANY") proxyOpts.countryCode = effectiveInput.proxyCountry;
        try {
            actorProxyConfiguration = await Actor.createProxyConfiguration(proxyOpts); // CORRECTED
            actorLog.info(`Apify Proxy: Country=${proxyOpts.countryCode || 'Any'}, Groups=${(proxyOpts.groups).join(', ')}`);
        } catch (e) { actorLog.error(`Failed Apify Proxy config: ${e.message}.`); actorProxyConfiguration = null; }
    }

    const jobs = [];
    for (let i = 0; i < effectiveInput.videoUrls.length; i++) {
        const videoUrl = effectiveInput.videoUrls[i];
        const videoId = extractVideoId(videoUrl);
        if (!videoId) { actorLog.warn(`Invalid YouTube URL/ID: "${videoUrl}". Skipping.`); await Actor.pushData({ videoUrl, status: 'error', error: 'Invalid YouTube URL' }); continue; }
        const refererUrl = (effectiveInput.refererUrls && effectiveInput.refererUrls[i] && effectiveInput.refererUrls[i].trim() !== "") ? effectiveInput.refererUrls[i].trim() : null;
        jobs.push({ id: uuidv4(), videoUrl, videoId, referer: refererUrl, video_info: { duration: 300, isLive: false }, watch_time: effectiveInput.watchTimePercentage, jobIndex: i });
    }

    if (jobs.length === 0) { actorLog.error('No valid jobs.'); await Actor.fail('No valid jobs.'); return; }
    actorLog.info(`Created ${jobs.length} job(s). Concurrency: ${effectiveInput.concurrency}`);

    const overallResults = { totalJobs: jobs.length, successfulJobs: 0, failedJobs: 0, details: [], startTime: new Date().toISOString() };
    const activeWorkers = new Set();
    let jobCounter = 0;

    const processJob = async (job) => {
        const jobLogger = actorLog.child({ prefix: `Job-${job.videoId.substring(0,4)}` });
        jobLogger.info(`Starting job ${job.jobIndex + 1}/${jobs.length}, Referer: ${job.referer || 'None'}`);
        let proxyUrlToUse = null;
        let proxyInfoForLog = 'None';

        if (actorProxyConfiguration) {
            const sessionId = `session_${job.id.substring(0, 12).replace(/-/g, '')}`; // CORRECTED
            proxyUrlToUse = actorProxyConfiguration.newUrl(sessionId);
            proxyInfoForLog = `ApifyProxy (Session: ${sessionId}, Country: ${effectiveInput.proxyCountry || 'Any'})`;
        } else if (effectiveInput.useProxies) {
             jobLogger.warn(`Proxy requested but not configured.`);
        }

        const worker = new YouTubeViewWorker(job, effectiveInput, proxyUrlToUse, jobLogger); // Pass jobLogger
        let jobResultData = { 
            jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId, 
            status: 'initiated', proxyUsed: proxyInfoForLog, refererRequested: job.referer 
        };

        try {
            await worker.startWorker();
            const watchResult = await worker.watchVideo();
            Object.assign(jobResultData, watchResult, { status: 'success' }); 
            overallResults.successfulJobs++;
        } catch (error) {
            jobLogger.error(`Error processing: ${error.message}`, { stack: error.stack && error.stack.split('\n').slice(0,5).join(' | ')});
            jobResultData = { ...jobResultData, status: 'failure', error: error.message + (error.stack ? ` STACK_TRACE_SNIPPET: ${error.stack.split('\n').slice(0,3).join(' | ')}` : '') };
            overallResults.failedJobs++;
        } finally {
            await worker.kill();
            jobLogger.info(`Finished. Status: ${jobResultData.status}`);
        }
        overallResults.details.push(jobResultData);
        await Actor.pushData(jobResultData);
    };
    
    const runPromises = [];
    for (const job of jobs) {
        if (activeWorkers.size >= effectiveInput.concurrency) {
            await Promise.race(Array.from(activeWorkers)).catch(e => actorLog.warn(`Error during Promise.race (worker slot wait): ${e.message}`));
        }
        const promise = processJob(job).catch(e => {
            actorLog.error(`Unhandled error directly from processJob promise for ${job.videoId}: ${e.message}`);
            const errorResult = { jobId: job.id, videoUrl: job.videoUrl, videoId: job.videoId, status: 'catastrophic_processJob_failure', error: e.message };
            Actor.pushData(errorResult); 
            overallResults.failedJobs++;
            overallResults.details.push(errorResult);
        }).finally(() => {
            activeWorkers.delete(promise);
        });
        activeWorkers.add(promise);
        runPromises.push(promise);
        jobCounter++;
        if (jobCounter < jobs.length && activeWorkers.size < effectiveInput.concurrency && effectiveInput.concurrencyInterval > 0) {
            actorLog.debug(`Waiting ${effectiveInput.concurrencyInterval}s before dispatching next job (active: ${activeWorkers.size}).`);
            await Apify.utils.sleep(effectiveInput.concurrencyInterval * 1000);
        }
    }
    await Promise.all(runPromises.map(p => p.catch(e => { 
        actorLog.error(`Error caught by Promise.all on worker promise: ${e.message}`);
        return e; 
    })));

    overallResults.endTime = new Date().toISOString();
    actorLog.info('All jobs processed.', { summary: { total: overallResults.totalJobs, success: overallResults.successfulJobs, failed: overallResults.failedJobs }});
    await Actor.setValue('OVERALL_RESULTS', overallResults);
    actorLog.info('Actor finished successfully.');
    await Actor.exit();
}

Actor.main(async () => {
    try {
        await actorMainLogic();
    } catch (error) {
        const loggerToUse = getSafeLogger(log); // Ensure logger is safe here too
        loggerToUse.error('CRITICAL UNHANDLED ERROR IN Actor.main:', { message: error.message, stack: error.stack });
        
        if (Actor.isAtHome && typeof Actor.isAtHome === 'function' && Actor.isAtHome()) {
            await Actor.fail(`Critical error in Actor.main: ${error.message}`);
        } else {
            console.error("Exiting due to critical error in local/non-Apify environment.");
            process.exit(1);
        }
    }
});

console.log('MAIN.JS: Script fully loaded. Actor.main is set up.');
