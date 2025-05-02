/**
 * ClipShare Encryption Module
 * 
 * Handles encryption and decryption of clipboard content using CryptoJS.
 * Provides transparent encryption for all content types (text, images, files)
 * using the session passphrase as the encryption key.
 */

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
    // Decrypt the data
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
    throw new Error('Failed to decrypt data: ' + error.message);
  }
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
