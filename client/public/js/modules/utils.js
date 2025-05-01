/**
 * ClipShare Utilities
 * 
 * Common utility functions used throughout the application.
 */

import { CONFIG } from './config.js';

/**
 * Detect operating system for clipboard format handling
 * @returns {string} The detected OS: 'windows', 'mac', 'linux', or 'unknown'
 */
export function detectOperatingSystem() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform.toLowerCase();
  
  // Check platform first (more reliable)
  if (platform.indexOf('win') !== -1) return 'windows';
  if (platform.indexOf('mac') !== -1) return 'mac';
  if (platform.indexOf('linux') !== -1 || platform.indexOf('x11') !== -1) return 'linux';
  
  // Fallback to userAgent if platform check fails
  if (userAgent.indexOf('windows') !== -1 || userAgent.indexOf('win') !== -1) return 'windows';
  if (userAgent.indexOf('macintosh') !== -1 || userAgent.indexOf('mac os x') !== -1) return 'mac';
  if (userAgent.indexOf('linux') !== -1 || userAgent.indexOf('x11') !== -1) return 'linux';
  
  // Additional iOS/Android detection
  if (userAgent.indexOf('ipad') !== -1 || userAgent.indexOf('iphone') !== -1) return 'ios';
  if (userAgent.indexOf('android') !== -1) return 'android';
  
  return 'unknown';
}

/**
 * Convert a Blob to a base64 string
 * @param {Blob} blob - The blob to convert
 * @returns {Promise<string>} Promise resolving to a base64 data URL
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to convert blob to base64'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert a data URL to a Blob object
 * @param {string} dataURL - The data URL to convert
 * @returns {Blob} The resulting Blob object
 */
export function dataURLtoBlob(dataURL) {
  // Convert base64/URLEncoded data component to raw binary data held in a string
  let byteString;
  if (dataURL.split(',')[0].indexOf('base64') >= 0) {
    byteString = atob(dataURL.split(',')[1]);
  } else {
    byteString = decodeURIComponent(dataURL.split(',')[1]);
  }
  
  // Separate out the mime component
  const mimeString = dataURL.split(',')[0].split(':')[1].split(';')[0];
  
  // Write the bytes of the string to an ArrayBuffer
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  
  // Create a Blob with the ArrayBuffer
  return new Blob([ab], { type: mimeString });
}

/**
 * Check if an image is oversized and should be displayed as thumbnail
 * @param {HTMLImageElement} imageElement - Image element to check
 * @returns {boolean} True if the image is oversized
 */
export function isOversizedImage(imageElement) {
  return imageElement.naturalWidth > CONFIG.files.maxImageSize || 
         imageElement.naturalHeight > CONFIG.files.maxImageSize;
}

/**
 * Format file size to human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Determine file extension from path or MIME type
 * @param {string} fileName - File name or path
 * @param {string} mimeType - Optional MIME type
 * @returns {string} The file extension
 */
export function getFileExtension(fileName, mimeType) {
  // First try to get extension from filename
  if (fileName && fileName.includes('.')) {
    return fileName.split('.').pop().toLowerCase();
  }
  
  // If no filename or no extension, try to derive from MIME type
  if (mimeType) {
    const mimeExtMap = {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/plain': 'txt',
      'text/html': 'html',
      'text/css': 'css',
      'text/javascript': 'js',
      'application/json': 'json',
      'application/xml': 'xml',
      'application/zip': 'zip',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
    };
    
    return mimeExtMap[mimeType] || mimeType.split('/')[1] || 'bin';
  }
  
  return 'bin'; // Default binary extension
}

/**
 * Get MIME type from file extension
 * @param {string} fileName - File name with extension
 * @returns {string} The MIME type
 */
export function getMimeTypeFromExtension(fileName) {
  const ext = getFileExtension(fileName);
  const extMimeMap = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'html': 'text/html',
    'htm': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'json': 'application/json',
    'xml': 'application/xml',
    'zip': 'application/zip',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
  };
  
  return extMimeMap[ext] || 'application/octet-stream';
}

/**
 * Display a formatted timestamp
 * @returns {string} Current time formatted as a string
 */
export function getFormattedTime() {
  const now = new Date();
  return now.toLocaleTimeString();
}

/**
 * Safely access DOM elements with error handling
 * @param {string} id - The element ID to find
 * @param {boolean} required - Whether the element is required
 * @returns {HTMLElement} The DOM element or null if not found
 */
export function getElement(id, required = false) {
  const element = document.getElementById(id);
  
  if (!element && required) {
    console.error(`Required DOM element not found: #${id}`);
  }
  
  return element;
}

/**
 * Generate a unique window identifier that persists across page reloads
 * @returns {string} Window identifier
 */
export function getWindowIdentifier() {
  // Check if we already have a window ID in sessionStorage
  let windowId = sessionStorage.getItem('clipshare_window_id');
  
  if (!windowId) {
    // Create a new window ID - combination of timestamp and random string
    windowId = `window_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('clipshare_window_id', windowId);
  }
  
  return windowId;
}

/**
 * Get browser information
 * @returns {Object} Browser details
 */
export function getBrowserInfo() {
  const ua = navigator.userAgent;
  let browserName = "Unknown";
  
  // Better browser detection with version information
  if (ua.match(/edg/i)) {
    browserName = "Edge";
  } else if (ua.match(/opr\//i) || ua.match(/opera/i)) {
    browserName = "Opera";
  } else if (ua.match(/chrome|chromium|crios/i)) {
    // Check for Arc browser (Chromium-based)
    if (ua.toLowerCase().indexOf('arc') !== -1) {
      browserName = "Arc";
    } else {
      browserName = "Chrome";
    }
  } else if (ua.match(/firefox|fxios/i)) {
    browserName = "Firefox";
  } else if (ua.match(/safari/i)) {
    browserName = "Safari";
  }
  
  // Get OS information
  const osInfo = detectOperatingSystem();
  
  // Create a fingerprint that combines multiple factors
  const browserFingerprint = `${browserName}_${osInfo}_${navigator.platform}_${window.screen.width}x${window.screen.height}`;
  
  return {
    name: browserName,
    os: osInfo,
    windowId: getWindowIdentifier(),
    fingerprint: browserFingerprint,
    userAgent: ua.substring(0, 100) // Truncated to avoid excessive size
  };
}

/**
 * Generate a simple content hash for comparison
 * @param {Object|string} content - Content to hash
 * @returns {string} Content hash
 */
export function hashContent(content) {
  if (typeof content === 'string') return content;
  
  if (typeof content === 'object') {
    if (content.type === 'text') return content.content;
    if (content.type === 'image') {
      return generateImageHash(content.content);
    }
  }
  
  return JSON.stringify(content);
}

/**
 * Generate a more robust hash for image data
 * @param {string} imageData - Base64 encoded image data
 * @returns {string} Image hash
 */
export function generateImageHash(imageData) {
  if (!imageData || typeof imageData !== 'string') {
    return '';
  }
  
  try {
    // Strip out metadata/headers from data URL
    const base64Part = imageData.split(',')[1] || imageData;
    
    // If it's a very short string, just return it
    if (base64Part.length < 100) return base64Part;
    
    // Sample from multiple parts of the image instead of just the beginning
    const totalLength = base64Part.length;
    
    // Take more samples and smaller chunks to create a more stable hash
    // These smaller, more numerous samples help with cross-OS variations
    const samples = [];
    
    // Beginning samples
    samples.push(base64Part.substring(0, 20));
    samples.push(base64Part.substring(20, 40));
    
    // Middle samples - take 5 samples evenly distributed in the middle
    for (let i = 1; i <= 5; i++) {
      const position = Math.floor((totalLength * i) / 6);
      samples.push(base64Part.substring(position, position + 15));
    }
    
    // End samples
    samples.push(base64Part.substring(totalLength - 40, totalLength - 20));
    samples.push(base64Part.substring(totalLength - 20));
    
    // Calculate string length as well - since this is stable across platforms
    const lengthInfo = `len:${base64Part.length}`;
    
    // Join all parts
    return samples.join('_') + '_' + lengthInfo;
  } catch (err) {
    console.error('Error generating image hash:', err);
    return imageData.substring(0, 100); // Fallback to original method
  }
}

/**
 * Extract image dimensions from data URL if possible
 * @param {string} dataUrl - Image data URL
 * @returns {string} Dimension string or empty string
 */
export function extractImageDimensions(dataUrl) {
  // This is a basic implementation that would be enhanced with actual
  // image dimension extraction. For now we'll just return
  // a portion of the data that's likely to contain dimension info
  
  try {
    // For PNG, dimensions are in bytes 16-23
    // For JPEG, dimensions are harder to extract without parsing the full format
    // This is a simplified approach for demo purposes
    
    // Extract MIME type
    const mimeMatch = dataUrl.match(/data:(image\/[^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : '';
    
    // Return mime type as part of the hash
    return mimeType;
  } catch (err) {
    return '';
  }
}

/**
 * Normalize image data by stripping irrelevant metadata
 * @param {Object} imageContent - Image content object
 * @returns {Object} Normalized image content
 */
export function normalizeImageContent(imageContent) {
  if (!imageContent || !imageContent.content) {
    return imageContent;
  }
  
  // Create a new object with normalized content
  return {
    type: 'image',
    content: normalizeDataUrl(imageContent.content),
    imageType: imageContent.imageType || 'image/png'
  };
}

/**
 * Normalize a data URL by removing variable metadata
 * @param {string} dataUrl - Data URL to normalize
 * @returns {string} Normalized data URL
 */
function normalizeDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return dataUrl;
  }
  
  try {
    // Split the data URL into parts
    const parts = dataUrl.split(',');
    if (parts.length < 2) return dataUrl;
    
    // Get the base64 data
    const base64Data = parts[1];
    
    // Get a standardized MIME type, discard all parameters except base type
    let mimeType = 'image/png';
    
    // Extract just the basic MIME type without parameters
    const mimeMatch = parts[0].match(/data:(image\/[^;,]+)/);
    if (mimeMatch && mimeMatch[1]) {
      const simpleMime = mimeMatch[1].toLowerCase();
      if (simpleMime === 'image/jpeg' || simpleMime === 'image/jpg') {
        mimeType = 'image/jpeg';
      } else if (simpleMime === 'image/png') {
        mimeType = 'image/png';
      } else if (simpleMime === 'image/gif') {
        mimeType = 'image/gif';
      } else if (simpleMime === 'image/svg+xml') {
        mimeType = 'image/svg+xml';
      } else {
        // Use the detected MIME type but ensure it's lowercase
        mimeType = simpleMime;
      }
    }
    
    // Always use one standard format for the data URL
    // This ensures consistency across platforms
    return `data:${mimeType};base64,${base64Data}`;
  } catch (err) {
    console.error('Error normalizing data URL:', err);
    return dataUrl;
  }
}

/**
 * Extract the base content without metadata
 * @param {Object|string} content - Content object or string
 * @returns {string} The actual content without metadata
 */
export function getBaseContent(content) {
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    if (content.type === 'text') return content.content;
    if (content.type === 'image') return content.content;
  }
  return JSON.stringify(content);
}
