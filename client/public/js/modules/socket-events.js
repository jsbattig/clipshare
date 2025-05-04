/**
 * ClipShare Socket Event Handlers
 * 
 * Manages WebSocket events and communication with the server.
 * Includes encryption for all content sent through the server.
 */

import { CONFIG } from './config.js';
import * as UIManager from './ui-manager.js';
// Import basic clipboard utilities for manually reading/writing clipboard
import * as ClipboardUtils from './clipboard-monitor.js';
import * as ContentHandlers from './content-handlers.js';
import * as Session from './session.js';
import { getBrowserInfo, hashContent, getFormattedTime } from './utils.js';
import { encryptClipboardContent, decryptClipboardContent } from './encryption.js';

// Module state
let socket = null;
let clipboardUpdateCallback = null;
let fileUpdateCallback = null;
let clientListCallback = null;
let connectedClients = [];

// Track chunked file transfers in progress
const chunkedFileTransfers = {};

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
  
  // Chunked file transfer events
  socket.on('file-metadata', handleFileMetadata);
  socket.on('file-chunk', handleFileChunk);
  
  // Ping-pong mechanism
  socket.on('ping-clients', handleServerPing);
  socket.on('session-inactive', handleSessionInactive);
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
  
  // Handle initial shared file if available (decrypt before display)
  if (response.sharedFile && fileUpdateCallback) {
    const sessionData = Session.getCurrentSession();
    if (sessionData && sessionData.passphrase) {
      const decryptedFile = decryptClipboardContent(response.sharedFile, sessionData.passphrase);
      fileUpdateCallback(decryptedFile);
    } else {
      console.error('Cannot decrypt initial shared file: missing session passphrase');
    }
  }
  
  // Update client count
  if (response.clientCount !== undefined) {
    Session.updateClientCount(response.clientCount);
  }
  
  // Handle initial client list if available
  if (response.clients && clientListCallback) {
    console.log('Initial client list received:', response.clients);
    
    // Check if we have client names or if they're null
    if (response.clients.length > 0) {
      const hasClientNames = response.clients.some(client => 
        client.clientName || (client.browserInfo && client.browserInfo.clientName)
      );
      console.log('Client list has client names:', hasClientNames);
    }
    
    connectedClients = response.clients;
    clientListCallback(connectedClients);
  } else {
    console.warn('No client list in successful connection response');
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
    const clientName = data.clientInfo.browserInfo?.clientName || data.clientInfo.clientName || null;
    
    if (clientName) {
      UIManager.displayMessage(`New device joined: ${clientName}`, 'info', 3000);
    } else {
      UIManager.displayMessage(`New device joined: ${browser} on ${os}`, 'info', 3000);
    }
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
  
  // Get session data for decryption
  const sessionData = Session.getCurrentSession();
  if (!sessionData || !sessionData.passphrase) {
    console.error('Cannot decrypt content: No valid session passphrase available');
    UIManager.displayMessage('Cannot decrypt content: Session data not available', 'error', 5000);
    return;
  }
  
  try {
    // Always assume the content is encrypted and try to decrypt it
    console.log('Attempting to decrypt received content');
    const decryptedData = decryptClipboardContent(data, sessionData.passphrase);
    console.log('Decryption successful, type:', decryptedData.type);
    
    // Handle different content types
    if (decryptedData.type === 'file') {
      // File content is handled separately
      handleFileBroadcast(decryptedData);
    } else {
      // Log what we received
      if (decryptedData.type === 'text') {
        // Don't log the whole content, just a snippet
        const previewText = decryptedData.content.length > 30 
          ? decryptedData.content.substring(0, 30) + '...' 
          : decryptedData.content;
        console.log('Received text content:', previewText);
      } else if (decryptedData.type === 'image') {
        console.log('Received image content, data URL length:', decryptedData.content.length);
      }
      
      // Update app content without sending to server
      if (clipboardUpdateCallback) {
        clipboardUpdateCallback(decryptedData, false);
      }
      
      // Update UI with informative message
      UIManager.updateSyncStatus(`Received ${decryptedData.type} content - Click "Copy" to use it`);
      UIManager.updateLastUpdated();
      
      const contentTypeMsg = decryptedData.type === 'image' ? 'Image' : 'Text';
      UIManager.displayMessage(`${contentTypeMsg} content received from another device. Click "Copy" to use it in your clipboard.`, 'info', 5000);
    }
  } catch (error) {
    console.error('Failed to decrypt clipboard content:', error);
    UIManager.displayMessage('Failed to decrypt received content', 'error', 5000);
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
  
  // Always log what we received without exposing sensitive content
  console.log('Received shared file from other client');
  
  // Use our unified processing function for consistent structure
  // This ensures identical storage between sender and receiver sides
  if (processReceivedFile(fileData)) {
    // If processReceivedFile was successful, we're done
    return;
  }
  
  // If we get here, our unified approach failed - fallback to original approach
  // This is just a safety net - the processReceivedFile function should handle all cases
  console.warn('Falling back to legacy file broadcast handling');
  
  // Try to get a readable filename for the notification
  let displayName = 'file';
  if (fileData.fileName) {
    if (fileData.fileName.startsWith('U2FsdGVk')) {
      console.log('Falling back to partial decryption for display');
      
      try {
        const sessionData = Session.getCurrentSession();
        if (sessionData && sessionData.passphrase) {
          const tempObject = {
            type: 'file',
            fileName: fileData.fileName
          };
          
          const decrypted = decryptClipboardContent(tempObject, sessionData.passphrase);
          if (decrypted && decrypted.fileName) {
            displayName = decrypted.fileName;
            console.log('Partial decryption successful for display:', displayName);
            
            // Store for UI display
            fileData._displayFileName = displayName;
          }
        }
      } catch (err) {
        console.error('Partial decryption failed:', err);
      }
    } else {
      displayName = fileData.fileName;
    }
  }
  
  // Store the file even if decryption failed
  if (fileUpdateCallback) {
    fileUpdateCallback(fileData);
  }
  
  // Show notification with best available filename
  UIManager.displayMessage(`File received: ${displayName}`, 'info', 5000);
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
  
  // Get session data for encryption
  const sessionData = Session.getCurrentSession();
  if (!sessionData || !sessionData.passphrase) {
    console.error('Cannot encrypt content: No valid session passphrase available');
    UIManager.displayMessage('Cannot encrypt content: Session data not available', 'error', 5000);
    return false;
  }
  
  try {
    // Encrypt the content before sending
    const encryptedContent = encryptClipboardContent(enhancedContent, sessionData.passphrase);
    
    // Add detailed logging
    console.log('Sending encrypted clipboard update:', encryptedContent.type);
    
    // Send the encrypted event to the server
    socket.emit('clipboard-update', encryptedContent);
    return true;
  } catch (error) {
    console.error('Failed to encrypt and send clipboard content:', error);
    UIManager.displayMessage('Failed to encrypt content for sending', 'error', 5000);
    return false;
  }
}

/**
 * Send file update to server
 * @param {Object} fileData - File data
 */
export function sendFileUpdate(fileData) {
  // Log detailed file information for debugging
  console.log('========== FILE UPLOAD STARTED ==========');
  
  try {
    if (!socket || !socket.connected) {
      console.warn('Cannot send file update: socket not connected');
      UIManager.displayMessage('Cannot share file: Not connected to server', 'error', 3000);
      console.log('========== FILE UPLOAD FAILED: Socket not connected ==========');
      return false;
    }
    
    // Validate file data
    if (!fileData || !fileData.type || fileData.type !== 'file') {
      console.error('Invalid file data - missing required properties');
      UIManager.displayMessage('Cannot share file: Invalid file data', 'error', 3000);
      console.log('========== FILE UPLOAD FAILED: Invalid file data ==========');
      return false;
    }
    
    console.log('File data validation passed');
    
    // Log original data information
    if (fileData._originalData) {
      console.log('File has _originalData attached - sender side confirmed');
    } else if (window.originalFileData) {
      console.log('Global originalFileData exists - sender side confirmed');
    }
    
    // Get best available filename for display
    let displayFilename = fileData.fileName;
    if (fileData._displayFileName) {
      displayFilename = fileData._displayFileName;
    } else if (fileData._originalData && fileData._originalData.fileName) {
      displayFilename = fileData._originalData.fileName;
    } else if (window.originalFileData && window.originalFileData.fileName) {
      displayFilename = window.originalFileData.fileName;
    }
    
    // Get session data for encryption
    const sessionData = Session.getCurrentSession();
    if (!sessionData || !sessionData.passphrase) {
      console.error('Cannot encrypt file: No valid session passphrase available');
      UIManager.displayMessage('Cannot encrypt file: Session data not available', 'error', 3000);
      console.log('========== FILE UPLOAD FAILED: Missing session data ==========');
      return false;
    }
    
    console.log('Session data validated successfully');
    
    // Prepare enhanced file data with metadata
    // We need to create a safe copy to prevent modifying the original
    const enhancedFileData = {
      type: 'file',
      fileName: fileData.fileName,
      fileSize: fileData.fileSize,
      fileType: fileData.fileType || 'application/octet-stream',
      content: fileData.content,
      originClient: socket.id,
      clientInfo: getBrowserInfo(),
      timestamp: fileData.timestamp || Date.now()
    };
    
    // Keep a safe reference to any original data for later use
    if (fileData._originalData) {
      enhancedFileData._originalData = { ...fileData._originalData };
    }
    if (fileData._displayFileName) {
      enhancedFileData._displayFileName = fileData._displayFileName;
    }
    
    console.log('Enhanced file data prepared successfully');
    console.log(`Preparing to encrypt file: ${displayFilename}, size: ${formatFileSize(fileData.fileSize)} bytes`);
    
    // CRITICAL: Synchronously encrypt the data to prevent socket disconnections
    let encryptedFileData;
    try {
      encryptedFileData = encryptClipboardContent(enhancedFileData, sessionData.passphrase);
      console.log('File encryption successful');
    } catch (encryptError) {
      console.error('File encryption failed:', encryptError);
      UIManager.displayMessage('Failed to encrypt file: ' + (encryptError.message || 'Unknown error'), 'error', 5000);
      console.log('========== FILE UPLOAD FAILED: Encryption error ==========');
      return false;
    }
    
    // Show user notification message
    UIManager.displayMessage(`Sharing encrypted file with other devices: ${displayFilename}`, 'info', 3000);
    console.log(`Sending encrypted file update: ${displayFilename}, encrypted size: ${encryptedFileData.content?.length || 0} chars`);
    
    // Use try-catch to safely emit socket event
    try {
      // Determine if we should use chunked transmission (for large files)
      if (encryptedFileData.content && encryptedFileData.content.length > 100000) { // 100KB threshold
        console.log(`Large file detected (${formatFileSize(encryptedFileData.content.length)}), using chunked transmission`);
        return sendLargeFileInChunks(encryptedFileData, sessionData.sessionId, displayFilename);
      } else {
        // Small file - send in one piece as before
        console.log('Small file, using single transmission');
        socket.emit('file-update', encryptedFileData);
        console.log('Socket.emit completed successfully');
        console.log('========== FILE UPLOAD COMPLETED ==========');
        return true;
      }
    } catch (socketError) {
      console.error('Socket emit error:', socketError);
      UIManager.displayMessage('Failed to send file: Network error', 'error', 3000);
      console.log('========== FILE UPLOAD FAILED: Socket emit error ==========');
      return false;
    }
  } catch (unexpectedError) {
    // Outermost catch to prevent any unexpected failures
    console.error('Unexpected error in sendFileUpdate:', unexpectedError);
    UIManager.displayMessage('Failed to send file due to an unexpected error', 'error', 3000);
    console.log('========== FILE UPLOAD FAILED: Unexpected error ==========');
    return false;
  }
}

/**
 * Send a large file in chunks to prevent socket disconnections
 * @param {Object} fileData - Complete encrypted file data
 * @param {string} sessionId - Current session ID
 * @param {string} displayFilename - Human-readable filename for messages
 * @returns {boolean} Success status
 */
function sendLargeFileInChunks(fileData, sessionId, displayFilename) {
  console.log('========== CHUNKED FILE UPLOAD STARTED ==========');
  
  try {
    // Generate a unique transfer ID
    const transferId = Date.now() + '-' + Math.random().toString(36).substring(2);
    
    // Extract the content that needs to be chunked
    const content = fileData.content;
    
    // Define chunk size and calculate total chunks
    const chunkSize = 50000; // 50KB chunks
    const totalChunks = Math.ceil(content.length / chunkSize);
    
    console.log(`Preparing chunked transfer: ${transferId}`);
    console.log(`Total file size: ${formatFileSize(content.length)}`);
    console.log(`Chunk size: ${formatFileSize(chunkSize)}`);
    console.log(`Total chunks: ${totalChunks}`);
    
    // Create a metadata packet without the actual content
    const metadataPacket = {
      ...fileData,
      content: null, // Don't include content in metadata
      transferId: transferId,
      totalChunks: totalChunks,
      isChunkedTransfer: true,
      sessionId: sessionId,
      originalFileSize: content.length
    };
    
    // Display progress message to user
    UIManager.displayMessage(`Sending file in chunks: ${displayFilename} (0%)`, 'info', 0);
    
    // Send metadata first
    console.log('Sending file metadata packet');
    socket.emit('file-metadata', metadataPacket);
    
    // Track how many chunks we've sent
    let sentChunks = 0;
    
    // Send chunks with delay between them
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, content.length);
      const chunk = content.substring(start, end);
      
      // Calculate delay based on chunk index
      const delay = i * 50; // 50ms between chunks
      
      setTimeout(() => {
        try {
          // Send the chunk
          socket.emit('file-chunk', {
            transferId: transferId,
            chunkIndex: i,
            data: chunk,
            sessionId: sessionId,
            isLastChunk: i === totalChunks - 1
          });
          
          // Increment sent counter
          sentChunks++;
          
          // Update progress every few chunks or for the last one
          if (sentChunks % 5 === 0 || sentChunks === totalChunks) {
            const progress = Math.floor((sentChunks / totalChunks) * 100);
            console.log(`Chunk progress: ${progress}% (${sentChunks}/${totalChunks})`);
            UIManager.displayMessage(`Sending file in chunks: ${displayFilename} (${progress}%)`, 'info', 0);
          }
          
          // If this is the last chunk, log completion
          if (sentChunks === totalChunks) {
            console.log('All chunks sent successfully');
            UIManager.displayMessage(`File sent successfully: ${displayFilename}`, 'success', 3000);
            console.log('========== CHUNKED FILE UPLOAD COMPLETED ==========');
          }
        } catch (chunkError) {
          console.error(`Error sending chunk ${i}:`, chunkError);
        }
      }, delay);
    }
    
    return true;
  } catch (error) {
    console.error('Error in chunked file transmission:', error);
    UIManager.displayMessage('Error sending file chunks', 'error', 5000);
    console.log('========== CHUNKED FILE UPLOAD FAILED ==========');
    return false;
  }
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

// Removed duplicate handleClientListUpdate function

/**
 * Handle server ping request
 * @param {Object} data - Ping data including timestamp
 */
function handleServerPing(data) {
  try {
    // Log with detailed info
    console.log(`Received server ping at ${getFormattedTime()}`, data);
    
    // Try to get session data using enhanced reliable method
    const sessionData = Session.getCurrentSession();
    
    // Get the most reliable socket reference
    const activeSocket = getActiveSocketReference();
    
    // Check if we have what we need to respond
    if (!sessionData) {
      console.warn('Cannot respond to ping - no valid session data available');
      console.log('Attempting to retrieve session ID from socket...');
      
      // Try to get sessionId directly from socket if available
      const socketSessionId = activeSocket?.sessionId;
      if (socketSessionId && activeSocket && activeSocket.connected) {
        console.log(`Found session ID ${socketSessionId} in socket object`);
        respondToPing(socketSessionId, null, activeSocket);
        return;
      }
      return;
    }
    
    if (!activeSocket || !activeSocket.connected) {
      console.warn('Cannot respond to ping - no connected socket available');
      return;
    }
    
    // We have both session data and a connected socket - proceed with response
    respondToPing(sessionData.sessionId, sessionData.passphrase, activeSocket);
    
  } catch (err) {
    console.error('Error handling server ping:', err);
  }
}

/**
 * Get the most reliable socket reference
 * @returns {Object|null} Active socket instance
 */
function getActiveSocketReference() {
  // First try the Session module's method if available
  if (typeof Session.getActiveSocket === 'function') {
    const sessionSocket = Session.getActiveSocket();
    if (sessionSocket) {
      return sessionSocket;
    }
  }
  
  // Then try window.appSocket
  if (window.appSocket && window.appSocket.connected) {
    return window.appSocket;
  }
  
  // Finally fall back to module-level socket
  return socket;
}

/**
 * Helper function to respond to server pings
 * @param {string} sessionId - Session ID
 * @param {string|null} passphrase - Session passphrase (optional)
 * @param {Object} socketToUse - Socket to use for the response
 */
function respondToPing(sessionId, passphrase, socketToUse) {
  // Get browser info for enhanced client identification
  const browserInfo = getBrowserInfo();
  
  // Log sending response
  console.log(`Sending ping response for session ${sessionId}, client ID: ${socketToUse.id}`);
  
  // Respond with session authentication and client info
  socketToUse.emit('client-ping-response', {
    sessionId: sessionId,
    sessionToken: passphrase, // This may be null in some cases
    timestamp: Date.now(),
    browserInfo: browserInfo,
    clientId: socketToUse.id,
    responseTime: getFormattedTime()
  });
  
  // Update UI to show we're active
  UIManager.updateSyncStatus('Connection active - last ping: ' + getFormattedTime());
  
  // Update local client list to ensure this client shows as active
  updateClientActiveStatus(socketToUse.id);
}

/**
 * Update the active status of a client in the local list
 * @param {string} clientId - Client ID to mark as active
 */
function updateClientActiveStatus(clientId) {
  // Update local client list if we have one
  if (connectedClients && connectedClients.length > 0) {
    // Find our client ID in the list
    const ourClient = connectedClients.find(client => client.id === clientId);
    if (ourClient) {
      // Make sure it's marked as active
      ourClient.active = true;
      
      // If we have a callback, update UI
      if (clientListCallback) {
        clientListCallback(connectedClients);
      }
    }
  }
}

/**
 * Handle session inactive notification
 * @param {Object} data - Notification data with message
 */
function handleSessionInactive(data) {
  try {
    console.warn('Received session inactive notification:', data);
    
    // Display error message to user with longer duration
    UIManager.displayMessage(data.message || 'Session became inactive. Reconnecting...', 'error', 8000);
    
    // Update UI to show inactive status
    UIManager.updateSyncStatus('Connection inactive - reconnecting...');
    
    // Add details to console for debugging
    console.log(`Session inactive at ${getFormattedTime()} - will redirect to login in 3 seconds`);
    
    // Force reconnection by redirecting to login after a delay
    setTimeout(() => {
      console.log('Session inactive - logging out and redirecting to login');
      Session.logout();
    }, 3000);
  } catch (err) {
    console.error('Error handling session inactive notification:', err);
    // Fallback logout in case of error
    setTimeout(() => Session.logout(), 5000);
  }
}

/**
 * Debug function to log all connected clients
 */
function logConnectedClients() {
  console.log('Connected clients:', connectedClients);
  
  // Count active clients
  const activeCount = connectedClients.filter(client => client.active).length;
  console.log(`Active clients: ${activeCount} / ${connectedClients.length}`);
  
  return { total: connectedClients.length, active: activeCount };
}

/**
 * Handle file metadata (first part of chunked file transfer)
 * @param {Object} metadataPacket - File metadata packet
 */
function handleFileMetadata(metadataPacket) {
  // Skip if this metadata originated from this client
  if (metadataPacket.originClient === socket.id) {
    return;
  }
  
  console.log(`Received file metadata for chunked transfer: ${metadataPacket.transferId}`);
  console.log(`Total chunks expected: ${metadataPacket.totalChunks}`);
  
  // Create a new entry in the chunkedFileTransfers map
  chunkedFileTransfers[metadataPacket.transferId] = {
    metadata: metadataPacket,
    chunks: new Array(metadataPacket.totalChunks),
    receivedChunks: 0,
    inProgress: true,
    startTime: Date.now()
  };
  
  // Get best available filename for display
  let displayName = metadataPacket.fileName || 'file';
  
  // Try to decrypt filename if it's encrypted
  if (metadataPacket.fileName && metadataPacket.fileName.startsWith('U2FsdGVk')) {
    try {
      const sessionData = Session.getCurrentSession();
      if (sessionData && sessionData.passphrase) {
        const tempObject = {
          type: 'file',
          fileName: metadataPacket.fileName
        };
        
        const decrypted = decryptClipboardContent(tempObject, sessionData.passphrase);
        if (decrypted && decrypted.fileName) {
          displayName = decrypted.fileName;
        }
      }
    } catch (err) {
      console.error('Failed to decrypt filename in metadata:', err);
    }
  }
  
  // Display progress message to user
  UIManager.displayMessage(`Receiving file: ${displayName} (0%)`, 'info', 0);
}

/**
 * Process a received file in a unified way (whether from chunks or direct broadcast)
 * This ensures identical storage structure between sender and receiver
 * @param {Object} fileData - The file data to process
 */
function processReceivedFile(fileData) {
  console.log('Processing received file:', fileData.fileName || 'unnamed file');
  
  try {
    // Get session data for decryption
    const sessionData = Session.getCurrentSession();
    if (!sessionData || !sessionData.passphrase) {
      throw new Error('No session data available for decryption');
    }
    
    // Decrypt the file content and metadata
    console.log('Decrypting received file');
    const decryptedFile = decryptClipboardContent(fileData, sessionData.passphrase);
    
    // Create identical structure to what file-operations.js creates for local files
    // This ensures getBestFileData() will work identically for uploaded and received files
    window.originalFileData = {
      fileName: decryptedFile.fileName,
      fileSize: decryptedFile.fileSize, 
      fileType: decryptedFile.fileType,
      content: decryptedFile.content,
      timestamp: Date.now(),
      isOriginal: true
    };
    
    console.log('Successfully decrypted file and stored original data');
    console.log('Original filename:', window.originalFileData.fileName);
    console.log('Content starts with:', window.originalFileData.content.substring(0, 30) + '...');
    
    // Also attach the original data to the file object itself (like sender side does)
    decryptedFile._originalData = {...window.originalFileData};
    decryptedFile._displayFileName = decryptedFile.fileName;
    
    // Forward to content handlers
    if (fileUpdateCallback) {
      fileUpdateCallback(decryptedFile);
    }
    
    return true;
  } catch (error) {
    console.error('Error processing received file:', error);
    
    // Even if full decryption failed, try to at least decrypt the filename for display
    if (fileData.fileName && fileData.fileName.startsWith('U2FsdGVk')) {
      try {
        const sessionData = Session.getCurrentSession();
        if (sessionData && sessionData.passphrase) {
          const tempObject = {
            type: 'file',
            fileName: fileData.fileName
          };
          
          const decrypted = decryptClipboardContent(tempObject, sessionData.passphrase);
          if (decrypted && decrypted.fileName) {
            console.log('Partial filename decryption successful:', decrypted.fileName);
            
            // Store decrypted filename for display
            fileData._displayFileName = decrypted.fileName;
          }
        }
      } catch (err) {
        console.error('Partial filename decryption failed:', err);
      }
    }
    
    if (window.ContentHandlers && window.ContentHandlers.getDisplayFileData) {
      console.log('Using ContentHandlers.getDisplayFileData to ensure proper filename display');
      fileData = window.ContentHandlers.getDisplayFileData(fileData);
    }
    
    // Still try to handle the file even if decryption failed
    if (fileUpdateCallback) {
      fileUpdateCallback(fileData);
    }
    
    return false;
  }
}

/**
 * Handle individual file chunk
 * @param {Object} chunkData - File chunk data
 */
function handleFileChunk(chunkData) {
  // Skip if there's no transfer ID or it's not in our transfers map
  if (!chunkData.transferId || !chunkedFileTransfers[chunkData.transferId]) {
    console.warn(`Received chunk for unknown transfer: ${chunkData.transferId}`);
    return;
  }
  
  // Get the transfer info
  const transfer = chunkedFileTransfers[chunkData.transferId];
  
  // Store the chunk in its position in the array
  transfer.chunks[chunkData.chunkIndex] = chunkData.data;
  transfer.receivedChunks++;
  
  // Calculate progress
  const progress = Math.floor((transfer.receivedChunks / transfer.metadata.totalChunks) * 100);
  
  // Get display name for progress messages
  let displayName = 'file';
  if (transfer.metadata._displayFileName) {
    displayName = transfer.metadata._displayFileName;
  } else if (transfer.metadata.fileName) {
    displayName = transfer.metadata.fileName;
  }
  
  // Update progress periodically
  if (transfer.receivedChunks % 5 === 0 || chunkData.isLastChunk) {
    console.log(`Chunked file progress: ${progress}% (${transfer.receivedChunks}/${transfer.metadata.totalChunks})`);
    UIManager.displayMessage(`Receiving file: ${displayName} (${progress}%)`, 'info', 0);
  }
  
  // Check if this is the last chunk or if we've received all chunks
  if (chunkData.isLastChunk || transfer.receivedChunks === transfer.metadata.totalChunks) {
    console.log(`Chunked file transfer complete: ${chunkData.transferId}`);
    
    // Reassemble the file data
    const completeContent = transfer.chunks.join('');
    
    // Create complete file data object
    const completeFileData = {
      ...transfer.metadata,
      content: completeContent,
      timestamp: Date.now()
    };
    
    // Mark transfer as complete
    transfer.inProgress = false;
    transfer.completedTime = Date.now();
    
    // Process the complete file using our unified processing function
    // This ensures identical storage structure between sender and receiver
    processReceivedFile(completeFileData);
    
    // Clean up after a delay (keep for debugging)
    setTimeout(() => {
      delete chunkedFileTransfers[chunkData.transferId];
    }, 30000);
    
    // Show completion message
    UIManager.displayMessage(`File received successfully: ${displayName}`, 'success', 3000);
  }
}

/**
 * Handle client list update event
 * @param {Object} data - Event data containing clients array
 */
function handleClientListUpdate(data) {
  console.log('CLIENT LIST UPDATE RECEIVED:', data);
  
  if (data.clients && Array.isArray(data.clients)) {
    // Update our local list of clients
    connectedClients = data.clients;
    
    // Check for active clients
    const activeClients = data.clients.filter(c => c.active).length;
    console.log(`Active clients in update: ${activeClients}/${data.clients.length}`);
    console.log('Client data:', JSON.stringify(data.clients));
    
    // Log client count information
    const counts = logConnectedClients();
    
    // Update UI via callback
    if (clientListCallback) {
      console.log('Updating UI with client list via callback');
      clientListCallback(connectedClients);
    } else {
      console.warn('No client list callback registered - UI will not update');
    }
    
    // Also update the status display for better user feedback
    UIManager.updateSyncStatus(`Connected to session with ${counts.active} active clients`);
  } else {
    console.warn('Invalid client list update received:', data);
  }
}
