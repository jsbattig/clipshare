/**
 * ClipShare Visible Browser Login Test
 * 
 * This script launches a visible browser in WSL2, connects to the ClipShare app,
 * and attempts to log in with test credentials so you can watch the automation.
 */

const puppeteer = require('puppeteer');

// Helper function to slow down actions with delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testClipShareLoginVisible() {
  console.log('=== ClipShare Visible Browser Login Test ===');
  console.log('Launching visible browser for http://localhost:3000...');
  
  try {
    // Configure browser with WSL2-compatible options and VISIBLE mode
    const browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: false, // Non-headless mode to see the browser
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--disable-gpu',
        '--window-size=1280,800', // Set a good window size
        '--start-maximized'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });
    
    console.log('✓ Browser launched successfully - You should see a Chrome window');
    await sleep(2000); // Pause so user can see browser launched
    
    // Open a new page and navigate to ClipShare
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    console.log('Opening ClipShare at http://localhost:3000...');
    
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('✓ ClipShare loaded successfully');
    await sleep(2000); // Pause to view the login page
    
    // Fill in the login form with pauses for visibility
    console.log('Filling login form with test credentials...');
    
    console.log('  > Entering session name: test');
    await page.type('#session-id', 'test', { delay: 100 }); // Slow typing for visibility
    await sleep(1000);
    
    console.log('  > Entering client name: test');
    await page.type('#client-name', 'test', { delay: 100 });
    await sleep(1000);
    
    console.log('  > Entering passphrase: test');
    await page.type('#passphrase', 'test', { delay: 100 });
    await sleep(1000);
    
    // Click the login button
    console.log('Submitting login form...');
    await Promise.all([
      page.click('#auth-button'),
      page.waitForNavigation({ timeout: 10000 }).catch(err => {
        console.log('Navigation may not have completed, but continuing...');
      })
    ]);
    
    // Check if we're redirected to app.html (successful login)
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    
    if (currentUrl.includes('app.html')) {
      console.log('✓ Login SUCCESSFUL - Redirected to app page');
      // Wait a bit longer to observe the app page
      await sleep(5000);
    } else {
      console.log('✗ Login FAILED - Still on login page or unexpected page');
      await sleep(3000);
    }
    
    // Ask user if they want to keep the browser open
    console.log('\nBrowser will remain open for 20 seconds so you can observe the result...');
    console.log('Press Ctrl+C now if you want to stop the test and keep the browser open.');
    await sleep(20000);
    
    // Close the browser
    console.log('Closing browser...');
    await browser.close();
    console.log('✓ Browser closed successfully');
    
    // Return login status
    return currentUrl.includes('app.html');
  } catch (error) {
    console.error('Error during testing:', error);
    return false;
  }
}

// Run the test
testClipShareLoginVisible()
  .then(success => {
    console.log('\n=== TEST RESULTS ===');
    if (success) {
      console.log('✅ TEST PASSED: Successfully logged in to ClipShare');
    } else {
      console.log('❌ TEST FAILED: Could not log in to ClipShare');
    }
    console.log('====================');
  });
