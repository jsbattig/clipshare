/**
 * ClipShare Login Test
 * 
 * This script launches a browser that works in WSL2, connects to the ClipShare app,
 * and attempts to log in with test credentials.
 */

const puppeteer = require('puppeteer');

async function testClipShareLogin() {
  console.log('=== ClipShare Login Test ===');
  console.log('Launching browser for http://localhost:3000...');
  
  try {
    // Configure browser with WSL2-compatible options
    const browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: "new", // Use headless mode for automated testing
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--disable-gpu'
      ]
    });
    
    console.log('✓ Browser launched successfully');
    
    // Open a new page and navigate to ClipShare
    const page = await browser.newPage();
    console.log('Opening ClipShare at http://localhost:3000...');
    
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('✓ ClipShare loaded successfully');
    
    // Take a screenshot of the login page
    await page.screenshot({ path: 'clipshare-login.png' });
    console.log('✓ Login page screenshot saved as clipshare-login.png');
    
    // Fill in the login form
    console.log('Filling login form with test credentials...');
    await page.type('#session-id', 'test');
    await page.type('#client-name', 'test');
    await page.type('#passphrase', 'test');
    
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
      // Take a screenshot of the app page
      await page.screenshot({ path: 'clipshare-app.png' });
      console.log('✓ App page screenshot saved as clipshare-app.png');
    } else {
      console.log('✗ Login FAILED - Still on login page or unexpected page');
      // Take a screenshot to see what happened
      await page.screenshot({ path: 'clipshare-login-failed.png' });
      console.log('✗ Failed login screenshot saved as clipshare-login-failed.png');
    }
    
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
testClipShareLogin()
  .then(success => {
    console.log('\n=== TEST RESULTS ===');
    if (success) {
      console.log('✅ TEST PASSED: Successfully logged in to ClipShare');
    } else {
      console.log('❌ TEST FAILED: Could not log in to ClipShare');
    }
    console.log('====================');
  });
