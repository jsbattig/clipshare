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
  // Check if filename is encrypted (starts with the AES marker)
  if (fileData.fileName && fileData.fileName.startsWith('U2FsdGVk')) {
    console.log('Handling file with encrypted filename:', fileData.fileName.substring(0, 30) + '...');
    
    try {
      // Get session data for decryption
      const sessionData = Session.getCurrentSession();
      if (sessionData && sessionData.passphrase) {
        // Create a copy with decrypted filename for display
        const displayData = {...fileData};
        
        // Try to decrypt the filename
        const tempObj = {
          type: 'file',
          fileName: fileData.fileName
        };
        
        const decrypted = decryptClipboardContent(tempObj, sessionData.passphrase);
        if (decrypted && decrypted.fileName) {
          displayData.fileName = decrypted.fileName;
          console.log('Successfully decrypted filename for UI display:', displayData.fileName);
          
          // Pass the display-friendly data to UI
          UIManager.displayFileContent(displayData);
          return;
        }
      }
    } catch (err) {
      console.error('Error decrypting filename for display:', err);
    }
  }
  
  // If we get here, either the filename wasn't encrypted or decryption failed
  UIManager.displayFileContent(fileData);
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
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      console.error('Invalid data URL provided:', dataUrl?.substring(0, 30) + '...');
      return false;
    }
    
    // Parse the data URL
    const parts = dataUrl.split(';base64,');
    if (parts.length !== 2) {
      console.error('Invalid data URL format:', dataUrl.substring(0, 30) + '...');
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
 * Download the current file
 */
export function downloadFile() {
  console.log('========== DOWNLOAD DEBUG START ==========');
  
  // IMPROVED SENDER-SIDE APPROACH:
  // Check for globally stored original file data first (sender side)
  if (window.originalFileData && window.originalFileData.content) {
    console.log('SENDER SIDE: Using globally stored original file data');
    console.log('Original filename:', window.originalFileData.fileName);
    console.log('Content type:', typeof window.originalFileData.content);
    
    // Use Blob-based download instead of direct data URL
    const success = downloadAsBlob(
      window.originalFileData.content,
      window.originalFileData.fileName
    );
    
    if (success) {
      UIManager.displayMessage(`Downloading: ${window.originalFileData.fileName}`, 'success', 3000);
      console.log('========== DOWNLOAD DEBUG END ==========');
      return; // Exit early - no need for complex handling
    } else {
      console.error('Blob download failed, falling back to alternative methods');
      // Continue to fallback approaches
    }
  }
  
  if (!sharedFile) {
    UIManager.displayMessage('No file available to download', 'error', 3000);
    return;
  }
  
  // Log the state of the shared file and its original data (for debugging)
  console.log('DOWNLOAD INITIATED - SHARED FILE STATE:', {
    hasOriginalData: !!sharedFile._originalData,
    originalContentExists: sharedFile._originalData?.content ? 'Yes' : 'No',
    originalFileName: sharedFile._originalData?.fileName || 'None',
    sharedFileName: sharedFile.fileName || 'None',
    contentStart: (sharedFile.content || '').substring(0, 30) + '...',
    contentIsEncrypted: (sharedFile.content || '').startsWith('U2FsdGVk'),
    originalContentIsDataUrl: sharedFile._originalData?.content?.startsWith('data:') || false,
    currentContentIsDataUrl: sharedFile.content?.startsWith('data:') || false
  });
  
  try {
    // Get session data for possible decryption
    const sessionData = Session.getCurrentSession();
    
    // Choose the best source of file data
    // Create a copy to work with
    let fileToDownload;
    
    // Decision making process
    if (sharedFile._originalData && sharedFile._originalData.content) {
      console.log('Using _originalData for download (has valid content)');
      fileToDownload = {...sharedFile._originalData};
    } else {
      console.log('No valid _originalData available, using sharedFile directly');
      fileToDownload = {...sharedFile};
      
      // Extra check: If it appears we're on sender side but _originalData is missing
      if (sharedFile._displayFileName && !sharedFile._originalData) {
        console.log('WARNING: This appears to be sender (has _displayFileName) but _originalData is missing!');
      }
    }
    
    // Last resort: check if content needs decryption (for receiver side)
    if (typeof fileToDownload.content === 'string' && fileToDownload.content.startsWith('U2FsdGVk') && sessionData?.passphrase) {
      console.log('DECRYPTION: Content appears encrypted, attempting decryption');
      try {
        const decryptedContent = decryptData(fileToDownload.content, sessionData.passphrase);
        if (decryptedContent.startsWith('data:')) {
          console.log('Decryption succeeded! Content is now a valid data URL');
          fileToDownload.content = decryptedContent;
        } else {
          console.log('Decryption produced non-data-URL:', decryptedContent.substring(0, 30) + '...');
        }
      } catch (decryptErr) {
        console.error('Decryption failed:', decryptErr);
        // Continue with what we have
      }
    }
    
    // If content is missing or invalid
    if (!fileToDownload.content) {
      console.error('File content missing for download');
      UIManager.displayMessage('Cannot download: File content missing', 'error', 3000);
      return;
    }
    
    // Create download link with content
    const linkEl = document.createElement('a');
    linkEl.href = fileToDownload.content;
    
    // Use the best available filename
    const downloadFilename = fileToDownload.fileName || sharedFile.fileName || 'download';
    linkEl.download = downloadFilename;
    
    console.log('Initiating download with:');
    console.log('- Filename:', downloadFilename);
    console.log('- Content type:', typeof fileToDownload.content);
    console.log('- Content starts with:', fileToDownload.content.substring(0, 50) + '...');
    console.log('- Link href starts with:', linkEl.href.substring(0, 50) + '...');
    
    // Last check - if href still looks encrypted, one more attempt
    if (linkEl.href.startsWith('U2FsdGVk') && sessionData?.passphrase) {
      console.log('FINAL CHECK: href is still encrypted, making one final attempt');
      try {
        const finalDecrypted = decryptData(linkEl.href, sessionData.passphrase);
        if (finalDecrypted.startsWith('data:')) {
          console.log('Final decryption succeeded, replacing href');
          linkEl.href = finalDecrypted;
        }
      } catch (e) {
        console.error('Final decryption attempt failed:', e);
      }
    }
    
    console.log('========== DOWNLOAD DEBUG END ==========');
    
    // Append to document temporarily to trigger download
    document.body.appendChild(linkEl);
    linkEl.click();
    document.body.removeChild(linkEl);
    
    UIManager.displayMessage(`Downloading: ${downloadFilename}`, 'success', 3000);
  } catch (err) {
    console.error('Download failed:', err);
    UIManager.displayMessage('Failed to download file: ' + err.message, 'error', 3000);
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
  getDisplayFileData
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
  
  // If the filename looks encrypted (starts with the AES marker), try to decrypt it
  if (displayData.fileName && displayData.fileName.startsWith('U2FsdGVk')) {
    try {
      // Get session data for decryption
      const sessionData = Session.getCurrentSession();
      if (sessionData && sessionData.passphrase) {
        console.log('Attempting to decrypt filename for display');
        
        // Create a mini-object just for decrypting the filename
        const filenamePart = {
          type: 'file',
          _encrypted: true,
          fileName: displayData.fileName
        };
        
        // Decrypt just the filename
        const decrypted = decryptClipboardContent(filenamePart, sessionData.passphrase);
        
        // Use the decrypted filename
        displayData.fileName = decrypted.fileName || defaultName;
        console.log('Successfully decrypted filename:', displayData.fileName);
      }
    } catch (err) {
      console.error('Error decrypting filename for display:', err);
      displayData.fileName = defaultName;
    }
  }
  
  return displayData;
}
