/**
 * ClipShare Clipboard Monitor
 * 
 * Handles monitoring the system clipboard for changes and
 * reading content from the clipboard using various methods.
 */

import { CONFIG } from './config.js';
import { detectOperatingSystem, blobToBase64, dataURLtoBlob } from './utils.js';
import * as UIManager from './ui-manager.js';

// Module state
let pollingInterval = null;
let isMonitoring = true;
let isUserTyping = false;
let syncGracePeriod = false;
let lastClipboardContent = '';
let lastClipboardType = 'text';
let lastClipboardTimestamp = Date.now();
let lastContentOrigin = 'init';
let lastSyncAttemptTime = 0;
let typingTimer = null;

/**
 * Initialize the clipboard monitor module
 * @param {Object} initialState - Initial state for the monitor
 */
export function init(initialState = {}) {
  // Apply initial state if provided
  if (initialState.isMonitoring !== undefined) isMonitoring = initialState.isMonitoring;
  if (initialState.lastClipboardContent) lastClipboardContent = initialState.lastClipboardContent;
  if (initialState.lastClipboardType) lastClipboardType = initialState.lastClipboardType;
}

/**
 * Start monitoring the clipboard for changes
 * @param {Function} onContentChanged - Callback for content changes
 * @param {Function} updateUI - Callback to update UI
 */
export function startMonitoring(onContentChanged, updateUI) {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  
  isMonitoring = true;
  
  // Poll clipboard at regular intervals
  pollingInterval = setInterval(async () => {
    // Skip if not monitoring, user is typing, or we're in grace period
    if (!isMonitoring || isUserTyping || syncGracePeriod) return;
    
    try {
      const clipboardData = await readFromClipboard();
      
      // Skip if no data retrieved
      if (!clipboardData) return;
      
      // Skip file detection in clipboard monitoring
      if (clipboardData.type === 'file') {
        console.log('File detected in clipboard but ignoring - use drop zone instead');
        return;
      }
      
      // Add timestamp if missing
      if (typeof clipboardData === 'object' && !clipboardData.timestamp) {
        clipboardData.timestamp = Date.now();
      }
      
      // Check if content has changed
      if (hasContentChanged(clipboardData)) {
        // Skip if we should prioritize app content
        if (shouldPrioritizeAppContent()) {
          forceSystemClipboardToMatchApp();
          return;
        }
        
        // Content has changed - update and notify
        lastContentOrigin = 'local';
        
        // Notify callback
        if (onContentChanged) {
          onContentChanged(clipboardData, true);
        }
        
        // Update UI status
        if (updateUI) {
          updateUI('Local clipboard change detected');
        }
      }
    } catch (err) {
      console.error('Error reading clipboard:', err);
      if (updateUI) {
        updateUI('Error reading clipboard');
      }
    }
  }, CONFIG.polling.interval);
  
  return true;
}

/**
 * Stop clipboard monitoring
 */
export function stopMonitoring() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  
  isMonitoring = false;
  return true;
}

/**
 * Set user typing state
 * @param {boolean} typing - Whether user is typing
 * @param {Function} updateUI - UI update callback
 */
export function setUserTyping(typing, updateUI) {
  // Clear existing timer if any
  if (typingTimer) {
    clearTimeout(typingTimer);
    typingTimer = null;
  }
  
  isUserTyping = typing;
  
  // If user stopped typing, set a timer to resume monitoring
  if (!typing) {
    // Resume immediately
    if (updateUI) updateUI('Monitoring resumed');
  } else {
    // Set timer to resume after timeout
    typingTimer = setTimeout(() => {
      isUserTyping = false;
      if (updateUI) updateUI('Monitoring resumed');
    }, CONFIG.polling.typingTimeout);
  }
}

/**
 * Set grace period state
 * @param {boolean} inGracePeriod - Whether in grace period
 */
export function setGracePeriod(inGracePeriod) {
  syncGracePeriod = inGracePeriod;
  
  // Auto clear after timeout
  if (inGracePeriod) {
    setTimeout(() => {
      syncGracePeriod = false;
    }, CONFIG.sync.syncGracePeriodDuration);
  }
}

/**
 * Check if content has changed
 * @param {Object|string} newContent - New clipboard content
 * @returns {boolean} True if content has changed
 */
function hasContentChanged(newContent) {
  let contentChanged = false;
  let isContentSame = false;
  
  if (typeof lastClipboardContent === 'string' && typeof newContent === 'object') {
    // Old format vs new format
    if (newContent.type === 'text' && newContent.content === lastClipboardContent) {
      isContentSame = true;
    } else {
      contentChanged = true;
    }
  } else if (typeof lastClipboardContent === 'object' && typeof newContent === 'object') {
    // Both object format - check if content is same regardless of timestamp
    if (lastClipboardContent.type === newContent.type) {
      if (lastClipboardContent.type === 'text' && 
          lastClipboardContent.content === newContent.content) {
        isContentSame = true;
      } else if (lastClipboardContent.type === 'image' && 
                 lastClipboardContent.content === newContent.content) {
        isContentSame = true;
      }
    }
    
    // Only mark as changed if content is actually different
    contentChanged = !isContentSame;
  } else {
    // Simple string comparison (legacy)
    contentChanged = newContent !== lastClipboardContent;
  }
  
  return contentChanged;
}

/**
 * Check if we should prioritize app content over system clipboard
 * @returns {boolean} True if app content should be prioritized
 */
function shouldPrioritizeAppContent() {
  const now = Date.now();
  const timeSinceLastSync = now - lastSyncAttemptTime;
  
  return document.visibilityState === 'visible' && 
         lastContentOrigin === 'remote' && 
         timeSinceLastSync < CONFIG.sync.minTimeBetweenSyncs;
}

/**
 * Force system clipboard to match app content
 */
function forceSystemClipboardToMatchApp() {
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
}

/**
 * Read from clipboard using multiple methods
 * @returns {Promise<Object>} Promise resolving to clipboard content object
 */
export async function readFromClipboard() {
  try {
    // Detect OS for better clipboard format handling
    const operatingSystem = detectOperatingSystem();
    console.log(`Detected operating system: ${operatingSystem}`);
    
    // First try the modern clipboard API to check for images
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
          
          // We're not handling files via clipboard monitoring
          // to keep things simple and avoid duplicate file sharing logic
        }
        
        // If we get here, no image was found, try text
        console.log('No image found, trying text');
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
    
    // Method 2: execCommand approach (older browsers)
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
 * Sync an image to the system clipboard
 * @param {string} dataUrl - Image data URL
 * @param {string} imageType - MIME type of the image
 * @param {number} retryCount - Number of times to retry (internal)
 */
export function syncImageToClipboard(dataUrl, imageType, retryCount = 0) {
  if (!window.ClipboardItem) {
    console.log('ClipboardItem not supported, cannot sync images to system clipboard');
    return;
  }
  
  try {
    const blob = dataURLtoBlob(dataUrl);
    const clipboardItem = new ClipboardItem({
      [imageType]: blob
    });
    
    navigator.clipboard.write([clipboardItem]).catch(err => {
      console.error('Error syncing image to clipboard:', err);
      
      // Retry logic
      if (retryCount < CONFIG.sync.imageSyncRetries) {
        setTimeout(() => {
          syncImageToClipboard(dataUrl, imageType, retryCount + 1);
        }, CONFIG.sync.imageSyncRetryDelay);
      }
    });
  } catch (err) {
    console.error('Failed to prepare image for clipboard:', err);
  }
}

/**
 * Update the module's state with new clipboard content
 * @param {Object} content - New clipboard content
 */
export function updateContent(content) {
  if (typeof content === 'string') {
    lastClipboardContent = content;
    lastClipboardType = 'text';
  } else if (typeof content === 'object') {
    lastClipboardContent = content;
    lastClipboardType = content.type || 'text';
    
    if (content.timestamp) {
      lastClipboardTimestamp = content.timestamp;
    } else {
      lastClipboardTimestamp = Date.now();
      content.timestamp = lastClipboardTimestamp;
    }
  }
  
  // Update last sync time
  lastSyncAttemptTime = Date.now();
}

/**
 * Manually refresh from clipboard
 * @param {Function} onContentChanged - Callback for content changes
 */
export async function refreshFromClipboard(onContentChanged) {
  try {
    const clipboardData = await readFromClipboard();
    
    // Only update if we actually get a value and it's different
    if (clipboardData && hasContentChanged(clipboardData)) {
      if (onContentChanged) {
        onContentChanged(clipboardData, true);
      }
      return true;
    }
  } catch (err) {
    console.error('Error refreshing from clipboard:', err);
  }
  
  return false;
}

/**
 * Set content origin (local, remote, manual, init)
 * @param {string} origin - Content origin
 */
export function setContentOrigin(origin) {
  lastContentOrigin = origin;
}

/**
 * Get monitoring state
 * @returns {boolean} Current monitoring state
 */
export function getMonitoringState() {
  return isMonitoring;
}

/**
 * Get current clipboard type
 * @returns {string} Current clipboard type
 */
export function getCurrentType() {
  return lastClipboardType;
}
