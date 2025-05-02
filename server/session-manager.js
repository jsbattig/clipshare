/**
 * Session Manager for clipboard sync application
 * Handles session creation, joining, and authentication
 */

// Simple in-memory session storage
const sessions = {};

// Constants for ping mechanism
const PING_TIMEOUT = 15000; // 15 seconds - time after which a client is considered inactive

// Model for client info within sessions
// {
//   id: socket.id,
//   ip: socket.handshake.address,
//   browserInfo: { name, os, windowId, fingerprint },
//   connectedAt: Date.toISOString()
// }

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
 * @returns {boolean} True if update was applied
 */
function updateClipboardContent(sessionId, content, originClient) {
  if (!sessions[sessionId]) return false;
  
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
  
  // Simple update - always accept the new content
  sessions[sessionId].clipboard = newClipboard;
  console.log(`Updated clipboard content for session ${sessionId} (from client ${originClient})`);
  
  return true;
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
 * Add a client to a session with detailed information
 * @param {string} sessionId - The session identifier
 * @param {string} clientId - The client socket ID
 * @param {Object} clientInfo - The client information including IP, browser details, etc.
 */
function addClientWithInfo(sessionId, clientId, clientInfo) {
  if (!sessions[sessionId]) return;
  
  // Add client to basic clients list if not already there
  if (!sessions[sessionId].clients.includes(clientId)) {
    sessions[sessionId].clients.push(clientId);
  }
  
  // Initialize clientsInfo if it doesn't exist
  if (!sessions[sessionId].clientsInfo) {
    sessions[sessionId].clientsInfo = {};
  }
  
  // Store the client info
  sessions[sessionId].clientsInfo[clientId] = {
    ...clientInfo,
    lastActivity: Date.now()
  };
}

/**
 * Remove a client from a session
 * @param {string} sessionId - The session identifier
 * @param {string} clientId - The client socket ID
 */
function removeClientFromSession(sessionId, clientId) {
  if (sessions[sessionId]) {
    // Remove from clients array
    sessions[sessionId].clients = sessions[sessionId].clients.filter(id => id !== clientId);
    
    // ALSO remove from clientsInfo object
    if (sessions[sessionId].clientsInfo && sessions[sessionId].clientsInfo[clientId]) {
      delete sessions[sessionId].clientsInfo[clientId];
    }
    
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

/**
 * Get detailed information about all clients in a session
 * @param {string} sessionId - The session identifier
 * @returns {Array} Array of client info objects
 */
function getSessionClientsInfo(sessionId) {
  if (!sessions[sessionId] || !sessions[sessionId].clientsInfo) {
    return [];
  }
  
  // Return array of client info objects
  return Object.entries(sessions[sessionId].clientsInfo).map(([clientId, info]) => ({
    id: clientId,
    ip: info.ip || 'Unknown',
    browserName: info.browserInfo?.name || 'Unknown',
    osName: info.browserInfo?.os || 'Unknown',
    connectedAt: info.connectedAt || new Date().toISOString(),
    lastActivity: info.lastActivity || Date.now(),
    active: isClientActive(sessionId, clientId)
  }));
}

/**
 * Check if a client is active (has responded to recent pings)
 * @param {string} sessionId - The session identifier
 * @param {string} clientId - The client socket ID
 * @returns {boolean} True if client is active
 */
function isClientActive(sessionId, clientId) {
  if (!sessions[sessionId]) return false;
  
  // Initialize activeClients if it doesn't exist
  if (!sessions[sessionId].activeClients) {
    sessions[sessionId].activeClients = [];
  }
  
  return sessions[sessionId].activeClients.includes(clientId);
}

/**
 * Get only active clients for a session
 * @param {string} sessionId - The session identifier
 * @returns {Array} List of active client IDs
 */
function getActiveSessionClients(sessionId) {
  if (!sessions[sessionId]) return [];
  
  // Initialize activeClients if it doesn't exist
  if (!sessions[sessionId].activeClients) {
    sessions[sessionId].activeClients = [];
  }
  
  return sessions[sessionId].activeClients;
}

/**
 * Record a ping response from a client
 * @param {string} sessionId - The session identifier
 * @param {string} clientId - The client socket ID
 * @returns {boolean} True if this was a newly activated client
 */
function recordPingResponse(sessionId, clientId) {
  if (!sessions[sessionId]) return false;
  
  // Initialize activeClients if it doesn't exist
  if (!sessions[sessionId].activeClients) {
    sessions[sessionId].activeClients = [];
  }
  
  // Check if client was already active
  const wasAlreadyActive = sessions[sessionId].activeClients.includes(clientId);
  
  // Add to active clients if not already there
  if (!wasAlreadyActive) {
    sessions[sessionId].activeClients.push(clientId);
  }
  
  // Initialize lastPingResponse if it doesn't exist
  if (!sessions[sessionId].lastPingResponse) {
    sessions[sessionId].lastPingResponse = {};
  }
  
  // Update last ping timestamp
  sessions[sessionId].lastPingResponse[clientId] = Date.now();
  
  // Return true if this client was newly activated
  return !wasAlreadyActive;
}

/**
 * Get all active session IDs
 * @returns {Array} List of active session IDs
 */
function getActiveSessions() {
  try {
    // Add debug log to confirm this function is being called
    console.log('getActiveSessions called, found:', Object.keys(sessions).length, 'sessions');
    return Object.keys(sessions);
  } catch (err) {
    console.error('Error in getActiveSessions:', err);
    return []; // Return empty array on error to prevent crashes
  }
}

/**
 * Get detailed status information about all sessions
 * @returns {Object} Object with session status information
 */
function getSessionsStatus() {
  const status = {};
  try {
    Object.keys(sessions).forEach(sessionId => {
      status[sessionId] = {
        clientCount: sessions[sessionId].clients.length,
        activeClientCount: sessions[sessionId].activeClients?.length || 0,
        hasLastPingData: !!sessions[sessionId].lastPingResponse
      };
    });
    return status;
  } catch (err) {
    console.error('Error in getSessionsStatus:', err);
    return {};
  }
}

/**
 * Reset the active clients for a session based on connected Socket.IO clients
 * @param {string} sessionId - The session identifier
 * @param {Array} connectedSocketIds - Array of connected socket IDs from Socket.IO
 */
function resetActiveClients(sessionId, connectedSocketIds) {
  if (!sessions[sessionId]) return;
  
  console.log(`Resetting active clients for session ${sessionId}`);
  console.log(`Connected sockets: ${connectedSocketIds.length}`);
  console.log(`Previous clients: ${sessions[sessionId].clients.length}`);

  // Reset clients array to match connected sockets
  sessions[sessionId].clients = [...connectedSocketIds];
  
  // Reset active clients to same list
  sessions[sessionId].activeClients = [...connectedSocketIds];
  
  // Clean up clientsInfo to match connected sockets
  if (sessions[sessionId].clientsInfo) {
    // Get current client IDs
    const currentClientIds = Object.keys(sessions[sessionId].clientsInfo);
    
    // Remove clients that are no longer connected
    currentClientIds.forEach(clientId => {
      if (!connectedSocketIds.includes(clientId)) {
        delete sessions[sessionId].clientsInfo[clientId];
      }
    });
  }
  
  console.log(`After reset: ${sessions[sessionId].clients.length} clients`);
}

/**
 * Clean up non-responsive clients
 * @param {string} sessionId - The session identifier
 * @returns {Object} Object containing count of removed clients and their IDs
 */
function cleanupNonResponsiveClients(sessionId) {
  if (!sessions[sessionId]) return { count: 0, removedIds: [] };
  
  console.log(`Running cleanup for session ${sessionId}`);
  
  // Initialize tracking structures if they don't exist
  if (!sessions[sessionId].lastPingResponse) {
    sessions[sessionId].lastPingResponse = {};
  }
  if (!sessions[sessionId].activeClients) {
    sessions[sessionId].activeClients = [];
  }
  
  const currentTime = Date.now();
  console.log(`Active clients before cleanup: ${sessions[sessionId].activeClients.length}`);
  
  // Get clients that haven't responded recently
  const inactiveClients = sessions[sessionId].clients.filter(clientId => {
    // Check if client has a recent ping response
    const lastPing = sessions[sessionId].lastPingResponse[clientId] || 0;
    return (currentTime - lastPing) > PING_TIMEOUT;
  });
  
  console.log(`Found ${inactiveClients.length} inactive clients`);
  
  // Remove each inactive client completely
  inactiveClients.forEach(clientId => {
    // Remove from clients array
    sessions[sessionId].clients = sessions[sessionId].clients.filter(id => id !== clientId);
    
    // Remove from active clients
    sessions[sessionId].activeClients = sessions[sessionId].activeClients.filter(id => id !== clientId);
    
    // Remove from clients info
    if (sessions[sessionId].clientsInfo && sessions[sessionId].clientsInfo[clientId]) {
      delete sessions[sessionId].clientsInfo[clientId];
    }
    
    // Remove from last ping response tracking
    if (sessions[sessionId].lastPingResponse[clientId]) {
      delete sessions[sessionId].lastPingResponse[clientId];
    }
    
    console.log(`Removed inactive client ${clientId} from session ${sessionId}`);
  });
  
  console.log(`Active clients after cleanup: ${sessions[sessionId].activeClients.length}`);
  
  return {
    count: inactiveClients.length,
    removedIds: inactiveClients
  };
}

module.exports = {
  joinSession,
  getClipboardContent,
  updateClipboardContent,
  addClientToSession,
  addClientWithInfo,
  removeClientFromSession,
  getSessionClients,
  getSessionClientsInfo,
  getClientCount,
  isClientActive,
  getActiveSessionClients,
  recordPingResponse,
  cleanupNonResponsiveClients,
  getActiveSessions,
  resetActiveClients,
  getSessionsStatus
};
