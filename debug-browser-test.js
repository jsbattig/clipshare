const puppeteer = require('puppeteer');

/**
 * Enhanced ClipShare browser test with debug features
 * Keeps the browser window open for manual testing
 */
async function runTest() {
  console.log('=== ClipShare Browser Debug Test ===');
  
  // Launch browser with debugging features enabled
  console.log('Launching browser for http://localhost:3000...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--window-size=1200,800', '--remote-debugging-port=9222']
  });
  
  // Get all pages
  const pages = await browser.pages();
  const page = pages[0];
  
  // Enable console log collection
  page.on('console', msg => {
    const type = msg.type().substr(0, 3).toUpperCase();
    console.log(`BROWSER CONSOLE [${type}]: ${msg.text()}`);
  });
  
  // Enable network request monitoring
  page.on('request', request => {
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      console.log(`NETWORK: ${request.method()} ${request.url()}`);
    }
  });
  
  // Error event handlers for better debugging
  page.on('error', err => {
    console.error('Page error:', err);
  });
  
  page.on('pageerror', err => {
    console.error('Uncaught exception:', err);
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
    
    // Wait a bit longer to make sure everything is fully loaded
    await page.waitForTimeout(2000);
    
    // Fill in login form
    console.log('Filling login form with provided credentials...');
    console.log('  > Session: test');
    console.log('  > Client name: test');
    console.log('  > Passphrase: test');
    
    await page.type('#session-id', 'test');
    await page.type('#client-name', 'test');
    await page.type('#passphrase', 'test');
    
    // Wait a moment before clicking the button
    await page.waitForTimeout(1000);
    
    // Submit the form
    console.log('Submitting login form...');
    await Promise.all([
      page.click('#login-button'),
      // Wait for navigation or for app page content to load
      Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => console.log('No navigation event detected')),
        page.waitForSelector('#app-container', { timeout: 30000 }).catch(() => console.log('App container not found'))
      ])
    ]);
    
    // Wait for potential redirects to complete
    await page.waitForTimeout(5000);
    
    // Log current URL to verify we're on the app page
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('/app.html')) {
      console.log('✓ Login SUCCESSFUL - Redirected to app page');
      
      // Verify we're connected to the session
      try {
        await page.waitForSelector('#session-info', { timeout: 10000 });
        const sessionInfo = await page.$eval('#session-info', el => el.textContent);
        console.log(`Connected to session: ${sessionInfo}`);
      } catch (e) {
        console.log('Could not verify session connection, but continuing...');
      }
    } else {
      console.log('✗ Login might have FAILED - Still on login page or unexpected page');
      
      // Try to dump any visible error messages
      try {
        const errorMessages = await page.evaluate(() => {
          const errors = document.querySelectorAll('.error-message, .message-error, .alert');
          return Array.from(errors).map(e => e.textContent);
        });
        
        if (errorMessages.length > 0) {
          console.log('Error messages found:');
          errorMessages.forEach(msg => console.log(`  - ${msg}`));
        }
      } catch (e) {
        console.log('Could not extract error messages');
      }
      
      // Try force navigation to app.html
      console.log('Attempting to force navigation to app.html...');
      await page.goto('http://localhost:3000/app.html', { waitUntil: 'networkidle0', timeout: 30000 });
      console.log(`Forced navigation, new URL: ${page.url()}`);
    }
    
    // Inject a helper function to expose console messages and errors
    await page.evaluate(() => {
      window.DEBUG_MODE = true;
      
      // Override console methods to add prefixes
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      
      console.log = function(...args) {
        originalLog.apply(console, ['DEBUG-LOG:', ...args]);
      };
      
      console.error = function(...args) {
        originalError.apply(console, ['DEBUG-ERROR:', ...args]);
      };
      
      console.warn = function(...args) {
        originalWarn.apply(console, ['DEBUG-WARN:', ...args]);
      };
      
      // Add global error handler
      window.addEventListener('error', (event) => {
        console.error('GLOBAL ERROR:', event.message, 'at', event.filename, ':', event.lineno);
      });
      
      // Add unhandled promise rejection handler
      window.addEventListener('unhandledrejection', (event) => {
        console.error('UNHANDLED PROMISE REJECTION:', event.reason);
      });
      
      // Add methods to test file transfers
      window.testFileTransfer = async (fileName, content) => {
        try {
          // Create a test file blob
          const blob = new Blob([content], { type: 'text/plain' });
          const file = new File([blob], fileName, { type: 'text/plain' });
          
          // Create a FileList-like object
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          const fileList = dataTransfer.files;
          
          // Dispatch drop event directly on drop zone
          const dropZone = document.querySelector('.drop-zone') || document.querySelector('.file-drop-area');
          
          if (dropZone) {
            console.log('Found drop zone, dispatching drop event');
            // Create a dummy event
            const event = { 
              preventDefault: () => {},
              stopPropagation: () => {},
              dataTransfer: { files: fileList }
            };
            
            // Directly call the drop handler if we can find it
            if (typeof window.handleFileDrop === 'function') {
              window.handleFileDrop(event);
            } else {
              console.error('No handleFileDrop function found');
            }
          } else {
            console.error('No drop zone found');
          }
        } catch (err) {
          console.error('Error in testFileTransfer:', err);
        }
      };
    });
    
    // Create a helper function for the file transfer test
    // This function can be called from the terminal during execution
    console.log('\n=== FILE TRANSFER TESTING AVAILABLE ===');
    console.log('Run this in the DevTools console to test file sharing:');
    console.log('  window.testFileTransfer("test.txt", "This is a test file content")');
    
  } catch (err) {
    console.error('Test error:', err);
  }
  
  console.log('\n=== BROWSER WILL STAY OPEN ===');
  console.log('Browser window will remain open until you press Ctrl+C to terminate this script.');
  console.log('You can drag and drop files to test file sharing functionality.');
  console.log('For advanced debugging, connect to: http://localhost:9222');
  
  // Keep the script running
  await new Promise(() => {});
}

// Run the test
runTest().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
