/**
 * ClipShare UI Manager
 * 
 * Handles all user interface updates, display functionality,
 * and UI state management.
 */

import { CONFIG } from './config.js';
import { getElement, getFormattedTime, formatFileSize } from './utils.js';

/**
 * Display a message to the user
 * @param {string} message - Message text
 * @param {string} type - Message type ('success', 'error', 'info')
 * @param {number} autoHideMs - Optional auto-hide time in milliseconds
 */
export function displayMessage(message, type = 'info', autoHideMs = 0) {
  const appMessage = getElement('app-message');
  if (!appMessage) return;
  
  appMessage.textContent = message;
  appMessage.className = `message ${type}`;
  appMessage.classList.remove('hidden');
  
  if (autoHideMs > 0) {
    setTimeout(() => {
      appMessage.className = 'message hidden';
    }, autoHideMs);
  }
}

/**
 * Display HTML message to the user (for more complex content)
 * @param {string} htmlContent - HTML content
 * @param {string} type - Message type ('success', 'error', 'info')
 * @param {number} autoHideMs - Optional auto-hide time in milliseconds
 */
export function displayHTMLMessage(htmlContent, type = 'info', autoHideMs = 0) {
  const appMessage = getElement('app-message');
  if (!appMessage) return;
  
  appMessage.innerHTML = htmlContent;
  appMessage.className = `message ${type}`;
  appMessage.classList.remove('hidden');
  
  if (autoHideMs > 0) {
    setTimeout(() => {
      appMessage.className = 'message hidden';
    }, autoHideMs);
  }
}

/**
 * Update the sync status display
 * @param {string} status - Status text to display
 */
export function updateSyncStatus(status) {
  const syncStatusEl = getElement('sync-status');
  if (syncStatusEl) {
    syncStatusEl.textContent = status;
  }
}

/**
 * Update the last updated timestamp
 */
export function updateLastUpdated() {
  const lastUpdateEl = getElement('last-update');
  if (lastUpdateEl) {
    lastUpdateEl.textContent = `Last update: ${getFormattedTime()}`;
  }
}

/**
 * Update the content type indicator
 * @param {string} type - Content type from CONFIG.contentTypes
 */
export function updateContentTypeIndicator(type) {
  const contentTypeStatus = getElement('content-type-status');
  const contentTypeText = getElement('content-type');
  
  if (!contentTypeStatus || !contentTypeText) return;
  
  // Show the status indicator
  contentTypeStatus.classList.remove('hidden');
  
  // Remove old type classes
  contentTypeStatus.classList.remove('text-content', 'image-content', 'file-content');
  
  // Update the content type text
  contentTypeText.textContent = type.charAt(0).toUpperCase() + type.slice(1);
  
  // Add the appropriate class
  if (type === CONFIG.contentTypes.TEXT) {
    contentTypeStatus.classList.add('text-content');
  } else if (type === CONFIG.contentTypes.IMAGE) {
    contentTypeStatus.classList.add('image-content');
  } else if (type === CONFIG.contentTypes.FILE) {
    contentTypeStatus.classList.add('file-content');
  }
}

/**
 * Show the drop zone overlay
 * @param {string} message - Optional message to display in drop zone
 */
export function showDropZone(message = '') {
  const dropZone = getElement('drop-zone');
  const primaryMsg = dropZone?.querySelector('.drop-message .primary');
  const globalOverlay = getElement('global-overlay');
  
  if (!dropZone || !globalOverlay) return;
  
  // Update message if provided
  if (message && primaryMsg) {
    primaryMsg.textContent = message;
  }
  
  // Show overlay and drop zone
  globalOverlay.classList.remove('hidden');
  dropZone.classList.remove('hidden');
}

/**
 * Hide the drop zone overlay
 */
export function hideDropZone() {
  const dropZone = getElement('drop-zone');
  const multiFileIndicator = getElement('multi-file-indicator');
  const globalOverlay = getElement('global-overlay');
  
  if (!dropZone || !globalOverlay) return;
  
  // Hide elements
  dropZone.classList.add('hidden');
  globalOverlay.classList.add('hidden');
  
  if (multiFileIndicator) {
    multiFileIndicator.classList.add('hidden');
  }
}

/**
 * Update file count display in multi-file indicator
 * @param {number} count - Number of files
 */
export function updateFileCountDisplay(count) {
  const multiFileIndicator = getElement('multi-file-indicator');
  const fileCountBadge = multiFileIndicator?.querySelector('.file-count-badge');
  
  if (!multiFileIndicator || !fileCountBadge) return;
  
  if (count > 0) {
    fileCountBadge.textContent = `${count} files`;
    multiFileIndicator.classList.remove('hidden');
  } else {
    multiFileIndicator.classList.add('hidden');
  }
}

/**
 * Update UI to show file content
 * @param {Object} fileData - File data object
 */
export function displayFileContent(fileData) {
  const fileContainer = getElement('file-banner');
  const emptyFileState = getElement('empty-file-state');
  const fileNameEl = getElement('clipboard-file-name');
  const fileSizeEl = getElement('clipboard-file-size');
  const fileMimeEl = getElement('clipboard-file-mime');
  const fileTypeIcon = document.querySelector('.file-type-icon');
  
  if (!fileContainer || !emptyFileState) return;
  
  // Update the file section UI
  emptyFileState.classList.add('hidden');
  fileContainer.classList.remove('hidden');
  
  // PRIORITY 1: Use _displayFileName if available
  // PRIORITY 2: Use window.originalFileData if available
  // PRIORITY 3: Use regular fileName
  let displayFileName;
  
  if (fileData._displayFileName) {
    displayFileName = fileData._displayFileName;
    console.log('UI using _displayFileName for display:', displayFileName);
  } 
  else if (window.originalFileData && window.originalFileData.fileName) {
    displayFileName = window.originalFileData.fileName;
    console.log('UI using window.originalFileData.fileName for display:', displayFileName);
  }
  else if (fileData.fileName) {
    // Check if the filename is still encrypted
    if (fileData.fileName.startsWith('U2FsdGVk')) {
      console.log('WARNING: Filename appears encrypted in UI display:', fileData.fileName.substring(0, 30) + '...');
      displayFileName = 'Encrypted file'; // Fallback display name
      
      // Try to decrypt it here as a last resort
      try {
        const sessionImport = window.Session || null;
        if (sessionImport) {
          const sessionData = sessionImport.getCurrentSession();
          if (sessionData && sessionData.passphrase) {
            // Try to decrypt using window.decryptClipboardContent if available
            if (window.decryptClipboardContent) {
              const tempObj = {
                type: 'file',
                fileName: fileData.fileName
              };
              const decrypted = window.decryptClipboardContent(tempObj, sessionData.passphrase);
              if (decrypted && decrypted.fileName) {
                displayFileName = decrypted.fileName;
                console.log('UI last-resort decryption successful:', displayFileName);
              }
            }
          }
        }
      } catch (err) {
        console.error('UI last-resort filename decryption failed:', err);
      }
    } else {
      // Not encrypted, use as is
      displayFileName = fileData.fileName;
    }
  } else {
    displayFileName = 'Unknown file';
  }
  
  // Update file info if elements exist
  if (fileNameEl) fileNameEl.textContent = displayFileName;
  if (fileSizeEl) fileSizeEl.textContent = formatFileSize(fileData.fileSize || 0);
  if (fileMimeEl) fileMimeEl.textContent = fileData.fileType || 'unknown/type';
  
// Set file extension in icon if we can determine it
if (fileTypeIcon && displayFileName) {
  const extension = displayFileName.split('.').pop().toLowerCase();
  if (extension) {
    fileTypeIcon.setAttribute('data-extension', extension);
  } else {
    fileTypeIcon.removeAttribute('data-extension');
  }
}

// Schedule a post-render check to catch any text that might have been
// updated by other code paths after our function returns
setTimeout(() => {
  ensureDecryptedFilenameDisplay();
}, 0);
}

/**
 * Display text in the clipboard textarea
 * @param {string} text - Text to display
 */
export function displayTextContent(text) {
  const clipboardTextarea = getElement('clipboard-content');
  const imageContainer = getElement('image-container');
  
  if (!clipboardTextarea || !imageContainer) return;
  
  // Set text in textarea
  clipboardTextarea.value = text;
  
  // Show textarea, hide image
  clipboardTextarea.classList.remove('hidden');
  imageContainer.classList.add('hidden');
}

/**
 * Display image in the clipboard image container
 * @param {string} imageData - Base64 encoded image data
 */
export function displayImageContent(imageData) {
  const clipboardTextarea = getElement('clipboard-content');
  const imageContainer = getElement('image-container');
  const clipboardImage = getElement('clipboard-image');
  
  if (!clipboardTextarea || !imageContainer || !clipboardImage) return;
  
  // Set image source
  clipboardImage.src = imageData;
  
  // Hide textarea, show image
  clipboardTextarea.classList.add('hidden');
  imageContainer.classList.remove('hidden');
}

/**
 * Toggle monitoring status display
 * @param {boolean} isActive - Whether monitoring is active
 */
export function setMonitoringStatus(isActive) {
  const monitoringStatus = getElement('monitoring-status');
  
  if (!monitoringStatus) return;
  
  monitoringStatus.textContent = isActive ? 'Monitoring Active' : 'Monitoring Paused';
}

/**
 * Show difference banner between local and remote clipboard
 * @param {boolean} show - Whether to show the banner
 */
export function showDiffBanner(show) {
  const diffBanner = getElement('clipboard-diff-banner');
  
  if (!diffBanner) return;
  
  if (show) {
    diffBanner.classList.remove('hidden');
  } else {
    diffBanner.classList.add('hidden');
  }
}

/**
 * Update the connected devices panel with current client information
 * @param {Array} clients - Array of client objects with connection info
 */
export function updateConnectedDevices(clients) {
  const devicesContainer = getElement('connected-devices');
  const toggleButton = getElement('toggle-devices-btn');
  
  if (!devicesContainer || !toggleButton) return;
  
  // Clear existing content
  devicesContainer.innerHTML = '';
  
  if (!clients || clients.length === 0) {
    devicesContainer.innerHTML = '<div class="no-devices-message">No other devices connected</div>';
    return;
  }
  
  // Get the current client socketId for comparison
  // Use window.appSocket (the main socket reference throughout the app)
  const currentClientId = window.appSocket?.id || 'unknown';
  
  // Debug information 
  console.log('Current client ID:', currentClientId);
  console.log('All clients:', clients);
  console.log('Global socket reference info:', { 
    'appSocket exists': !!window.appSocket,
    'appSocket ID': window.appSocket?.id
  });
  
  // Count active clients for accurate display
  let activeClientCount = 0;
  
  // Create a card for each connected client
  clients.forEach(client => {
    const isCurrentClient = client.id === currentClientId;
    const isActive = client.active !== false; // Default to active if property missing
    
    if (isActive) {
      activeClientCount++;
    }
    
    // Format connected time
    const connectedTime = formatTimeAgo(client.connectedAt);
    
    // Create device card
    const deviceCard = document.createElement('div');
    deviceCard.className = 'device-card';
    
    // Add active/inactive status class
    if (!isActive) {
      deviceCard.classList.add('inactive-device');
    }
    
    // Create device icon
    const deviceIcon = document.createElement('div');
    deviceIcon.className = 'device-icon';
    
    // Choose icon based on browser and OS
    let iconContent = '💻';
    if (client.browserName === 'Chrome') iconContent = '🌐';
    if (client.browserName === 'Firefox') iconContent = '🦊';
    if (client.browserName === 'Safari') iconContent = '🧭';
    if (client.browserName === 'Edge') iconContent = '🔷';
    
    deviceIcon.textContent = iconContent;
    
    // Create device info
    const deviceInfo = document.createElement('div');
    deviceInfo.className = 'device-info';
    
    const deviceName = document.createElement('div');
    deviceName.className = 'device-name';
    
    // Debug log the client data to help diagnose display issues
    console.log('Client data for UI display:', {
      id: client.id,
      clientName: client.clientName,
      browserInfoClientName: client.browserInfo?.clientName,
      browserName: client.browserName,
      osName: client.osName
    });
    
    // IMPORTANT: Access socket.js clientName - user entered name takes highest priority
    // This is needed because sometimes the clientName doesn't make it through all the server transforms
    const sessionData = localStorage.getItem(CONFIG.storage.sessionKey);
    let localClientName = null;
    
    if (sessionData) {
      try {
        const parsedData = JSON.parse(sessionData);
        localClientName = parsedData.clientName;
        console.log('Retrieved client name from local storage:', localClientName);
      } catch (e) {
        console.error('Error parsing session data:', e);
      }
    }
    
    // Give highest priority to the locally stored client name for the current client only
    const displayName = isCurrentClient && localClientName 
      ? localClientName // Use locally stored name for current client
      : client.clientName || client.browserInfo?.clientName || `${client.browserName} on ${client.osName}`;
    
    deviceName.textContent = displayName;
    
    // Add additional debug in case name display is still wrong
    console.log(`Display name selected for client ${client.id}:`, displayName, isCurrentClient ? '(current client)' : '');
    
    const deviceTime = document.createElement('div');
    deviceTime.className = 'device-time';
    deviceTime.textContent = `Connected ${connectedTime}`;
    
    deviceInfo.appendChild(deviceName);
    deviceInfo.appendChild(deviceTime);
    
    // Create status indicator
    const deviceStatus = document.createElement('div');
    if (isCurrentClient) {
      deviceStatus.className = 'device-status current';
      deviceStatus.textContent = 'You';
    } else if (!isActive) {
      deviceStatus.className = 'device-status inactive';
      deviceStatus.textContent = 'Inactive';
    } else {
      deviceStatus.className = 'device-status active';
      deviceStatus.textContent = 'Active';
    }
    deviceCard.appendChild(deviceStatus);
    
    // Assemble the card
    deviceCard.appendChild(deviceIcon);
    deviceCard.appendChild(deviceInfo);
    
    // Add to container
    devicesContainer.appendChild(deviceCard);
  });
  
  // Update the toggle button text with active count
  toggleButton.textContent = `Connected Devices (${activeClientCount} active of ${clients.length})`;
}

/**
 * Toggle the connected devices panel visibility
 */
export function toggleDevicesPanel() {
  const devicesContainer = getElement('connected-devices');
  const toggleButton = getElement('toggle-devices-btn');
  
  if (!devicesContainer || !toggleButton) return;
  
  const isHidden = devicesContainer.classList.contains('hidden');
  
  if (isHidden) {
    devicesContainer.classList.remove('hidden');
    toggleButton.classList.add('active');
  } else {
    devicesContainer.classList.add('hidden');
    toggleButton.classList.remove('active');
  }
}

/**
 * Ensure filename displayed in the UI is decrypted
 * Checks DOM elements for encrypted filenames and attempts to decrypt them
 */
export function ensureDecryptedFilenameDisplay() {
  const fileNameEl = getElement('clipboard-file-name');
  if (!fileNameEl) return;
  
  const currentText = fileNameEl.textContent;
  
  // Check if this looks like an encrypted filename (starts with the AES marker "U2FsdGVk")
  if (currentText && typeof currentText === 'string' && currentText.startsWith('U2FsdGVk')) {
    console.log('Post-render encrypted filename detection:', currentText.substring(0, 30) + '...');
    
    // Try three approaches to decrypt
    
    // APPROACH 1: Try using window.originalFileData if available
    if (window.originalFileData && window.originalFileData.fileName) {
      console.log('Using originalFileData.fileName for post-render decryption');
      fileNameEl.textContent = window.originalFileData.fileName;
      return;
    }
    
    // APPROACH 2: Try using sharedFile._originalData if available via ContentHandlers
    if (window.ContentHandlers && window.ContentHandlers.getSharedFile) {
      const sharedFile = window.ContentHandlers.getSharedFile();
      if (sharedFile && sharedFile._originalData && sharedFile._originalData.fileName) {
        console.log('Using sharedFile._originalData.fileName for post-render decryption');
        fileNameEl.textContent = sharedFile._originalData.fileName;
        return;
      }
    }
    
    // APPROACH 3: Try decrypting directly if window.decryptData is available
    if (window.decryptData && window.Session) {
      try {
        const sessionData = window.Session.getCurrentSession();
        if (sessionData && sessionData.passphrase) {
          const decryptedName = window.decryptData(currentText, sessionData.passphrase);
          if (decryptedName && typeof decryptedName === 'string' && !decryptedName.startsWith('U2FsdGVk')) {
            console.log('Direct decryption successful in post-render check:', decryptedName);
            fileNameEl.textContent = decryptedName;
            return;
          }
        }
      } catch (err) {
        console.error('Error in post-render direct decryption:', err);
      }
    }
    
    // APPROACH 4: Last resort - try decrypting via decryptClipboardContent
    if (window.decryptClipboardContent && window.Session) {
      try {
        const sessionData = window.Session.getCurrentSession();
        if (sessionData && sessionData.passphrase) {
          const tempObj = {
            type: 'file',
            fileName: currentText
          };
          
          const decrypted = window.decryptClipboardContent(tempObj, sessionData.passphrase);
          if (decrypted && decrypted.fileName && !decrypted.fileName.startsWith('U2FsdGVk')) {
            console.log('decryptClipboardContent successful in post-render:', decrypted.fileName);
            fileNameEl.textContent = decrypted.fileName;
            return;
          }
        }
      } catch (err) {
        console.error('Error in post-render decryptClipboardContent:', err);
      }
    }
    
    console.warn('All post-render decryption approaches failed, leaving encrypted filename');
  }
}

/**
 * Set up observer to catch direct DOM updates to file name
 * This ensures encrypted filenames are decrypted even when set by other code paths
 */
export function setupFilenameObserver() {
  const fileNameEl = getElement('clipboard-file-name');
  if (!fileNameEl) return;
  
  console.log('Setting up filename observer for automatic decryption');
  
  // Create a new MutationObserver to watch for changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'characterData' || mutation.type === 'childList') {
        // Check if content looks encrypted
        const content = fileNameEl.textContent;
        if (content && content.startsWith('U2FsdGVk')) {
          console.log('Observer detected encrypted filename:', content.substring(0, 30) + '...');
          // Use our helper function to attempt decryption
          ensureDecryptedFilenameDisplay();
        }
      }
    });
  });
  
  // Begin observing the target node for configured mutations
  observer.observe(fileNameEl, { 
    childList: true, 
    characterData: true,
    subtree: true
  });
  
  return observer;
}

/**
 * Format a timestamp into a relative time ("2 minutes ago")
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} Formatted relative time
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'recently';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  
  if (isNaN(diffSec)) return 'recently';
  
  if (diffSec < 60) return `${diffSec} seconds ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minutes ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
  
  return `${Math.floor(diffSec / 86400)} days ago`;
}
