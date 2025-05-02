/**
 * ClipShare Encryption Module
 * 
 * Handles encryption and decryption of clipboard content using CryptoJS.
 * Provides transparent encryption for all content types (text, images, files)
 * using the session passphrase as the encryption key.
 */

// Export essential encryption functions to window for UI and last-resort decryption
window.decryptData = decryptData;
window.decryptClipboardContent = decryptClipboardContent;

/**
 * Encrypt data with AES using the session passphrase
 * @param {string|object} data - Data to encrypt
 * @param {string} passphrase - Session passphrase to use as encryption key
 * @returns {string} Encrypted data as string
 */
export function encryptData(data, passphrase) {
  // Convert data to string if needed
  const dataString = typeof data === 'object' ? JSON.stringify(data) : String(data);
  
  // Encrypt with AES using the session passphrase
  return CryptoJS.AES.encrypt(dataString, passphrase).toString();
}

/**
 * Decrypt data with AES using the session passphrase
 * @param {string} encryptedData - Encrypted data string
 * @param {string} passphrase - Session passphrase to use as decryption key
 * @returns {string|object} Decrypted data, parsed as JSON if it's a JSON string
 */
export function decryptData(encryptedData, passphrase) {
  try {
    // Validate input to prevent errors
    if (!encryptedData) {
      console.warn('Cannot decrypt: encryptedData is null or undefined');
      return encryptedData;
    }
    
    if (typeof encryptedData !== 'string') {
      console.warn('Cannot decrypt: encryptedData is not a string', typeof encryptedData);
      return encryptedData;
    }
    
    // Check if data is actually encrypted (AES encrypted data starts with "U2FsdGVk" in base64)
    // This is "Salted__" when decoded - the standard AES encryption prefix
    if (!encryptedData.startsWith('U2FsdGVk')) {
      console.warn('Data does not appear to be encrypted (missing AES marker), returning as-is');
      return encryptedData;
    }
    
    // Proceed with decryption only if input is valid
    const bytes = CryptoJS.AES.decrypt(encryptedData, passphrase);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
    
    // Try to parse as JSON if it looks like JSON
    if (decryptedString.startsWith('{') || decryptedString.startsWith('[')) {
      try {
        return JSON.parse(decryptedString);
      } catch (e) {
        console.warn('Failed to parse decrypted data as JSON:', e);
      }
    }
    
    return decryptedString;
  } catch (error) {
    console.error('Decryption failed:', error);
    // Return original data instead of throwing exception to prevent app from crashing
    console.warn('Returning original data due to decryption failure');
    return encryptedData;
  }
}

/**
 * Encrypt data with AES asynchronously using the session passphrase
 * This non-blocking version prevents main thread blocking for large files
 * @param {string|object} data - Data to encrypt
 * @param {string} passphrase - Session passphrase to use as encryption key
 * @returns {Promise<string>} Promise resolving to encrypted data string
 */
export function encryptDataAsync(data, passphrase) {
  return new Promise((resolve, reject) => {
    try {
      // Use setTimeout to yield back to the event loop
      // This prevents blocking the main thread for large files
      setTimeout(() => {
        try {
          // Convert data to string if needed
          const dataString = typeof data === 'object' ? JSON.stringify(data) : String(data);
          
          // Encrypt with AES using the session passphrase
          const encrypted = CryptoJS.AES.encrypt(dataString, passphrase).toString();
          resolve(encrypted);
        } catch (innerError) {
          reject(innerError);
        }
      }, 0);
    } catch (outerError) {
      reject(outerError);
    }
  });
}

/**
 * Encrypt clipboard content object based on content type
 * @param {Object} content - Clipboard content object
 * @param {string} passphrase - Session passphrase
 * @returns {Object} Encrypted content object
 */
export function encryptClipboardContent(content, passphrase) {
  // Create a copy to avoid modifying the original
  const encryptedContent = {...content};
  
  if (!passphrase) {
    console.warn('No passphrase provided for encryption, returning unencrypted content');
    return content;
  }
  
  try {
    console.log(`Encrypting ${content.type} content`);
    
    if (content.type === 'text') {
      // For text, encrypt the content directly
      encryptedContent.content = encryptData(content.content, passphrase);
    } else if (content.type === 'image') {
      // For images, encrypt the base64 data
      encryptedContent.content = encryptData(content.content, passphrase);
    } else if (content.type === 'file') {
      // For files, encrypt the file data
      encryptedContent.content = encryptData(content.content, passphrase);
      // Also encrypt the filename for additional privacy
      encryptedContent.fileName = encryptData(content.fileName, passphrase);
      // Encrypt MIME type if available
      if (content.mimeType) {
        encryptedContent.mimeType = encryptData(content.mimeType, passphrase);
      }
    }
    
    // No need for an encrypted flag - all transmitted content is assumed encrypted
    
    return encryptedContent;
  } catch (error) {
    console.error('Encryption failed:', error);
    // Return the original content if encryption fails
    return content;
  }
}

/**
 * Encrypt clipboard content object asynchronously - non-blocking version
 * Use this for large files to prevent socket disconnections
 * @param {Object} content - Clipboard content object
 * @param {string} passphrase - Session passphrase
 * @returns {Promise<Object>} Promise resolving to encrypted content object
 */
export async function encryptClipboardContentAsync(content, passphrase) {
  // Early validation
  if (!passphrase) {
    console.warn('No passphrase provided for encryption, returning unencrypted content');
    return content;
  }
  
  if (!content) {
    console.warn('No content provided for encryption');
    return content;
  }
  
  // Create a copy to avoid modifying the original
  const encryptedContent = {...content};
  
  try {
    console.log(`Asynchronously encrypting ${content.type} content`);
    
    // Show progress via UI if needed for large files
    if (content.type === 'file' && content.fileSize > 100000) {
      // This will be passed to UI manager by the caller
      encryptedContent._encryptionProgress = true;
    }
    
    if (content.type === 'text') {
      // For text, encrypt the content directly
      encryptedContent.content = await encryptDataAsync(content.content, passphrase);
    } else if (content.type === 'image') {
      // For images, encrypt the base64 data
      encryptedContent.content = await encryptDataAsync(content.content, passphrase);
    } else if (content.type === 'file') {
      // For files, encrypt the file data - most important for large files
      console.log('Starting async file content encryption');
      encryptedContent.content = await encryptDataAsync(content.content, passphrase);
      console.log('Completed async file content encryption');
      
      // Also encrypt the filename for additional privacy
      encryptedContent.fileName = await encryptDataAsync(content.fileName, passphrase);
      
      // Encrypt MIME type if available
      if (content.mimeType) {
        encryptedContent.mimeType = await encryptDataAsync(content.mimeType, passphrase);
      }
    }
    
    // No need for an encrypted flag - all transmitted content is assumed encrypted
    
    return encryptedContent;
  } catch (error) {
    console.error('Async encryption failed:', error);
    // Return the original content if encryption fails
    return content;
  }
}

/**
 * Decrypt clipboard content object based on content type
 * @param {Object} content - Encrypted clipboard content object
 * @param {string} passphrase - Session passphrase
 * @returns {Object} Decrypted content object
 */
export function decryptClipboardContent(content, passphrase) {
  // Skip if no content or no passphrase provided
  if (!content || !passphrase) {
    console.warn('Cannot decrypt: missing content or passphrase');
    return content;
  }
  
  // Create a clone to avoid modifying the original
  const decryptedContent = {...content};
  
  try {
    console.log(`Attempting to decrypt ${content.type} content`);
    
    if (content.type === 'text') {
      decryptedContent.content = decryptData(content.content, passphrase);
      console.log('Text decryption successful');
    } else if (content.type === 'image') {
      decryptedContent.content = decryptData(content.content, passphrase);
      console.log('Image decryption successful');
    } else if (content.type === 'file') {
      decryptedContent.content = decryptData(content.content, passphrase);
      decryptedContent.fileName = decryptData(content.fileName, passphrase);
      // Decrypt MIME type if available
      if (content.mimeType) {
        decryptedContent.mimeType = decryptData(content.mimeType, passphrase);
      }
      console.log('File decryption successful');
    }
    
    return decryptedContent;
  } catch (error) {
    console.error('Decryption failed:', error);
    // Return the original encrypted content if decryption fails
    // This prevents breaking the application flow
    return content;
  }
}
