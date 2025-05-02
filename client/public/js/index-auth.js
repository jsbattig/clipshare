/**
 * ClipShare Authentication Entry Point
 * 
 * Main entry point for the authentication page, connects to 
 * auth-module.js for secure client-side encryption.
 */

import * as AuthModule from './modules/auth-module.js';
import { getBrowserInfo } from './modules/utils.js';

// DOM Elements
const authForm = document.getElementById('auth-form');
const sessionIdInput = document.getElementById('session-id');
const passphraseInput = document.getElementById('passphrase');
const authButton = document.getElementById('auth-button');
const authMessage = document.getElementById('auth-message');
const passwordToggle = document.getElementById('password-toggle');
const authStatus = document.getElementById('auth-status');
const authStatusText = authStatus?.querySelector('.auth-status-text');

/**
 * Get or create a socket connection on demand
 * @returns {Object} Socket.io instance
 */
function getSocketConnection() {
  // Return existing socket if already created and connected
  if (window.appSocket && window.appSocket.connected) {
    console.log('Using existing connected socket');
    return window.appSocket;
  }
  
  // If socket exists but is disconnected, attempt to reconnect
  if (window.appSocket) {
    console.log('Reconnecting existing socket');
    window.appSocket.connect();
    return window.appSocket;
  }
  
  console.log('Creating new socket connection');
  
  // Create a new socket connection with improved settings
  const socket = io({
    path: '/socket.io',
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    // Auto-detect if we're using HTTPS
    secure: window.location.protocol === 'https:',
    // Try polling first for better cross-browser compatibility
    transports: ['polling', 'websocket']
  });
  
  // Set up event handlers
  socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
  });
  
  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err);
    hideAuthStatus();
    displayMessage('Connection error: ' + (err.message || 'Cannot reach server'), 'error');
    setFormLoading(false);
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
  
  // Store socket for reuse
  window.appSocket = socket;
  return socket;
}

// Initialize the authentication module
document.addEventListener('DOMContentLoaded', () => {
  // Set up password toggle
  if (passwordToggle) {
    displayMessage('Initializing authentication...', 'info');
    passwordToggle.addEventListener('click', togglePasswordVisibility);
  }
  
  // Check if user is already authenticated
  const sessionData = AuthModule.getSessionData();
  
  // If session data exists, try to reconnect by creating socket and logging in
  if (sessionData && sessionData.sessionId && sessionData.passphrase) {
    displayMessage('Reconnecting to session...', 'info');
    attemptLogin(sessionData.sessionId, sessionData.passphrase);
  }
  // Don't create socket until it's needed
});

/**
 * Toggle password field visibility
 */
function togglePasswordVisibility() {
  const type = passphraseInput.type === 'password' ? 'text' : 'password';
  passphraseInput.type = type;
  
  // Update icon
  passwordToggle.textContent = type === 'password' ? '👁️' : '🔒';
}

// Handle form submission
authForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const sessionId = sessionIdInput.value.trim();
  const passphrase = passphraseInput.value;
  
  if (!sessionId || !passphrase) {
    displayMessage('Please provide both session name and passphrase', 'error');
    return;
  }
  
  // Disable form during login attempt
  setFormLoading(true);
  
  // Show authentication status
  showAuthStatus('Checking session existence...');
  
  // Attempt login
  attemptLogin(sessionId, passphrase);
});

/**
 * Attempt to join or create a session
 * @param {string} sessionId - Session identifier
 * @param {string} passphrase - Secret passphrase
 */
function attemptLogin(sessionId, passphrase) {
  // Get browser information for user-agent tracking
  const browserInfo = getBrowserInfo();
  
  // Get or create a socket connection
  const socket = getSocketConnection();
  
  // Ensure the socket is connected before proceeding
  if (!socket.connected) {
    displayMessage('Connecting to server...', 'info');
    showAuthStatus('Connecting to server...');
    
    // Wait for connection before proceeding
    socket.once('connect', () => {
      console.log('Socket connected, proceeding with authentication');
      proceedWithAuthentication(socket, sessionId, passphrase);
    });
    
    // Set connection timeout
    setTimeout(() => {
      if (!socket.connected) {
        hideAuthStatus();
        displayMessage('Unable to connect to server. Please try again later.', 'error');
        setFormLoading(false);
      }
    }, 5000);
    
    return;
  }
  
  // If already connected, proceed immediately
  proceedWithAuthentication(socket, sessionId, passphrase);
}

/**
 * Proceed with authentication after ensuring socket connection
 * @param {Object} socket - Socket.io instance
 * @param {string} sessionId - Session identifier
 * @param {string} passphrase - Secret passphrase
 */
function proceedWithAuthentication(socket, sessionId, passphrase) {
  // Initialize auth module with the socket
  AuthModule.init(socket, { 
    onSuccess: handleAuthSuccess,
    onFailure: handleAuthFailure,
    onStatusUpdate: updateAuthStatus
  });
  
  // Use the auth module with client-side encryption
  AuthModule.createOrJoinSession(sessionId, passphrase, updateAuthStatus)
    .then(() => {
      hideAuthStatus();
      displayMessage('Session joined successfully! Redirecting...', 'success');
      
      // Redirect to app page
      setTimeout(() => {
        window.location.href = '/app.html';
      }, 1500);
    })
    .catch((error) => {
      // Authentication failed
      hideAuthStatus();
      displayMessage(error, 'error');
      setFormLoading(false);
    });
}

/**
 * Handle successful authentication
 * @param {Object} sessionData - Session data
 */
function handleAuthSuccess(sessionData) {
  hideAuthStatus();
  displayMessage('Authentication successful!', 'success');
  console.log('Successfully authenticated:', sessionData.sessionId);
}

/**
 * Handle authentication failure
 * @param {string} errorMessage - Error message
 */
function handleAuthFailure(errorMessage) {
  hideAuthStatus();
  displayMessage(errorMessage, 'error');
  setFormLoading(false);
}

/**
 * Show authentication status indicator
 * @param {string} message - Status message
 */
function showAuthStatus(message) {
  if (!authStatus) return;
  
  authStatus.classList.remove('hidden');
  if (authStatusText) {
    authStatusText.textContent = message;
  }
}

/**
 * Hide authentication status indicator
 */
function hideAuthStatus() {
  if (!authStatus) return;
  
  authStatus.classList.add('hidden');
}

/**
 * Update authentication status during the process
 * @param {string} message - Status message
 * @param {string} type - Message type (info, success, error)
 */
function updateAuthStatus(message, type = 'info') {
  // Update the message
  displayMessage(message, type);
  
  // Update the auth status indicator
  if (type !== 'error' && type !== 'success') {
    showAuthStatus(message);
  } else {
    hideAuthStatus();
  }
}

/**
 * Display a message to the user
 * @param {string} message - Message to display
 * @param {string} type - Message type (info, success, error)
 */
function displayMessage(message, type = 'info') {
  authMessage.textContent = message;
  authMessage.className = `message ${type}`;
  authMessage.classList.remove('hidden');
}

/**
 * Set form loading state
 * @param {boolean} isLoading - Whether form is loading
 */
function setFormLoading(isLoading) {
  authButton.disabled = isLoading;
  sessionIdInput.disabled = isLoading;
  passphraseInput.disabled = isLoading;
  if (passwordToggle) passwordToggle.disabled = isLoading;
  
  authButton.textContent = isLoading ? 'Connecting...' : 'Join Session';
}

// Socket event handlers are now set up in getSocketConnection()
