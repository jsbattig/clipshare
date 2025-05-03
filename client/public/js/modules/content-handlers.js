/**
 * ClipShare Content Handlers
 * 
 * Handles different content types (text, image, file) and their
 * respective operations for clipboard synchronization.
 * Includes decryption support for encrypted content.
 */

import { CONFIG } from './config.js';
import { getElement, formatFileSize, getFileExtension } from './utils.js';
import * as UIManager from './ui-manager.js';
import * as ClipboardUtils from './clipboard-monitor.js';
import * as Session from './session.js';
import { decryptClipboardContent, decryptData } from './encryption.js';

// Module state
let currentContentState = CONFIG.contentTypes.EMPTY;
let sharedFile = null;

/**
 * Update the clipboard content in the UI and optionally send to server
 * @param {Object|string} content - Clipboard content
 * @param {boolean} sendToServer - Whether to send update to server
 * @param {Function} sendUpdateFn - Function to send update to server
 * @returns {Object} Processed content object
 */
export function updateClipboardContent(content, sendToServer = false, sendUpdateFn = null) {
  // Reset UI copy button state
  const copyBtn = getElement('copy-btn');
  if (copyBtn) {
    copyBtn.classList.remove('download-mode');
    copyBtn.textContent = 'Copy';
  }
  
  let clipboardData;
  
  // Process different content formats
  if (typeof content === 'string') {
    // Legacy string format - convert to object with text type
    clipboardData = { 
      type: 'text', 
      content: content,
      timestamp: Date.now()
    };
    
    // Handle text content in UI
    handleTextContent(content);
    currentContentState = CONFIG.contentTypes.TEXT;
    
    // No need to update clipboard monitor state anymore
    
  } else if (typeof content === 'object') {
    // Object format with type field
    clipboardData = content;
    
    // Make sure we have a timestamp
    if (!clipboardData.timestamp) {
      clipboardData.timestamp = Date.now();
    }
    
    // Handle based on content type
    if (content.type === 'text') {
      handleTextContent(content.content);
      currentContentState = CONFIG.contentTypes.TEXT;
      
    } else if (content.type === 'image') {
      handleImageContent(content.content);
      currentContentState = CONFIG.contentTypes.IMAGE;
      
    } else if (content.type === 'file') {
      handleFileContent(content);
      sharedFile = content;
      currentContentState = CONFIG.contentTypes.FILE;
    }
    
    // No need to update clipboard monitor state anymore
  }
  
  // Update content type indicator
  UIManager.updateContentTypeIndicator(currentContentState);
  
  // Send to server if requested and callback provided
  if (sendToServer && sendUpdateFn) {
    sendUpdateFn(clipboardData);
  }
  
  // Update last updated timestamp
  UIManager.updateLastUpdated();
  
  return clipboardData;
}

/**
 * Handle text content
 * @param {string} text - Text content
 */
export function handleTextContent(text) {
  UIManager.displayTextContent(text);
}

/**
 * Handle image content
 * @param {string} imageData - Base64 encoded image data
 */
export function handleImageContent(imageData) {
  UIManager.displayImageContent(imageData);
}

/**
 * Handle file content display
 * @param {Object} fileData - File data object
 */
export function handleFileContent(fileData) {
  // Create a display-friendly copy of the file data
  const displayData = {...fileData};
  
  // SIMPLIFY: Always use window.originalFileData.fileName if available (our single source of truth)
  if (window.originalFileData && window.originalFileData.fileName) {
    console.log('Using originalFileData.fileName as single source of truth:', window.originalFileData.fileName);
    displayData.fileName = window.originalFileData.fileName;
    UIManager.displayFileContent(displayData);
    return;
  }
  
  // FALLBACKS in priority order if window.originalFileData is not available:
  
  // 1. Check if the file has a pre-decrypted display filename
  if (fileData._displayFileName) {
    console.log('Using pre-defined _displayFileName for display:', fileData._displayFileName);
    displayData.fileName = fileData._displayFileName;
    UIManager.displayFileContent(displayData);
    return;
  }
  
  // 2. Check if we have original data in the file object
  if (fileData._originalData && fileData._originalData.fileName) {
    console.log('Using _originalData.fileName from file object:', fileData._originalData.fileName);
    displayData.fileName = fileData._originalData.fileName;
    UIManager.displayFileContent(displayData);
    return;
  }
  
  // FALLBACK: If we get here, use whatever filename we have
  console.log('Using fallback filename display method');
  UIManager.displayFileContent(displayData);
}

/**
 * Copy current content to clipboard
 */
export async function copyToClipboard() {
  try {
    if (currentContentState === CONFIG.contentTypes.TEXT) {
      const clipboardTextarea = getElement('clipboard-content');
      if (!clipboardTextarea) {
        throw new Error('Clipboard textarea not found');
      }
      
      const textContent = {
        type: 'text',
        content: clipboardTextarea.value,
        timestamp: Date.now()
      };
      
      // Use the ClipboardUtils to write to clipboard
      const success = await ClipboardUtils.writeToClipboard(textContent);
      
      if (success) {
        UIManager.displayMessage('Text copied to clipboard', 'success', 2000);
      } else {
        throw new Error('Failed to copy text');
      }
      
    } else if (currentContentState === CONFIG.contentTypes.IMAGE) {
      const clipboardImage = getElement('clipboard-image');
      if (!clipboardImage) {
        throw new Error('Clipboard image not found');
      }
      
      const imageContent = {
        type: 'image',
        content: clipboardImage.src,
        imageType: clipboardImage.dataset.mimeType || 'image/png',
        timestamp: Date.now()
      };
      
      // Use the ClipboardUtils to write to clipboard
      const success = await ClipboardUtils.writeToClipboard(imageContent);
      
      if (success) {
        UIManager.displayMessage('Image copied to clipboard', 'success', 2000);
      } else {
        throw new Error('Failed to copy image');
      }
      
    } else if (currentContentState === CONFIG.contentTypes.FILE) {
      downloadFile();
    }
  } catch (err) {
    console.error('Copy failed:', err);
    UIManager.displayMessage('Failed to copy: ' + (err.message || 'Unknown error'), 'error', 5000);
    
    // Last resort - prompt user to copy manually
    UIManager.displayMessage('Please use system copy functionality to copy the content', 'info', 4000);
  }
}

/**
 * Copy text to clipboard
 */
async function copyTextToClipboard() {
  const clipboardTextarea = getElement('clipboard-content');
  if (!clipboardTextarea) {
    throw new Error('Clipboard textarea not found');
  }
  
  const content = clipboardTextarea.value;
  
  // Try modern Clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      UIManager.displayMessage('Copied to clipboard', 'success', 2000);
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
      UIManager.displayMessage('Copied to clipboard (fallback method)', 'success', 2000);
    } else {
      throw new Error('execCommand copy failed');
    }
  } catch (fallbackError) {
    throw fallbackError; // Re-throw for the outer catch
  }
}

/**
 * Copy image to clipboard
 */
async function copyImageToClipboard() {
  const clipboardImage = getElement('clipboard-image');
  if (!clipboardImage) {
    throw new Error('Clipboard image not found');
  }
  
  // Try to copy the image
  if (navigator.clipboard && window.ClipboardItem) {
    try {
      // Get the image data
      const imageURL = clipboardImage.src;
      const blob = await fetch(imageURL).then(r => r.blob());
      
      // Create a ClipboardItem
      const clipboardItem = new ClipboardItem({
        [blob.type]: blob
      });
      
      // Write to clipboard
      await navigator.clipboard.write([clipboardItem]);
      UIManager.displayMessage('Image copied to clipboard', 'success', 2000);
      return;
    } catch (imgError) {
      console.error('Image copy to clipboard failed:', imgError);
      UIManager.displayMessage('Could not copy image to clipboard (browser limitation)', 'error', 3000);
      throw imgError;
    }
  } else {
    UIManager.displayMessage('Browser does not support copying images to clipboard', 'info', 3000);
    throw new Error('Browser does not support ClipboardItem for images');
  }
}

/**
 * Helper function to convert data URL to Blob and download
 * Much more reliable than using data URLs directly in href
 * @param {string} dataUrl - The data URL to download
 * @param {string} filename - The filename to use for download
 * @returns {boolean} Whether the download was successful
 */
function downloadAsBlob(dataUrl, filename) {
  try {
    console.log('Converting data URL to Blob for download');
    
    // Check if we have a valid data URL
    if (!dataUrl || typeof dataUrl !== 'string') {
      console.error('Invalid data URL provided - null or not a string');
      return false;
    }
    
    if (!dataUrl.startsWith('data:')) {
      console.error('Invalid data URL provided - does not start with "data:"');
      console.log('Content starts with:', dataUrl.substring(0, 30) + '...');
      return false;
    }
    
    // Parse the data URL
    const parts = dataUrl.split(';base64,');
    if (parts.length !== 2) {
      console.error('Invalid data URL format - could not split into parts');
      return false;
    }
    
    // Get content type and base64 data
    const contentType = parts[0].split(':')[1];
    const base64Data = parts[1];
    
    // Convert base64 to binary
    const raw = window.atob(base64Data);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    
    // Create Blob and URL
    const blob = new Blob([uInt8Array], {type: contentType});
    const url = URL.createObjectURL(blob);
    
    console.log('Blob created successfully:', {
      size: blob.size,
      type: blob.type,
      url: url.substring(0, 30) + '...'
    });
    
    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    // Trigger download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up the URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    console.log('Download initiated via Blob');
    return true;
  } catch (err) {
    console.error('Error in downloadAsBlob:', err);
    return false;
  }
}

/**
 * Get the best available file data for download
 * Works consistently for both sender and receiver sides
 * @returns {Object} File data with clean content and filename
 */
function getBestFileData() {
  console.log('Finding best file data source for download');
  
  // Create result object with defaults
  const result = {
    content: null,
    fileName: 'download',
    success: false
  };
  
  // PRIORITY 1: Use window.originalFileData if available (original sender data)
  if (window.originalFileData && 
      window.originalFileData.content && 
      typeof window.originalFileData.content === 'string' &&
      window.originalFileData.content.startsWith('data:')) {
    
    console.log('PRIORITY 1: Using globally stored original file data');
    result.content = window.originalFileData.content;
    result.fileName = window.originalFileData.fileName || result.fileName;
    result.success = true;
    return result;
  }
  
  // Exit if no shared file exists
  if (!sharedFile) {
    console.error('No shared file available');
    return result;
  }
  
  // PRIORITY 2: Use sharedFile._originalData if available (compatible with existing code)
  if (sharedFile._originalData && 
      sharedFile._originalData.content && 
      typeof sharedFile._originalData.content === 'string' &&
      sharedFile._originalData.content.startsWith('data:')) {
    
    console.log('PRIORITY 2: Using _originalData from sharedFile');
    result.content = sharedFile._originalData.content;
    result.fileName = sharedFile._originalData.fileName || sharedFile.fileName || result.fileName;
    result.success = true;
    return result;
  }
  
  // PRIORITY 3: If content is already a valid data URL, use it directly
  if (sharedFile.content && 
      typeof sharedFile.content === 'string' && 
      sharedFile.content.startsWith('data:')) {
    
    console.log('PRIORITY 3: Using direct data URL from sharedFile');
    result.content = sharedFile.content;
    result.fileName = sharedFile.fileName || result.fileName;
    result.success = true;
    return result;
  }
  
  // PRIORITY 4: Attempt to decrypt the content if it looks encrypted
  const sessionData = Session.getCurrentSession();
  if (sharedFile.content && 
      typeof sharedFile.content === 'string' && 
      sharedFile.content.startsWith('U2FsdGVk') && 
      sessionData?.passphrase) {
    
    console.log('PRIORITY 4: Attempting to decrypt encrypted content');
    try {
      const decryptedContent = decryptData(sharedFile.content, sessionData.passphrase);
      if (decryptedContent && decryptedContent.startsWith('data:')) {
        console.log('Successfully decrypted to valid data URL');
        result.content = decryptedContent;
        
        // Try to get a clean filename too
        if (sharedFile.fileName && sharedFile.fileName.startsWith('U2FsdGVk')) {
          try {
            const tempObj = {
              type: 'file',
              fileName: sharedFile.fileName
            };
            const decrypted = decryptClipboardContent(tempObj, sessionData.passphrase);
            if (decrypted && decrypted.fileName) {
              result.fileName = decrypted.fileName;
            }
          } catch (e) {
            console.error('Failed to decrypt filename:', e);
          }
        } else {
          result.fileName = sharedFile.fileName || result.fileName;
        }
        
        result.success = true;
        return result;
      } else {
        console.error('Decryption did not produce a valid data URL');
      }
    } catch (decryptErr) {
      console.error('Decryption failed:', decryptErr);
    }
  }
  
  // If we got here, we couldn't find valid content
  console.error('Failed to find valid file data for download');
  return result;
}

/**
 * Single unified download function that works for all scenarios
 * Use this function for ALL file downloads from anywhere in the app
 */
export function downloadFile() {
  console.log('========== UNIFIED DOWNLOAD STARTED ==========');
  
  // Get the best file data from any available source
  const fileData = getBestFileData();
  
  if (!fileData.success) {
    UIManager.displayMessage('No file available to download', 'error', 3000);
    console.log('========== DOWNLOAD FAILED ==========');
    return;
  }
  
  // Always use our Blob-based approach for consistent, reliable downloads
  const downloadSuccess = downloadAsBlob(fileData.content, fileData.fileName);
  
  if (downloadSuccess) {
    UIManager.displayMessage(`Downloading: ${fileData.fileName}`, 'success', 3000);
    console.log('========== DOWNLOAD SUCCEEDED ==========');
  } else {
    UIManager.displayMessage('Failed to download file', 'error', 3000);
    console.log('========== DOWNLOAD FAILED ==========');
  }
}

/**
 * Get current content state
 * @returns {string} Current content state
 */
export function getCurrentContentState() {
  return currentContentState;
}

/**
 * Get shared file
 * @returns {Object|null} Current shared file
 */
export function getSharedFile() {
  return sharedFile;
}

/**
 * Set shared file
 * @param {Object} fileData - File data to set as shared file
 */
export function setSharedFile(fileData) {
  // Store the file data
  sharedFile = fileData;
  
  // For debugging encrypted filenames
  if (fileData && fileData.fileName) {
    console.log('Setting shared file with fileName:', fileData.fileName);
    if (fileData.fileName.startsWith('U2FsdGVk')) {
      console.log('Warning: Filename appears to be encrypted:', fileData.fileName.substring(0, 30) + '...');
    }
  }
  
  // Check if we have original data that should be preserved for downloads
  if (fileData && fileData._originalData) {
    console.log('IMPORTANT: SharedFile has _originalData, will be used for downloads');
    console.log('Original data filename:', fileData._originalData.fileName);
    console.log('Original data content starts with:', 
      fileData._originalData.content?.substring(0, 30) + '...');
  }
}

/**
 * Get decrypted filename from any encrypted filename
 * @param {string} encryptedFileName - Potentially encrypted filename
 * @returns {string} Decrypted filename or original if already decrypted
 */
/**
 * Get the best filename to display, always using window.originalFileData as the single source of truth
 * @param {string} fileName - Input filename (potentially encrypted)
 * @returns {string} The best available filename from our single source of truth
 */
export function getDecryptedFilename(fileName) {
  // SIMPLEST APPROACH: Always use window.originalFileData if available (our single source of truth)
  if (window.originalFileData && window.originalFileData.fileName) {
    console.log('getDecryptedFilename: Using originalFileData.fileName as source of truth:', window.originalFileData.fileName);
    return window.originalFileData.fileName;
  }
  
  // If we don't have window.originalFileData, try the shared file 
  const currentSharedFile = getSharedFile();
  
  // Check for pre-decrypted display filename
  if (currentSharedFile && currentSharedFile._displayFileName) {
    console.log('getDecryptedFilename: Using _displayFileName:', currentSharedFile._displayFileName);
    return currentSharedFile._displayFileName;
  }
  
  // Check for original data
  if (currentSharedFile && currentSharedFile._originalData && currentSharedFile._originalData.fileName) {
    console.log('getDecryptedFilename: Using _originalData.fileName:', currentSharedFile._originalData.fileName);
    return currentSharedFile._originalData.fileName;
  }
  
  // Return the input filename as last resort
  return fileName || "Unknown file";
}

// Export ContentHandlers to window for global access
// This allows direct access from file-operations.js
window.ContentHandlers = {
  setSharedFile,
  getSharedFile,
  downloadFile,
  getCurrentContentState,
  updateClipboardContent,
  copyToClipboard,
  handleTextContent,
  handleImageContent,
  handleFileContent,
  getDisplayFileData,
  getDecryptedFilename
};

// Log that the global export is ready
console.log('ContentHandlers exported to window object for global access');

/**
 * Ensure file data has decrypted filename for display
 * @param {Object} fileData - File data object that might have encrypted fields
 * @param {string} [defaultName='Unknown file'] - Default filename if decryption fails
 * @returns {Object} File data with display-friendly properties
 */
export function getDisplayFileData(fileData, defaultName = 'Unknown file') {
  if (!fileData) return null;
  
  // Create a copy for display purposes
  const displayData = {...fileData};
  
  // SIMPLIFIED: Always use window.originalFileData if available (our single source of truth)
  if (window.originalFileData && window.originalFileData.fileName) {
    console.log('getDisplayFileData: Using originalFileData.fileName as source of truth:', window.originalFileData.fileName);
    displayData.fileName = window.originalFileData.fileName;
    return displayData;
  }
  
  // FALLBACKS in priority order:
  
  // 1. Check if the file has a pre-decrypted display filename
  if (fileData._displayFileName) {
    console.log('getDisplayFileData: Using _displayFileName:', fileData._displayFileName);
    displayData.fileName = fileData._displayFileName;
    return displayData;
  }
  
  // 2. Check if we have original data in the file object
  if (fileData._originalData && fileData._originalData.fileName) {
    console.log('getDisplayFileData: Using _originalData.fileName:', fileData._originalData.fileName);
    displayData.fileName = fileData._originalData.fileName;
    return displayData;
  }
  
  if (displayData.fileName && displayData.fileName.startsWith('U2FsdGVk')) {
    try {
      const sessionData = window.Session.getCurrentSession();
      if (sessionData && sessionData.passphrase) {
        console.log('Attempting to decrypt filename for display');
        
        // Create a mini-object just for decrypting the filename
        const filenamePart = {
          type: 'file',
          fileName: displayData.fileName
        };
        
        const decrypted = window.decryptClipboardContent(filenamePart, sessionData.passphrase);
        
        // Use the decrypted filename
        if (decrypted && decrypted.fileName) {
          displayData.fileName = decrypted.fileName;
          console.log('Successfully decrypted filename:', displayData.fileName);
        } else {
          displayData.fileName = defaultName;
        }
      }
    } catch (err) {
      console.error('Error decrypting filename for display:', err);
      displayData.fileName = defaultName;
    }
  }
  
  return displayData;
}
