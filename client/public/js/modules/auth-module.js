/**
 * ClipShare Authentication Module
 * 
 * Handles user authentication with client-side encryption for session joining/creation.
 * Uses AES encryption to ensure the passphrase never leaves the client.
 */

import { CONFIG } from './config.js';
import { getElement } from './utils.js';

// CryptoJS is loaded from CDN in index.html and app.html
const CryptoJS = window.CryptoJS;

// Authentication constants
const AUTH_CONSTANTS = {
  VERIFICATION_TEXT: "ClipShare is freaking awesome",
  AUTH_TIMEOUT: 30000, // 30 seconds timeout for verification
  STORAGE_KEY: CONFIG.storage.sessionKey,
  CLIENT_ID_KEY: "clipshare_client_identity",
  DEBUG_MODE: true // Enable debug logging
};

// Generate or retrieve a permanent client ID that persists across page loads
function getOrCreateClientId() {
  let clientId = localStorage.getItem(AUTH_CONSTANTS.CLIENT_ID_KEY);
  
  if (!clientId) {
    // Generate a unique ID combining timestamp, random number and user agent hash
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const userAgentHash = CryptoJS.MD5(navigator.userAgent).toString().substring(0, 8);
    
    clientId = `client_${timestamp}_${random}_${userAgentHash}`;
    localStorage.setItem(AUTH_CONSTANTS.CLIENT_ID_KEY, clientId);
    
    if (AUTH_CONSTANTS.DEBUG_MODE) {
      console.log(`Generated new persistent client ID: ${clientId}`);
    }
  } else if (AUTH_CONSTANTS.DEBUG_MODE) {
    console.log(`Using existing persistent client ID: ${clientId}`);
  }
  
  return clientId;
}

// Get the permanent client ID
export function getClientId() {
  return getOrCreateClientId();
}

// Module state
let socket = null;
let authCallbacks = {
  onSuccess: null,
  onFailure: null,
  onStatusUpdate: null
};

/**
 * Initialize authentication module
 * @param {Object} socketInstance - Socket.io instance
 * @param {Object} callbacks - Callback functions for auth events
 */
export function init(socketInstance, callbacks = {}) {
  socket = socketInstance;
  
  // Store callbacks
  if (callbacks.onSuccess) authCallbacks.onSuccess = callbacks.onSuccess;
  if (callbacks.onFailure) authCallbacks.onFailure = callbacks.onFailure;
  if (callbacks.onStatusUpdate) authCallbacks.onStatusUpdate = callbacks.onStatusUpdate;
  
  setupSocketListeners();
}

/**
 * Set up socket listeners for authentication events
 */
function setupSocketListeners() {
  if (!socket) return;
  
  // Handle join request verification
  socket.on('verify-join-request', handleJoinRequestVerification);
  
  // Handle verification response
  socket.on('verification-result', handleVerificationResult);
  
  // Handle verification timeout
  socket.on('verification-timeout', handleVerificationTimeout);
  
  // Handle session banned
  socket.on('session-banned', handleSessionBanned);
}

/**
 * Create or join a session
 * @param {string} sessionId - Session identifier
 * @param {string} passphrase - Secret passphrase (never sent to server)
 * @param {Function} onStatusUpdate - Callback for status updates
 * @returns {Promise} Promise that resolves on successful auth
 */
export function createOrJoinSession(sessionId, passphrase, onStatusUpdate) {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject('Socket not connected');
      return;
    }
    
    // Set temporary status update callback
    if (onStatusUpdate) authCallbacks.onStatusUpdate = onStatusUpdate;
    
    // Update status
    updateStatus('Checking session existence...');
    
    if (AUTH_CONSTANTS.DEBUG_MODE) {
      console.log(`Checking if session '${sessionId}' exists...`);
    }
    
    // First check if session exists with active clients
    socket.emit('check-session-exists', { sessionId }, (response) => {
      if (AUTH_CONSTANTS.DEBUG_MODE) {
        console.log('Session check response:', response);
      }
      
      if (response.exists && response.hasActiveClients) {
        // Session exists with active clients, need verification
        updateStatus('Session exists with active clients. Requesting to join...');
        requestToJoinSession(sessionId, passphrase, resolve, reject);
      } else if (response.banned) {
        // Session is banned
        updateStatus('This session has been banned temporarily for security reasons', 'error');
        reject('This session has been banned temporarily. Please try a different session name.');
      } else if (response.exists) {
        // Session exists but has no active clients - we still need to join it
        updateStatus('Session exists but has no active clients. Requesting to join...');
        requestToJoinSession(sessionId, passphrase, resolve, reject);
      } else {
        // Session doesn't exist - create new
        updateStatus('Session does not exist. Creating new session...');
        createNewSession(sessionId, passphrase, resolve, reject);
      }
    });
  });
}

/**
 * Request to join an existing session
 * @param {string} sessionId - Session identifier
 * @param {string} passphrase - Secret passphrase
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 */
function requestToJoinSession(sessionId, passphrase, resolve, reject) {
  // Generate encrypted verification data
  const verificationData = generateVerificationData(sessionId, passphrase);
  
  if (AUTH_CONSTANTS.DEBUG_MODE) {
    console.log(`Sending join request for session '${sessionId}'`);
    console.log('Client ID:', socket.id);
  }
  
  // Get browser information for enhanced client identification
  const browserInfo = getBrowserInfo();
  
  // Send join request with encrypted verification data
  socket.emit('request-session-join', {
    sessionId,
    encryptedVerification: verificationData,
    browserInfo
  }, (response) => {
    if (AUTH_CONSTANTS.DEBUG_MODE) {
      console.log('Join request response:', response);
    }
    
    if (response.accepted) {
      updateStatus('Join request sent. Waiting for verification...');
      
      // Save session data now for potential later use
      saveSessionData(sessionId, passphrase);
      
      // Set up verification timeout
      setTimeout(() => {
        if (authCallbacks.onFailure) {
          authCallbacks.onFailure('Verification timed out. Please try again.');
        }
        reject('Verification timed out');
      }, AUTH_CONSTANTS.AUTH_TIMEOUT);
      
      // Wait for verification-result event (handled by socket listener)
    } else {
      updateStatus('Failed to request session join: ' + response.message, 'error');
      reject(response.message);
    }
  });
}

/**
 * Create a new session
 * @param {string} sessionId - Session identifier
 * @param {string} passphrase - Secret passphrase
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 */
function createNewSession(sessionId, passphrase, resolve, reject) {
  if (AUTH_CONSTANTS.DEBUG_MODE) {
    console.log(`Creating new session '${sessionId}'`);
  }
  
  socket.emit('create-new-session', { sessionId }, (response) => {
    if (AUTH_CONSTANTS.DEBUG_MODE) {
      console.log('Create session response:', response);
    }
    
    if (response.success) {
      // Save session data locally (passphrase never sent to server)
      saveSessionData(sessionId, passphrase);
      updateStatus('Session created successfully!', 'success');
      
      // Resolve with session data
      const sessionData = { sessionId, passphrase };
      if (authCallbacks.onSuccess) {
        authCallbacks.onSuccess(sessionData);
      }
      resolve(sessionData);
    } else {
      updateStatus('Failed to create session: ' + response.message, 'error');
      reject(response.message);
    }
  });
}

/**
 * Handle verification of a join request from another client
 * @param {Object} data - Join request data with encrypted verification
 */
function handleJoinRequestVerification(data) {
  const { sessionId, encryptedVerification, clientId } = data;
  
  console.log(`VERIFICATION REQUEST RECEIVED:`, data);
  console.log(`Current socket ID: ${window.socketInstance?.id}`);
  
  // Get current session data
  const sessionData = getSessionData();
  if (!sessionData || sessionId !== sessionData.sessionId) {
    console.error('Received verification request for unknown session');
    return;
  }
  
  console.log(`Session data matches, proceeding with verification for session: ${sessionId}`);
  
  // Attempt to decrypt and verify
  try {
    const { passphrase } = sessionData;
    let verified = false;
    
    if (AUTH_CONSTANTS.DEBUG_MODE) {
      console.log('Attempting to decrypt verification data...');
    }
    
    // Decrypt using our passphrase
    const decrypted = decryptVerification(encryptedVerification, passphrase);
    
    // Verify expected text
    const expected = sessionId + AUTH_CONSTANTS.VERIFICATION_TEXT;
    verified = (decrypted === expected);
    
    if (AUTH_CONSTANTS.DEBUG_MODE) {
      console.log(`Verification result: ${verified ? 'APPROVED' : 'DENIED'}`);
      if (!verified) {
        console.log(`Expected: "${expected}"`);
        console.log(`Decrypted: "${decrypted}"`);
      }
    }
    
    // Send verification result to server
    socket.emit('submit-verification-result', {
      sessionId,
      clientId,
      approved: verified
    });
    
    console.log(`Verification ${verified ? 'approved' : 'denied'} for client ${clientId}`);
  } catch (err) {
    console.error('Error during verification:', err);
    console.error('Detailed error info:', err.message);
    console.error('Encrypted data was:', encryptedVerification);
    
    // Deny verification on error
    socket.emit('submit-verification-result', {
      sessionId,
      clientId,
      approved: false
    });
  }
}

/**
 * Handle verification result
 * @param {Object} data - Verification result data
 */
function handleVerificationResult(data) {
  const { approved, sessionId } = data;
  
  if (AUTH_CONSTANTS.DEBUG_MODE) {
    console.log(`Received verification result for session ${sessionId}: ${approved ? 'Approved' : 'Denied'}`);
  }
  
  if (approved) {
    // Get session data (passphrase is only stored locally)
    const sessionData = getSessionData();
    
    if (!sessionData || sessionId !== sessionData.sessionId) {
      updateStatus('Session mismatch error', 'error');
      if (authCallbacks.onFailure) {
        authCallbacks.onFailure('Session data error');
      }
      return;
    }
    
    updateStatus('Verification successful!', 'success');
    
    // Trigger success callback
    if (authCallbacks.onSuccess) {
      authCallbacks.onSuccess(sessionData);
    }
  } else {
    updateStatus('Verification failed. Access denied.', 'error');
    
    // Remove session data
    clearSessionData();
    
    // Trigger failure callback
    if (authCallbacks.onFailure) {
      authCallbacks.onFailure('Verification failed. Session may have been banned.');
    }
  }
}

/**
 * Handle verification timeout
 * @param {Object} data - Timeout data
 */
function handleVerificationTimeout(data) {
  updateStatus('Verification request timed out.', 'error');
  
  // Trigger failure callback
  if (authCallbacks.onFailure) {
    authCallbacks.onFailure('Verification timed out. Please try again.');
  }
}

/**
 * Handle session banned notification
 * @param {Object} data - Ban data
 */
function handleSessionBanned(data) {
  const { sessionId, reason } = data;
  
  updateStatus(`Session "${sessionId}" has been banned: ${reason}`, 'error');
  
  // Clear local session data if it matches the banned session
  const sessionData = getSessionData();
  if (sessionData && sessionData.sessionId === sessionId) {
    clearSessionData();
  }
  
  // Trigger failure callback
  if (authCallbacks.onFailure) {
    authCallbacks.onFailure(`Session banned: ${reason}`);
  }
}

/**
 * Generate encrypted verification data
 * @param {string} sessionId - Session identifier
 * @param {string} passphrase - Secret passphrase
 * @returns {string} Encrypted verification data
 */
function generateVerificationData(sessionId, passphrase) {
  // Combine session ID with verification text
  const verificationText = sessionId + AUTH_CONSTANTS.VERIFICATION_TEXT;
  
  // Encrypt using AES
  const encrypted = CryptoJS.AES.encrypt(verificationText, passphrase).toString();
  
  return encrypted;
}

/**
 * Decrypt verification data
 * @param {string} encrypted - Encrypted verification data
 * @param {string} passphrase - Secret passphrase
 * @returns {string} Decrypted text
 */
function decryptVerification(encrypted, passphrase) {
  const decrypted = CryptoJS.AES.decrypt(encrypted, passphrase);
  return decrypted.toString(CryptoJS.enc.Utf8);
}

/**
 * Save session data to localStorage
 * @param {string} sessionId - Session identifier
 * @param {string} passphrase - Secret passphrase
 */
export function saveSessionData(sessionId, passphrase) {
  const sessionData = { sessionId, passphrase, timestamp: Date.now() };
  localStorage.setItem(AUTH_CONSTANTS.STORAGE_KEY, JSON.stringify(sessionData));
}

/**
 * Get session data from localStorage
 * @returns {Object|null} Session data or null if not found
 */
export function getSessionData() {
  const data = localStorage.getItem(AUTH_CONSTANTS.STORAGE_KEY);
  if (!data) return null;
  
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error('Error parsing session data:', err);
    return null;
  }
}

/**
 * Clear session data from localStorage
 */
export function clearSessionData() {
  localStorage.removeItem(AUTH_CONSTANTS.STORAGE_KEY);
}

/**
 * Update authentication status
 * @param {string} message - Status message
 * @param {string} type - Message type ('info', 'success', 'error')
 */
function updateStatus(message, type = 'info') {
  if (authCallbacks.onStatusUpdate) {
    authCallbacks.onStatusUpdate(message, type);
  }
}

/**
 * Log out of current session
 */
export function logout() {
  // Clear session data
  clearSessionData();
  
  // Disconnect socket if available
  if (socket && socket.connected) {
    socket.disconnect();
  }
  
  // Redirect to login page
  window.location.href = '/';
}

/**
 * Get browser information for user-agent tracking
 * @returns {Object} Browser information object
 */
function getBrowserInfo() {
  const userAgent = navigator.userAgent;
  let browserName = 'Unknown';
  let osName = 'Unknown';
  
  // Detect browser
  if (userAgent.includes('Firefox')) {
    browserName = 'Firefox';
  } else if (userAgent.includes('Chrome')) {
    browserName = 'Chrome';
  } else if (userAgent.includes('Safari')) {
    browserName = 'Safari';
  } else if (userAgent.includes('Edge')) {
    browserName = 'Edge';
  } else if (userAgent.includes('MSIE') || userAgent.includes('Trident/')) {
    browserName = 'Internet Explorer';
  }
  
  // Detect OS
  if (userAgent.includes('Windows')) {
    osName = 'Windows';
  } else if (userAgent.includes('Mac OS')) {
    osName = 'MacOS';
  } else if (userAgent.includes('Linux')) {
    osName = 'Linux';
  } else if (userAgent.includes('Android')) {
    osName = 'Android';
  } else if (userAgent.includes('iOS')) {
    osName = 'iOS';
  }
  
  // Get persistent client ID to track client across page navigations
  const persistentId = getOrCreateClientId();
  
  return {
    name: browserName,
    os: osName,
    userAgent,
    windowId: Math.random().toString(36).substring(2, 10), // Generate a unique window ID
    persistentId: persistentId, // Include persistent ID for tracking across page navigations
    timestamp: Date.now()
  };
}
