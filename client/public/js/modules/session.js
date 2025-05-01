/**
 * ClipShare Session Management
 * 
 * Handles authentication, session creation, and session membership.
 */

import { CONFIG } from './config.js';
import { getElement } from './utils.js';

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
 * Get stored session data from localStorage
 * @returns {Object|null} Session data object or null if not found/invalid
 */
export function getSessionData() {
  const sessionDataStr = localStorage.getItem(CONFIG.storage.sessionKey);
  if (!sessionDataStr) return null;
  
  try {
    return JSON.parse(sessionDataStr);
  } catch (err) {
    console.error('Error parsing session data:', err);
    return null;
  }
}

/**
 * Connect to the session using stored credentials
 * @param {Function} onSuccess - Callback for successful connection
 * @param {Function} onFailure - Callback for failed connection
 * @param {Function} displayMessage - Function to display messages to user
 */
export function connectToSession(onSuccess, onFailure, displayMessage) {
  if (!sessionData || !socket) {
    if (onFailure) onFailure('No session data or socket connection');
    return;
  }
  
  setConnectionStatus(false, displayMessage);
  displayMessage('Connecting to session...', 'info');
  
  socket.emit('join-session', {
    sessionId: sessionData.sessionId,
    passphrase: sessionData.passphrase
  }, (response) => {
    if (response.success) {
      // Connection successful
      setConnectionStatus(true, displayMessage);
      displayMessage('Connected to session', 'success', 3000);
      
      if (onSuccess) onSuccess(response);
    } else {
      // Connection failed
      displayMessage('Failed to connect: ' + response.message, 'error');
      
      setTimeout(() => {
        // Redirect to login
        logout();
      }, 3000);
      
      if (onFailure) onFailure(response.message);
    }
  });
}

/**
 * Log the user out
 */
export function logout() {
  // Clear session data
  localStorage.removeItem(CONFIG.storage.sessionKey);
  
  // Disconnect socket if available
  if (socket && socket.connected) {
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
  return sessionData;
}
