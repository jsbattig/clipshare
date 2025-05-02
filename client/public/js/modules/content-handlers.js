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
 * Download the current file
 */
export function downloadFile() {
  if (!sharedFile || !sharedFile.content) {
    UIManager.displayMessage('No file available to download', 'error', 3000);
    return;
  }
  
  try {
    // Get session data for decryption
    const sessionData = Session.getCurrentSession();
    if (!sessionData || !sessionData.passphrase) {
      console.error('Cannot decrypt file: No valid session passphrase');
      UIManager.displayMessage('Cannot download: Missing decryption key', 'error', 5000);
      return;
    }
    
    // Create a copy of the file data to decrypt
    const fileToDownload = {...sharedFile};
    
    // Check if content is encrypted (starts with the AES marker)
    if (typeof fileToDownload.content === 'string' && fileToDownload.content.startsWith('U2FsdGVk')) {
      console.log('Encrypted content detected, attempting to decrypt full content string');
      
      try {
        // Decrypt the ENTIRE content string - this is a full AES encrypted string
        // not a data URL with an encrypted part
        const decryptedContent = decryptData(fileToDownload.content, sessionData.passphrase);
        console.log('Successfully decrypted file content for download');
        fileToDownload.content = decryptedContent;
      } catch (decryptErr) {
        console.error('Failed to decrypt file content:', decryptErr);
        UIManager.displayMessage('Download failed: Could not decrypt file content', 'error', 5000);
        return;
      }
    }
    
    // If content still starts with "data:" but contains "U2FsdGVk", it might be a data URL with encrypted content
    // This is a fallback for potentially different encryption patterns
    if (typeof fileToDownload.content === 'string' && 
        fileToDownload.content.startsWith('data:') && 
        fileToDownload.content.includes('U2FsdGVk')) {
      
      console.log('Found data URL with encrypted content, attempting secondary decryption');
      
      // Extract the MIME type and base64 part
      const matches = fileToDownload.content.match(/^data:([^;]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const encryptedContent = matches[2];
        
        try {
          const decryptedContent = decryptData(encryptedContent, sessionData.passphrase);
          console.log('Successfully decrypted file content part for download');
          fileToDownload.content = `data:${mimeType};base64,${decryptedContent}`;
        } catch (decryptErr) {
          console.error('Failed to decrypt partial file content:', decryptErr);
          // Continue with what we have - don't return
        }
      }
    }
    
    // Use original filename if available on source client
    if (fileToDownload._displayFileName) {
      console.log('Using original filename for download:', fileToDownload._displayFileName);
      fileToDownload.fileName = fileToDownload._displayFileName;
    } 
    // Otherwise decrypt filename if it appears to be encrypted
    else if (fileToDownload.fileName && fileToDownload.fileName.startsWith('U2FsdGVk')) {
      try {
        fileToDownload.fileName = decryptData(fileToDownload.fileName, sessionData.passphrase);
        console.log('Successfully decrypted filename for download:', fileToDownload.fileName);
      } catch (decryptErr) {
        console.error('Failed to decrypt filename:', decryptErr);
        fileToDownload.fileName = 'download'; // Fallback to generic name
      }
    }
    
    // Create and trigger the download with decrypted data
    const linkEl = document.createElement('a');
    linkEl.href = fileToDownload.content;
    linkEl.download = fileToDownload.fileName || 'download';
    
    // Log download attempt for debugging
    console.log('Initiating download with:');
    console.log('- Filename:', fileToDownload.fileName);
    console.log('- Content type:', typeof fileToDownload.content);
    console.log('- Content starts with:', fileToDownload.content.substring(0, 50) + '...');
    
    // Append to document temporarily
    document.body.appendChild(linkEl);
    linkEl.click();
    document.body.removeChild(linkEl);
    
    UIManager.displayMessage(`Downloading: ${fileToDownload.fileName}`, 'success', 3000);
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
}

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
