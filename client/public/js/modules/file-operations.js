/**
 * ClipShare File Operations
 * 
 * Handles file uploading, download, and sharing operations.
 */

import { CONFIG } from './config.js';
import { formatFileSize, getFileExtension, getMimeTypeFromExtension, dataURLtoBlob } from './utils.js';
import * as UIManager from './ui-manager.js';
import * as Session from './session.js';
import { encryptClipboardContent } from './encryption.js';

// Module state
let droppedFiles = [];
let fileTransferInProgress = false;

/**
 * Process file drop event
 * @param {DragEvent} event - Drop event
 * @param {Function} onSingleFile - Callback for single file handling
 * @param {Function} onMultipleFiles - Callback for multiple files handling
 */
export function handleFileDrop(event, onSingleFile, onMultipleFiles) {
  event.preventDefault();
  
  // Remove active drag styling
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) dropZone.classList.remove('drag-active');
  
  // Get all dropped files
  const files = Array.from(event.dataTransfer.files);
  
  if (files.length === 0) {
    UIManager.displayMessage('No files detected', 'error', 3000);
    return;
  }
  
  if (files.length === 1) {
    // Single file - process normally
    handleSingleFileUpload(files[0], onSingleFile);
  } else {
    // Multiple files - collect and show indicator
    handleMultipleFiles(files, onMultipleFiles);
  }
}

/**
 * Process a single file upload
 * @param {File} file - File object from drop event
 * @param {Function} onFileProcessed - Callback for when file is processed
 */
export function handleSingleFileUpload(file, onFileProcessed) {
  if (file.size > CONFIG.files.maxFileSize) {
    UIManager.displayMessage(
      `File too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(CONFIG.files.maxFileSize)}.`, 
      'error', 
      5000
    );
    return;
  }
  
  // Mark transfer in progress
  fileTransferInProgress = true;
  
  const reader = new FileReader();
  
  reader.onload = function(e) {
    // Create file data object
    const fileData = {
      type: 'file',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || getMimeTypeFromExtension(file.name),
      content: e.target.result,
      timestamp: Date.now()
    };
    
    // Hide drop zone
    UIManager.hideDropZone();
    
    // Call the callback with processed file data
    if (onFileProcessed) {
      // Always encrypt the file data before sending
      const sessionData = Session.getCurrentSession();
      if (sessionData && sessionData.passphrase) {
        try {
          console.log(`Encrypting file '${file.name}' before sending`);
          
          // CRITICAL: Store a complete copy of the original file data
          // before encryption for local use (download, display)
          const originalFileData = {
            type: 'file',
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || getMimeTypeFromExtension(file.name),
            content: e.target.result,  // This is the raw data URL from FileReader
            timestamp: Date.now()
          };
          
          // Log the original file data being stored
          console.log('ORIGINAL FILE DATA BEING STORED:', {
            fileName: originalFileData.fileName,
            fileSize: originalFileData.fileSize,
            contentStart: originalFileData.content.substring(0, 30) + '...',
            contentIsDataUrl: originalFileData.content.startsWith('data:')
          });
          
          // Encrypt the file data for transmission (using a copy to avoid modifying original)
          const encryptedFileData = encryptClipboardContent({...fileData}, sessionData.passphrase);
          
          // Store the original unencrypted data in the encrypted data
          // Using direct assignment to ensure reference is preserved
          encryptedFileData._originalData = originalFileData;
          
          // Also preserve original filename for display
          encryptedFileData._displayFileName = file.name;
          
          // IMMEDIATE VERIFICATION OF ORIGINAL DATA
          if (encryptedFileData._originalData && 
              encryptedFileData._originalData.content && 
              encryptedFileData._originalData.content.startsWith('data:')) {
            console.log('✓ VERIFIED: Original data successfully stored and is a valid data URL');
          } else {
            console.error('❌ WARNING: Original data verification failed!', {
              hasOriginalData: !!encryptedFileData._originalData,
              hasContent: encryptedFileData._originalData ? !!encryptedFileData._originalData.content : false,
              contentStart: encryptedFileData._originalData?.content?.substring(0, 30) + '...' || 'none',
              isDataUrl: encryptedFileData._originalData?.content?.startsWith('data:')
            });
          }
          
          // DIRECTLY STORE A REFERENCE TO THE SHARED FILE
          // This bypasses any potential reference loss in the callback chain
          // Import needed at the top: import { setSharedFile } from './content-handlers.js';
          if (typeof window.ContentHandlers !== 'undefined' && 
              typeof window.ContentHandlers.setSharedFile === 'function') {
            console.log('Directly setting shared file with original data in ContentHandlers');
            window.ContentHandlers.setSharedFile(encryptedFileData);
          }
          
          onFileProcessed(encryptedFileData);
          UIManager.displayMessage(`File "${file.name}" encrypted and processed`, 'success', 3000);
        } catch (error) {
          console.error('Failed to encrypt file:', error);
          UIManager.displayMessage('Failed to encrypt file.', 'error', 5000);
          // Don't send the file unencrypted - encryption is required
          return;
        }
      } else {
        console.error('No session passphrase available for encryption');
        UIManager.displayMessage('Cannot send file: Missing encryption key', 'error', 5000);
        return;
      }
    }
    
    // Update UI
    UIManager.displayMessage(`File "${file.name}" processed`, 'success', 3000);
    
    // Reset transfer status
    fileTransferInProgress = false;
  };
  
  reader.onerror = function() {
    console.error('Error reading file:', file.name);
    UIManager.displayMessage(`Error reading file: ${file.name}`, 'error', 3000);
    fileTransferInProgress = false;
  };
  
  // Display loading message
  UIManager.displayMessage(`Reading file: ${file.name}...`, 'info', 0);
  
  // Read file as data URL
  reader.readAsDataURL(file);
}

/**
 * Handle multiple files dropped at once
 * @param {File[]} files - Array of File objects
 * @param {Function} onMultipleFilesSelected - Callback when multiple files selected
 */
export function handleMultipleFiles(files, onMultipleFilesSelected) {
  // Store files for later use
  droppedFiles = files;
  
  // Check total size
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > CONFIG.files.maxFileSize * 2) {
    UIManager.displayMessage(
      `Files too large (${formatFileSize(totalSize)}). Try dropping fewer files.`, 
      'error', 
      5000
    );
    return;
  }
  
  // Update multi-file indicator
  UIManager.updateFileCountDisplay(files.length);
  
  // Display message with file list
  let fileListHtml = `<strong>${files.length} files selected:</strong><br>`;
  files.slice(0, 5).forEach(file => {
    fileListHtml += `- ${file.name} (${formatFileSize(file.size)})<br>`;
  });
  
  if (files.length > 5) {
    fileListHtml += `...and ${files.length - 5} more`;
  }
  
  UIManager.displayHTMLMessage(fileListHtml, 'info', 0);
  
  // Call callback if provided
  if (onMultipleFilesSelected) {
    onMultipleFilesSelected(files);
  }
}

/**
 * Create and share a ZIP archive containing multiple files
 * @param {File[]} files - Array of files to include in the ZIP
 * @param {Function} onZipCreated - Callback when ZIP is created
 */
export async function createAndShareZip(files, onZipCreated) {
  if (!window.JSZip) {
    UIManager.displayMessage('ZIP library not loaded. Cannot create archive.', 'error', 3000);
    return;
  }
  
  try {
    UIManager.displayMessage('Creating ZIP archive...', 'info', 0);
    
    // Generate a filename with date
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    const zipFileName = `clipboard_files_${dateStr}_${timeStr}.zip`;
    
    // Create new ZIP file
    const zip = new JSZip();
    
    // Add each file to the ZIP
    let processedCount = 0;
    let totalSize = 0;
    
    for (const file of files) {
      await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          try {
            // Add file to zip with original name
            zip.file(file.name, e.target.result);
            processedCount++;
            totalSize += file.size;
            
            // Update progress message
            UIManager.displayMessage(`Adding files to ZIP: ${processedCount}/${files.length}`, 'info', 0);
            
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    }
    
    // Generate ZIP file
    UIManager.displayMessage('Compressing files...', 'info', 0);
    const zipContent = await zip.generateAsync({
      type: 'base64',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    
    // Create file data object
    const fileData = {
      type: 'file',
      fileName: zipFileName,
      fileSize: Math.round((zipContent.length * 3) / 4), // Approximate size from base64
      fileType: 'application/zip',
      content: `data:application/zip;base64,${zipContent}`,
      isArchive: true,
      fileCount: files.length,
      timestamp: Date.now()
    };
    
    // Hide UI elements
    UIManager.hideDropZone();
    
    // Call the callback with the ZIP data
    if (onZipCreated) {
      // Always encrypt the ZIP data before sending
      const sessionData = Session.getCurrentSession();
      if (sessionData && sessionData.passphrase) {
        try {
          console.log('Encrypting ZIP archive before sending');
          const encryptedZipData = encryptClipboardContent(fileData, sessionData.passphrase);
          onZipCreated(encryptedZipData);
          UIManager.displayMessage(`ZIP archive encrypted and ready to share`, 'success', 3000);
        } catch (error) {
          console.error('Failed to encrypt ZIP archive:', error);
          UIManager.displayMessage('Failed to encrypt ZIP archive.', 'error', 5000);
          // Don't send the file unencrypted - encryption is required
          return;
        }
      } else {
        console.error('No session passphrase available for encryption');
        UIManager.displayMessage('Cannot send ZIP: Missing encryption key', 'error', 5000);
        return;
      }
    }
    
    UIManager.displayMessage(`ZIP archive with ${files.length} files created`, 'success', 3000);
    
    // Reset dropped files
    droppedFiles = [];
    UIManager.updateFileCountDisplay(0);
    
  } catch (err) {
    console.error('Error creating ZIP:', err);
    UIManager.displayMessage('Failed to create ZIP file: ' + err.message, 'error', 5000);
  }
}

/**
 * Download shared file
 * @param {Object} fileData - File data object
 */
export function downloadSharedFile(fileData) {
  if (!fileData || !fileData.content) {
    UIManager.displayMessage('No file to download', 'error', 2000);
    return;
  }
  
  try {
    // Create download link
    const linkEl = document.createElement('a');
    linkEl.href = fileData.content;
    linkEl.download = fileData.fileName || 'download-file';
    linkEl.style.display = 'none';
    
    // Add to document and trigger click
    document.body.appendChild(linkEl);
    linkEl.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(linkEl);
    }, 100);
    
    UIManager.displayMessage(`File "${fileData.fileName}" downloaded successfully`, 'success', 3000);
  } catch (err) {
    console.error('Download failed:', err);
    UIManager.displayMessage('Failed to download file: ' + (err.message || 'Unknown error'), 'error');
  }
}

/**
 * Get current dropped files
 * @returns {File[]} Array of dropped files
 */
export function getDroppedFiles() {
  return droppedFiles;
}

/**
 * Check if file transfer is in progress
 * @returns {boolean} True if transfer in progress
 */
export function isFileTransferInProgress() {
  return fileTransferInProgress;
}

/**
 * Set file transfer progress status
 * @param {boolean} inProgress - Whether transfer is in progress
 */
export function setFileTransferInProgress(inProgress) {
  fileTransferInProgress = inProgress;
}

/**
 * Clear dropped files
 */
export function clearDroppedFiles() {
  droppedFiles = [];
  UIManager.updateFileCountDisplay(0);
}
