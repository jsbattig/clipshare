/**
 * ClipShare Event Handlers
 * 
 * Handles all user interactions: buttons, drag & drop, input events, etc.
 * Simplified to use manual clipboard operations instead of automatic monitoring.
 */

import { CONFIG } from './config.js';
import { getElement } from './utils.js';
import * as UIManager from './ui-manager.js';
import * as ClipboardUtils from './clipboard-monitor.js';
import * as ContentHandlers from './content-handlers.js';
import * as FileOperations from './file-operations.js';
import * as SocketEvents from './socket-events.js';
import * as Session from './session.js';

/**
 * Set up event listeners
 */
export function setupEventListeners() {
  setupClipboardControls();
  setupSessionControls();
  setupTextareaEvents();
  setupDropZone();
  setupFileEvents();
  setupKeyboardEvents();
}

/**
 * Set up clipboard control buttons
 */
function setupClipboardControls() {
  // Copy button
  const copyBtn = getElement('copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', handleCopyButtonClick);
  }
  
  // Clear button
  const clearBtn = getElement('clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', handleClearButtonClick);
  }
  
  // Paste button (renamed from Refresh)
  const pasteBtn = getElement('refresh-btn');
  if (pasteBtn) {
    pasteBtn.addEventListener('click', handlePasteButtonClick);
    
    // Update button text to be clearer about its purpose
    if (pasteBtn.textContent.trim() === 'Refresh') {
      pasteBtn.textContent = 'Paste';
      pasteBtn.title = 'Paste from your clipboard';
    }
  }
}

/**
 * Set up session controls
 */
function setupSessionControls() {
  // Logout button
  const logoutBtn = getElement('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogoutButtonClick);
  }
  
  // Toggle connected devices button
  const toggleDevicesBtn = getElement('toggle-devices-btn');
  if (toggleDevicesBtn) {
    toggleDevicesBtn.addEventListener('click', () => {
      UIManager.toggleDevicesPanel();
    });
  }
}

/**
 * Set up textarea events
 */
function setupTextareaEvents() {
  const clipboardTextarea = getElement('clipboard-content');
  if (clipboardTextarea) {
    // Input event (typing)
    clipboardTextarea.addEventListener('input', handleTextareaInput);
  }
}

/**
 * Set up drop zone events
 */
function setupDropZone() {
  const dropZone = getElement('drop-zone');
  const dropCloseBtn = document.querySelector('.close-drop-zone');
  
  if (!dropZone) return;
  
  // Close drop zone button
  if (dropCloseBtn) {
    dropCloseBtn.addEventListener('click', () => {
      UIManager.hideDropZone();
    });
  }
  
  // Prevent default to allow drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-active');
  });
  
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-active');
  });
  
  // Handle the drop event
  dropZone.addEventListener('drop', (e) => {
    FileOperations.handleFileDrop(
      e,
      handleSingleFileUpload,
      handleMultipleFilesSelected
    );
  });
  
  // Make file container droppable too
  const fileContainerEl = getElement('file-container');
  if (fileContainerEl) {
    fileContainerEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      UIManager.showDropZone('Drop file(s) here to share');
    });
  }
}

/**
 * Set up file-related events
 */
function setupFileEvents() {
  // Create a hidden file input element for the file selection dialog
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true; // Allow multiple file selection
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      
      if (files.length === 1) {
        // Directly call handleSingleFileUpload with the raw File object
        console.log('File selected via dialog:', files[0].name);
        UIManager.displayMessage(`Processing file: ${files[0].name}...`, 'info', 0);
        FileOperations.handleSingleFileUpload(files[0], processSingleFileCallback);
      } else {
        console.log('Multiple files selected via dialog:', files.length);
        FileOperations.handleMultipleFiles(files, handleMultipleFilesSelected);
      }
    }
  });
  
  // Share File button - directly opens file selection dialog
  const shareFileBtn = getElement('share-file-btn');
  if (shareFileBtn) {
    shareFileBtn.addEventListener('click', () => {
      // Directly open file selection dialog
      fileInput.click();
    });
  }
  
  // Download File button
  const downloadFileBtn = getElement('download-file-btn');
  if (downloadFileBtn) {
    downloadFileBtn.addEventListener('click', () => {
      // Use the unified download function from ContentHandlers
      // This works for both sender and receiver sides
      ContentHandlers.downloadFile();
    });
  }
  
  // Create ZIP button
  const createZipBtn = document.querySelector('.create-zip-btn');
  if (createZipBtn) {
    createZipBtn.addEventListener('click', () => {
      const droppedFiles = FileOperations.getDroppedFiles();
      if (droppedFiles.length > 0) {
        FileOperations.createAndShareZip(droppedFiles, handleZipCreated);
      }
    });
  }
}

/**
 * Set up keyboard events
 */
function setupKeyboardEvents() {
  // Hide drop zone on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const dropZone = getElement('drop-zone');
      if (dropZone && !dropZone.classList.contains('hidden')) {
        UIManager.hideDropZone();
      }
    }
  });
}

/**
 * Handle copy button click - copies from app to system clipboard
 */
function handleCopyButtonClick() {
  ContentHandlers.copyToClipboard();
}

/**
 * Handle clear button click
 */
function handleClearButtonClick() {
  const clipboardTextarea = getElement('clipboard-content');
  if (clipboardTextarea) {
    // Update content with empty string
    const emptyContent = {
      type: 'text',
      content: '',
      timestamp: Date.now()
    };
    
    ContentHandlers.updateClipboardContent(
      emptyContent, 
      true, 
      SocketEvents.sendClipboardUpdate
    );
    
    // Focus textarea
    clipboardTextarea.focus();
  }
}

/**
 * Handle paste button click - reads from system clipboard into app
 */
async function handlePasteButtonClick() {
  try {
    const clipboardData = await ClipboardUtils.readFromClipboard();
    
    // Only handle text and image content types - files use the drop zone
    if (clipboardData && (clipboardData.type === 'text' || clipboardData.type === 'image')) {
      ContentHandlers.updateClipboardContent(
        clipboardData, 
        true, 
        SocketEvents.sendClipboardUpdate
      );
      UIManager.displayMessage('Content pasted from clipboard', 'info', 2000);
    } else {
      // If a file is detected or we can't determine the type, show drop zone
      UIManager.showDropZone('Please drag & drop files to share them');
    }
  } catch (err) {
    // If any error occurs, try showing drop zone as fallback
    UIManager.showDropZone('Cannot access clipboard - Please drag and drop files');
    console.error('Failed to read clipboard:', err);
    UIManager.displayMessage('Error reading clipboard: ' + err.message, 'error', 5000);
  }
}

/**
 * Handle textarea input
 */
function handleTextareaInput() {
  const clipboardTextarea = getElement('clipboard-content');
  if (!clipboardTextarea) return;
  
  const newContent = clipboardTextarea.value;
  
  // Create text content object
  const contentData = {
    type: 'text',
    content: newContent,
    timestamp: Date.now()
  };
  
  // Update UI
  UIManager.updateSyncStatus('Sending text update...');
  
  // Send update to server
  if (SocketEvents.sendClipboardUpdate(contentData)) {
    UIManager.updateSyncStatus('Text sent to connected devices');
    UIManager.updateLastUpdated();
  } else {
    UIManager.updateSyncStatus('Failed to send - check connection');
  }
}

/**
 * Callback function for processed single file
 * @param {Object} fileData - Processed file data
 */
function processSingleFileCallback(fileData) {
  handleSingleFileUpload(fileData);
}

/**
 * Handle single file upload
 * @param {Object} fileData - Processed file data
 */
function handleSingleFileUpload(fileData) {
  // Store as shared file
  ContentHandlers.setSharedFile(fileData);
  
  // Update UI with file information
  ContentHandlers.handleFileContent(fileData);
  
  // Send to server
  SocketEvents.sendFileUpdate(fileData);
  
  // Show notification
  UIManager.displayMessage(`Shared file: ${fileData.fileName}`, 'success', 3000);
}

/**
 * Handle multiple files selected
 * @param {File[]} files - Selected files
 */
function handleMultipleFilesSelected(files) {
  // Already handled in FileOperations.handleMultipleFiles
}

/**
 * Handle ZIP creation
 * @param {Object} zipData - Created ZIP file data
 */
function handleZipCreated(zipData) {
  // Store as shared file
  ContentHandlers.setSharedFile(zipData);
  
  // Update UI
  ContentHandlers.handleFileContent(zipData);
  
  // Send to server
  SocketEvents.sendFileUpdate(zipData);
}

/**
 * Handle logout button click
 */
function handleLogoutButtonClick() {
  Session.logout();
}
