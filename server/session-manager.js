/**
 * Session Manager for clipboard sync application
 * Handles session creation, joining, and authentication
 * 
 * Refactored for client-side encryption and enhanced security:
 * - Passphrases never stored on server
 * - Client verification via encrypted challenge
 * - Session banning for security violations
 */

// Simple in-memory session storage
const sessions = {};

// Banned sessions with timestamps
const bannedSessions = new Map();

// Constants
const SESSION_CONSTANTS = {
  BAN_DURATION: 10 * 60 * 1000, // 10 minutes in milliseconds
  VERIFICATION_TIMEOUT: 30 * 1000, // 30 seconds in milliseconds
  MAX_PENDING_VERIFICATIONS: 10, // Maximum pending verification requests
  DEBUG_MODE: true // Enable debug output for troubleshooting
};

// Storage for pending verification requests
// { sessionId: { clientId: { timestamp, callbacks, timeoutId } } }
const pendingVerifications = {};

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
 * Check if a session exists and has active clients
 * @param {string} sessionId - The session identifier
 * @returns {object} Information about session existence and status
 */
function checkSessionExists(sessionId) {
  // Normalize session ID to prevent case sensitivity issues
  const normalizedSessionId = sessionId.trim();
  
  // Check if session is banned
  if (isBannedSession(normalizedSessionId)) {
    return {
      exists: false,
      hasActiveClients: false,
      banned: true
    };
  }
  
  // Check if session exists
  if (sessions[normalizedSessionId]) {
    // Get all clients
    const clients = sessions[normalizedSessionId].clients || [];
    const activeClientCount = clients.length;
    
    // Get authorized clients that are still connected
    const authorizedClients = Array.from(sessions[normalizedSessionId].authorizedClients || []);
    const connectedAuthorizedCount = authorizedClients.filter(id => 
      clients.includes(id)).length;
    
    if (SESSION_CONSTANTS.DEBUG_MODE) {
      console.log(`Session ${normalizedSessionId} check:
        - Total clients: ${activeClientCount}
        - Total authorized: ${authorizedClients.length}
        - Connected authorized: ${connectedAuthorizedCount}`);
    }
    
    return {
      exists: true,
      hasActiveClients: activeClientCount > 0,
      connectedAuthorizedClients: connectedAuthorizedCount,
    };
  }
  
  return {
    exists: false,
    hasActiveClients: false,
    connectedAuthorizedClients: 0
  };
}

/**
 * Create a new session
 * @param {string} sessionId - The session identifier
 * @returns {object} Creation result with success status and message
 */
function createNewSession(sessionId) {
  // Normalize session ID to prevent case sensitivity issues
  const normalizedSessionId = sessionId.trim();
  
  // Check if session is banned
  if (isBannedSession(normalizedSessionId)) {
    return {
      success: false,
      message: 'This session name is temporarily banned for security reasons'
    };
  }
  
  // Check if session already exists
  if (sessions[normalizedSessionId]) {
    return {
      success: false,
      message: 'Session already exists'
    };
  }
  
  // Create new session (no passphrase stored)
  sessions[normalizedSessionId] = {
    clipboard: {
      type: 'text',
      content: '',
      timestamp: Date.now(),
      originClient: null
    },
    createdAt: new Date(),
    clients: [],
    authorizedClients: new Set(), // Track authorized clients
    lastHeartbeat: Date.now()
  };
  
  return { 
    success: true, 
    message: 'New session created'
  };
}

/**
 * Register a client's join request for verification
 * @param {string} sessionId - The session identifier
 * @param {string} clientId - The client socket ID
 * @param {string} encryptedVerification - Encrypted verification data
 * @param {Function} callback - Callback function for verification request result
 * @returns {object} Request result with status and message
 */
function registerJoinRequest(sessionId, clientId, encryptedVerification, callback) {
  // Normalize session ID
  const normalizedSessionId = sessionId.trim();
  
  if (SESSION_CONSTANTS.DEBUG_MODE) {
    console.log(`[DEBUG] Registering join request for client ${clientId} in session ${normalizedSessionId}`);
  }
  
  // Check if session is banned
  if (isBannedSession(normalizedSessionId)) {
    return {
      accepted: false,
      message: 'This session name is temporarily banned for security reasons'
    };
  }
  
  // Check if session exists
  if (!sessions[normalizedSessionId]) {
    return {
      accepted: false,
      message: 'Session does not exist'
    };
  }
  
  // Get authorized clients to verify
  const authorizedClientsCount = sessions[normalizedSessionId].authorizedClients?.size || 0;
  
  if (SESSION_CONSTANTS.DEBUG_MODE) {
    console.log(`[DEBUG] Session ${normalizedSessionId} has ${authorizedClientsCount} authorized clients`);
    if (authorizedClientsCount > 0) {
      console.log(`[DEBUG] Authorized clients: ${Array.from(sessions[normalizedSessionId].authorizedClients || []).join(', ')}`);
      console.log(`[DEBUG] Connected clients: ${sessions[normalizedSessionId].clients.join(', ')}`);
    }
  }
  
  // If there are no authorized clients, auto-accept
  if (authorizedClientsCount === 0) {
    // Auto-authorize this client
    if (!sessions[normalizedSessionId].authorizedClients) {
      sessions[normalizedSessionId].authorizedClients = new Set();
    }
    sessions[normalizedSessionId].authorizedClients.add(clientId);
    
    if (SESSION_CONSTANTS.DEBUG_MODE) {
      console.log(`[DEBUG] Auto-authorized client ${clientId} as first authorized client`);
    }
    
    return {
      accepted: true,
      message: 'Auto-authorized as first client',
      autoAuthorized: true
    };
  }
  
  // NEW CODE: Check if any authorized clients are actually connected
  const authorizedClientsSet = sessions[normalizedSessionId].authorizedClients;
  const connectedAuthorizedClients = Array.from(authorizedClientsSet).filter(
    id => sessions[normalizedSessionId].clients.includes(id)
  );
  
  if (SESSION_CONSTANTS.DEBUG_MODE) {
    console.log(`[DEBUG] Found ${connectedAuthorizedClients.length} connected authorized clients`);
    console.log(`[DEBUG] Connected authorized clients: ${connectedAuthorizedClients.join(', ')}`);
  }
  
  if (connectedAuthorizedClients.length === 0) {
    // All authorized clients have disconnected, auto-authorize this client
    sessions[normalizedSessionId].authorizedClients.add(clientId);
    
    if (SESSION_CONSTANTS.DEBUG_MODE) {
      console.log(`[DEBUG] Auto-authorized client ${clientId} because no authorized clients are connected`);
    }
    
    return {
      accepted: true,
      message: 'Auto-authorized (no connected authorized clients)',
      autoAuthorized: true
    };
  }
  
  // Initialize pending verifications for this session if needed
  if (!pendingVerifications[normalizedSessionId]) {
    pendingVerifications[normalizedSessionId] = {};
  }
  
  // Check if we have too many pending verifications
  if (Object.keys(pendingVerifications[normalizedSessionId]).length >= SESSION_CONSTANTS.MAX_PENDING_VERIFICATIONS) {
    return {
      accepted: false,
      message: 'Too many pending verification requests for this session'
    };
  }
  
  // Store verification request with timeout
  const timeoutId = setTimeout(() => {
    // Handle verification timeout
    handleVerificationTimeout(normalizedSessionId, clientId);
  }, SESSION_CONSTANTS.VERIFICATION_TIMEOUT);
  
  // Store verification data
  pendingVerifications[normalizedSessionId][clientId] = {
    timestamp: Date.now(),
    encryptedVerification,
    timeoutId,
    callback,
    verifications: {
      approved: 0,
      denied: 0,
      total: authorizedClientsCount
    }
  };
  
  return {
    accepted: true,
    message: 'Join request accepted for verification',
    pendingTimeout: SESSION_CONSTANTS.VERIFICATION_TIMEOUT
  };
}

/**
 * Submit verification result from an authorized client
 * @param {string} sessionId - The session identifier
 * @param {string} verifierClientId - ID of the client submitting the verification
 * @param {string} targetClientId - ID of the client being verified
 * @param {boolean} approved - Whether verification was approved
 * @returns {object} Result with status
 */
function submitVerificationResult(sessionId, verifierClientId, targetClientId, approved) {
  // Normalize session ID
  const normalizedSessionId = sessionId.trim();
  
  // Check if session exists
  if (!sessions[normalizedSessionId]) {
    return { success: false, message: 'Session does not exist' };
  }
  
  // Check if verifier is authorized
  const isAuthorized = sessions[normalizedSessionId].authorizedClients?.has(verifierClientId);
  if (!isAuthorized) {
    return { success: false, message: 'Unauthorized verifier' };
  }
  
  // Check if we have pending verification for this client
  if (!pendingVerifications[normalizedSessionId] || 
      !pendingVerifications[normalizedSessionId][targetClientId]) {
    return { success: false, message: 'No pending verification for this client' };
  }
  
  const verification = pendingVerifications[normalizedSessionId][targetClientId];
  
  // Record verification result
  if (approved) {
    verification.verifications.approved++;
  } else {
    verification.verifications.denied++;
    
    // If ANY client denies, immediately fail verification and ban the session
    clearTimeout(verification.timeoutId);
    
    // Ban the session
    banSession(normalizedSessionId, 'Verification failure - possible security breach');
    
    // Close verification with denial
    finalizeVerification(normalizedSessionId, targetClientId, false);
    
    return { 
      success: true, 
      message: 'Verification denied - session banned',
      banned: true
    };
  }
  
  // Check if all clients have verified
  const { approved: approvedCount, total } = verification.verifications;
  if (approvedCount === total) {
    // All approved - finalize verification
    clearTimeout(verification.timeoutId);
    finalizeVerification(normalizedSessionId, targetClientId, true);
  }
  
  return { success: true, message: 'Verification result recorded' };
}

/**
 * Finalize a verification process
 * @param {string} sessionId - The session identifier
 * @param {string} clientId - The client being verified
 * @param {boolean} approved - Final verification result
 */
function finalizeVerification(sessionId, clientId, approved) {
  if (!pendingVerifications[sessionId] || !pendingVerifications[sessionId][clientId]) {
    return;
  }
  
  const verification = pendingVerifications[sessionId][clientId];
  
  // Execute callback with result
  if (verification.callback) {
    verification.callback({
      approved,
      sessionId,
      clientId,
      timestamp: Date.now()
    });
  }
  
  // If approved, add to authorized clients
  if (approved && sessions[sessionId]) {
    if (!sessions[sessionId].authorizedClients) {
      sessions[sessionId].authorizedClients = new Set();
    }
    sessions[sessionId].authorizedClients.add(clientId);
  }
  
  // Clean up
  delete pendingVerifications[sessionId][clientId];
  
  // If no more pending verifications for this session, clean up session entry
  if (Object.keys(pendingVerifications[sessionId]).length === 0) {
    delete pendingVerifications[sessionId];
  }
}

/**
 * Handle verification timeout
 * @param {string} sessionId - The session identifier
 * @param {string} clientId - The client being verified
 */
function handleVerificationTimeout(sessionId, clientId) {
  console.log(`Verification timeout for client ${clientId} in session ${sessionId}`);
  
  if (!pendingVerifications[sessionId] || !pendingVerifications[sessionId][clientId]) {
    return;
  }
  
  // Finalize as failed
  finalizeVerification(sessionId, clientId, false);
}

/**
 * Ban a session for security reasons
 * @param {string} sessionId - The session identifier to ban
 * @param {string} reason - Reason for the ban
 */
function banSession(sessionId, reason) {
  console.log(`Banning session ${sessionId}: ${reason}`);
  
  // Add to banned sessions with expiration time
  bannedSessions.set(sessionId, {
    timestamp: Date.now(),
    expiry: Date.now() + SESSION_CONSTANTS.BAN_DURATION,
    reason
  });
}

/**
 * Check if a session is currently banned
 * @param {string} sessionId - The session identifier to check
 * @returns {boolean} True if session is banned
 */
function isBannedSession(sessionId) {
  // Clean up expired bans first
  cleanupExpiredBans();
  
  // Check if session is in banned list
  return bannedSessions.has(sessionId);
}

/**
 * Remove expired bans from the banned sessions list
 */
function cleanupExpiredBans() {
  const now = Date.now();
  
  // Remove expired bans
  for (const [sessionId, banInfo] of bannedSessions.entries()) {
    if (banInfo.expiry <= now) {
      bannedSessions.delete(sessionId);
      console.log(`Ban expired for session ${sessionId}`);
    }
  }
}

/**
 * Get ban information for a session
 * @param {string} sessionId - The session identifier
 * @returns {object|null} Ban information or null if not banned
 */
function getSessionBanInfo(sessionId) {
  if (!isBannedSession(sessionId)) {
    return null;
  }
  
  const banInfo = bannedSessions.get(sessionId);
  return {
    ...banInfo,
    remainingTime: banInfo.expiry - Date.now()
  };
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
 * @param {boolean} authorized - Whether client is authorized
 */
function addClientToSession(sessionId, clientId, authorized = false) {
  if (sessions[sessionId]) {
    // Add client if not already in the list
    if (!sessions[sessionId].clients.includes(clientId)) {
      sessions[sessionId].clients.push(clientId);
    }
    
    // If authorized, add to authorized clients set
    if (authorized) {
      if (!sessions[sessionId].authorizedClients) {
        sessions[sessionId].authorizedClients = new Set();
      }
      sessions[sessionId].authorizedClients.add(clientId);
    }
  }
}

/**
 * Add a client to a session with detailed information
 * @param {string} sessionId - The session identifier
 * @param {string} clientId - The client socket ID
 * @param {Object} clientInfo - The client information including IP, browser details, etc.
 * @param {boolean} authorized - Whether client is authorized
 */
function addClientWithInfo(sessionId, clientId, clientInfo, authorized = false) {
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
    lastActivity: Date.now(),
    authorized: authorized
  };
  
  // If authorized, add to authorized clients set
  if (authorized) {
    if (!sessions[sessionId].authorizedClients) {
      sessions[sessionId].authorizedClients = new Set();
    }
    sessions[sessionId].authorizedClients.add(clientId);
  }
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
    
    // Remove from authorized clients set
    if (sessions[sessionId].authorizedClients) {
      sessions[sessionId].authorizedClients.delete(clientId);
    }
    
    // Remove from clientsInfo object
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
 * Check if a client is authorized in a session
 * @param {string} sessionId - The session identifier
 * @param {string} clientId - The client socket ID
 * @returns {boolean} True if client is authorized
 */
function isClientAuthorized(sessionId, clientId) {
  if (!sessions[sessionId] || !sessions[sessionId].authorizedClients) {
    return false;
  }
  
  return sessions[sessionId].authorizedClients.has(clientId);
}

/**
 * Get all authorized clients for a session
 * @param {string} sessionId - The session identifier
 * @returns {Array} Array of authorized client IDs
 */
function getAuthorizedClients(sessionId) {
  if (!sessions[sessionId] || !sessions[sessionId].authorizedClients) {
    return [];
  }
  
  return Array.from(sessions[sessionId].authorizedClients);
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
  checkSessionExists,
  createNewSession,
  registerJoinRequest,
  submitVerificationResult,
  finalizeVerification,
  handleVerificationTimeout,
  banSession,
  isBannedSession,
  getSessionBanInfo,
  cleanupExpiredBans,
  getClipboardContent,
  updateClipboardContent,
  addClientToSession,
  addClientWithInfo,
  removeClientFromSession,
  getSessionClients,
  getSessionClientsInfo,
  getClientCount,
  isClientActive,
  isClientAuthorized,
  getAuthorizedClients,
  getActiveSessionClients,
  recordPingResponse,
  cleanupNonResponsiveClients,
  getActiveSessions,
  resetActiveClients,
  getSessionsStatus,
  // Export constants for use in other modules
  SESSION_CONSTANTS
};
