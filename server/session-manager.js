/**
 * Session Manager for clipboard sync application
 * Handles session creation, joining, and authentication
 */

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
    } else {
      // Invalid content type
      return false;
    }
  } else {
    // Invalid content format
    return false;
  }
  
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
