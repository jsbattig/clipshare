// Test script for running Puppeteer in WSL2 environment with Xvfb
const puppeteer = require('puppeteer');

async function runBrowser() {
  console.log('Launching browser with WSL2-compatible flags...');
  
  try {
    // Launch with special flags for WSL2
    const browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });
    
    console.log('Browser launched successfully!');
    
    // Open a new page
    const page = await browser.newPage();
    console.log('Opening Google...');
    
    // Navigate to Google
    await page.goto('https://www.google.com', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('Page loaded successfully!');
    
    // Get the page title
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    // Take a screenshot
    await page.screenshot({ path: 'google.png' });
    console.log('Screenshot saved as google.png');
    
    // Wait for 5 seconds so we can see the browser
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Close browser
    await browser.close();
    console.log('Browser closed');
  } catch (error) {
    console.error('Error running browser:', error);
  }
}

// Run the browser test
runBrowser();
