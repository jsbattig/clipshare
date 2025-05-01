/**
 * ClipShare Socket Event Handlers
 * 
 * Manages WebSocket events and communication with the server.
 */

import { CONFIG } from './config.js';
import * as UIManager from './ui-manager.js';
import * as ClipboardMonitor from './clipboard-monitor.js';
import * as ContentHandlers from './content-handlers.js';
import * as Session from './session.js';

// Module state
let socket = null;
let clipboardUpdateCallback = null;
let fileUpdateCallback = null;

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
  
  UIManager.displayMessage('Another device joined the session', 'info', 3000);
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
  
  console.log('Received clipboard update from another device', data.type);
  
  // Enter grace period to prevent ping-pong updates
  ClipboardMonitor.setGracePeriod(true);
  
  // Mark content as coming from remote
  ClipboardMonitor.setContentOrigin('remote');
  
  // Handle different content types
  if (data.type === 'file') {
    // File content is handled separately
    handleFileBroadcast(data);
  } else {
    // Update clipboard content without sending to server
    if (clipboardUpdateCallback) {
      clipboardUpdateCallback(data, false);
    }
    
    // Write to system clipboard if monitoring is active
    if (ClipboardMonitor.getMonitoringState()) {
      syncToSystemClipboard(data);
    }
    
    // Update UI
    UIManager.updateSyncStatus('Updated from another device');
    UIManager.updateLastUpdated();
    
    const contentTypeMsg = data.type === 'image' ? 'Image' : 'Text';
    UIManager.displayMessage(`${contentTypeMsg} clipboard updated from another device`, 'info', 2000);
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
 * Sync content to system clipboard
 * @param {Object} data - Content data
 */
function syncToSystemClipboard(data) {
  try {
    if (data.type === 'text') {
      // Text can be written directly
      navigator.clipboard.writeText(data.content).catch(err => {
        console.error('Error writing text to clipboard:', err);
      });
    } else if (data.type === 'image') {
      // For images, attempt multiple sync retries
      ClipboardMonitor.syncImageToClipboard(
        data.content, 
        data.imageType || 'image/png'
      );
    }
  } catch (err) {
    console.error('Failed to access clipboard API:', err);
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
  
  socket.emit('clipboard-update', content);
  return true;
}

/**
 * Send file update to server
 * @param {Object} fileData - File data
 */
export function sendFileUpdate(fileData) {
  if (!socket || !socket.connected) {
    console.warn('Cannot send file update: socket not connected');
    return false;
  }
  
  // Use separate file channel for sharing files
  socket.emit('file-update', fileData);
  return true;
}

/**
 * Get socket instance
 * @returns {Object|null} Socket.io instance
 */
export function getSocket() {
  return socket;
}
