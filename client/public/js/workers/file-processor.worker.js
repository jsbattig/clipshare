/**
 * File Processor Web Worker
 * 
 * Handles file reading and encryption in a separate thread
 * to prevent main thread blocking and socket disconnections.
 */

// Import CryptoJS from CDN for encryption
importScripts('https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js');

// Worker state
let activeProcessing = false;

/**
 * Main message handler for worker
 */
self.onmessage = function(e) {
  const data = e.data;
  
  if (!data || !data.action) {
    self.postMessage({
      status: 'error',
      error: 'Invalid message format'
    });
    return;
  }
  
  switch (data.action) {
    case 'process':
      processFile(data);
      break;
    case 'encrypt':
      encryptData(data);
      break;
    case 'cancel':
      activeProcessing = false;
      self.postMessage({
        status: 'cancelled'
      });
      break;
    default:
      self.postMessage({
        status: 'error',
        error: `Unknown action: ${data.action}`
      });
  }
};

/**
 * Process file for encryption - direct file handling version
 * @param {Object} data - File data and processing options
 */
function processFile(data) {
  try {
    activeProcessing = true;
    
    // Send progress update
    self.postMessage({
      status: 'progress',
      progress: 0,
      message: 'Starting file processing'
    });
    
    // Validate required data
    if (data.file) {
      // New approach: File is directly passed to worker
      processRawFile(data);
    } else if (data.fileData && data.passphrase) {
      // Legacy approach: File data already read
      processFileData(data);
    } else {
      throw new Error('Missing required data for processing');
    }
  } catch (error) {
    console.error('Worker error processing file:', error);
    self.postMessage({
      status: 'error',
      error: error.message || 'Unknown error in worker'
    });
    activeProcessing = false;
  }
}

/**
 * Process a raw File object directly in the worker
 * @param {Object} data - Object containing the File and options
 */
function processRawFile(data) {
  // First read the file in the worker thread
  const file = data.file;
  const passphrase = data.passphrase;
  
  if (!file || !passphrase) {
    throw new Error('Missing file or passphrase');
  }
  
  // Send progress update
  self.postMessage({
    status: 'progress',
    progress: 10,
    message: 'Reading file in background thread'
  });
  
  // Use FileReader in the worker
  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      const fileContent = e.target.result;
      
      // Send progress update
      self.postMessage({
        status: 'progress',
        progress: 30,
        message: 'File read complete, preparing for encryption'
      });
      
      // Create file data object to encrypt
      const fileData = {
        type: 'file',
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType || 'application/octet-stream',
        content: fileContent,
        timestamp: Date.now()
      };
      
      // Encrypt the file data
      const encryptedData = encryptClipboardContent(fileData, passphrase);
      
      // Send success message back to main thread
      self.postMessage({
        status: 'complete',
        encryptedData: encryptedData,
        originalName: data.fileName,
        originalSize: data.fileSize
      });
      
      activeProcessing = false;
    } catch (error) {
      console.error('Error processing file after read:', error);
      self.postMessage({
        status: 'error',
        error: error.message || 'Error processing file after reading'
      });
      activeProcessing = false;
    }
  };
  
  reader.onerror = function(e) {
    console.error('Error reading file in worker:', e);
    self.postMessage({
      status: 'error',
      error: 'Failed to read file in worker thread'
    });
    activeProcessing = false;
  };
  
  // Read file as data URL
  reader.readAsDataURL(file);
}

/**
 * Process file data that's already been read
 * @param {Object} data - Pre-read file data and options
 */
function processFileData(data) {
  try {
    // Validate required data
    if (!data.fileData || !data.passphrase) {
      throw new Error('Missing required data: fileData or passphrase');
    }
    
    // Create file data object to encrypt
    const fileData = {
      type: 'file',
      fileName: data.fileName,
      fileSize: data.fileSize,
      fileType: data.fileType || 'application/octet-stream',
      content: data.fileData,
      timestamp: Date.now()
    };
    
    // Send progress update
    self.postMessage({
      status: 'progress',
      progress: 20,
      message: 'Preparing file data'
    });
    
    // Encrypt the file data
    const encryptedData = encryptClipboardContent(fileData, data.passphrase);
    
    // Send success message back to main thread
    self.postMessage({
      status: 'complete',
      encryptedData: encryptedData,
      originalName: data.fileName,
      originalSize: data.fileSize
    });
    
    activeProcessing = false;
  } catch (error) {
    console.error('Worker error processing file data:', error);
    self.postMessage({
      status: 'error',
      error: error.message || 'Unknown error processing file data'
    });
    activeProcessing = false;
  }
}

/**
 * Encrypt data directly (without file processing)
 * @param {Object} data - Data to encrypt and options
 */
function encryptData(data) {
  try {
    if (!data.content || !data.passphrase) {
      throw new Error('Missing required data: content or passphrase');
    }
    
    const encrypted = encryptDataString(data.content, data.passphrase);
    
    self.postMessage({
      status: 'complete',
      encryptedData: encrypted
    });
    
  } catch (error) {
    self.postMessage({
      status: 'error',
      error: error.message || 'Unknown encryption error'
    });
  }
}

/**
 * Encrypt a string or object with AES
 * @param {string|object} data - Data to encrypt
 * @param {string} passphrase - Passphrase for encryption
 * @returns {string} Encrypted data string
 */
function encryptDataString(data, passphrase) {
  // Convert data to string if needed
  const dataString = typeof data === 'object' ? JSON.stringify(data) : String(data);
  
  // Encrypt with AES using the passphrase
  return CryptoJS.AES.encrypt(dataString, passphrase).toString();
}

/**
 * Encrypt clipboard content object based on content type
 * @param {Object} content - Clipboard content object
 * @param {string} passphrase - Session passphrase
 * @returns {Object} Encrypted content object
 */
function encryptClipboardContent(content, passphrase) {
  // Create a copy to avoid modifying the original
  const encryptedContent = {...content};
  
  if (!passphrase) {
    throw new Error('No passphrase provided for encryption');
  }
  
  try {
    // Progress update - starting encryption
    self.postMessage({
      status: 'progress',
      progress: 40,
      message: 'Starting encryption'
    });
    
    if (content.type === 'text') {
      // For text, encrypt the content directly
      encryptedContent.content = encryptDataString(content.content, passphrase);
    } else if (content.type === 'image') {
      // For images, encrypt the base64 data
      encryptedContent.content = encryptDataString(content.content, passphrase);
    } else if (content.type === 'file') {
      // Progress update
      self.postMessage({
        status: 'progress',
        progress: 50,
        message: 'Encrypting file content'
      });
      
      // For files, encrypt the file data
      encryptedContent.content = encryptDataString(content.content, passphrase);
      
      // Progress update
      self.postMessage({
        status: 'progress',
        progress: 75,
        message: 'Encrypting metadata'
      });
      
      // Also encrypt the filename for additional privacy
      encryptedContent.fileName = encryptDataString(content.fileName, passphrase);
      
      // Encrypt MIME type if available
      if (content.mimeType) {
        encryptedContent.mimeType = encryptDataString(content.mimeType, passphrase);
      }
      
      // Progress update - almost done
      self.postMessage({
        status: 'progress',
        progress: 90,
        message: 'Finalizing encryption'
      });
    }
    
    return encryptedContent;
  } catch (error) {
    self.postMessage({
      status: 'error',
      error: 'Encryption failed: ' + (error.message || 'Unknown error')
    });
    
    throw error;
  }
}
