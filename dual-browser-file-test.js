/**
 * ClipShare Dual Browser File Transfer Test
 * 
 * This script launches two Chrome browsers side by side, logs them into the same
 * ClipShare session, and tests file transfer by dragging/dropping a file in one browser.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

// Helper function to slow down actions with delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Configuration
const CONFIG = {
  sessionId: 'test',
  clientName1: 'browser1',
  clientName2: 'browser2',
  passphrase: 'test',
  testFile: "large-test-file.bin",
  browser1Position: { x: 0, y: 0, width: 800, height: 700 },
  browser2Position: { x: 800, y: 0, width: 800, height: 700 }
};

async function runDualBrowserTest() {
  console.log('=== ClipShare Dual Browser File Transfer Test ===');
  
  // Store browser instances for cleanup
  let browser1 = null;
  let browser2 = null;
  
  try {
    // Launch first browser (Sender)
    console.log('\n[Browser 1] Launching browser for sender...');
    browser1 = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: false,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        `--window-position=${CONFIG.browser1Position.x},${CONFIG.browser1Position.y}`,
        `--window-size=${CONFIG.browser1Position.width},${CONFIG.browser1Position.height}`
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });
    
    // Capture and log browser1 console messages
    const browser1Context = browser1.defaultBrowserContext();
    const browser1Page = await browser1.newPage();
    
    browser1Page.on('console', msg => {
      console.log(`[Browser 1 Console] ${msg.text()}`);
    });
    
    console.log('[Browser 1] Successfully launched');
    
    // Launch second browser (Receiver)
    console.log('\n[Browser 2] Launching browser for receiver...');
    browser2 = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: false,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        `--window-position=${CONFIG.browser2Position.x},${CONFIG.browser2Position.y}`,
        `--window-size=${CONFIG.browser2Position.width},${CONFIG.browser2Position.height}`
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });
    
    // Capture and log browser2 console messages
    const browser2Context = browser2.defaultBrowserContext();
    const browser2Page = await browser2.newPage();
    
    browser2Page.on('console', msg => {
      console.log(`[Browser 2 Console] ${msg.text()}`);
    });
    
    console.log('[Browser 2] Successfully launched');
    
    // Login first browser
    console.log('\n[Browser 1] Navigating to ClipShare...');
    await browser1Page.goto('http://localhost:3000', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('[Browser 1] Logging in with credentials:');
    console.log(`  - Session: ${CONFIG.sessionId}`);
    console.log(`  - Client name: ${CONFIG.clientName1}`);
    console.log(`  - Passphrase: ${CONFIG.passphrase}`);
    
    await browser1Page.type('#session-id', CONFIG.sessionId, { delay: 50 });
    await browser1Page.type('#client-name', CONFIG.clientName1, { delay: 50 });
    await browser1Page.type('#passphrase', CONFIG.passphrase, { delay: 50 });
    
    await Promise.all([
      browser1Page.click('#auth-button'),
      browser1Page.waitForNavigation({ timeout: 10000 })
        .catch(err => console.log('[Browser 1] Navigation timeout - continuing anyway'))
    ]);
    
    // Verify browser1 login
    const browser1CurrentUrl = browser1Page.url();
    if (browser1CurrentUrl.includes('app.html')) {
      console.log('[Browser 1] Login successful');
    } else {
      console.log('[Browser 1] Login failed! URL is still:', browser1CurrentUrl);
      throw new Error('Browser 1 login failed');
    }
    
    // Login second browser
    console.log('\n[Browser 2] Navigating to ClipShare...');
    await browser2Page.goto('http://localhost:3000', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('[Browser 2] Logging in with credentials:');
    console.log(`  - Session: ${CONFIG.sessionId}`);
    console.log(`  - Client name: ${CONFIG.clientName2}`);
    console.log(`  - Passphrase: ${CONFIG.passphrase}`);
    
    await browser2Page.type('#session-id', CONFIG.sessionId, { delay: 50 });
    await browser2Page.type('#client-name', CONFIG.clientName2, { delay: 50 });
    await browser2Page.type('#passphrase', CONFIG.passphrase, { delay: 50 });
    
    await Promise.all([
      browser2Page.click('#auth-button'),
      browser2Page.waitForNavigation({ timeout: 10000 })
        .catch(err => console.log('[Browser 2] Navigation timeout - continuing anyway'))
    ]);
    
    // Verify browser2 login
    const browser2CurrentUrl = browser2Page.url();
    if (browser2CurrentUrl.includes('app.html')) {
      console.log('[Browser 2] Login successful');
    } else {
      console.log('[Browser 2] Login failed! URL is still:', browser2CurrentUrl);
      throw new Error('Browser 2 login failed');
    }
    
    // Wait for both browsers to be fully loaded
    console.log('\nWaiting for both browsers to stabilize...');
    await sleep(5000);
    
    // Check if file exists
    if (!fs.existsSync(CONFIG.testFile)) {
      console.log(`Test file ${CONFIG.testFile} not found, creating it...`);
      fs.writeFileSync(CONFIG.testFile, 'This is a test file for ClipShare file transfer testing.');
    }
    
    // Setup file input for browser1
    console.log('\n[Browser 1] Preparing to upload test file...');
    
    // Use the file input element that might be hidden but exists in the page
    await browser1Page.evaluate(() => {
      // Create a visible message to indicate file upload is happening
      const msgDiv = document.createElement('div');
      msgDiv.id = 'testMessage';
      msgDiv.style.position = 'fixed';
      msgDiv.style.top = '10px';
      msgDiv.style.left = '10px';
      msgDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      msgDiv.style.color = 'white';
      msgDiv.style.padding = '10px';
      msgDiv.style.borderRadius = '5px';
      msgDiv.style.zIndex = '9999';
      msgDiv.textContent = 'Preparing to upload test file...';
      document.body.appendChild(msgDiv);
      
      // Make sure the file drop area is visible
      const dropArea = document.querySelector('.drop-zone');
      if (dropArea) {
        dropArea.style.display = 'block';
        dropArea.style.border = '3px dashed red';
        dropArea.style.padding = '50px';
        dropArea.style.margin = '20px';
        dropArea.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
        dropArea.textContent = 'DROP TEST FILE HERE';
      }
    });
    
    // Wait a moment for visual feedback
    await sleep(2000);
    
    // Find the file input element
    const fileInputSelector = 'input[type=file]';
    await browser1Page.waitForSelector(fileInputSelector, { timeout: 5000 }).catch(() => {
      console.log('[Browser 1] File input not found, creating one...');
      return browser1Page.evaluate(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.id = 'testFileInput';
        input.style.position = 'fixed';
        input.style.top = '50px';
        input.style.left = '10px';
        input.style.zIndex = '9999';
        document.body.appendChild(input);
        
        // Update the message
        const msgDiv = document.getElementById('testMessage');
        if (msgDiv) msgDiv.textContent = 'Created file input element...';
      });
    });
    
    // Now use the file input to upload the file
    console.log(`[Browser 1] Uploading test file: ${CONFIG.testFile}`);
    
    // Set file input path
    const fileInputHandle = await browser1Page.$(fileInputSelector);
    if (fileInputHandle) {
      await fileInputHandle.uploadFile(CONFIG.testFile);
      console.log('[Browser 1] File selected in input');
    } else {
      console.log('[Browser 1] File input element not found after waiting!');
    }
    
    // Show a message that file has been selected
    await browser1Page.evaluate(() => {
      const msgDiv = document.getElementById('testMessage');
      if (msgDiv) msgDiv.textContent = 'File selected, sharing with other clients...';
    });
    
    // Observe both browser consoles and server logs
    console.log('\nMonitoring file transfer between browsers...');
    console.log('Waiting for 30 seconds to observe file transfer behavior...');
    
    // Wait for file transfer to complete or fail
    await sleep(30000);
    
    // Take final screenshots of both browsers
    await browser1Page.screenshot({ path: 'browser1-final.png' });
    await browser2Page.screenshot({ path: 'browser2-final.png' });
    
    console.log('\nBrowsers will remain open for manual inspection.');
    console.log('Press Ctrl+C to terminate the test and close browsers.');
    
    // Keep the browsers open for manual inspection
    while (true) {
      await sleep(10000);
    }
    
  } catch (error) {
    console.error('Error during testing:', error);
  } finally {
    // The browsers will be closed when the script is terminated with Ctrl+C
    process.on('SIGINT', async () => {
      console.log('\nTest terminated. Closing browsers...');
      if (browser1) await browser1.close().catch(() => {});
      if (browser2) await browser2.close().catch(() => {});
      process.exit(0);
    });
  }
}

// Run the test
runDualBrowserTest();
