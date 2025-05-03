/**
 * Transfer Module
 * 
 * Handles all data transfer operations using socket.io-stream for efficient
 * streaming transfer of clipboard content and files with proper chunking and backpressure.
 * All encryption/decryption is handled in Web Workers to prevent UI blocking.
 */

import { encryptClipboardContent, decryptClipboardContent } from './encryption.js';
import * as Session from './session.js';
import * as UIManager from './ui-manager.js';

// Load socket.io-stream from CDN if not available locally
if (typeof ss === 'undefined') {
  console.log('Loading socket.io-stream from CDN');
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io-stream/0.9.1/socket.io-stream.min.js';
  script.async = true;
  document.head.appendChild(script);
}

// Module state
let socket = null;
let fileWorker = null;
let contentReceivedCallback = null;
let fileReceivedCallback = null;
let transferInProgress = false;

/**
 * Initialize the transfer module
 * @param {Object} socketInstance - Socket.IO instance
 * @param {Object} callbacks - Callback functions
 */
export function init(socketInstance, callbacks = {}) {
  // Wait for socket.io-stream to load if needed
  const waitForSS = () => {
    if (typeof ss === 'undefined') {
      console.log('Waiting for socket.io-stream to load...');
      setTimeout(waitForSS, 100);
      return;
    }
    
    initializeModule(socketInstance, callbacks);
  };
  
  // Start waiting or initialize immediately if available
  if (typeof ss === 'undefined') {
    waitForSS();
  } else {
    initializeModule(socketInstance, callbacks);
  }
}

/**
 * Initialize the module once dependencies are loaded
 * @param {Object} socketInstance - Socket.IO instance
 * @param {Object} callbacks - Callback functions
 */
function initializeModule(socketInstance, callbacks) {
  socket = socketInstance;
  
  // Store callbacks
  if (callbacks.onContentReceived) contentReceivedCallback = callbacks.onContentReceived;
  if (callbacks.onFileReceived) fileReceivedCallback = callbacks.onFileReceived;
  
  setupEventListeners();
  
  console.log('Transfer module initialized');
}

/**
 * Set up event listeners for incoming streams
 */
function setupEventListeners() {
  if (!socket || typeof ss === 'undefined') return;
  
  // Listen for clipboard content streams
  ss(socket).on('clipboard-stream', (stream, data) => {
    console.log('Receiving clipboard stream:', data.type);
    
    // Show progress message
    UIManager.displayMessage(`Receiving ${data.type} content...`, 'info', 0);
    
    // Create buffer to collect chunks
    const chunks = [];
    let totalSize = 0;
    
    // Process incoming chunks
    stream.on('data', (chunk) => {
      chunks.push(chunk);
      totalSize += chunk.length;
      
      // Update progress periodically (every ~100KB)
      if (totalSize % 100000 < 16384) {
        UIManager.displayMessage(`Receiving ${data.type} (${Math.round(totalSize/1024)}KB)...`, 'info', 0);
      }
    });
    
    // Process complete content when stream ends
    stream.on('end', () => {
      console.log(`Stream complete: ${totalSize} bytes received`);
      UIManager.displayMessage(`Processing ${data.type} content...`, 'info', 0);
      
      // Get complete content - browser compatible way
      const completeContent = chunks.join('');
      
      // Process with Web Worker to avoid blocking UI
      processReceivedContent(completeContent, data);
    });
    
    // Handle stream errors
    stream.on('error', (error) => {
      console.error('Stream error:', error);
      UIManager.displayMessage('Error receiving content', 'error', 5000);
    });
  });
  
  // Listen for file streams
  ss(socket).on('file-stream', (stream, data) => {
    console.log('Receiving file stream:', data.fileName);
    
    // Show progress message
    UIManager.displayMessage(`Receiving file: ${data.fileName}...`, 'info', 0);
    
    // Create buffer to collect chunks
    const chunks = [];
    let totalSize = 0;
    let expectedSize = data.fileSize || 0;
    
    // Process incoming chunks
    stream.on('data', (chunk) => {
      chunks.push(chunk);
      totalSize += chunk.length;
      
      // Update progress periodically (every ~100KB)
      if (totalSize % 100000 < 16384) {
        const percent = expectedSize ? Math.round((totalSize / expectedSize) * 100) : '?';
        UIManager.displayMessage(`Receiving file: ${data.fileName} (${percent}%)`, 'info', 0);
      }
    });
    
    // Process complete file when stream ends
    stream.on('end', () => {
      console.log(`File stream complete: ${totalSize} bytes received`);
      UIManager.displayMessage(`Processing file: ${data.fileName}...`, 'info', 0);
      
      // Get complete content - browser compatible way
      const completeContent = chunks.join('');
      
      // Process with Web Worker to avoid blocking UI
      processReceivedFile(completeContent, data);
    });
    
    // Handle stream errors
    stream.on('error', (error) => {
      console.error('File stream error:', error);
      UIManager.displayMessage('Error receiving file', 'error', 5000);
    });
  });
}

/**
 * Get or create file worker for background processing
 * @returns {Worker} Web Worker instance
 */
function getFileWorker() {
  if (!fileWorker) {
    try {
      fileWorker = new Worker('js/workers/file-processor.worker.js');
      console.log('File processor worker created in transfer module');
      
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
 * Process received content with Web Worker
 * @param {string} encryptedContent - Encrypted content string
 * @param {Object} metadata - Content metadata
 */
function processReceivedContent(encryptedContent, metadata) {
  try {
    const worker = getFileWorker();
    
    if (!worker) {
      // Fall back to synchronous processing if worker is not available
      processReceivedContentSync(encryptedContent, metadata);
      return;
    }
    
    // Get session data for decryption
    const sessionData = Session.getCurrentSession();
    if (!sessionData || !sessionData.passphrase) {
      console.error('Cannot decrypt content: No valid session passphrase available');
      UIManager.displayMessage('Cannot decrypt content: Session data not available', 'error', 5000);
      return;
    }
    
    // Set up message handler for worker
    worker.onmessage = function(e) {
      const response = e.data;
      
      if (response.status === 'progress') {
        // Update progress message
        UIManager.displayMessage(
          `Processing content: ${response.progress}% - ${response.message}`, 
          'info', 
          0
        );
      } 
      else if (response.status === 'complete') {
        console.log('Web Worker completed content processing');
        
        // Get decrypted content
        const decryptedContent = response.decryptedData;
        
        // Call callback with decrypted content
        if (contentReceivedCallback) {
          contentReceivedCallback(decryptedContent, false);
        }
        
        // Update UI with success message
        const contentTypeMsg = metadata.type === 'image' ? 'Image' : 'Text';
        UIManager.displayMessage(`${contentTypeMsg} content received from another device. Click "Copy" to use it in your clipboard.`, 'success', 5000);
      } 
      else if (response.status === 'error') {
        console.error('Worker reported error:', response.error);
        UIManager.displayMessage('Failed to decrypt content: ' + response.error, 'error', 5000);
      }
    };
    
    // Send to worker for decryption
    worker.postMessage({
      action: 'decrypt',
      encryptedContent: JSON.parse(encryptedContent),
      passphrase: sessionData.passphrase
    });
  } catch (error) {
    console.error('Error processing received content:', error);
    UIManager.displayMessage('Failed to process received content', 'error', 5000);
    
    // Try with synchronous fallback
    processReceivedContentSync(encryptedContent, metadata);
  }
}

/**
 * Synchronous fallback for content processing
 * @param {string} encryptedContent - Encrypted content string
 * @param {Object} metadata - Content metadata
 */
function processReceivedContentSync(encryptedContent, metadata) {
  try {
    // Get session data for decryption
    const sessionData = Session.getCurrentSession();
    if (!sessionData || !sessionData.passphrase) {
      console.error('Cannot decrypt content: No valid session passphrase available');
      UIManager.displayMessage('Cannot decrypt content: Session data not available', 'error', 5000);
      return;
    }
    
    // Parse the encrypted content
    const parsedContent = JSON.parse(encryptedContent);
    
    // Decrypt the content
    const decryptedContent = decryptClipboardContent(parsedContent, sessionData.passphrase);
    
    // Call callback with decrypted content
    if (contentReceivedCallback) {
      contentReceivedCallback(decryptedContent, false);
    }
    
    // Update UI with success message
    const contentTypeMsg = metadata.type === 'image' ? 'Image' : 'Text';
    UIManager.displayMessage(`${contentTypeMsg} content received from another device. Click "Copy" to use it in your clipboard.`, 'success', 5000);
  } catch (error) {
    console.error('Error in synchronous content processing:', error);
    UIManager.displayMessage('Failed to decrypt received content', 'error', 5000);
  }
}

/**
 * Process received file with Web Worker
 * @param {string} encryptedContent - Encrypted file content string
 * @param {Object} metadata - File metadata
 */
function processReceivedFile(encryptedContent, metadata) {
  try {
    const worker = getFileWorker();
    
    if (!worker) {
      // Fall back to synchronous processing if worker is not available
      processReceivedFileSync(encryptedContent, metadata);
      return;
    }
    
    // Get session data for decryption
    const sessionData = Session.getCurrentSession();
    if (!sessionData || !sessionData.passphrase) {
      console.error('Cannot decrypt file: No valid session passphrase available');
      UIManager.displayMessage('Cannot decrypt file: Session data not available', 'error', 5000);
      return;
    }
    
    // Set up message handler for worker
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
        
        // Get decrypted file data
        const decryptedData = response.decryptedData;
        
        // Store original content for download access
        window.originalFileData = {
          fileName: decryptedData.fileName,
          fileSize: decryptedData.fileSize, 
          fileType: decryptedData.fileType,
          content: decryptedData.content,
          timestamp: Date.now(),
          isOriginal: true
        };
        
        // Add original data reference for download
        decryptedData._originalData = {...window.originalFileData};
        decryptedData._displayFileName = decryptedData.fileName;
        
        // Call callback with decrypted file data
        if (fileReceivedCallback) {
          fileReceivedCallback(decryptedData);
        }
        
        // Update UI with success message
        UIManager.displayMessage(`File received: ${decryptedData.fileName}`, 'success', 5000);
      } 
      else if (response.status === 'error') {
        console.error('Worker reported error:', response.error);
        UIManager.displayMessage('Failed to decrypt file: ' + response.error, 'error', 5000);
      }
    };
    
    // Send to worker for decryption
    worker.postMessage({
      action: 'decrypt_file',
      encryptedContent: JSON.parse(encryptedContent),
      passphrase: sessionData.passphrase
    });
  } catch (error) {
    console.error('Error processing received file:', error);
    UIManager.displayMessage('Failed to process received file', 'error', 5000);
    
    // Try with synchronous fallback
    processReceivedFileSync(encryptedContent, metadata);
  }
}

/**
 * Synchronous fallback for file processing
 * @param {string} encryptedContent - Encrypted file content string
 * @param {Object} metadata - File metadata
 */
function processReceivedFileSync(encryptedContent, metadata) {
  try {
    // Get session data for decryption
    const sessionData = Session.getCurrentSession();
    if (!sessionData || !sessionData.passphrase) {
      console.error('Cannot decrypt file: No valid session passphrase available');
      UIManager.displayMessage('Cannot decrypt file: Session data not available', 'error', 5000);
      return;
    }
    
    // Parse the encrypted content
    const parsedContent = JSON.parse(encryptedContent);
    
    // Decrypt the file content
    const decryptedData = decryptClipboardContent(parsedContent, sessionData.passphrase);
    
    // Store original content for download access
    window.originalFileData = {
      fileName: decryptedData.fileName,
      fileSize: decryptedData.fileSize, 
      fileType: decryptedData.fileType,
      content: decryptedData.content,
      timestamp: Date.now(),
      isOriginal: true
    };
    
    // Add original data reference for download
    decryptedData._originalData = {...window.originalFileData};
    decryptedData._displayFileName = decryptedData.fileName;
    
    // Call callback with decrypted file data
    if (fileReceivedCallback) {
      fileReceivedCallback(decryptedData);
    }
    
    // Update UI with success message
    UIManager.displayMessage(`File received: ${decryptedData.fileName}`, 'success', 5000);
  } catch (error) {
    console.error('Error in synchronous file processing:', error);
    UIManager.displayMessage('Failed to decrypt received file', 'error', 5000);
  }
}

/**
 * Send content to other clients using stream
 * @param {Object} content - Content to send (text, image, file)
 * @returns {Promise<boolean>} Success status
 */
export async function sendContent(content) {
  if (transferInProgress) {
    console.warn('A transfer is already in progress, please wait...');
    UIManager.displayMessage('Please wait for the current transfer to complete', 'warning', 3000);
    return false;
  }
  
  try {
    transferInProgress = true;
    
    // Check socket connection
    if (!socket || !socket.connected || typeof ss === 'undefined') {
      console.warn('Cannot send content: Socket not connected or ss not loaded');
      UIManager.displayMessage('Cannot send: Not connected to session', 'error', 3000);
      transferInProgress = false;
      return false;
    }
    
    // Get session data for encryption
    const sessionData = Session.getCurrentSession();
    if (!sessionData || !sessionData.passphrase) {
      console.error('Cannot encrypt content: No valid session passphrase available');
      UIManager.displayMessage('Cannot encrypt content: Session data not available', 'error', 5000);
      transferInProgress = false;
      return false;
    }
    
    // Use worker to encrypt content if available
    const worker = getFileWorker();
    
    if (worker) {
      return await encryptAndSendWithWorker(content, sessionData);
    } else {
      return await encryptAndSendSync(content, sessionData);
    }
  } catch (error) {
    console.error('Error sending content:', error);
    UIManager.displayMessage('Failed to send content: ' + error.message, 'error', 5000);
    transferInProgress = false;
    return false;
  }
}

/**
 * Encrypt and send content using Web Worker
 * @param {Object} content - Content to send
 * @param {Object} sessionData - Session data with passphrase
 * @returns {Promise<boolean>} Success status
 */
function encryptAndSendWithWorker(content, sessionData) {
  return new Promise((resolve, reject) => {
    const worker = getFileWorker();
    
    // Show progress message
    const contentType = content.type === 'file' ? 'file' : (content.type === 'image' ? 'image' : 'text');
    UIManager.displayMessage(`Encrypting ${contentType} content...`, 'info', 0);
    
    // Set up message handler for worker
    worker.onmessage = function(e) {
      const response = e.data;
      
      if (response.status === 'progress') {
        // Update progress message
        UIManager.displayMessage(
          `Processing content: ${response.progress}% - ${response.message}`, 
          'info', 
          0
        );
      } 
      else if (response.status === 'complete') {
        console.log('Web Worker completed encryption');
        
        // Get encrypted content
        const encryptedContent = response.encryptedData;
        
        // Send encrypted content
        sendEncryptedContent(encryptedContent, content, resolve, reject);
      } 
      else if (response.status === 'error') {
        console.error('Worker reported error:', response.error);
        UIManager.displayMessage('Failed to encrypt content: ' + response.error, 'error', 5000);
        transferInProgress = false;
        reject(new Error(response.error));
      }
    };
    
    // Send to worker for encryption
    worker.postMessage({
      action: 'encrypt',
      content: content,
      passphrase: sessionData.passphrase
    });
  });
}

/**
 * Encrypt and send content synchronously
 * @param {Object} content - Content to send
 * @param {Object} sessionData - Session data with passphrase
 * @returns {Promise<boolean>} Success status
 */
async function encryptAndSendSync(content, sessionData) {
  try {
    // Show progress message
    const contentType = content.type === 'file' ? 'file' : (content.type === 'image' ? 'image' : 'text');
    UIManager.displayMessage(`Encrypting ${contentType} content...`, 'info', 0);
    
    // Encrypt content
    const encryptedContent = encryptClipboardContent(content, sessionData.passphrase);
    
    // Create a stream to emit
    return await new Promise((resolve, reject) => {
      sendEncryptedContent(encryptedContent, content, resolve, reject);
    });
  } catch (error) {
    console.error('Error in synchronous encryption:', error);
    UIManager.displayMessage('Failed to encrypt content', 'error', 5000);
    transferInProgress = false;
    throw error;
  }
}

/**
 * Send encrypted content via stream
 * @param {Object} encryptedContent - Encrypted content object
 * @param {Object} originalContent - Original content for metadata
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 */
function sendEncryptedContent(encryptedContent, originalContent, resolve, reject) {
  try {
    // Create metadata for stream
    const metadata = {
      type: originalContent.type,
      originClient: socket.id,
      timestamp: Date.now()
    };
    
    // For files, include additional metadata
    if (originalContent.type === 'file') {
      metadata.fileName = originalContent._displayFileName || originalContent.fileName;
      metadata.fileSize = originalContent.fileSize;
      metadata.fileType = originalContent.fileType;
      
      // Send as file stream
      sendFileStream(encryptedContent, metadata, resolve, reject);
    } else {
      // Send as clipboard stream
      sendClipboardStream(encryptedContent, metadata, resolve, reject);
    }
  } catch (error) {
    console.error('Error sending encrypted content:', error);
    UIManager.displayMessage('Failed to send content', 'error', 5000);
    transferInProgress = false;
    reject(error);
  }
}

/**
 * Send clipboard content via stream
 * @param {Object} encryptedContent - Encrypted content object
 * @param {Object} metadata - Content metadata
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 */
function sendClipboardStream(encryptedContent, metadata, resolve, reject) {
  try {
    // Create a stream
    const stream = ss.createStream();
    
    // Show progress message
    UIManager.displayMessage(`Sending ${metadata.type} content...`, 'info', 0);
    
    // Emit the stream with metadata
    ss(socket).emit('clipboard-stream', stream, metadata);
    
    // Convert encrypted content to string
    const contentString = JSON.stringify(encryptedContent);
    
    // Create a buffer from the string (browser-compatible approach)
    // Convert string to ArrayBuffer first
    const encoder = new TextEncoder();
    const contentArray = encoder.encode(contentString);
    const totalSize = contentArray.length;
    
    // Create a readable stream using socket.io-stream's approach
    const bufferStream = ss.createStream();
    
    // Write the content to the stream
    bufferStream.write(contentString);
    bufferStream.end();
    
    // Set up progress tracking
    let bytesSent = 0;
    
    // Pipe through a progress stream first
    const progressStream = ss.createStream();
    progressStream.on('data', (chunk) => {
      bytesSent += chunk.length;
      
      // Update progress periodically (every ~100KB)
      if (bytesSent % 100000 < 16384) {
        const percent = Math.floor((bytesSent / totalSize) * 100);
        UIManager.displayMessage(`Sending ${metadata.type} content: ${percent}%`, 'info', 0);
      }
    });
    
    progressStream.on('end', () => {
      console.log(`${metadata.type} content sent successfully: ${bytesSent} bytes`);
      UIManager.displayMessage(`${metadata.type} content sent successfully`, 'success', 3000);
      transferInProgress = false;
      resolve(true);
    });
    
    // Pipe the buffer through progress stream to the output stream
    bufferStream.pipe(progressStream).pipe(stream);
  } catch (error) {
    console.error('Error sending clipboard stream:', error);
    UIManager.displayMessage('Failed to send content', 'error', 5000);
    transferInProgress = false;
    reject(error);
  }
}

/**
 * Send file content via stream
 * @param {Object} encryptedContent - Encrypted file content
 * @param {Object} metadata - File metadata
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 */
function sendFileStream(encryptedContent, metadata, resolve, reject) {
  try {
    // Create a stream
    const stream = ss.createStream();
    
    // Show progress message with filename
    UIManager.displayMessage(`Sending file: ${metadata.fileName}...`, 'info', 0);
    
    // Emit the stream with metadata
    ss(socket).emit('file-stream', stream, metadata);
    
    // Convert encrypted content to string
    const contentString = JSON.stringify(encryptedContent);
    
    // Create a buffer from the string (browser-compatible approach)
    // Convert string to ArrayBuffer first
    const encoder = new TextEncoder();
    const contentArray = encoder.encode(contentString);
    const totalSize = contentArray.length;
    
    // Create a readable stream using socket.io-stream's approach
    const bufferStream = ss.createStream();
    
    // Write the content to the stream
    bufferStream.write(contentString);
    bufferStream.end();
    
    // Set up progress tracking
    let bytesSent = 0;
    
    // Pipe through a progress stream first
    const progressStream = ss.createStream();
    progressStream.on('data', (chunk) => {
      bytesSent += chunk.length;
      
      // Update progress periodically (every ~100KB)
      if (bytesSent % 100000 < 16384) {
        const percent = Math.floor((bytesSent / totalSize) * 100);
        UIManager.displayMessage(`Sending file: ${metadata.fileName} (${percent}%)`, 'info', 0);
      }
    });
    
    progressStream.on('end', () => {
      console.log(`File sent successfully: ${metadata.fileName} (${bytesSent} bytes)`);
      UIManager.displayMessage(`File sent successfully: ${metadata.fileName}`, 'success', 3000);
      transferInProgress = false;
      resolve(true);
    });
    
    // Pipe the buffer through progress stream to the output stream
    bufferStream.pipe(progressStream).pipe(stream);
  } catch (error) {
    console.error('Error sending file stream:', error);
    UIManager.displayMessage('Failed to send file', 'error', 5000);
    transferInProgress = false;
    reject(error);
  }
}
