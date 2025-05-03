/**
 * ClipShare Session Management
 * 
 * Handles authentication, session creation, and session membership.
 */

import { CONFIG } from './config.js';
import { getElement, getBrowserInfo } from './utils.js';

// Local state
let sessionData = null;
let socket = null;
let connectionStatus = false;

/**
 * Initialize session module
 * @param {Object} socketInstance - Socket.io instance to use
 * @returns {Object|null} Session data if authenticated, null otherwise
 */
export function initSession(socketInstance) {
  socket = socketInstance;
  sessionData = getSessionData();
  
  if (!sessionData || !sessionData.sessionId || !sessionData.passphrase) {
    return null;
  }
  
  // Update session display
  const sessionNameEl = getElement('session-name');
  if (sessionNameEl) {
    sessionNameEl.textContent = sessionData.sessionId;
  }
  
  return sessionData;
}

/**
 * Connect to a session using stored session data
 * @param {Function} onSuccess - Success callback
 * @param {Function} onFailure - Failure callback
 * @param {Function} statusUpdateFn - Status update callback (optional)
 */
export function connectToSession(onSuccess, onFailure, statusUpdateFn) {
  const sessionData = getCurrentSession();
  
  if (!sessionData) {
    if (onFailure) onFailure('No session data found');
    return;
  }
  
  try {
    // Get most reliable socket reference
    const socket = getActiveSocket();
    
    if (!socket) {
      if (onFailure) onFailure('No active socket connection');
      return;
    }
    
    // Get client name from session data
    const clientName = sessionData.clientName || null;
    console.log('Connecting to session with client name:', clientName);
    
    // Join session
    socket.emit('join-session', {
      sessionId: sessionData.sessionId,
      passphrase: sessionData.passphrase,
      clientName: clientName, // Include client name in join-session
      browserInfo: getBrowserInfo()
    }, (response) => {
      if (response.success) {
        if (statusUpdateFn) statusUpdateFn('Connected to session', 'success');
        
        // Set connection status
        setConnectionStatus(true, statusUpdateFn);
        
        if (response.clientCount !== undefined) {
          updateClientCount(response.clientCount);
        }
        
        // Force an immediate client list update if we don't have one already
        if (!response.clients || response.clients.length === 0) {
          console.log('Requesting immediate client list refresh');
          setTimeout(() => {
            // Request client list update from server to avoid waiting for ping cycle
            socket.emit('request-client-list-update', {
              sessionId: sessionData.sessionId
            });
          }, 500); // Small delay to ensure server has processed join
        }
        
        // Call success callback with response
        if (onSuccess) onSuccess(response);
      } else {
        if (statusUpdateFn) statusUpdateFn(`Failed to join session: ${response.message}`, 'error');
        setConnectionStatus(false, statusUpdateFn);
        
        // Call failure callback with message
        if (onFailure) onFailure(response.message);
      }
    });
  } catch (err) {
    console.error('Error connecting to session:', err);
    if (onFailure) onFailure('Error connecting to session: ' + err.message);
  }
}

/**
 * Log the user out
 */
export function logout() {
  console.log('Logout initiated - cleaning up connections');
  
  // Use AuthModule's clearSessionData if available
  if (window.AuthModule && typeof window.AuthModule.clearSessionData === 'function') {
    console.log('Using AuthModule.clearSessionData to clear tab-specific session data');
    window.AuthModule.clearSessionData();
  } else {
    console.log('Fallback: removing session data directly from localStorage');
    localStorage.removeItem(CONFIG.storage.sessionKey);
  }
  
  // Clear module-level session data
  sessionData = null;
  
  // Disconnect and clean up any global socket
  if (window.appSocket) {
    console.log('Cleaning up global socket connection');
    
    // Remove all listeners to prevent reconnection attempts
    window.appSocket.removeAllListeners();
    
    // Set flag to prevent auto-reconnect
    window.appSocket.manuallyDisconnected = true;
    
    // Disconnect socket
    window.appSocket.disconnect();
    
    // Delete reference
    delete window.appSocket;
  }
  
  // Also handle local socket reference
  if (socket && socket.connected) {
    console.log('Disconnecting local socket reference');
    socket.disconnect();
  }
  
  // Redirect to login page
  window.location.href = '/';
}

/**
 * Set connection status
 * @param {boolean} connected - Whether connected to server
 * @param {Function} displayMessage - Function to display messages to user
 */
export function setConnectionStatus(connected, displayMessage) {
  connectionStatus = connected;
  
  const connectionStatusEl = getElement('connection-status');
  if (connectionStatusEl) {
    connectionStatusEl.textContent = connected ? 'Connected' : 'Disconnected';
    connectionStatusEl.className = connected ? 'connected' : 'disconnected';
  }
  
  // Update UI elements that depend on connection status
  updateUIByConnectionStatus(connected);
  
  // Show message if disconnected
  if (!connected && displayMessage) {
    displayMessage('Disconnected from server', 'error');
  }
}

/**
 * Update UI elements based on connection status
 * @param {boolean} connected - Whether connected to server
 */
function updateUIByConnectionStatus(connected) {
  // Find common controls that should be enabled/disabled based on connection
  const controls = [
    getElement('copy-btn'),
    getElement('clear-btn'),
    getElement('refresh-btn'),
    getElement('clipboard-content'),
    getElement('monitoring-toggle')
  ];
  
  // Update each control's disabled state
  controls.forEach(el => {
    if (el) {
      el.disabled = !connected;
    }
  });
}

/**
 * Update client count display
 * @param {number} count - Number of clients
 */
export function updateClientCount(count) {
  const clientCountEl = getElement('client-count');
  if (clientCountEl) {
    clientCountEl.textContent = count;
  }
}

/**
 * Get current connection status
 * @returns {boolean} True if connected
 */
export function isConnected() {
  return connectionStatus;
}

/**
 * Get current session data
 * @returns {Object|null} Current session data
 */
export function getCurrentSession() {
  // First try the module-level sessionData
  if (sessionData && sessionData.sessionId && sessionData.passphrase) {
    return sessionData;
  }
  
  // If not available or incomplete, try to get from auth-module's getSessionData function
  try {
    // Check if auth-module's getSessionData function is available
    if (window.AuthModule && typeof window.AuthModule.getSessionData === 'function') {
      const authModuleData = window.AuthModule.getSessionData();
      if (authModuleData && authModuleData.sessionId && authModuleData.passphrase) {
        // Update our module-level variable for future use
        sessionData = authModuleData;
        console.log(`Retrieved session data from AuthModule: ${authModuleData.sessionId}`);
        return authModuleData;
      }
    }
    
    // Fallback to direct localStorage access if auth-module is not available
    const sessionDataStr = localStorage.getItem(CONFIG.storage.sessionKey);
    if (sessionDataStr) {
      const parsedData = JSON.parse(sessionDataStr);
      if (parsedData && parsedData.sessionId && parsedData.passphrase) {
        // Update our module-level variable for future use
        sessionData = parsedData;
        console.log(`Retrieved session data from localStorage: ${parsedData.sessionId}`);
        return parsedData;
      }
    }
  } catch (e) {
    console.error('Error retrieving session data:', e);
  }
  
  console.warn('No valid session data found in memory or localStorage');
  return null;
}

/**
 * Get the current active socket, prioritizing global reference
 * @returns {Object|null} Active socket instance
 */
export function getActiveSocket() {
  // First try global socket reference
  if (window.appSocket && window.appSocket.connected) {
    return window.appSocket;
  }
  
  // Fall back to module-level socket if available
  if (socket && socket.connected) {
    return socket;
  }
  
  // No valid socket found
  return null;
}

// Export Session module to window for UI decryption access
window.Session = {
  getCurrentSession,
  getActiveSocket
};
