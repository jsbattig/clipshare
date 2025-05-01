/**
 * ClipShare Event Handlers
 * 
 * Handles all user interactions: buttons, drag & drop, input events, etc.
 */

import { CONFIG } from './config.js';
import { getElement } from './utils.js';
import * as UIManager from './ui-manager.js';
import * as ClipboardMonitor from './clipboard-monitor.js';
import * as ContentHandlers from './content-handlers.js';
import * as FileOperations from './file-operations.js';
import * as SocketEvents from './socket-events.js';
import * as Session from './session.js';

/**
 * Set up event listeners
 */
export function setupEventListeners() {
  setupClipboardControls();
  setupMonitoringControls();
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
  
  // Refresh/Paste button
  const refreshBtn = getElement('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefreshButtonClick);
  }
  
  // Use local button (for clipboard differences)
  const useLocalBtn = getElement('use-local-btn');
  if (useLocalBtn) {
    useLocalBtn.addEventListener('click', handleUseLocalButtonClick);
  }
}

/**
 * Set up monitoring controls
 */
function setupMonitoringControls() {
  // Monitoring toggle
  const monitoringToggle = getElement('monitoring-toggle');
  if (monitoringToggle) {
    monitoringToggle.addEventListener('change', handleMonitoringToggleChange);
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
}

/**
 * Set up textarea events
 */
function setupTextareaEvents() {
  const clipboardTextarea = getElement('clipboard-content');
  if (clipboardTextarea) {
    // Input event (typing)
    clipboardTextarea.addEventListener('input', handleTextareaInput);
    
    // Focus event
    clipboardTextarea.addEventListener('focus', () => {
      ClipboardMonitor.setUserTyping(true, UIManager.updateSyncStatus);
    });
    
    // Blur event
    clipboardTextarea.addEventListener('blur', () => {
      // Short delay before resuming to handle click+focus sequence
      setTimeout(() => {
        ClipboardMonitor.setUserTyping(false, UIManager.updateSyncStatus);
      }, 500);
    });
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
  // Share File button
  const shareFileBtn = getElement('share-file-btn');
  if (shareFileBtn) {
    shareFileBtn.addEventListener('click', () => {
      UIManager.showDropZone('Drop file(s) to share with all devices');
    });
  }
  
  // Download File button
  const downloadFileBtn = getElement('download-file-btn');
  if (downloadFileBtn) {
    downloadFileBtn.addEventListener('click', () => {
      const sharedFile = ContentHandlers.getSharedFile();
      if (sharedFile) {
        FileOperations.downloadSharedFile(sharedFile);
      }
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
 * Handle copy button click
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
 * Handle refresh/paste button click
 */
async function handleRefreshButtonClick() {
  try {
    const clipboardData = await ClipboardMonitor.readFromClipboard();
    
    // Only handle text and image content types - files use the drop zone
    if (clipboardData && (clipboardData.type === 'text' || clipboardData.type === 'image')) {
      ContentHandlers.updateClipboardContent(
        clipboardData, 
        true, 
        SocketEvents.sendClipboardUpdate
      );
      UIManager.displayMessage('Clipboard refreshed', 'info', 2000);
    } else {
      // If a file is detected or we can't determine the type, show drop zone
      UIManager.showDropZone('Please drag & drop files to share them');
    }
  } catch (err) {
    // If any error occurs, try showing drop zone as fallback
    UIManager.showDropZone('Cannot access clipboard - Please drag and drop files');
    console.error('Failed to read clipboard:', err);
    UIManager.displayMessage(err.message, 'error', 3000);
  }
}

/**
 * Handle "Use Local" button click
 */
async function handleUseLocalButtonClick() {
  try {
    const clipboardContent = await ClipboardMonitor.readFromClipboard();
    
    ContentHandlers.updateClipboardContent(
      clipboardContent, 
      true, 
      SocketEvents.sendClipboardUpdate
    );
    
    // Hide the diff banner
    UIManager.showDiffBanner(false);
    
    UIManager.displayMessage('Remote clipboard updated with local content', 'success', 2000);
  } catch (err) {
  UIManager.displayMessage('Failed to read clipboard: ' + err.message, 'error', 5000);
  }
}

/**
 * Handle monitoring toggle change
 */
function handleMonitoringToggleChange() {
  const monitoringToggle = getElement('monitoring-toggle');
  if (!monitoringToggle) return;
  
  const isActive = monitoringToggle.checked;
  
  if (isActive) {
    ClipboardMonitor.startMonitoring(
      (content, sendToServer) => {
        ContentHandlers.updateClipboardContent(
          content, 
          sendToServer, 
          SocketEvents.sendClipboardUpdate
        );
      },
      UIManager.updateSyncStatus
    );
    UIManager.setMonitoringStatus(true);
  } else {
    ClipboardMonitor.stopMonitoring();
    UIManager.setMonitoringStatus(false);
  }
  
  UIManager.displayMessage(
    isActive ? 'Clipboard monitoring enabled' : 'Clipboard monitoring disabled', 
    'info', 
    2000
  );
}

/**
 * Handle textarea input
 */
function handleTextareaInput() {
  const clipboardTextarea = getElement('clipboard-content');
  if (!clipboardTextarea) return;
  
  // Set typing flag to prevent clipboard polling
  ClipboardMonitor.setUserTyping(true, UIManager.updateSyncStatus);
  
  const newContent = clipboardTextarea.value;
  
  // Check current content type
  const currentType = ClipboardMonitor.getCurrentType();
  
  // If we were showing an image, hide it when user starts typing
  if (currentType === 'image') {
    const imageContainer = getElement('image-container');
    if (imageContainer && !imageContainer.classList.contains('hidden')) {
      // Hide the image container
      imageContainer.classList.add('hidden');
      // Reset the placeholder
      clipboardTextarea.placeholder = "Clipboard content will appear here. Type or paste content to share it with all connected devices.";
      
      UIManager.displayMessage('Switched to text mode', 'info', 2000);
    }
  }
  
  // Create text content object
  const contentData = {
    type: 'text',
    content: newContent,
    timestamp: Date.now()
  };
  
  // Send update to server
  SocketEvents.sendClipboardUpdate(contentData);
  
  // Update UI
  UIManager.updateSyncStatus('Synchronized');
  UIManager.updateLastUpdated();
  
  // Update system clipboard with what user typed to prevent overwrite when polling resumes
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(newContent).catch(err => {
      console.log('Could not write to clipboard:', err);
      // Non-critical error, continue anyway
    });
  }
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
  ClipboardMonitor.stopMonitoring();
  Session.logout();
}
