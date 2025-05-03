const puppeteer = require('puppeteer');

/**
 * Opens a second browser instance for ClipShare testing
 */
async function runTest() {
  console.log('=== Opening Second ClipShare Browser ===');
  
  // Launch browser with debugging features enabled
  console.log('Launching browser for http://localhost:3000...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--window-size=1200,800', '--remote-debugging-port=9223']
  });
  
  // Get all pages
  const pages = await browser.pages();
  const page = pages[0];
  
  // Enable console log collection
  page.on('console', msg => {
    const type = msg.type().substr(0, 3).toUpperCase();
    console.log(`BROWSER CONSOLE [${type}]: ${msg.text()}`);
  });
  
  try {
    // Navigate to the login page
    console.log('Opening ClipShare at http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
    console.log('✓ ClipShare loaded successfully');
    
    // Wait for form to be ready
    await page.waitForSelector('#session-id', { visible: true, timeout: 10000 });
    await page.waitForSelector('#client-name', { visible: true, timeout: 10000 });
    await page.waitForSelector('#passphrase', { visible: true, timeout: 10000 });
    
    // Fill in login form
    console.log('Filling login form with provided credentials...');
    console.log('  > Session: test');
    console.log('  > Client name: test');
    console.log('  > Passphrase: test');
    
    await page.type('#session-id', 'test');
    await page.type('#client-name', 'test-receiver');
    await page.type('#passphrase', 'test');
    
    // Submit the form
    console.log('Submitting login form...');
    await Promise.all([
      page.click('#login-button'),
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 })
    ]);
    
    // Log current URL to verify we're on the app page
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('/app.html')) {
      console.log('✓ Login SUCCESSFUL - Redirected to app page');
      
      // Load our diagnostic script
      console.log('Loading diagnostic tools...');
      const diagnosticScript = require('fs').readFileSync('./file-transfer-diagnostic.js', 'utf8');
      await page.evaluate(script => {
        const scriptEl = document.createElement('script');
        scriptEl.textContent = script;
        document.head.appendChild(scriptEl);
      }, diagnosticScript);
      
      console.log('✓ Diagnostic tools loaded successfully');
    } else {
      console.log('✗ Login FAILED - Still on login page');
    }
    
  } catch (err) {
    console.error('Test error:', err);
  }
  
  console.log('\n=== BROWSER WILL STAY OPEN ===');
  console.log('Browser window will remain open until you press Ctrl+C to terminate this script.');
  console.log('You can test file sharing between the two browser instances.');
  
  // Keep the script running
  await new Promise(() => {});
}

// Run the test
runTest().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
