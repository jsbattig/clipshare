/**
 * Fix for Claude VSCode Extension Embedded Browser in WSL2
 * 
 * This script provides a solution for the "Failed to launch the browser process" 
 * error when using the embedded browser in WSL2 environments.
 * 
 * Usage:
 * 1. Install dependencies: npm install puppeteer
 * 2. Run: node fix-embedded-browser.js <url>
 *   Example: node fix-embedded-browser.js https://www.google.com
 */

const puppeteer = require('puppeteer');

// Get URL from command line or use default
const url = process.argv[2] || 'https://www.google.com';

async function launchBrowser(url) {
  console.log(`Launching browser and navigating to ${url}...`);
  
  try {
    // Configure browser with WSL2-compatible options
    const browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: false, // Show browser UI
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--disable-gpu',
        '--window-size=1280,720',
        '--start-maximized'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });
    
    console.log('Browser launched successfully!');
    
    // Open a new page and navigate to the requested URL
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    
    console.log(`Opening ${url}...`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('Page loaded successfully!');
    
    // Keep the browser open until user presses Ctrl+C
    console.log('\n*** Browser is running. Press Ctrl+C to close. ***');
    
    // Set up a cleanup handler for Ctrl+C
    process.on('SIGINT', async () => {
      console.log('\nClosing browser...');
      await browser.close();
      console.log('Browser closed successfully');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Error running browser:', error);
    process.exit(1);
  }
}

// Start the browser
launchBrowser(url);
