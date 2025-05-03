// Testing Puppeteer in WSL2 environment with explicit Chrome path
const puppeteer = require('puppeteer');
const { execSync } = require('child_process');

async function runBrowserTest() {
  console.log('Checking Chrome installations:');
  try {
    const chromeLocations = execSync('which google-chrome chrome chromium-browser 2>/dev/null || echo "Not found"').toString();
    console.log('Chrome executable locations:', chromeLocations);
    
    // Get Chrome version
    try {
      const chromeVersion = execSync('google-chrome --version').toString().trim();
      console.log('Chrome version:', chromeVersion);
    } catch (e) {
      console.log('Could not get Chrome version:', e.message);
    }
    
    // Try to use the system Chrome installation
    console.log('\nLaunching browser with explicit Chrome path...');
    
    // It's better to use headless: true for WSL
    const browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--disable-gpu',
        '--mute-audio',
        '--no-first-run',
        '--no-zygote'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });
    
    console.log('Browser launched successfully!');
    
    // Open a new page and navigate to Google
    const page = await browser.newPage();
    console.log('Opening Google...');
    
    await page.goto('https://www.google.com', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('Page loaded successfully!');
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    // Take a screenshot to verify it worked
    await page.screenshot({ path: 'google.png' });
    console.log('Screenshot saved as google.png');
    
    // Close browser
    await browser.close();
    console.log('Browser closed successfully');
    return true;
  } catch (error) {
    console.error('Error running browser:', error);
    return false;
  }
}

// Run the test
runBrowserTest();
