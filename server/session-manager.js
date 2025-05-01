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
        content: ''
      },
      createdAt: new Date(),
      clients: []
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
 * @returns {Object} Current clipboard object with type and content
 */
function getClipboardContent(sessionId) {
  if (!sessions[sessionId]) {
    return { type: 'text', content: '' };
  }
  
  // Handle backward compatibility with old format (string only)
  if (typeof sessions[sessionId].clipboard === 'string') {
    // Migrate old format to new format
    sessions[sessionId].clipboard = {
      type: 'text',
      content: sessions[sessionId].clipboard
    };
  }
  
  return sessions[sessionId].clipboard;
}

/**
 * Update the clipboard content for a session
 * @param {string} sessionId - The session identifier
 * @param {Object|string} content - New clipboard content (object with type and content or legacy string)
 */
function updateClipboardContent(sessionId, content) {
  if (!sessions[sessionId]) return;
  
  // Handle different input formats
  if (typeof content === 'string') {
    // Legacy format - convert to object
    sessions[sessionId].clipboard = {
      type: 'text',
      content: content
    };
  } else if (typeof content === 'object' && (content.type === 'text' || content.type === 'image')) {
    // New format - typed content
    sessions[sessionId].clipboard = content;
  }
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
