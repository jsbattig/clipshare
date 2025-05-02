/**
 * ClipShare File Operations
 * 
 * Handles file uploading, download, and sharing operations.
 */

import { CONFIG } from './config.js';
import { formatFileSize, getFileExtension, getMimeTypeFromExtension, dataURLtoBlob } from './utils.js';
import * as UIManager from './ui-manager.js';
import * as Session from './session.js';
import { encryptClipboardContent, encryptClipboardContentAsync } from './encryption.js';

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

// Web Worker instance
let fileWorker = null;

/**
 * Get or create Web Worker for file processing
 * @returns {Worker} Web Worker instance
 */
function getFileWorker() {
  if (!fileWorker) {
    try {
      fileWorker = new Worker('js/workers/file-processor.worker.js');
      console.log('File processor worker created');
      
      // Set up global error handler
      fileWorker.onerror = function(event) {
        console.error('File worker error:', event);
        UIManager.displayMessage('Error in file processing', 'error', 5000);
      };
    } catch (err) {
      console.error('Failed to create Web Worker:', err);
      // Return null to indicate worker creation failed
      return null;
    }
  }
  return fileWorker;
}

/**
 * Process a single file upload with Web Worker for large files
 * @param {File} file - File object from drop event
 * @param {Function} onFileProcessed - Callback for when file is processed
 */
export async function handleSingleFileUpload(file, onFileProcessed) {
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
  
  try {
    // Show initial processing message
    UIManager.displayMessage(`Reading file: ${file.name}...`, 'info', 0);
    
    // Read file as data URL
    const fileContent = await readFileAsDataURL(file);
    
    console.log(`File read complete: ${file.name}, size: ${formatFileSize(file.size)}`);
    UIManager.displayMessage(`Processing file: ${file.name}...`, 'info', 0);
    
    // Store original file data globally for download
    // This ensures it's always accessible even if references are lost
    window.originalFileData = {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || getMimeTypeFromExtension(file.name),
      content: fileContent,
      timestamp: Date.now(),
      isOriginal: true
    };
    
    // LARGE FILES: Use Web Worker for encryption
    // Small files: Use async encryption method
    if (file.size > 50000) { // 50KB threshold for using worker - lowered from 500KB to handle medium files better
      await processLargeFileWithWorker(file, fileContent, onFileProcessed);
    } else {
      await processFileWithAsyncEncryption(file, fileContent, onFileProcessed);
    }
    
    // Reset transfer status
    fileTransferInProgress = false;
    
  } catch (error) {
    console.error('Error processing file:', error);
    UIManager.displayMessage(`Error processing file: ${error.message}`, 'error', 5000);
    UIManager.hideDropZone();
    fileTransferInProgress = false;
  }
}

/**
 * Process large file with Web Worker to prevent socket disconnections
 * @param {File} file - File object
 * @param {string} fileContent - File content as data URL
 * @param {Function} onFileProcessed - Callback for completed processing
 */
async function processLargeFileWithWorker(file, fileContent, onFileProcessed) {
  console.log('Processing large file with Web Worker:', file.name);
  
  // Get session data for encryption
  const sessionData = Session.getCurrentSession();
  if (!sessionData || !sessionData.passphrase) {
    console.error('No session passphrase available for encryption');
    UIManager.displayMessage('Cannot send file: Missing encryption key', 'error', 5000);
    UIManager.hideDropZone();
    return;
  }
  
  // Show worker processing message
  UIManager.displayMessage(`Encrypting large file in background: ${file.name}`, 'info', 0);
  
  return new Promise((resolve, reject) => {
    // Get or create worker
    const worker = getFileWorker();
    
    if (!worker) {
      // Web Workers not supported - fall back to async encryption
      UIManager.displayMessage('Web Workers not supported - using fallback method', 'info', 3000);
      processFileWithAsyncEncryption(file, fileContent, onFileProcessed)
        .then(resolve)
        .catch(reject);
      return;
    }
    
    // Set up message handler for this specific file
    worker.onmessage = function(e) {
      const response = e.data;
      
      if (response.status === 'progress') {
        // Update progress message
        UIManager.displayMessage(
          `Processing file: ${response.progress}% - ${response.message}`, 
          'info', 
          0
        );
      } 
      else if (response.status === 'complete') {
        console.log('Web Worker completed file processing');
        
        // Create the complete processed file data
        const encryptedFileData = response.encryptedData;
        
        // Add original data reference for download
        encryptedFileData._originalData = {...window.originalFileData};
        encryptedFileData._displayFileName = file.name;
        
        // Hide the drop zone now that processing is complete
        UIManager.hideDropZone();
        
        // Store in content handlers
        if (typeof window.ContentHandlers !== 'undefined' && 
            typeof window.ContentHandlers.setSharedFile === 'function') {
          console.log('Directly setting shared file with original data in ContentHandlers');
          window.ContentHandlers.setSharedFile(encryptedFileData);
        }
        
        // Call the callback
        if (onFileProcessed) {
          onFileProcessed(encryptedFileData);
        }
        
        UIManager.displayMessage(`File "${file.name}" processed in background thread`, 'success', 3000);
        resolve();
      } 
      else if (response.status === 'error') {
        console.error('Worker reported error:', response.error);
        UIManager.displayMessage('Error processing file: ' + response.error, 'error', 5000);
        UIManager.hideDropZone();
        reject(new Error(response.error));
      }
    };
    
    // Send file to worker for processing
    worker.postMessage({
      action: 'process',
      fileData: fileContent,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || getMimeTypeFromExtension(file.name),
      passphrase: sessionData.passphrase
    });
    
    console.log('File sent to worker for processing');
  });
}

/**
 * Process file with async encryption for medium-sized files
 * @param {File} file - File object
 * @param {string} fileContent - File content as data URL
 * @param {Function} onFileProcessed - Callback for completed processing
 */
async function processFileWithAsyncEncryption(file, fileContent, onFileProcessed) {
  console.log('Processing file with async encryption:', file.name);
  
  // Show encryption message for larger files
  if (file.size > 100000) {
    UIManager.displayMessage(`Encrypting file "${file.name}"...`, 'info', 0);
  }
  
  // Get session data for encryption
  const sessionData = Session.getCurrentSession();
  if (!sessionData || !sessionData.passphrase) {
    console.error('No session passphrase available for encryption');
    UIManager.displayMessage('Cannot send file: Missing encryption key', 'error', 5000);
    UIManager.hideDropZone();
    return;
  }
  
  try {
    // Create file data object to encrypt
    const fileData = {
      type: 'file',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || getMimeTypeFromExtension(file.name),
      content: fileContent,
      timestamp: Date.now()
    };
    
    // Create original file data for reference
    const originalFileData = {
      type: 'file',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || getMimeTypeFromExtension(file.name),
      content: fileContent,
      timestamp: Date.now()
    };
    
    console.log(`Starting async encryption for file '${file.name}'`);
    
    // USE ASYNC ENCRYPTION (using our previously implemented function)
    const encryptedFileData = await encryptClipboardContentAsync({...fileData}, sessionData.passphrase);
    console.log('Async encryption complete');
    
    // Add original data references
    encryptedFileData._originalData = originalFileData;
    encryptedFileData._displayFileName = file.name;
    
    // Hide drop zone after encryption
    UIManager.hideDropZone();
    
    // Store in content handlers
    if (typeof window.ContentHandlers !== 'undefined' && 
        typeof window.ContentHandlers.setSharedFile === 'function') {
      console.log('Directly setting shared file with original data in ContentHandlers');
      window.ContentHandlers.setSharedFile(encryptedFileData);
    }
    
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
    
    // Call the callback with processed data
    if (onFileProcessed) {
      onFileProcessed(encryptedFileData);
    }
    
    UIManager.displayMessage(`File "${file.name}" encrypted and processed`, 'success', 3000);
    
  } catch (error) {
    console.error('Failed to encrypt file:', error);
    UIManager.displayMessage('Failed to encrypt file: ' + error.message, 'error', 5000);
    UIManager.hideDropZone();
    throw error;
  }
}

/**
 * Read a file as data URL (Promise-based wrapper around FileReader)
 * @param {File} file - The file to read
 * @returns {Promise<string>} Promise resolving to the file content as data URL
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      resolve(e.target.result);
    };
    
    reader.onerror = function(e) {
      console.error('Error reading file:', file.name, e);
      reject(new Error(`Error reading file: ${file.name}`));
    };
    
    // Read file as data URL
    reader.readAsDataURL(file);
  });
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
          
          // Store original data globally for download
          window.originalFileData = {
            fileName: fileData.fileName,
            fileSize: fileData.fileSize,
            fileType: fileData.fileType,
            content: fileData.content,
            timestamp: Date.now(),
            isOriginal: true
          };
          
          // ZIP archives are usually large - use Web Worker for larger ZIPs
          // and async encryption for smaller ones
          if (fileData.fileSize > 50000) { // 50KB threshold for using worker - lowered to match file threshold
            console.log('Using Web Worker for large ZIP archive encryption');
            try {
              // Process ZIP with worker
              const worker = getFileWorker();
              
              if (!worker) {
                // Web Workers not supported - fall back to async encryption
                UIManager.displayMessage('Web Workers not supported - using fallback method', 'info', 3000);
                
                // Use async encryption as fallback
                const encryptedZipData = await encryptClipboardContentAsync(fileData, sessionData.passphrase);
                
                // Set original data references
                encryptedZipData._originalData = {...fileData};
                encryptedZipData._displayFileName = fileData.fileName;
                
                // Call the callback
                onZipCreated(encryptedZipData);
                UIManager.displayMessage(`ZIP archive encrypted and ready to share`, 'success', 3000);
              } else {
                // Use worker for processing
                await new Promise((resolve, reject) => {
                  // Set up message handler
                  worker.onmessage = function(e) {
                    const response = e.data;
                    
                    if (response.status === 'progress') {
                      // Update progress message
                      UIManager.displayMessage(
                        `Processing ZIP: ${response.progress}% - ${response.message}`, 
                        'info', 
                        0
                      );
                    } 
                    else if (response.status === 'complete') {
                      console.log('Web Worker completed ZIP processing');
                      
                      // Create the complete processed ZIP data
                      const encryptedZipData = response.encryptedData;
                      
                      // Add original data reference for download
                      encryptedZipData._originalData = {...window.originalFileData};
                      encryptedZipData._displayFileName = fileData.fileName;
                      
                      // Call the callback
                      onZipCreated(encryptedZipData);
                      
                      UIManager.displayMessage(`ZIP archive processed and ready to share`, 'success', 3000);
                      resolve();
                    } 
                    else if (response.status === 'error') {
                      console.error('Worker reported error:', response.error);
                      UIManager.displayMessage('Error processing ZIP: ' + response.error, 'error', 5000);
                      reject(new Error(response.error));
                    }
                  };
                  
                  // Send ZIP to worker for processing
                  worker.postMessage({
                    action: 'process',
                    fileData: fileData.content,
                    fileName: fileData.fileName,
                    fileSize: fileData.fileSize,
                    fileType: fileData.fileType,
                    passphrase: sessionData.passphrase
                  });
                  
                  console.log('ZIP sent to worker for processing');
                });
              }
            } catch (error) {
              console.error('Error with ZIP worker processing:', error);
              UIManager.displayMessage('Error processing ZIP: ' + error.message, 'error', 5000);
              throw error;
            }
          } else {
            // Use async encryption for smaller ZIP files
            console.log('Using async encryption for ZIP archive');
            const encryptedZipData = await encryptClipboardContentAsync(fileData, sessionData.passphrase);
            console.log('Async ZIP encryption complete');
            
            // Add original data references
            encryptedZipData._originalData = {...fileData};
            encryptedZipData._displayFileName = fileData.fileName;
            
            // Call the callback
            onZipCreated(encryptedZipData);
            UIManager.displayMessage(`ZIP archive encrypted and ready to share`, 'success', 3000);
          }
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
 * Helper utility to convert a data URL to a Blob
 * @param {string} dataUrl - The data URL to convert
 * @returns {Blob|null} The resulting Blob or null if failed
 */
export function dataUrlToBlob(dataUrl) {
  try {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return null;
    }
    
    const parts = dataUrl.split(';base64,');
    if (parts.length !== 2) {
      return null;
    }
    
    const contentType = parts[0].split(':')[1];
    const base64Data = parts[1];
    const raw = window.atob(base64Data);
    const uInt8Array = new Uint8Array(raw.length);
    
    for (let i = 0; i < raw.length; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    
    return new Blob([uInt8Array], {type: contentType});
  } catch (err) {
    console.error('Error converting data URL to Blob:', err);
    return null;
  }
}

// Note: downloadSharedFile has been moved to ContentHandlers.downloadFile()
// to create a unified download path for better consistency

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
