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
  
  // Update file info if elements exist
  if (fileNameEl) fileNameEl.textContent = fileData.fileName || 'Unknown file';
  if (fileSizeEl) fileSizeEl.textContent = formatFileSize(fileData.fileSize || 0);
  if (fileMimeEl) fileMimeEl.textContent = fileData.fileType || 'unknown/type';
  
  // Set file extension in icon if we can determine it
  if (fileTypeIcon && fileData.fileName) {
    const extension = fileData.fileName.split('.').pop().toLowerCase();
    if (extension) {
      fileTypeIcon.setAttribute('data-extension', extension);
    } else {
      fileTypeIcon.removeAttribute('data-extension');
    }
  }
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
