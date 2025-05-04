/**
 * Dual-browser end-to-end file sharing test using Playwright.
 *
 * Spawns the dev server, launches two browser contexts via Firefox,
 * shares a test file in one, and verifies the other shows the clear-text filename.
 */
const { firefox } = require('playwright');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');
const http = require('http');

(async () => {
  const SERVER_URL = 'http://localhost:3001';
  const TEST_FILE = path.resolve(__dirname, '../large-test-file.bin');
  const EXPECTED_NAME = path.basename(TEST_FILE);

  // Spawn development server
  const serverProcess = spawn('node', ['server/index.js'], {
    shell: true,
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: '3001' },
    stdio: ['ignore', 'ignore', 'ignore']
  });

  // Wait for server to be ready
  await new Promise((resolve, reject) => {
    const maxRetries = 20;
    let retries = 0;
    const check = () => {
      http.get(SERVER_URL + '/health', res => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      }).on('error', retry);
    };
    const retry = () => {
      retries++;
      if (retries >= maxRetries) {
        reject(new Error('Server did not start in time'));
      } else {
        setTimeout(check, 500);
      }
    };
    check();
  });

  // Launch two isolated browser contexts
  const browser = await firefox.launch({ headless: true });
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  // Navigate both pages
  await Promise.all([
    page1.goto(SERVER_URL),
    page2.goto(SERVER_URL)
  ]);

  // Bypass login: set session data in localStorage and reload
  const session = { sessionId: 'test', passphrase: 'test', timestamp: Date.now() };
  await page1.evaluate(s => localStorage.setItem('clipshare_session', JSON.stringify(s)), session);
  await page2.evaluate(s => localStorage.setItem('clipshare_session', JSON.stringify(s)), session);
  await Promise.all([page1.reload(), page2.reload()]);

  // Wait for the share button to appear
  await Promise.all([
    page1.waitForSelector('#share-file-btn'),
    page2.waitForSelector('#share-file-btn')
  ]);

  // In page1, click "Share File" and upload TEST_FILE
  await page1.click('#share-file-btn');
  const [fileChooser] = await Promise.all([
    page1.waitForEvent('filechooser'),
    page1.click('#share-file-btn')
  ]);
  await fileChooser.setFiles(TEST_FILE);

  // Allow time for file transfer
  await page2.waitForTimeout(3000);

  // In page2, read displayed filename
  const displayed = await page2.textContent('.clipboard-file-name');
  console.log('Filename displayed in page2:', displayed.trim());

  // Assert it matches expected clear-text name
  assert.strictEqual(displayed.trim(), EXPECTED_NAME,
    `Expected shared filename "${EXPECTED_NAME}", but got "${displayed.trim()}"`);

  console.log('✅ Dual-browser file sharing test passed');

  await browser.close();
  // Tear down server
  serverProcess.kill();
})();
