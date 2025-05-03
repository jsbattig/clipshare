#!/bin/bash

# Run Puppeteer with Xvfb
# This script starts a virtual display with Xvfb and runs the browser script

# Set display number
DISPLAY_NUM=99
XVFB_WHD="1280x720x24"

echo "Starting Xvfb display :$DISPLAY_NUM with resolution $XVFB_WHD"
Xvfb :$DISPLAY_NUM -screen 0 $XVFB_WHD &
XVFB_PID=$!

# Wait a moment for Xvfb to start
sleep 2

# Export the display environment variable
export DISPLAY=:$DISPLAY_NUM

echo "Running browser test with DISPLAY=:$DISPLAY_NUM"
node browser-test.js

# Kill Xvfb when done
echo "Stopping Xvfb"
kill $XVFB_PID
