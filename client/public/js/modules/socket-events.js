/**
 * ClipShare Socket Event Handlers
 * 
 * Manages WebSocket events and communication with the server.
 */

import { CONFIG } from './config.js';
import * as UIManager from './ui-manager.js';
// Import basic clipboard utilities for manually reading/writing clipboard
import * as ClipboardUtils from './clipboard-monitor.js';
import * as ContentHandlers from './content-handlers.js';
import * as Session from './session.js';
import { getBrowserInfo, hashContent } from './utils.js';

// Module state
let socket = null;
let clipboardUpdateCallback = null;
let fileUpdateCallback = null;
let clientListCallback = null;
let connectedClients = [];

/**
 * Initialize socket event handlers
 * @param {Object} socketInstance - Socket.io instance
 * @param {Object} callbacks - Callback functions
 */
export function init(socketInstance, callbacks = {}) {
  socket = socketInstance;
  
  // Store callbacks
  if (callbacks.onClipboardUpdate) clipboardUpdateCallback = callbacks.onClipboardUpdate;
  if (callbacks.onFileUpdate) fileUpdateCallback = callbacks.onFileUpdate;
  if (callbacks.onClientListUpdate) clientListCallback = callbacks.onClientListUpdate;
  
  setupSocketListeners();
}

/**
 * Set up socket event listeners
 */
function setupSocketListeners() {
  if (!socket) return;
  
  // Connection events
  socket.on('connect', handleConnect);
  socket.on('disconnect', handleDisconnect);
  socket.on('connect_error', handleConnectError);
  
  // Session events
  socket.on('client-count-update', handleClientCountUpdate);
  socket.on('client-joined', handleClientJoined);
  socket.on('client-left', handleClientLeft);
  socket.on('client-list-update', handleClientListUpdate);
  
  // Content events
  socket.on('clipboard-broadcast', handleClipboardBroadcast);
  socket.on('file-broadcast', handleFileBroadcast);
}

/**
 * Handle socket connect event
 */
function handleConnect() {
  console.log('Socket connected');
  
  // Attempt to join session if we have session data
  const sessionData = Session.getCurrentSession();
  if (sessionData) {
    Session.connectToSession(
      handleSuccessfulConnection,
      handleConnectionFailure,
      UIManager.displayMessage
    );
  }
}

/**
 * Handle successful session connection
 * @param {Object} response - Server response
 */
function handleSuccessfulConnection(response) {
  console.log('Successfully connected to session', response);
  
  // Handle initial clipboard content if available
  if (response.clipboard && clipboardUpdateCallback) {
    clipboardUpdateCallback(response.clipboard, false);
  }
  
  // Handle initial shared file if available
  if (response.sharedFile && fileUpdateCallback) {
    fileUpdateCallback(response.sharedFile);
  }
  
  // Update client count
  if (response.clientCount !== undefined) {
    Session.updateClientCount(response.clientCount);
  }
  
  // Handle initial client list if available
  if (response.clients && clientListCallback) {
    connectedClients = response.clients;
    clientListCallback(connectedClients);
  }
}

/**
 * Handle connection failure
 * @param {string} message - Error message
 */
function handleConnectionFailure(message) {
  console.error('Failed to connect to session:', message);
}

/**
 * Handle socket disconnect event
 */
function handleDisconnect() {
  Session.setConnectionStatus(false, UIManager.displayMessage);
  UIManager.displayMessage('Disconnected from server. Reconnecting...', 'error');
}

/**
 * Handle socket connection error
 * @param {Error} error - Connection error
 */
function handleConnectError(error) {
  Session.setConnectionStatus(false, UIManager.displayMessage);
  UIManager.displayMessage('Connection error. Reconnecting...', 'error');
  console.error('Socket connection error:', error);
}

/**
 * Handle client count update event
 * @param {Object} data - Event data
 */
function handleClientCountUpdate(data) {
  if (data.clientCount !== undefined) {
    Session.updateClientCount(data.clientCount);
  }
}

/**
 * Handle client joined event
 * @param {Object} data - Event data
 */
function handleClientJoined(data) {
  // Update client count if provided
  if (data.clientCount) {
    Session.updateClientCount(data.clientCount);
  }
  
  // If client info is provided, show a more detailed message
  if (data.clientInfo) {
    const browser = data.clientInfo.browserInfo?.name || 'Unknown browser';
    const os = data.clientInfo.browserInfo?.os || 'Unknown OS';
    const ip = data.clientInfo.ip || 'Unknown IP';
    
    UIManager.displayMessage(`New device joined: ${browser} on ${os} (${ip})`, 'info', 3000);
  } else {
    UIManager.displayMessage('Another device joined the session', 'info', 3000);
  }
}

/**
 * Handle client left event
 * @param {Object} data - Event data
 */
function handleClientLeft(data) {
  // Update client count if provided
  if (data.clientCount) {
    Session.updateClientCount(data.clientCount);
  }
  
  UIManager.displayMessage('A device left the session', 'info', 3000);
}

/**
 * Handle clipboard broadcast event
 * @param {Object} data - Event data
 */
function handleClipboardBroadcast(data) {
  // Skip if this update originated from this client
  if (data.originClient === socket.id) {
    return;
  }
  
  console.log('Received clipboard update from another device:', data.type);
  
  // Handle different content types
  if (data.type === 'file') {
    // File content is handled separately
    handleFileBroadcast(data);
  } else {
    // Update app content without sending to server
    if (clipboardUpdateCallback) {
      clipboardUpdateCallback(data, false);
    }
    
    // Update UI with informative message
    UIManager.updateSyncStatus(`Received ${data.type} content - Click "Copy" to use it`);
    UIManager.updateLastUpdated();
    
    const contentTypeMsg = data.type === 'image' ? 'Image' : 'Text';
    UIManager.displayMessage(`${contentTypeMsg} content received from another device. Click "Copy" to use it in your clipboard.`, 'info', 5000);
  }
}

/**
 * Handle file broadcast event
 * @param {Object} fileData - File data
 */
function handleFileBroadcast(fileData) {
  // Skip if this update originated from this client
  if (fileData.originClient === socket.id) {
    return;
  }
  
  console.log('Received shared file from other client:', fileData.fileName);
  
  // Store the shared file and update UI
  if (fileUpdateCallback) {
    fileUpdateCallback(fileData);
  }
  
  // Show notification
  UIManager.displayMessage(`File received: ${fileData.fileName}`, 'info', 5000);
}

/**
 * Manually copy received content to system clipboard
 * @param {Object} data - Content data
 * @returns {Promise<boolean>} Success status
 */
export async function copyToSystemClipboard(data) {
  try {
    const result = await ClipboardUtils.writeToClipboard(data);
    
    if (result) {
      UIManager.displayMessage('Copied to clipboard', 'success', 2000);
    } else {
      UIManager.displayMessage('Failed to copy to clipboard', 'error', 3000);
    }
    
    return result;
  } catch (err) {
    console.error('Failed to access clipboard API:', err);
    UIManager.displayMessage('Error accessing clipboard: ' + err.message, 'error', 3000);
    return false;
  }
}

/**
 * Send clipboard update to server
 * @param {Object} content - Clipboard content
 */
export function sendClipboardUpdate(content) {
  if (!socket || !socket.connected) {
    console.warn('Cannot send clipboard update: socket not connected');
    return false;
  }
  
  // Include full client info with browser, OS and timestamp
  const enhancedContent = {
    ...content,
    clientInfo: getBrowserInfo(),
    timestamp: content.timestamp || Date.now()
  };
  
  // Add detailed logging
  console.log('Sending clipboard update:', enhancedContent.type);
  
  // Send the event to the server
  socket.emit('clipboard-update', enhancedContent);
  return true;
}

/**
 * Send file update to server
 * @param {Object} fileData - File data
 */
export function sendFileUpdate(fileData) {
  if (!socket || !socket.connected) {
    console.warn('Cannot send file update: socket not connected');
    UIManager.displayMessage('Cannot share file: Not connected to server', 'error', 3000);
    return false;
  }
  
  // Add additional metadata
  const enhancedFileData = {
    ...fileData,
    originClient: socket.id,
    clientInfo: getBrowserInfo(),
    timestamp: fileData.timestamp || Date.now()
  };
  
  console.log(`Sending file update: ${enhancedFileData.fileName}, size: ${formatFileSize(enhancedFileData.fileSize)} bytes`);
  UIManager.displayMessage(`Sharing file with other devices: ${enhancedFileData.fileName}`, 'info', 3000);
  
  // Use separate file channel for sharing files
  socket.emit('file-update', enhancedFileData);
  return true;
}

/**
 * Format file size in a human-readable way
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === undefined || bytes === null) return '0 B';
  if (bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Handle client list update event
 * @param {Object} data - Event data containing clients array
 */
function handleClientListUpdate(data) {
  if (data.clients && Array.isArray(data.clients)) {
    // Update our local list of clients
    connectedClients = data.clients;
    
    // Update UI via callback
    if (clientListCallback) {
      clientListCallback(connectedClients);
    }
  }
}

/**
 * Get socket instance
 * @returns {Object|null} Socket.io instance
 */
export function getSocket() {
  return socket;
}

/**
 * Get connected clients list
 * @returns {Array} List of connected clients
 */
export function getConnectedClients() {
  return connectedClients;
}
