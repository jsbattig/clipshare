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

/**
 * Attempts to sync an image to the system clipboard with multiple retries
 * @param {string} imageData - Base64 encoded image data
 * @param {string} imageType - MIME type of the image
 */
function syncImageToClipboard(imageData, imageType) {
  let retryCount = 0;
  
  // Function to attempt clipboard write
  const attemptSync = () => {
    // Only try if the browser supports ClipboardItem
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        // Convert data URL to Blob
        const blob = dataURLtoBlob(imageData);
        
        // Create a ClipboardItem
        const clipboardItem = new ClipboardItem({
          [imageType]: blob
        });
        
        navigator.clipboard.write([clipboardItem])
          .then(() => {
            console.log('Image successfully written to system clipboard');
            displayMessage('Image synced to clipboard', 'success', 2000);
            
            // Record the time of this successful sync
            lastSyncAttemptTime = Date.now();
          })
          .catch(err => {
            console.error(`Image clipboard write attempt ${retryCount + 1} failed:`, err);
            
            // Try again if we haven't reached the max retries
            retryCount++;
            if (retryCount < imageSyncRetries) {
              console.log(`Will retry image sync in ${imageSyncRetryDelay}ms (attempt ${retryCount + 1}/${imageSyncRetries})`);
              setTimeout(attemptSync, imageSyncRetryDelay);
            } else {
              // Give up after max retries
              displayMessage('Image available in app (system clipboard sync failed)', 'info', 3000);
            }
          });
      } catch (err) {
        console.error('Error preparing image for clipboard sync:', err);
        displayMessage('Image available in app only', 'info', 3000);
      }
    } else {
      // Browser doesn't support needed APIs
      displayMessage('Image available in app (system clipboard image writing not supported)', 'info', 3000);
    }
  };
  
  // Start the first attempt
  attemptSync();
}

// DOM Elements
const sessionNameEl = document.getElementById('session-name');
const connectionStatusEl = document.getElementById('connection-status');
const clientCountEl = document.getElementById('client-count');
const clipboardTextarea = document.getElementById('clipboard-content');
const imageContainer = document.getElementById('image-container');
const clipboardImage = document.getElementById('clipboard-image');
const fileContainer = document.getElementById('file-banner');
const fileNameEl = document.getElementById('clipboard-file-name');
const fileSizeEl = document.getElementById('clipboard-file-size');
const fileMimeEl = document.getElementById('clipboard-file-mime');
const fileTypeIcon = document.querySelector('.file-type-icon');
const diffBanner = document.getElementById('clipboard-diff-banner');
const useLocalBtn = document.getElementById('use-local-btn');
const contentTypeStatus = document.getElementById('content-type-status');
const contentTypeText = document.getElementById('content-type');
const copyBtn = document.getElementById('copy-btn');
const clearBtn = document.getElementById('clear-btn');
const refreshBtn = document.getElementById('refresh-btn');
const monitoringToggle = document.getElementById('monitoring-toggle');
const monitoringStatus = document.getElementById('monitoring-status');
const syncStatusEl = document.getElementById('sync-status');
const lastUpdateEl = document.getElementById('last-update');
const logoutBtn = document.getElementById('logout-btn');
const appMessage = document.getElementById('app-message');

// Content type constants
const CONTENT_STATES = {
  TEXT: 'text',
  IMAGE: 'image',
  FILE: 'file',
  EMPTY: 'empty'
};

// Application state
let sessionData = null;
let isConnected = false;
let isMonitoring = true;
let pollingInterval = null;
let lastClipboardContent = '';
let lastClipboardType = 'text'; // Track content type (text/image)
let lastClipboardTimestamp = Date.now(); // Timestamp for versioning
let clientCount = 1; // Including current client
let isUserTyping = false; // Track when user is typing
let typingTimer = null; // Timer for typing detection
let syncGracePeriod = false; // Flag to prevent sync race conditions
let lastContentOrigin = 'init'; // Track where content came from: 'local', 'remote', 'manual', 'init'
let lastSyncAttemptTime = 0; // Track when we last tried to sync to avoid frequent checks
let currentContentState = CONTENT_STATES.EMPTY; // Current type of content in clipboard
let fileTransferInProgress = false; // Flag to track if a file transfer is in progress
const typingTimeout = 3000; // 3 seconds before resuming polling
const syncGracePeriodDuration = 3000; // 3 seconds grace period after receiving updates (increased from 500ms)
const minTimeBetweenSyncs = 2000; // Minimum time between sync attempts
const maxImageSize = 800; // Maximum size for images before thumbnailing
const imageSyncRetries = 3; // Number of times to retry syncing images to system clipboard
const imageSyncRetryDelay = 1000; // Delay between image sync retries
const maxFileSize = 50 * 1024 * 1024; // 50MB maximum file size
const fileChunkSize = 1024 * 1024; // 1MB chunks for file transfer

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
        
        // Also update system clipboard with the initial content
        // This ensures the joining device's clipboard is synced with the session
        try {
          if (response.clipboard.type === 'text') {
            navigator.clipboard.writeText(response.clipboard.content).catch(err => {
              console.error('Error writing initial text to clipboard:', err);
            });
          } else if (response.clipboard.type === 'image') {
            // For images, we'll try to use the newer Clipboard API
            try {
              // Convert data URL to Blob
              const blob = dataURLtoBlob(response.clipboard.content);
              
              // Only try this in browsers that support ClipboardItem
              if (window.ClipboardItem) {
                const clipboardItem = new ClipboardItem({
                  [blob.type]: blob
                });
                navigator.clipboard.write([clipboardItem]).catch(err => {
                  console.error('Error writing image to clipboard:', err);
                  displayMessage('Image available in app (cannot copy to system clipboard)', 'info', 3000);
                });
              } else {
                displayMessage('Image available in app (system clipboard image writing not supported)', 'info', 3000);
              }
            } catch (imgError) {
              console.error('Error preparing image for clipboard:', imgError);
            }
          }
        } catch (err) {
          console.error('Failed to access clipboard API for initial sync:', err);
        }
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
  // Copy/Download button click
  copyBtn.addEventListener('click', () => {
    if (currentContentState === CONTENT_STATES.FILE) {
      downloadFile();
    } else {
      copyToClipboard();
    }
  });
  
  // Clear button click
  clearBtn.addEventListener('click', () => {
    updateClipboardContent('', true);
    clipboardTextarea.focus();
  });
  
  // Refresh/Paste button click
  refreshBtn.addEventListener('click', async () => {
    try {
      const clipboardContent = await readFromClipboard();
      
      // If content is a file, show confirmation before sending
      if (clipboardContent && clipboardContent.type === 'file') {
        showFileTransferConfirmation(clipboardContent);
      } else {
        // Handle other content types normally
        updateClipboardContent(clipboardContent, true);
        displayMessage('Clipboard refreshed', 'info', 2000);
      }
    } catch (err) {
      displayMessage('Failed to read clipboard: ' + err.message, 'error');
    }
  });
  
  // Use local button click (for clipboard differences)
  useLocalBtn.addEventListener('click', async () => {
    try {
      const clipboardContent = await readFromClipboard();
      updateClipboardContent(clipboardContent, true);
      diffBanner.classList.add('hidden');
      displayMessage('Remote clipboard updated with local content', 'success', 2000);
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
    
    // Update last known content with timestamp
    lastClipboardTimestamp = Date.now();
    lastClipboardContent = { 
      type: 'text', 
      content: newContent,
      timestamp: lastClipboardTimestamp
    };
    
    // Send update to server as text type with timestamp
    sendClipboardUpdate({ 
      type: 'text', 
      content: newContent,
      timestamp: lastClipboardTimestamp
    });
    
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
    // Skip clipboard check if user is actively typing, monitoring is disabled,
    // or if we're in the grace period after receiving an update
    if (!isMonitoring || isUserTyping || syncGracePeriod) return;
    
    try {
      const clipboardData = await readFromClipboard();
      
      // Add timestamp to clipboard data if it doesn't have one
      if (typeof clipboardData === 'object' && !clipboardData.timestamp) {
        clipboardData.timestamp = Date.now();
      }
      
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
      
      // Skip if we recently received content from another device (within grace period)
      // or if the last content was from a remote source and our tab is active
      const now = Date.now();
      const timeSinceLastSync = now - lastSyncAttemptTime;
      const shouldPrioritizeAppContent = 
        document.visibilityState === 'visible' && 
        lastContentOrigin === 'remote' && 
        timeSinceLastSync < minTimeBetweenSyncs;
      
      // Log debugging info when we detect a potential conflict
      if (shouldPrioritizeAppContent && contentChanged) {
        console.log('Prioritizing app content over system clipboard to prevent overwriting remote content');
        
        // Force the system clipboard to match our app content instead
        if (lastClipboardType === 'text' && typeof lastClipboardContent === 'object') {
          // Update system clipboard with current app content
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(lastClipboardContent.content).catch(err => {
              console.log('Could not update system clipboard:', err);
            });
          }
        } else if (lastClipboardType === 'image' && typeof lastClipboardContent === 'object') {
          // For images, retry syncing to system clipboard
          syncImageToClipboard(
            lastClipboardContent.content, 
            lastClipboardContent.imageType || 'image/png'
          );
        }
        return; // Skip processing the change to prevent override
      }
      
      // If content changed and is eligible for sync
      if (contentChanged) {
        // Mark this content as coming from local system clipboard
        lastContentOrigin = 'local';
        
        // Update content in UI and send to server
        updateClipboardContent(clipboardData, true);
        
        // Update UI status
        updateSyncStatus('Local clipboard change detected');
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
 * Detect operating system for clipboard format handling
 * @returns {string} The detected OS: 'windows', 'mac', 'linux', or 'unknown'
 */
function detectOperatingSystem() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  if (userAgent.indexOf('windows') !== -1) return 'windows';
  if (userAgent.indexOf('mac') !== -1) return 'mac';
  if (userAgent.indexOf('linux') !== -1) return 'linux';
  return 'unknown';
}

/**
 * Read from clipboard using multiple methods
 * Tries different approaches for better browser compatibility
 * Attempts to detect text, image, and file content
 */
async function readFromClipboard() {
  try {
    // Detect OS for better clipboard format handling
    const operatingSystem = detectOperatingSystem();
    console.log(`Detected operating system: ${operatingSystem}`);
    
    // First try the modern clipboard API to check for images and files
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        // This can read multiple content types
        const clipboardItems = await navigator.clipboard.read();
        console.log('Clipboard items found:', clipboardItems.length);
        
        // Enhanced clipboard format detection
        for (const item of clipboardItems) {
          console.log('Available clipboard formats:', item.types);
          
          // Check for images first
          if (item.types.some(type => type.startsWith('image/'))) {
            const imageType = item.types.find(type => type.startsWith('image/'));
            console.log(`Detected image format: ${imageType}`);
            
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
          
          // Check for files (cross-platform detection)
          // Windows: Files, FileContents, etc.
          // Mac: public.file-url, etc.
          // Linux: text/uri-list, etc.
          // General: application/*, etc.
          const isFile = item.types.some(type => 
            // Windows formats
            type === 'Files' || 
            type.includes('FileContents') ||
            type.includes('FileGroupDescriptor') ||
            // Mac formats
            type === 'public.file-url' ||
            type.includes('pasteboard.promised-file') ||
            // Linux formats
            type === 'text/uri-list' ||
            type.includes('gnome-copied-files') ||
            // Generic application formats
            type === 'application/pdf' ||
            type.includes('application/') && !type.includes('json') && !type.includes('javascript')
          );
          
          if (isFile) {
            console.log('File detected in clipboard');
            
            // Determine best format to extract based on OS
            let fileFormat;
            let fileContent;
            let fileName = 'clipboard-file';
            let fileType = 'application/octet-stream';
            let fileSize = 0;
            
            // Extract file information based on available formats
            if (item.types.includes('application/pdf')) {
              fileFormat = 'application/pdf';
              fileName = 'clipboard-document.pdf';
              fileType = 'application/pdf';
            } 
            else if (operatingSystem === 'windows' && item.types.includes('Files')) {
              fileFormat = 'Files';
            }
            else if (operatingSystem === 'mac' && item.types.includes('public.file-url')) {
              fileFormat = 'public.file-url';
            }
            else if (item.types.some(t => t.startsWith('application/'))) {
              fileFormat = item.types.find(t => t.startsWith('application/'));
              
              // Try to determine file extension from type
              const formatParts = fileFormat.split('/');
              if (formatParts.length > 1) {
                const extension = formatParts[1].split('+')[0].split('-')[0];
                if (extension && extension !== 'octet' && extension !== 'stream') {
                  fileName = `clipboard-file.${extension}`;
                  fileType = fileFormat;
                }
              }
            }
            else {
              // Use first available format
              fileFormat = item.types[0];
            }
            
            console.log(`Attempting to extract file with format: ${fileFormat}`);
            
            try {
              // Get file content as blob
              const blob = await item.getType(fileFormat);
              fileSize = blob.size;
              fileContent = await blobToBase64(blob);
              
              console.log(`Successfully extracted file: ${fileName}, ${formatFileSize(fileSize)}`);
              
              // Return file data
              return {
                type: 'file',
                fileName,
                fileSize,
                fileType,
                fileContent
              };
            } catch (fileError) {
              console.error('Error extracting file from clipboard:', fileError);
              // Continue to other formats if file extraction fails
            }
          }
        }
        
        // If we get here, no image or file was found, try text
        console.log('No image or file found, trying text');
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
 * Convert a data URL to a Blob object
 * @param {string} dataURL - The data URL to convert
 * @returns {Blob} The resulting Blob object
 */
function dataURLtoBlob(dataURL) {
  // Convert base64/URLEncoded data component to raw binary data held in a string
  let byteString;
  if (dataURL.split(',')[0].indexOf('base64') >= 0) {
    byteString = atob(dataURL.split(',')[1]);
  } else {
    byteString = decodeURIComponent(dataURL.split(',')[1]);
  }
  
  // Separate out the mime component
  const mimeString = dataURL.split(',')[0].split(':')[1].split(';')[0];
  
  // Write the bytes of the string to an ArrayBuffer
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  
  // Create a Blob with the ArrayBuffer
  return new Blob([ab], { type: mimeString });
}

/**
 * Copy content to clipboard with improved fallbacks
 */
async function copyToClipboard() {
  try {
    // Handle different types of content
    if (lastClipboardType === 'image' && !imageContainer.classList.contains('hidden')) {
      // Try to copy the image
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          // Get the image data
          const imageURL = clipboardImage.src;
          const blob = dataURLtoBlob(imageURL);
          
          // Create a ClipboardItem
          const clipboardItem = new ClipboardItem({
            [blob.type]: blob
          });
          
          // Write to clipboard
          await navigator.clipboard.write([clipboardItem]);
          displayMessage('Image copied to clipboard', 'success', 2000);
          return;
        } catch (imgError) {
          console.error('Image copy to clipboard failed:', imgError);
          displayMessage('Could not copy image to clipboard (browser limitation)', 'error', 3000);
        }
      } else {
        displayMessage('Browser does not support copying images to clipboard', 'info', 3000);
      }
    } else {
      // Handle text content
      const content = clipboardTextarea.value;
      
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
    }
  } catch (err) {
    console.error('Copy failed:', err);
    displayMessage('Failed to copy: ' + (err.message || 'Unknown error'), 'error');
    
    // Last resort - prompt user to copy manually
    displayMessage('Please use system copy functionality to copy the content', 'info', 4000);
  }
}

// Function removed to fix duplicate definition
// The correct implementation is defined later in the file

/**
 * Update clipboard content in the UI and optionally send to server
 * @param {Object|string} content - Clipboard content (object with type/content or legacy string)
 * @param {boolean} sendToServer - Whether to send update to server
 */
function updateClipboardContent(content, sendToServer = false) {
  // Clear UI state for content transition
  copyBtn.classList.remove('download-mode');
  copyBtn.textContent = 'Copy';
  
  // Handle different content formats
  if (typeof content === 'string') {
    // Legacy string format - treat as text
    handleTextContent(content);
    
    // Update last known content
    lastClipboardContent = content;
    lastClipboardType = 'text';
    currentContentState = CONTENT_STATES.TEXT;
    
    // Update content type indicator
    updateContentTypeIndicator(CONTENT_STATES.TEXT);
    
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
      currentContentState = CONTENT_STATES.TEXT;
      
      // Update content type indicator
      updateContentTypeIndicator(CONTENT_STATES.TEXT);
    } 
    else if (content.type === 'image') {
      // Handle image content
      handleImageContent(content.content, content.imageType);
      lastClipboardType = 'image';
      lastClipboardContent = content;
      currentContentState = CONTENT_STATES.IMAGE;
      
      // Update content type indicator
      updateContentTypeIndicator(CONTENT_STATES.IMAGE);
    }
    else if (content.type === 'file') {
      // Handle file content
      handleFileContent(content);
      lastClipboardType = 'file';
      lastClipboardContent = content;
      currentContentState = CONTENT_STATES.FILE;
      
      // Update content type indicator
      updateContentTypeIndicator(CONTENT_STATES.FILE);
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
  
  // If content is a string (legacy), convert to object format with timestamp
  if (typeof content === 'string') {
    const timestamp = Date.now();
    lastClipboardTimestamp = timestamp;
    
    socket.emit('clipboard-update', { 
      type: 'text',
      content,
      timestamp
    });
  } else {
    // Make sure content has a timestamp
    if (!content.timestamp) {
      content.timestamp = Date.now();
      lastClipboardTimestamp = content.timestamp;
    }
    
    // Content is in the correct format
    socket.emit('clipboard-update', content);
  }
}

/**
 * Update the last updated timestamp display
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
  // Check if this update is newer than our current content
  // If not, ignore it to prevent update loops
  if (data.timestamp && data.timestamp <= lastClipboardTimestamp) {
    console.log('Ignoring older or same-age clipboard update');
    return;
  }
  
  // Update our timestamp tracking with this newer timestamp
  if (data.timestamp) {
    lastClipboardTimestamp = data.timestamp;
  }
  
  // Enter grace period to prevent immediate re-sync
  syncGracePeriod = true;
  
  // Mark content as coming from remote
  lastContentOrigin = 'remote';
  
  // Update local clipboard content without sending to server
  updateClipboardContent(data, false);
  
  // Optionally write to system clipboard - with retry logic for images
  if (isMonitoring) {
    try {
      if (data.type === 'text') {
        // Text can be written directly
        navigator.clipboard.writeText(data.content).catch(err => {
          console.error('Error writing text to clipboard:', err);
        });
        
        // Record the time of this sync attempt
        lastSyncAttemptTime = Date.now();
        
        console.log('Text content written to system clipboard');
      } else if (data.type === 'image') {
        // For images, attempt multiple sync retries to improve success rate
        syncImageToClipboard(data.content, data.imageType || 'image/png');
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
  
  // End grace period after short delay
  setTimeout(() => {
    syncGracePeriod = false;
  }, syncGracePeriodDuration);
});

/**
 * Show confirmation before transferring a file
 * @param {Object} fileData - File data object
 */
function showFileTransferConfirmation(fileData) {
  // Get file info
  const fileName = fileData.fileName || 'unknown-file';
  const fileSize = fileData.fileSize || 0;
  const formattedSize = formatFileSize(fileSize);
  
  // Show confirmation dialog
  const confirmSend = confirm(
    `Send file "${fileName}" (${formattedSize}) to all connected devices?`
  );
  
  if (confirmSend) {
    // User confirmed, prepare and send the file
    updateClipboardContent(fileData, true);
    displayMessage(`Sending file "${fileName}"...`, 'info', 3000);
  }
}

/**
 * Format file size to human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Download a file from clipboard data
 */
function downloadFile() {
  if (currentContentState !== CONTENT_STATES.FILE || !lastClipboardContent) {
    displayMessage('No file to download', 'error', 2000);
    return;
  }
  
  try {
    // Get file data
    const { fileName, fileContent, fileType } = lastClipboardContent;
    
    // Create blob from content
    const blob = dataURLtoBlob(fileContent);
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download-file';
    a.style.display = 'none';
    
    // Add to document and trigger click
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    displayMessage(`File "${fileName}" downloaded successfully`, 'success', 3000);
  } catch (err) {
    console.error('Download failed:', err);
    displayMessage('Failed to download file: ' + (err.message || 'Unknown error'), 'error');
  }
}

/**
 * Update UI to show file content
 * @param {Object} fileData - File data object
 */
function handleFileContent(fileData) {
  // Hide other containers
  clipboardTextarea.value = '';
  clipboardTextarea.classList.add('hidden');
  imageContainer.classList.add('hidden');
  
  // Show file banner
  fileContainer.classList.remove('hidden');
  
  // Update file info
  fileNameEl.textContent = fileData.fileName || 'Unknown file';
  fileSizeEl.textContent = formatFileSize(fileData.fileSize || 0);
  fileMimeEl.textContent = fileData.fileType || 'unknown/type';
  
  // Set file extension in icon if we can determine it
  if (fileData.fileName) {
    const extension = fileData.fileName.split('.').pop().toLowerCase();
    if (extension) {
      fileTypeIcon.setAttribute('data-extension', extension);
    } else {
      fileTypeIcon.removeAttribute('data-extension');
    }
  }
  
  // Update copy button to download mode
  copyBtn.textContent = 'Download';
  copyBtn.classList.add('download-mode');
  
  // Update content state
  currentContentState = CONTENT_STATES.FILE;
  
  // Update content type indicator
  updateContentTypeIndicator(CONTENT_STATES.FILE);
}

/**
 * Update the content type indicator
 * @param {string} type - Content type (from CONTENT_STATES)
 */
function updateContentTypeIndicator(type) {
  // Show the status indicator
  contentTypeStatus.classList.remove('hidden');
  
  // Remove old type classes
  contentTypeStatus.classList.remove('text-content', 'image-content', 'file-content');
  
  // Update the content type text
  contentTypeText.textContent = type.charAt(0).toUpperCase() + type.slice(1);
  
  // Add the appropriate class
  if (type === CONTENT_STATES.TEXT) {
    contentTypeStatus.classList.add('text-content');
  } else if (type === CONTENT_STATES.IMAGE) {
    contentTypeStatus.classList.add('image-content');
  } else if (type === CONTENT_STATES.FILE) {
    contentTypeStatus.classList.add('file-content');
  }
}

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

// Listen for explicit client count updates from server
socket.on('client-count-update', (data) => {
  if (data.clientCount !== undefined) {
    updateClientCount(data.clientCount);
  }
});

// Listen for file chunk transfers
socket.on('file-chunk', (data) => {
  // TODO: Implement file chunking for large files
  console.log('Received file chunk:', data.chunkId, 'of', data.totalChunks);
});
