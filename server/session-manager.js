/**
 * Session Manager for clipboard sync application
 * Handles session creation, joining, and authentication
 */

// Enhanced hash function for content that matches client-side algorithm
function hashContent(content) {
  // For text content, use the text itself
  if (typeof content === 'string') return content;
  
  if (typeof content === 'object') {
    if (content.type === 'text') return content.content;
    if (content.type === 'image') {
      // Use the same robust hashing algorithm as the client
      return generateImageHash(content.content);
    }
  }
  return JSON.stringify(content);
}

/**
 * Generate a more robust hash for image data - SAME AS CLIENT VERSION
 * @param {string} imageData - Base64 encoded image data
 * @returns {string} Image hash
 */
function generateImageHash(imageData) {
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
 * Normalize image content object
 * @param {Object} imageContent - Image content object
 * @returns {Object} Normalized image content
 */
function normalizeImageContent(imageContent) {
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

// Simple in-memory session storage
const sessions = {};

/**
 * Create a new session or join an existing one
 * @param {string} sessionId - The session identifier
 * @param {string} passphrase - The passphrase for authentication
 * @returns {object} Session result with success status and message
 */
function joinSession(sessionId, passphrase) {
  // Normalize session ID to prevent case sensitivity issues
  const normalizedSessionId = sessionId.trim();
  
  // Check if session exists
  if (sessions[normalizedSessionId]) {
    // Verify passphrase for existing session
    if (sessions[normalizedSessionId].passphrase === passphrase) {
      return { 
        success: true, 
        message: 'Session joined successfully', 
        isNewSession: false 
      };
    } else {
      return { 
        success: false, 
        message: 'Incorrect passphrase' 
      };
    }
  } else {
    // Create new session
    sessions[normalizedSessionId] = {
      passphrase,
      clipboard: {
        type: 'text',
        content: '',
        timestamp: Date.now(),
        originClient: null
      },
      createdAt: new Date(),
      clients: [],
      lastHeartbeat: Date.now()
    };
    
    return { 
      success: true, 
      message: 'New session created', 
      isNewSession: true 
    };
  }
}

/**
 * Get the current clipboard content for a session
 * @param {string} sessionId - The session identifier
 * @returns {Object} Current clipboard object with type, content, timestamp and originClient
 */
function getClipboardContent(sessionId) {
  if (!sessions[sessionId]) {
    return { 
      type: 'text', 
      content: '',
      timestamp: Date.now(),
      originClient: null
    };
  }
  
  // Handle backward compatibility with old format (string only)
  if (typeof sessions[sessionId].clipboard === 'string') {
    // Migrate old format to new format
    sessions[sessionId].clipboard = {
      type: 'text',
      content: sessions[sessionId].clipboard,
      timestamp: Date.now(),
      originClient: null
    };
  }
  
  // Handle partially-migrated format (missing timestamp or originClient)
  if (!sessions[sessionId].clipboard.timestamp) {
    sessions[sessionId].clipboard.timestamp = Date.now();
  }
  
  if (!sessions[sessionId].clipboard.hasOwnProperty('originClient')) {
    sessions[sessionId].clipboard.originClient = null;
  }
  
  return sessions[sessionId].clipboard;
}

/**
 * Update the clipboard content for a session
 * @param {string} sessionId - The session identifier
 * @param {Object|string} content - New clipboard content
 * @param {string} originClient - Client ID that originated this update
 * @returns {boolean} True if update was applied, false if rejected (older timestamp)
 */
function updateClipboardContent(sessionId, content, originClient) {
  if (!sessions[sessionId]) return false;
  
  // Get current clipboard state
  const currentClipboard = getClipboardContent(sessionId);
  
  // Prepare new clipboard object
  let newClipboard;
  
  // Handle different input formats
  if (typeof content === 'string') {
    // Legacy format - convert to object
    newClipboard = {
      type: 'text',
      content: content,
      timestamp: Date.now(),
      originClient: originClient
    };
  } else if (typeof content === 'object') {
    if (content.type === 'text' || content.type === 'image') {
      // New format with explicit timestamp
      newClipboard = {
        type: content.type,
        content: content.content,
        timestamp: content.timestamp || Date.now(),
        originClient: originClient
      };
      
      // If we have imageType, preserve it
      if (content.type === 'image' && content.imageType) {
        newClipboard.imageType = content.imageType;
      }
      
      // Preserve client info if provided
      if (content.clientInfo) {
        newClipboard.clientInfo = content.clientInfo;
      }
    } else {
      // Invalid content type
      return false;
    }
  } else {
    // Invalid content format
    return false;
  }
  
  // For images, normalize the content before hashing
  if (newClipboard.type === 'image') {
    newClipboard = normalizeImageContent(newClipboard);
  }
  
  // Generate content hash - only of the actual content, not metadata
  const contentHash = hashContent(newClipboard.type === 'text' ? newClipboard.content : newClipboard);
  
  // Include OS info in the hash key if available to help prevent cross-OS ping-pong
  const osInfo = newClipboard.clientInfo && newClipboard.clientInfo.os ? 
    `_${newClipboard.clientInfo.os}` : '';
  const browserInfo = newClipboard.clientInfo && newClipboard.clientInfo.name ? 
    `_${newClipboard.clientInfo.name}` : '';
  
  // Create a more specific hash key that includes client environment info
  const hashKey = contentHash + osInfo + browserInfo;
  
  // Initialize session tracking properties if they don't exist
  if (!sessions[sessionId].contentHashes) {
    sessions[sessionId].contentHashes = {};
  }
  
  if (!sessions[sessionId].lastUpdateTime) {
    sessions[sessionId].lastUpdateTime = Date.now();
  }
  
  if (!sessions[sessionId].updateFrequency) {
    sessions[sessionId].updateFrequency = [];
  }
  
  // Check time-based constraints
  const now = Date.now();
  const timeSinceLastUpdate = now - sessions[sessionId].lastUpdateTime;
  
  // Debug logging for cross-OS scenarios
  if (newClipboard.type === 'image' && newClipboard.clientInfo) {
    console.log(`Image update from: ${newClipboard.clientInfo.name} on ${newClipboard.clientInfo.os || 'unknown OS'}`);
    console.log(`Hash key: ${hashKey}`);
  }
  
  // Check if we've seen this exact content hash recently
  if (sessions[sessionId].contentHashes[hashKey]) {
    const hashAge = now - sessions[sessionId].contentHashes[hashKey].timestamp;
    
    // For images, use a longer detection window (5 seconds instead of 2)
    const pingPongWindow = newClipboard.type === 'image' ? 5000 : 2000;
    
    // If identical content was updated very recently
    // AND from a different client (potential ping-pong)
    if (hashAge < pingPongWindow && 
        sessions[sessionId].contentHashes[hashKey].client !== originClient) {
      console.log(`Preventing ping-pong: duplicate ${newClipboard.type} content from different client`);
      console.log(`Age: ${hashAge}ms, Origin: ${originClient} vs Previous: ${sessions[sessionId].contentHashes[hashKey].client}`);
      return false;
    }
  }
  
  // Track update frequency for throttling
  sessions[sessionId].updateFrequency.push(now);
  
  // Only keep the last 10 updates for calculating frequency
  if (sessions[sessionId].updateFrequency.length > 10) {
    sessions[sessionId].updateFrequency.shift();
  }
  
  // Check if updates are happening too frequently (potential ping-pong)
  // If we have 5+ updates in last 3 seconds
  if (sessions[sessionId].updateFrequency.length >= 5) {
    const oldestInWindow = sessions[sessionId].updateFrequency[0];
    const timeWindow = now - oldestInWindow;
    
    if (timeWindow < 3000) {
      // We're getting too many updates too quickly
      // Only allow this update if significant time has passed since last one
      if (timeSinceLastUpdate < 750) {
        console.log(`Throttling updates: too frequent (${timeWindow}ms for 5 updates)`);
        return false;
      }
    }
  }
  
  // Store hash with timestamp and additional info for future comparisons
  sessions[sessionId].contentHashes[hashKey] = {
    timestamp: now,
    client: originClient,
    type: newClipboard.type,
    clientInfo: newClipboard.clientInfo
  };
  
  // Update session tracking state
  sessions[sessionId].lastUpdateTime = now;
  
  // Only update if the new timestamp is newer or equal but from different client
  // This prevents race conditions and update loops
  if (newClipboard.timestamp > currentClipboard.timestamp || 
      (newClipboard.timestamp === currentClipboard.timestamp && 
       newClipboard.originClient !== currentClipboard.originClient)) {
    
    sessions[sessionId].clipboard = newClipboard;
    return true;
  }
  
  // Reject update with older timestamp
  return false;
}

/**
 * Add a client to a session
 * @param {string} sessionId - The session identifier
 * @param {string} clientId - The client socket ID
 */
function addClientToSession(sessionId, clientId) {
  if (sessions[sessionId]) {
    // Add client if not already in the list
    if (!sessions[sessionId].clients.includes(clientId)) {
      sessions[sessionId].clients.push(clientId);
    }
  }
}

/**
 * Remove a client from a session
 * @param {string} sessionId - The session identifier
 * @param {string} clientId - The client socket ID
 */
function removeClientFromSession(sessionId, clientId) {
  if (sessions[sessionId]) {
    sessions[sessionId].clients = sessions[sessionId].clients.filter(id => id !== clientId);
    
    // Optional: Clean up empty sessions after some time
    if (sessions[sessionId].clients.length === 0) {
      // For now, keep empty sessions in memory
      // In a production app, you might want to clean them up after a timeout
    }
  }
}

/**
 * Get all clients in a session
 * @param {string} sessionId - The session identifier
 * @returns {Array} List of client IDs
 */
function getSessionClients(sessionId) {
  return sessions[sessionId]?.clients || [];
}

/**
 * Get the number of clients in a session
 * @param {string} sessionId - The session identifier
 * @returns {number} Count of clients in the session
 */
function getClientCount(sessionId) {
  return sessions[sessionId]?.clients.length || 0;
}

module.exports = {
  joinSession,
  getClipboardContent,
  updateClipboardContent,
  addClientToSession,
  removeClientFromSession,
  getSessionClients,
  getClientCount
};
