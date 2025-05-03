# Fix for "Failed to launch the browser process" in WSL2

This document provides a solution for the "Failed to launch the browser process" error when using the embedded browser in VS Code Claude extension within a WSL2 environment.

## Problem

When attempting to use the embedded browser from Claude VS Code extension in WSL2, you may encounter the following error:

```
Error executing browser action: {"name":"Error","message":"Failed to launch the browser process!\n\n\nTROUBLESHOOTING: https://pptr.dev/troubleshooting\n"}
```

This occurs because:
1. WSL2 doesn't have a native display server
2. Puppeteer (which powers the embedded browser) has difficulty running in headless mode in WSL2
3. Additional flags are needed for Chrome to run properly in a WSL2 environment

## Solution

We've created a custom browser launcher that works around these limitations:

### Prerequisites

1. Install Google Chrome in your WSL2 environment:
   ```bash
   # Update package list
   sudo apt update
   
   # Install dependencies
   sudo apt install -y wget gnupg
   
   # Add Chrome repository
   wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
   sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
   
   # Install Chrome
   sudo apt update
   sudo apt install -y google-chrome-stable
   ```

2. Install Xvfb (X Virtual Framebuffer) if you want to use headless mode:
   ```bash
   sudo apt install -y xvfb
   ```

3. Install Puppeteer:
   ```bash
   npm install puppeteer
   ```

### Usage

#### Option 1: Non-headless browser (recommended)

Run the `fix-embedded-browser.js` script whenever you need a browser:

```bash
node fix-embedded-browser.js https://www.google.com
```

This will launch Chrome with the correct flags to work in WSL2. The browser will run with a visible UI if you have an X server connected to WSL (like VcXsrv, Xming, or WSLg).

#### Option 2: Headless browser with screenshots

If you want to use a headless browser but still see the web pages, run:

```bash
node wsl-browser-test.js
```

This will take a screenshot of the page and save it as `google.png`.

#### Option 3: Using with Xvfb (for advanced users)

If you need a virtual display:

```bash
./run-with-xvfb.sh
```

This starts Xvfb, sets the DISPLAY environment variable, and runs the browser test.

## Troubleshooting

If you continue to experience issues:

1. Make sure Google Chrome is installed and working:
   ```bash
   which google-chrome
   google-chrome --version
   ```

2. Check that all necessary dependencies are installed:
   ```bash
   sudo apt install -y ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release xdg-utils wget
   ```

3. Make sure your X server is running (if using non-headless mode with UI)

4. Try running Chrome directly with flags:
   ```bash
   google-chrome --no-sandbox --disable-setuid-sandbox
   ```

## How it Works

The fix works by:

1. Using the system Chrome installation instead of Puppeteer's bundled version
2. Adding necessary flags to disable sandbox and GPU acceleration
3. Using proper configuration for WSL2 environment
4. Using Xvfb for virtual display when needed

## References

- Puppeteer Troubleshooting: https://pptr.dev/troubleshooting
- WSL2 GUI Apps: https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps
- Chrome for Testing: https://developer.chrome.com/blog/chrome-for-testing
