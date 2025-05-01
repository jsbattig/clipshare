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
  if (userAgent.indexOf('windows') !== -1) return 'windows';
  if (userAgent.indexOf('mac') !== -1) return 'mac';
  if (userAgent.indexOf('linux') !== -1) return 'linux';
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
  
  if (ua.match(/chrome|chromium|crios/i)) {
    browserName = "Chrome";
  } else if (ua.match(/firefox|fxios/i)) {
    browserName = "Firefox";
  } else if (ua.match(/safari/i)) {
    browserName = "Safari";
  } else if (ua.match(/opr\//i)) {
    browserName = "Opera";
  } else if (ua.match(/edg/i)) {
    browserName = "Edge";
  }
  
  return {
    name: browserName,
    windowId: getWindowIdentifier(),
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
      // For images, use beginning of data URL as representative sample
      return content.content.substring(0, 100);
    }
  }
  
  return JSON.stringify(content);
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
