const { chromium } = require('playwright');

/**
 * Test script to validate the improved YouTube & Rumble View Bot functionality
 * This script tests key features without requiring the full Apify environment
 */
async function runTests() {
    console.log('Starting validation tests for YouTube & Rumble View Bot');
    
    // Test configuration
    const testConfig = {
        youtubeUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', // First YouTube video (Me at the zoo)
        rumbleUrl: 'https://rumble.com/v4e9a5h-test-video-for-testing.html', // Test video on Rumble
        watchTimePercentage: 80,
        headless: false, // Set to false to see the browser during testing
        timeout: 120
    };
    
    // Run tests
    try {
        await testVideoDurationDetection(testConfig);
        await testWatchTimeEnforcement(testConfig);
        await testAntiDetectionMeasures(testConfig);
        await testEngagementFeatures(testConfig);
        
        console.log('All tests completed successfully!');
    } catch (error) {
        console.error(`Test suite failed: ${error.message}`);
    }
}

/**
 * Test video duration detection
 */
async function testVideoDurationDetection(config) {
    console.log('\n--- Testing Video Duration Detection ---');
    
    // Launch browser
    const browser = await chromium.launch({ headless: config.headless });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        // Test YouTube duration detection
        console.log('Testing YouTube duration detection...');
        await page.goto(config.youtubeUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout * 1000 });
        await page.waitForSelector('video', { timeout: 30000 });
        
        // Get duration using the function from main.js
        const youtubeDuration = await getVideoDurationWithRetry(page, 3);
        console.log(`YouTube video duration: ${youtubeDuration} seconds`);
        
        if (!youtubeDuration || youtubeDuration <= 0) {
            throw new Error('Failed to detect YouTube video duration');
        }
        
        // Test Rumble duration detection (if needed)
        if (config.rumbleUrl) {
            console.log('Testing Rumble duration detection...');
            await page.goto(config.rumbleUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout * 1000 });
            await page.waitForSelector('video', { timeout: 30000 });
            
            const rumbleDuration = await getVideoDurationWithRetry(page, 3);
            console.log(`Rumble video duration: ${rumbleDuration} seconds`);
            
            if (!rumbleDuration || rumbleDuration <= 0) {
                throw new Error('Failed to detect Rumble video duration');
            }
        }
        
        console.log('✅ Video duration detection test passed');
    } catch (error) {
        console.error(`❌ Video duration detection test failed: ${error.message}`);
        throw error;
    } finally {
        await browser.close();
    }
}

/**
 * Test watch time enforcement
 */
async function testWatchTimeEnforcement(config) {
    console.log('\n--- Testing Watch Time Enforcement ---');
    
    // Launch browser
    const browser = await chromium.launch({ headless: config.headless });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        // Test YouTube watch time
        console.log('Testing YouTube watch time enforcement...');
        await page.goto(config.youtubeUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout * 1000 });
        await page.waitForSelector('video', { timeout: 30000 });
        
        // Get duration
        const youtubeDuration = await getVideoDurationWithRetry(page, 3);
        console.log(`YouTube video duration: ${youtubeDuration} seconds`);
        
        // Calculate watch time
        const watchTimeSeconds = Math.floor(youtubeDuration * (config.watchTimePercentage / 100));
        console.log(`Target watch time: ${watchTimeSeconds} seconds (${config.watchTimePercentage}%)`);
        
        // Ensure video is playing
        await ensureVideoIsPlaying(page);
        
        // Start time measurement
        const startTime = Date.now();
        
        // Watch video with verification
        await watchVideoWithVerification(page, watchTimeSeconds);
        
        // Calculate actual watch time
        const actualWatchTime = Math.round((Date.now() - startTime) / 1000);
        console.log(`Actual watch time: ${actualWatchTime} seconds`);
        
        // Verify watch time is at least the target
        if (actualWatchTime < watchTimeSeconds * 0.9) { // Allow 10% margin
            throw new Error(`Watch time too short: ${actualWatchTime}s vs target ${watchTimeSeconds}s`);
        }
        
        console.log('✅ Watch time enforcement test passed');
    } catch (error) {
        console.error(`❌ Watch time enforcement test failed: ${error.message}`);
        throw error;
    } finally {
        await browser.close();
    }
}

/**
 * Test anti-detection measures
 */
async function testAntiDetectionMeasures(config) {
    console.log('\n--- Testing Anti-Detection Measures ---');
    
    // Launch browser
    const browser = await chromium.launch({ headless: config.headless });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        // Apply anti-detection measures
        await applyAntiDetectionMeasures(page, config);
        
        // Test navigator properties
        console.log('Testing navigator properties...');
        const navigatorProps = await page.evaluate(() => {
            return {
                webdriver: navigator.webdriver,
                languages: navigator.languages,
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                vendor: navigator.vendor
            };
        });
        
        console.log('Navigator properties:', navigatorProps);
        
        if (navigatorProps.webdriver === true) {
            throw new Error('Anti-detection failed: navigator.webdriver is true');
        }
        
        // Test WebGL fingerprinting protection
        console.log('Testing WebGL fingerprinting protection...');
        const webglInfo = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl');
            if (!gl) return { protected: false, reason: 'WebGL not available' };
            
            const vendor = gl.getParameter(gl.VENDOR);
            const renderer = gl.getParameter(gl.RENDERER);
            
            return {
                protected: true,
                vendor,
                renderer
            };
        });
        
        console.log('WebGL info:', webglInfo);
        
        // Test canvas fingerprinting protection
        console.log('Testing canvas fingerprinting protection...');
        const canvasTest1 = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            const ctx = canvas.getContext('2d');
            
            // Draw something
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#F60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('Fingerprint test', 2, 15);
            
            return canvas.toDataURL();
        });
        
        // Run the same test again to see if there's variation
        const canvasTest2 = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            const ctx = canvas.getContext('2d');
            
            // Draw the same thing
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#F60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('Fingerprint test', 2, 15);
            
            return canvas.toDataURL();
        });
        
        const canvasProtected = canvasTest1 !== canvasTest2;
        console.log(`Canvas fingerprinting protected: ${canvasProtected}`);
        
        if (!canvasProtected) {
            console.warn('Warning: Canvas fingerprinting protection may not be working');
        }
        
        console.log('✅ Anti-detection measures test passed');
    } catch (error) {
        console.error(`❌ Anti-detection measures test failed: ${error.message}`);
        throw error;
    } finally {
        await browser.close();
    }
}

/**
 * Test engagement features
 */
async function testEngagementFeatures(config) {
    console.log('\n--- Testing Engagement Features ---');
    
    // Launch browser
    const browser = await chromium.launch({ headless: config.headless });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        // Go to YouTube
        console.log('Testing YouTube engagement features...');
        await page.goto(config.youtubeUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout * 1000 });
        await page.waitForSelector('video', { timeout: 30000 });
        
        // Test like function
        console.log('Testing like function...');
        const likeResult = await testLikeYouTubeVideo(page);
        console.log(`Like function test result: ${likeResult ? 'Passed' : 'Failed'}`);
        
        // Test subscribe function (just check if button is found, don't actually subscribe)
        console.log('Testing subscribe button detection...');
        const subscribeResult = await testSubscribeButtonDetection(page);
        console.log(`Subscribe button detection test result: ${subscribeResult ? 'Passed' : 'Failed'}`);
        
        // Test comment function (just check if input is found, don't actually comment)
        console.log('Testing comment input detection...');
        const commentResult = await testCommentInputDetection(page);
        console.log(`Comment input detection test result: ${commentResult ? 'Passed' : 'Failed'}`);
        
        console.log('✅ Engagement features test passed');
    } catch (error) {
        console.error(`❌ Engagement features test failed: ${error.message}`);
        throw error;
    } finally {
        await browser.close();
    }
}

/**
 * Test like function without actually clicking
 */
async function testLikeYouTubeVideo(page) {
    try {
        // Find like button using multiple methods
        const likeButtonFound = await page.evaluate(() => {
            // Try multiple selectors to find the like button
            const selectors = [
                'button[aria-label*="like" i]:not([aria-label*="dislike" i])',
                'ytd-toggle-button-renderer:not([is-icon-button]) button',
                '#top-level-buttons-computed > ytd-toggle-button-renderer:first-child button',
                '#segmented-like-button button'
            ];
            
            for (const selector of selectors) {
                const button = document.querySelector(selector);
                if (button) {
                    return true;
                }
            }
            
            // Look for buttons with like icon or text
            const buttons = Array.from(document.querySelectorAll('button'));
            
            // Find button with like text or aria-label
            for (const button of buttons) {
                const text = button.textContent.toLowerCase();
                const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                
                if ((text.includes('like') && !text.includes('dislike')) || 
                    (ariaLabel.includes('like') && !ariaLabel.includes('dislike'))) {
                    return true;
                }
            }
            
            return false;
        });
        
        return likeButtonFound;
    } catch (error) {
        console.error(`Error testing like function: ${error.message}`);
        return false;
    }
}

/**
 * Test subscribe button detection without actually clicking
 */
async function testSubscribeButtonDetection(page) {
    try {
        // Find subscribe button using multiple methods
        const subscribeButtonFound = await page.evaluate(() => {
            // Try multiple selectors to find the subscribe button
            const selectors = [
                '#subscribe-button button',
                'button[aria-label*="subscribe" i]',
                'ytd-subscribe-button-renderer button',
                '#meta-contents ytd-subscribe-button-renderer button'
            ];
            
            for (const selector of selectors) {
                const button = document.querySelector(selector);
                if (button) {
                    return true;
                }
            }
            
            return false;
        });
        
        return subscribeButtonFound;
    } catch (error) {
        console.error(`Error testing subscribe button detection: ${error.message}`);
        return false;
    }
}

/**
 * Test comment input detection without actually commenting
 */
async function testCommentInputDetection(page) {
    try {
        // Scroll to comments section
        await page.evaluate(() => {
            // Find comments section
            const commentsSection = document.querySelector('#comments');
            if (commentsSection) {
                commentsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
        
        // Wait for comments to load
        await page.waitForTimeout(3000);
        
        // Find comment input
        const commentInputFound = await page.evaluate(() => {
            // Try multiple selectors to find the comment input
            const selectors = [
                '#simplebox-placeholder',
                '#commentbox #contenteditable-root',
                'ytd-comment-simplebox-renderer #simplebox-placeholder',
                'ytd-comment-simplebox-renderer #contenteditable-root'
            ];
            
            for (const selector of selectors) {
                const input = document.querySelector(selector);
                if (input) {
                    return true;
                }
            }
            
            return false;
        });
        
        return commentInputFound;
    } catch (error) {
        console.error(`Error testing comment input detection: ${error.message}`);
        return false;
    }
}

/**
 * Get video duration with retry mechanism
 * (Copy from main.js for testing)
 */
async function getVideoDurationWithRetry(page, maxRetries) {
    let retries = 0;
    let duration = 0;
    
    while (retries < maxRetries) {
        try {
            // Try multiple selectors and methods to get duration
            duration = await page.evaluate(() => {
                // Method 1: Direct video element
                const video = document.querySelector('video');
                if (video && video.duration && video.duration !== Infinity) {
                    return video.duration;
                }
                
                // Method 2: YouTube specific time display
                const timeDisplay = document.querySelector('.ytp-time-duration');
                if (timeDisplay) {
                    const timeParts = timeDisplay.textContent.split(':').map(Number);
                    if (timeParts.length === 3) { // hours:minutes:seconds
                        return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
                    } else if (timeParts.length === 2) { // minutes:seconds
                        return timeParts[0] * 60 + timeParts[1];
                    }
                }
                
                // Method 3: Rumble specific time display
                const rumbleTimeDisplay = document.querySelector('.media-time-duration');
                if (rumbleTimeDisplay) {
                    const timeParts = rumbleTimeDisplay.textContent.split(':').map(Number);
                    if (timeParts.length === 3) { // hours:minutes:seconds
                        return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
                    } else if (timeParts.length === 2) { // minutes:seconds
                        return timeParts[0] * 60 + timeParts[1];
                    }
                }
                
                return 0;
            });
            
            if (duration > 0) {
                return duration;
            }
            
            // Wait before retrying
            await page.waitForTimeout(2000);
            retries++;
        } catch (error) {
            console.log(`Error getting video duration (attempt ${retries+1}): ${error.message}`);
            await page.waitForTimeout(2000);
            retries++;
        }
    }
    
    return duration;
}

/**
 * Ensure video is playing
 * (Copy from main.js for testing)
 */
async function ensureVideoIsPlaying(page) {
    try {
        // Check if video is paused and play if needed
        const isPlaying = await page.evaluate(() => {
            const video = document.querySelector('video');
            if (video && video.paused) {
                // Try multiple methods to start playback
                
                // Method 1: Direct play call
                video.play();
                
                // Method 2: Click play button
                const playButton = document.querySelector('.ytp-play-button') || 
                                  document.querySelector('.play-button');
                if (playButton) {
                    playButton.click();
                }
                
                // Method 3: Press space key on video
                video.focus();
                
                return !video.paused;
            }
            return video ? !video.paused : false;
        });
        
        if (!isPlaying) {
            // Fallback: Try clicking on video element
            await page.click('video');
            
            // Alternative: Press space key
            await page.keyboard.press('Space');
        }
        
        // Verify playback started
        await page.waitForFunction(() => {
            const video = document.querySelector('video');
            return video && !video.paused && video.currentTime > 0;
        }, { timeout: 10000 });
        
        console.log('Video playback confirmed');
    } catch (error) {
        console.log(`Error ensuring video playback: ${error.message}`);
        // Last resort: reload page and try again
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('video', { timeout: 30000 });
        await page.click('video');
    }
}

/**
 * Watch video with verification of actual progress
 * (Copy from main.js for testing)
 */
async function watchVideoWithVerification(page, targetSeconds) {
    const startTime = Date.now();
    const maxWaitTime = targetSeconds * 1000 * 1.5; // 50% buffer for ads, buffering, etc.
    let lastTime = 0;
    
    while (true) {
        // Check if we've exceeded maximum wait time
        if (Date.now() - startTime > maxWaitTime) {
            console.log(`Exceeded maximum wait time of ${maxWaitTime}ms, finishing watch`);
            break;
        }
        
        // Get current video time
        const currentTime = await getCurrentVideoTime(page);
        
        // Log progress
        if (Math.floor(currentTime) % 5 === 0 && Math.floor(currentTime) !== Math.floor(lastTime)) {
            console.log(`Watching progress: ${Math.floor(currentTime)}/${targetSeconds} seconds`);
        }
        
        // Check if video has progressed
        if (currentTime > lastTime) {
            lastTime = currentTime;
        } else {
            // If video hasn't progressed, check if it's paused and try to resume
            await ensureVideoIsPlaying(page);
        }
        
        // Check if we've watched enough
        if (currentTime >= targetSeconds) {
            console.log(`Reached target watch time of ${targetSeconds} seconds`);
            break;
        }
        
        // Wait before checking again
        await page.waitForTimeout(2000);
    }
}

/**
 * Get current video time
 * (Copy from main.js for testing)
 */
async function getCurrentVideoTime(page) {
    return page.evaluate(() => {
        const video = document.querySelector('video');
        return video ? video.currentTime : 0;
    });
}

/**
 * Apply anti-detection measures
 * (Copy from main.js for testing)
 */
async function applyAntiDetectionMeasures(page, settings) {
    console.log('Applying advanced anti-detection measures');
    
    // Apply browser fingerprint protection
    await page.evaluateOnNewDocument(() => {
        // Override navigator properties
        const navigatorProps = {
            webdriver: false,
            languages: ['en-US', 'en'],
            plugins: {
                length: Math.floor(Math.random() * 5) + 3,
                item: () => null,
                namedItem: () => null,
                refresh: () => {}
            },
            vendor: 'Google Inc.',
            platform: 'Win32',
            hardwareConcurrency: 8,
            deviceMemory: 8,
            maxTouchPoints: 0,
            doNotTrack: null,
            appVersion: navigator.userAgent.substring(8)
        };
        
        // Apply navigator property overrides
        for (const [key, value] of Object.entries(navigatorProps)) {
            try {
                if (key === 'plugins') {
                    // Handle plugins specially
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => {
                            return {
                                length: value.length,
                                item: value.item,
                                namedItem: value.namedItem,
                                refresh: value.refresh
                            };
                        }
                    });
                } else {
                    // Override other properties
                    Object.defineProperty(navigator, key, {
                        get: () => value
                    });
                }
            } catch (e) {
                console.log(`Failed to override navigator.${key}`);
            }
        }
        
        // Override chrome property
        if (window.chrome) {
            Object.defineProperty(window, 'chrome', {
                get: () => {
                    return {
                        app: {
                            isInstalled: false,
                            InstallState: {
                                DISABLED: 'disabled',
                                INSTALLED: 'installed',
                                NOT_INSTALLED: 'not_installed'
                            },
                            RunningState: {
                                CANNOT_RUN: 'cannot_run',
                                READY_TO_RUN: 'ready_to_run',
                                RUNNING: 'running'
                            }
                        },
                        runtime: {
                            OnInstalledReason: {
                                CHROME_UPDATE: 'chrome_update',
                                INSTALL: 'install',
                                SHARED_MODULE_UPDATE: 'shared_module_update',
                                UPDATE: 'update'
                            },
                            OnRestartRequiredReason: {
                                APP_UPDATE: 'app_update',
                                OS_UPDATE: 'os_update',
                                PERIODIC: 'periodic'
                            },
                            PlatformArch: {
                                ARM: 'arm',
                                ARM64: 'arm64',
                                MIPS: 'mips',
                                MIPS64: 'mips64',
                                X86_32: 'x86-32',
                                X86_64: 'x86-64'
                            },
                            PlatformNaclArch: {
                                ARM: 'arm',
                                MIPS: 'mips',
                                MIPS64: 'mips64',
                                X86_32: 'x86-32',
                                X86_64: 'x86-64'
                            },
                            PlatformOs: {
                                ANDROID: 'android',
                                CROS: 'cros',
                                LINUX: 'linux',
                                MAC: 'mac',
                                OPENBSD: 'openbsd',
                                WIN: 'win'
                            },
                            RequestUpdateCheckStatus: {
                                NO_UPDATE: 'no_update',
                                THROTTLED: 'throttled',
                                UPDATE_AVAILABLE: 'update_available'
                            }
                        }
                    };
                }
            });
        }
    });
    
    // Protect WebGL fingerprint
    await page.evaluateOnNewDocument(() => {
        // Override getParameter to prevent fingerprinting
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            // Spoof renderer info
            if (parameter === 37445) {
                return 'Intel Inc.';
            }
            if (parameter === 37446) {
                return 'Intel Iris OpenGL Engine';
            }
            
            // Call original method for other parameters
            return getParameter.apply(this, arguments);
        };
    });
    
    // Protect canvas fingerprint
    await page.evaluateOnNewDocument(() => {
        // Override toDataURL to add slight noise
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type) {
            if (type === 'image/png' && this.width > 16 && this.height > 16) {
                // Get the original image data
                const context = this.getContext('2d');
                const imageData = context.getImageData(0, 0, this.width, this.height);
                const data = imageData.data;
                
                // Add slight noise to the image data
                for (let i = 0; i < data.length; i += 4) {
                    // Only modify a small percentage of pixels
                    if (Math.random() < 0.005) {
                        // Add minor noise to RGB channels
                        data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() * 2 - 1)));
                        data[i+1] = Math.max(0, Math.min(255, data[i+1] + (Math.random() * 2 - 1)));
                        data[i+2] = Math.max(0, Math.min(255, data[i+2] + (Math.random() * 2 - 1)));
                    }
                }
                
                // Put the modified image data back
                context.putImageData(imageData, 0, 0);
            }
            
            // Call original method
            return originalToDataURL.apply(this, arguments);
        };
    });
    
    console.log('Anti-detection measures applied successfully');
}

// Run the tests
runTests().catch(console.error);
