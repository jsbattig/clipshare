/**
 * ClipShare - Clipboard Synchronization Logic
 * Handles bidirectional clipboard synchronization between devices
 */

// Initialize socket connection with proxy support
const socket = io({
  path: '/socket.io',
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  // Auto-detect if we're using HTTPS
  secure: window.location.protocol === 'https:'
});

// DOM Elements
const sessionNameEl = document.getElementById('session-name');
const connectionStatusEl = document.getElementById('connection-status');
const clientCountEl = document.getElementById('client-count');
const clipboardTextarea = document.getElementById('clipboard-content');
const imageContainer = document.getElementById('image-container');
const clipboardImage = document.getElementById('clipboard-image');
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
let lastClipboardType = 'text'; // Track content type (text/image)
let clientCount = 1; // Including current client
let isUserTyping = false; // Track when user is typing
let typingTimer = null; // Timer for typing detection
const typingTimeout = 3000; // 3 seconds before resuming polling
const maxImageSize = 800; // Maximum size for images before thumbnailing

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
  
  // Add page visibility detection
  setupVisibilityDetection();
});

/**
 * Set up page visibility detection to improve UX with background tabs
 */
function setupVisibilityDetection() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Tab became visible - immediately check clipboard
      if (isMonitoring && !isUserTyping) {
        refreshFromClipboard();
        updateSyncStatus('Tab active - monitoring resumed');
      }
    } else {
      // Tab hidden
      updateSyncStatus('Tab inactive - monitoring paused');
    }
  });
}

/**
 * Refresh content from clipboard
 */
async function refreshFromClipboard() {
  try {
    const clipboardText = await readFromClipboard();
    if (clipboardText !== lastClipboardContent) {
      updateClipboardContent(clipboardText, true);
    }
  } catch (err) {
    console.error('Error refreshing from clipboard:', err);
  }
}

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
      
      // Update client count from server
      if (response.clientCount) {
        updateClientCount(response.clientCount);
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
    // Set typing flag to prevent clipboard polling
    isUserTyping = true;
    clearTimeout(typingTimer);
    
    const newContent = clipboardTextarea.value;
    
    // If we were showing an image, hide it when user starts typing
    if (lastClipboardType === 'image' && !imageContainer.classList.contains('hidden')) {
      // Hide the image container
      imageContainer.classList.add('hidden');
      // Reset the placeholder
      clipboardTextarea.placeholder = "Clipboard content will appear here. Type or paste content to share it with all connected devices.";
      // Update the type
      lastClipboardType = 'text';
      displayMessage('Switched to text mode', 'info', 2000);
    }
    
    // Update last known content
    lastClipboardContent = { type: 'text', content: newContent };
    
    // Send update to server as text type
    sendClipboardUpdate({ type: 'text', content: newContent });
    
    // Update UI
    updateSyncStatus('Synchronized');
    updateLastUpdated();
    
    // Update system clipboard with what user typed to prevent overwrite
    // when polling resumes
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(newContent).catch(err => {
        console.log('Could not write to clipboard:', err);
        // Non-critical error, continue anyway
      });
    }
    
    // Set timer to resume polling after typing stops
    typingTimer = setTimeout(() => {
      isUserTyping = false;
      updateSyncStatus('Monitoring resumed');
    }, typingTimeout);
  });
  
  // Add focus/blur events to improve behavior
  clipboardTextarea.addEventListener('focus', () => {
    isUserTyping = true;
    clearTimeout(typingTimer);
    
    // If we currently have an image displayed and user focuses on textarea,
    // prepare to switch to text mode when they start typing
    if (lastClipboardType === 'image' && !imageContainer.classList.contains('hidden')) {
      // We don't hide the image yet, but we'll hide it as soon as typing begins
      clipboardTextarea.placeholder = "Start typing to replace the image...";
    }
  });
  
  clipboardTextarea.addEventListener('blur', () => {
    // Short delay before resuming to handle click+focus sequence
    setTimeout(() => {
      isUserTyping = false;
    }, 500);
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
    // Skip clipboard check if user is actively typing or monitoring is disabled
    if (!isMonitoring || isUserTyping) return;
    
    try {
      const clipboardData = await readFromClipboard();
      
      // Compare based on type and content
      let contentChanged = false;
      
      if (typeof lastClipboardContent === 'string' && typeof clipboardData === 'object') {
        // Old format vs new format
        contentChanged = true;
      } else if (typeof lastClipboardContent === 'object' && typeof clipboardData === 'object') {
        // Both object format
        contentChanged = 
          lastClipboardContent.type !== clipboardData.type || 
          lastClipboardContent.content !== clipboardData.content;
      } else {
        // Simple string comparison (legacy)
        contentChanged = clipboardData !== lastClipboardContent;
      }
      
      // If content changed and not already synced
      if (contentChanged) {
        // Update content in UI
        updateClipboardContent(clipboardData, true);
        
        // Update UI status
        updateSyncStatus('Synchronized');
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
 * Read from clipboard using multiple methods
 * Tries different approaches for better browser compatibility
 * Attempts to detect both text and image content
 */
async function readFromClipboard() {
  try {
    // First try the modern clipboard API to check for images
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        // This can read both text and images
        const clipboardItems = await navigator.clipboard.read();
        
        // Check for images first
        for (const item of clipboardItems) {
          // Check if image type is available
          if (item.types.some(type => type.startsWith('image/'))) {
            const imageType = item.types.find(type => type.startsWith('image/'));
            const blob = await item.getType(imageType);
            // Convert blob to base64 for transmission
            const base64Image = await blobToBase64(blob);
            
            // Set content type to image
            lastClipboardType = 'image';
            
            // Return image data in the correct format
            return {
              type: 'image',
              content: base64Image,
              imageType
            };
          }
        }
        
        // If we get here, no image was found, try text
        const text = await navigator.clipboard.readText();
        lastClipboardType = 'text';
        return {
          type: 'text',
          content: text
        };
      } catch (clipboardApiError) {
        console.log('Modern Clipboard API failed, trying text fallback...', clipboardApiError);
        // Continue to text fallbacks
      }
    }
    
    // Try text-only methods
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        lastClipboardType = 'text';
        return {
          type: 'text',
          content: text
        };
      } catch (textReadError) {
        console.log('Text clipboard read failed, trying execCommand...', textReadError);
      }
    }
    
    // Method 2: execCommand approach (older browsers, text only)
    const textarea = document.createElement('textarea');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.top = '0';
    textarea.style.left = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    
    let success = false;
    let text = '';
    
    try {
      // Try to execute paste command
      success = document.execCommand('paste');
      if (success) {
        text = textarea.value;
        lastClipboardType = 'text';
        return {
          type: 'text',
          content: text
        };
      }
    } catch (execError) {
      console.log('execCommand approach failed', execError);
    } finally {
      document.body.removeChild(textarea);
    }
    
    // If we get here, all methods failed
    throw new Error('Clipboard API not supported');
  } catch (err) {
    console.error('Failed to read clipboard:', err);
    throw err;
  }
}

/**
 * Convert Blob to base64 string
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Check if an image is oversized and should be displayed as thumbnail
 */
function isOversizedImage(imageElement) {
  return imageElement.naturalWidth > maxImageSize || 
         imageElement.naturalHeight > maxImageSize;
}

/**
 * Copy content to clipboard with improved fallbacks
 */
async function copyToClipboard() {
  const content = clipboardTextarea.value;
  
  try {
    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(content);
        displayMessage('Copied to clipboard', 'success', 2000);
        return;
      } catch (clipboardError) {
        console.log('Clipboard write API failed, trying fallback...', clipboardError);
        // Fall through to fallback if this fails
      }
    }
    
    // Fallback using execCommand
    try {
      // Select the text
      clipboardTextarea.select();
      // For mobile devices
      clipboardTextarea.setSelectionRange(0, 99999);
      
      // Execute copy command
      const success = document.execCommand('copy');
      
      if (success) {
        displayMessage('Copied to clipboard (fallback method)', 'success', 2000);
      } else {
        throw new Error('execCommand copy failed');
      }
    } catch (fallbackError) {
      throw fallbackError; // Re-throw for the outer catch
    }
  } catch (err) {
    console.error('Copy failed:', err);
    displayMessage('Failed to copy: ' + (err.message || 'Unknown error'), 'error');
    
    // Last resort - prompt user to copy manually
    displayMessage('Please use Ctrl+C/Cmd+C to copy manually', 'info', 4000);
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
 * @param {Object|string} content - Clipboard content (object with type/content or legacy string)
 * @param {boolean} sendToServer - Whether to send update to server
 */
function updateClipboardContent(content, sendToServer = false) {
  // Handle different content formats
  if (typeof content === 'string') {
    // Legacy string format - treat as text
    handleTextContent(content);
    
    // Update last known content
    lastClipboardContent = content;
    lastClipboardType = 'text';
    
    // Optionally send to server (legacy format)
    if (sendToServer) {
      sendClipboardUpdate(content);
    }
  } 
  else if (typeof content === 'object') {
    // New object format with type
    if (content.type === 'text') {
      // Handle text content
      handleTextContent(content.content);
      lastClipboardType = 'text';
      lastClipboardContent = content;
    } 
    else if (content.type === 'image') {
      // Handle image content
      handleImageContent(content.content, content.imageType);
      lastClipboardType = 'image';
      lastClipboardContent = content;
    }
    
    // Optionally send to server (new format)
    if (sendToServer) {
      sendClipboardUpdate(content);
    }
  }
  
  // Update timestamp
  updateLastUpdated();
}

/**
 * Handle text content
 * @param {string} text - Text content
 */
function handleTextContent(text) {
  // Show textarea, hide image
  clipboardTextarea.value = text;
  clipboardTextarea.classList.remove('hidden');
  imageContainer.classList.add('hidden');
}

/**
 * Handle image content
 * @param {string} imageData - Base64 encoded image data
 * @param {string} imageType - MIME type of the image
 */
function handleImageContent(imageData, imageType) {
  // Show image, empty textarea but keep it visible for optional text
  clipboardTextarea.value = '';
  imageContainer.classList.remove('hidden');
  clipboardImage.src = imageData;
  
  // When image loads, check if it needs to be shown as thumbnail
  clipboardImage.onload = () => {
    const isThumbnailed = isOversizedImage(clipboardImage);
    
    // Get the image info element
    const imageInfoEl = imageContainer.querySelector('.image-info');
    
    // Update image info text
    if (isThumbnailed) {
      // Add thumbnail indicator
      if (!imageInfoEl.querySelector('.thumbnail-indicator')) {
        const thumbnailIndicator = document.createElement('span');
        thumbnailIndicator.className = 'thumbnail-indicator';
        thumbnailIndicator.textContent = 'Large image (thumbnailed)';
        imageInfoEl.appendChild(thumbnailIndicator);
      }
    } else {
      // Remove thumbnail indicator if exists
      const thumbnailIndicator = imageInfoEl.querySelector('.thumbnail-indicator');
      if (thumbnailIndicator) {
        imageInfoEl.removeChild(thumbnailIndicator);
      }
    }
  };
}

/**
 * Send clipboard update to server
 * @param {Object|string} content - Clipboard content
 */
function sendClipboardUpdate(content) {
  if (!isConnected) return;
  
  // If content is a string (legacy), convert to object format
  if (typeof content === 'string') {
    socket.emit('clipboard-update', { 
      type: 'text',
      content 
    });
  } else {
    // Content is already in the correct format
    socket.emit('clipboard-update', content);
  }
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
  // Update local clipboard content
  updateClipboardContent(data, false);
  
  // Optionally write to system clipboard
  if (isMonitoring) {
    try {
      if (data.type === 'text') {
        // Text can be written directly
        navigator.clipboard.writeText(data.content).catch(err => {
          console.error('Error writing text to clipboard:', err);
        });
      } else if (data.type === 'image') {
        // Images are more complex to write to system clipboard
        // Most browsers don't support writing images to clipboard programmatically
        // Just notify user that an image is available
        displayMessage('Image received - view in app', 'info', 3000);
      }
    } catch (err) {
      console.error('Failed to access clipboard API:', err);
    }
  }
  
  // Update UI
  updateSyncStatus('Updated from another device');
  updateLastUpdated();
  
  const contentTypeMsg = data.type === 'image' ? 'Image' : 'Text';
  displayMessage(`${contentTypeMsg} clipboard updated from another device`, 'info', 2000);
});

// Handle client join/leave events
socket.on('client-joined', (data) => {
  // Use server-provided count instead of local increment
  if (data.clientCount) {
    updateClientCount(data.clientCount);
  }
  displayMessage('Another device joined the session', 'info', 3000);
});

socket.on('client-left', (data) => {
  // Use server-provided count instead of local calculation
  if (data.clientCount) {
    updateClientCount(data.clientCount);
  }
  displayMessage('A device left the session', 'info', 3000);
});
