/**
 * ClipShare - Clipboard Synchronization Logic
 * Handles bidirectional clipboard synchronization between devices
 */

// Initialize socket connection
const socket = io();

// DOM Elements
const sessionNameEl = document.getElementById('session-name');
const connectionStatusEl = document.getElementById('connection-status');
const clientCountEl = document.getElementById('client-count');
const clipboardTextarea = document.getElementById('clipboard-content');
const copyBtn = document.getElementById('copy-btn');
const clearBtn = document.getElementById('clear-btn');
const refreshBtn = document.getElementById('refresh-btn');
const monitoringToggle = document.getElementById('monitoring-toggle');
const monitoringStatus = document.getElementById('monitoring-status');
const syncStatusEl = document.getElementById('sync-status');
const lastUpdateEl = document.getElementById('last-update');
const logoutBtn = document.getElementById('logout-btn');
const appMessage = document.getElementById('app-message');

// Application state
let sessionData = null;
let isConnected = false;
let isMonitoring = true;
let pollingInterval = null;
let lastClipboardContent = '';
let clientCount = 1; // Including current client

// Check if user is authenticated
document.addEventListener('DOMContentLoaded', () => {
  sessionData = getSessionData();
  
  if (!sessionData || !sessionData.sessionId || !sessionData.passphrase) {
    // Not authenticated, redirect to login
    window.location.href = '/';
    return;
  }
  
  // Update session display
  sessionNameEl.textContent = sessionData.sessionId;
  
  // Connect to session
  connectToSession();
  
  // Start clipboard monitoring
  startClipboardMonitoring();
  
  // Set up event listeners
  setupEventListeners();
});

/**
 * Connect to the session using stored credentials
 */
function connectToSession() {
  setConnectionStatus(false);
  displayMessage('Connecting to session...', 'info');
  
  socket.emit('join-session', {
    sessionId: sessionData.sessionId,
    passphrase: sessionData.passphrase
  }, (response) => {
    if (response.success) {
      // Connection successful
      setConnectionStatus(true);
      displayMessage('Connected to session', 'success', 3000);
      
      // Set initial clipboard content if available
      if (response.clipboard) {
        updateClipboardContent(response.clipboard, false);
      }
    } else {
      // Connection failed
      displayMessage('Failed to connect: ' + response.message, 'error');
      setTimeout(() => {
        // Redirect to login
        logout();
      }, 3000);
    }
  });
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Copy button click
  copyBtn.addEventListener('click', () => {
    copyToClipboard();
  });
  
  // Clear button click
  clearBtn.addEventListener('click', () => {
    updateClipboardContent('', true);
    clipboardTextarea.focus();
  });
  
  // Refresh button click
  refreshBtn.addEventListener('click', async () => {
    try {
      const clipboardText = await readFromClipboard();
      updateClipboardContent(clipboardText, true);
      displayMessage('Clipboard refreshed', 'info', 2000);
    } catch (err) {
      displayMessage('Failed to read clipboard: ' + err.message, 'error');
    }
  });
  
  // Manual textarea change
  clipboardTextarea.addEventListener('input', () => {
    const newContent = clipboardTextarea.value;
    lastClipboardContent = newContent;
    
    // Send update to server
    sendClipboardUpdate(newContent);
    
    // Update UI
    updateSyncStatus('Synchronized');
    updateLastUpdated();
  });
  
  // Monitoring toggle change
  monitoringToggle.addEventListener('change', () => {
    isMonitoring = monitoringToggle.checked;
    
    if (isMonitoring) {
      startClipboardMonitoring();
      monitoringStatus.textContent = 'Monitoring Active';
    } else {
      stopClipboardMonitoring();
      monitoringStatus.textContent = 'Monitoring Paused';
    }
    
    displayMessage(
      isMonitoring ? 'Clipboard monitoring enabled' : 'Clipboard monitoring disabled', 
      'info', 
      2000
    );
  });
  
  // Logout button click
  logoutBtn.addEventListener('click', () => {
    logout();
  });
}

/**
 * Start monitoring the clipboard for changes
 */
function startClipboardMonitoring() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  
  // Poll clipboard every second
  pollingInterval = setInterval(async () => {
    if (!isMonitoring) return;
    
    try {
      const clipboardText = await readFromClipboard();
      
      // If content changed and not already synced
      if (clipboardText !== lastClipboardContent) {
        // Update last known content
        lastClipboardContent = clipboardText;
        
        // Update textarea
        clipboardTextarea.value = clipboardText;
        
        // Send to server
        sendClipboardUpdate(clipboardText);
        
        // Update UI
        updateSyncStatus('Synchronized');
        updateLastUpdated();
      }
    } catch (err) {
      console.error('Error reading clipboard:', err);
      // Don't display error to avoid spamming the user
      // Just update sync status
      updateSyncStatus('Error reading clipboard');
    }
  }, 1000);
}

/**
 * Stop clipboard monitoring
 */
function stopClipboardMonitoring() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/**
 * Read from clipboard using Clipboard API
 */
async function readFromClipboard() {
  try {
    // Request permission if needed
    if (navigator.clipboard && navigator.clipboard.readText) {
      return await navigator.clipboard.readText();
    } else {
      throw new Error('Clipboard API not supported');
    }
  } catch (err) {
    console.error('Failed to read clipboard:', err);
    throw err;
  }
}

/**
 * Copy content to clipboard
 */
async function copyToClipboard() {
  const content = clipboardTextarea.value;
  
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(content);
      displayMessage('Copied to clipboard', 'success', 2000);
      
      // We don't need to send an update since the clipboard monitor
      // will detect the change and send it automatically
    } else {
      // Fallback
      clipboardTextarea.select();
      document.execCommand('copy');
      displayMessage('Copied to clipboard (fallback method)', 'success', 2000);
    }
  } catch (err) {
    displayMessage('Failed to copy: ' + err.message, 'error');
  }
}

/**
 * Send clipboard update to server
 */
function sendClipboardUpdate(content) {
  if (!isConnected) return;
  
  socket.emit('clipboard-update', { content });
}

/**
 * Update clipboard content in the UI and optionally send to server
 */
function updateClipboardContent(content, sendToServer = false) {
  // Update textarea
  clipboardTextarea.value = content;
  
  // Update last known content
  lastClipboardContent = content;
  
  // Optionally send to server
  if (sendToServer) {
    sendClipboardUpdate(content);
  }
  
  // Update timestamp
  updateLastUpdated();
}

/**
 * Update the "last updated" timestamp
 */
function updateLastUpdated() {
  const now = new Date();
  const timeString = now.toLocaleTimeString();
  lastUpdateEl.textContent = `Last update: ${timeString}`;
}

/**
 * Update the sync status display
 */
function updateSyncStatus(status) {
  syncStatusEl.textContent = status;
}

/**
 * Set connection status
 */
function setConnectionStatus(connected) {
  isConnected = connected;
  
  connectionStatusEl.textContent = connected ? 'Connected' : 'Disconnected';
  connectionStatusEl.className = connected ? 'connected' : 'disconnected';
  
  // Disable/enable UI based on connection
  const controls = [copyBtn, clearBtn, refreshBtn, clipboardTextarea, monitoringToggle];
  controls.forEach(el => {
    el.disabled = !connected;
  });
}

/**
 * Update the client count display
 */
function updateClientCount(count) {
  clientCount = count;
  clientCountEl.textContent = count;
}

/**
 * Display a message to the user
 */
function displayMessage(message, type = 'info', autoHideMs = 0) {
  appMessage.textContent = message;
  appMessage.className = `message ${type}`;
  
  if (autoHideMs > 0) {
    setTimeout(() => {
      appMessage.className = 'message hidden';
    }, autoHideMs);
  }
}

/**
 * Get session data from localStorage
 */
function getSessionData() {
  const data = localStorage.getItem('clipshare_session');
  return data ? JSON.parse(data) : null;
}

/**
 * Log out and clear session data
 */
function logout() {
  stopClipboardMonitoring();
  localStorage.removeItem('clipshare_session');
  window.location.href = '/';
}

// Socket event handlers
socket.on('connect', () => {
  if (sessionData) {
    connectToSession();
  }
});

socket.on('disconnect', () => {
  setConnectionStatus(false);
  displayMessage('Disconnected from server. Reconnecting...', 'error');
});

socket.on('connect_error', () => {
  setConnectionStatus(false);
  displayMessage('Connection error. Reconnecting...', 'error');
});

// Handle clipboard updates from other clients
socket.on('clipboard-broadcast', (data) => {
  const { content } = data;
  
  // Update local clipboard content
  updateClipboardContent(content, false);
  
  // Optionally write to system clipboard
  if (isMonitoring) {
    try {
      navigator.clipboard.writeText(content).catch(err => {
        console.error('Error writing to clipboard:', err);
      });
    } catch (err) {
      console.error('Failed to access clipboard API:', err);
    }
  }
  
  // Update UI
  updateSyncStatus('Updated from another device');
  updateLastUpdated();
  
  displayMessage('Clipboard updated from another device', 'info', 2000);
});

// Handle client join/leave events
socket.on('client-joined', () => {
  updateClientCount(clientCount + 1);
  displayMessage('Another device joined the session', 'info', 3000);
});

socket.on('client-left', () => {
  updateClientCount(Math.max(1, clientCount - 1));
  displayMessage('A device left the session', 'info', 3000);
});
