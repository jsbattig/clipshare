/**
 * ClipShare Clipboard Utilities
 * 
 * Provides basic clipboard reading and writing functionality.
 * All clipboard operations are now manual (no automatic monitoring).
 */

import { CONFIG } from './config.js';
import { 
  detectOperatingSystem, 
  blobToBase64, 
  dataURLtoBlob 
} from './utils.js';

/**
 * Read from clipboard using multiple methods
 * @returns {Promise<Object>} Promise resolving to clipboard content object
 */
export async function readFromClipboard() {
  try {
    // Detect OS for better clipboard format handling
    const operatingSystem = detectOperatingSystem();
    console.log(`Detected operating system: ${operatingSystem}`);
    
    // First try the modern clipboard API to check for images
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        // This can read multiple content types
        const clipboardItems = await navigator.clipboard.read();
        console.log('Clipboard items found:', clipboardItems.length);
        
        // Enhanced clipboard format detection
        for (const item of clipboardItems) {
          console.log('Available clipboard formats:', item.types);
          
          // Check for images first
          if (item.types.some(type => type.startsWith('image/'))) {
            const imageType = item.types.find(type => type.startsWith('image/'));
            console.log(`Detected image format: ${imageType}`);
            
            const blob = await item.getType(imageType);
            // Convert blob to base64 for transmission
            const base64Image = await blobToBase64(blob);
            
            // Return image data in the correct format
            return {
              type: 'image',
              content: base64Image,
              imageType,
              timestamp: Date.now()
            };
          }
          
          // We're not handling files via clipboard monitoring
          // to keep things simple and avoid duplicate file sharing logic
        }
        
        // If we get here, no image was found, try text
        console.log('No image found, trying text');
        const text = await navigator.clipboard.readText();
        return {
          type: 'text',
          content: text,
          timestamp: Date.now()
        };
      } catch (clipboardApiError) {
        console.log('Modern Clipboard API failed, trying text fallback...', clipboardApiError);
        // Continue to text fallbacks
      }
    }
    
    // Try text-only methods
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        return {
          type: 'text',
          content: text,
          timestamp: Date.now()
        };
      } catch (textReadError) {
        console.log('Text clipboard read failed, trying execCommand...', textReadError);
      }
    }
    
    // Method 2: execCommand approach (older browsers)
    const textarea = document.createElement('textarea');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.top = '0';
    textarea.style.left = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    
    let success = false;
    let text = '';
    
    try {
      // Try to execute paste command
      success = document.execCommand('paste');
      if (success) {
        text = textarea.value;
        return {
          type: 'text',
          content: text,
          timestamp: Date.now()
        };
      }
    } catch (execError) {
      console.log('execCommand approach failed', execError);
    } finally {
      document.body.removeChild(textarea);
    }
    
    // If we get here, all methods failed
    throw new Error('Clipboard API not supported');
  } catch (err) {
    console.error('Failed to read clipboard:', err);
    throw err;
  }
}

/**
 * Write text to system clipboard
 * @param {string} text - Text to write
 * @returns {Promise<boolean>} Success status
 */
export async function writeTextToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      return success;
    }
  } catch (err) {
    console.error('Failed to write to clipboard:', err);
    return false;
  }
}

/**
 * Write image to system clipboard
 * @param {string} dataUrl - Image data URL
 * @param {string} imageType - MIME type of the image
 * @returns {Promise<boolean>} Success status
 */
export async function writeImageToClipboard(dataUrl, imageType) {
  if (!window.ClipboardItem) {
    console.log('ClipboardItem not supported, cannot write images to clipboard');
    return false;
  }
  
  try {
    const blob = dataURLtoBlob(dataUrl);
    const clipboardItem = new ClipboardItem({
      [imageType]: blob
    });
    
    await navigator.clipboard.write([clipboardItem]);
    return true;
  } catch (err) {
    console.error('Failed to write image to clipboard:', err);
    return false;
  }
}

/**
 * Write content to clipboard based on type
 * @param {Object} content - Content object with type and content
 * @returns {Promise<boolean>} Success status
 */
export async function writeToClipboard(content) {
  if (!content) return false;
  
  try {
    if (content.type === 'text') {
      return await writeTextToClipboard(content.content);
    } else if (content.type === 'image') {
      return await writeImageToClipboard(content.content, content.imageType || 'image/png');
    }
    return false;
  } catch (err) {
    console.error('Error writing to clipboard:', err);
    return false;
  }
}
