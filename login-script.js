// Script to simulate login to ClipShare
const puppeteer = require('puppeteer');

(async () => {
  // Launch the browser
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    console.log('Opening new page...');
    const page = await browser.newPage();
    
    // Navigate to the login page
    console.log('Navigating to localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    
    // Wait for form elements to load
    console.log('Waiting for form elements...');
    await page.waitForSelector('#session-id');
    await page.waitForSelector('#client-name');
    await page.waitForSelector('#passphrase');
    
    // Fill out the form
    console.log('Filling form with session: test, client: wsl, passphrase: test');
    await page.type('#session-id', 'test');
    await page.type('#client-name', 'wsl');
    await page.type('#passphrase', 'test');
    
    // Submit the form
    console.log('Submitting form...');
    await page.click('#auth-button');
    
    // Wait for redirect or authentication result
    console.log('Waiting for authentication process...');
    await page.waitForNavigation({ timeout: 10000 }).catch((err) => {
      console.log('Navigation timeout or error occurred, but we might still be logged in');
    });
    
    console.log('Login attempt completed. Browser will stay open.');
    
    // Keeping browser open for manual interaction
    // You'll need to manually close the browser window when done
  } catch (error) {
    console.error('Error occurred:', error);
    await browser.close();
  }
})();
