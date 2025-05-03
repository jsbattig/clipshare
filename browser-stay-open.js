/**
 * Browser Test with Indefinite Stay Open
 * Keeps the browser window open until manually terminated
 */

const puppeteer = require('puppeteer');

// Session credentials
const sessionName = process.argv[2] || 'test';
const clientName = process.argv[3] || 'test';
const passphrase = process.argv[4] || 'test';

// URL settings
const baseUrl = 'http://localhost:3000';

async function runTest() {
  console.log(`=== ClipShare Browser Test (Stay Open) ===`);
  console.log(`Launching browser for ${baseUrl}...`);
  
  // Launch browser with visible window using same config as visible-browser-test.js
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
  
  console.log('✓ Browser launched successfully - Window will stay open indefinitely');
  
  try {
    // Create a new page
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });
    
    // Navigate to ClipShare
    console.log(`Opening ClipShare at ${baseUrl}...`);
    await page.goto(baseUrl, { waitUntil: 'networkidle2' });
    console.log('✓ ClipShare loaded successfully');
    
    // Login with provided credentials
    console.log('Filling login form with provided credentials...');
    console.log(`  > Session: ${sessionName}`);
    console.log(`  > Client name: ${clientName}`);
    console.log(`  > Passphrase: ${passphrase}`);
    
    await page.type('#session-id', sessionName);
    await page.type('#client-name', clientName);
    await page.type('#passphrase', passphrase);
    
    // Submit form
    console.log('Submitting login form...');
    await Promise.all([
      page.click('#auth-button'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
    ]);
    
    // Check if we successfully logged in
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('/app.html')) {
      console.log('✓ Login SUCCESSFUL - Redirected to app page');
    } else {
      console.log('✗ Login might have FAILED - Still on login page or unexpected page');
    }
    
    // Keep browser open indefinitely
    console.log('\n=== BROWSER WILL STAY OPEN ===');
    console.log('Browser window will remain open until you press Ctrl+C to terminate this script.');
    console.log('You can drag and drop files to test file sharing functionality.');
    
    // This is a blocking loop that keeps the script running
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
  } catch (error) {
    console.error('Error during test:', error);
    await browser.close();
    process.exit(1);
  }
}

// Run the test
runTest().catch(console.error);
