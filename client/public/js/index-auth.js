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
const clientNameInput = document.getElementById('client-name');
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
function getSocketConnection(forcedClientName = null) {
  // If socket was manually disconnected, don't auto-reconnect
  if (window.appSocket && window.appSocket.manuallyDisconnected) {
    console.log('Socket was manually disconnected, creating new instance');
    window.appSocket = null;
  }

  // Return existing socket if already created and connected
  // UNLESS we have a new forcedClientName
  if (window.appSocket && window.appSocket.connected && !forcedClientName) {
    console.log('Using existing connected socket');
    return window.appSocket;
  }
  
  // If socket exists but is disconnected and no new client name, attempt to reconnect
  if (window.appSocket && !forcedClientName) {
    console.log('Reconnecting existing socket');
    window.appSocket.connect();
    return window.appSocket;
  }
  
  // If we have a socket and we're forcing a new client name, disconnect it first
  if (window.appSocket && forcedClientName) {
    console.log('Disconnecting existing socket to create new one with updated client name');
    window.appSocket.disconnect();
    window.appSocket = null;
  }
  
  console.log('Creating new socket connection');
  
  // Get persistent client ID
  const persistentClientId = AuthModule.getClientId();
  console.log('Initializing auth socket with persistent client ID:', persistentClientId);
  
  // Get client name - prioritize forced name passed to function
  const sessionData = AuthModule.getSessionData();
  const clientName = forcedClientName || sessionData?.clientName || clientNameInput?.value || null;
  
  // CRITICAL DEBUG: Log client name value to verify what's being sent
  console.log('Client name value when creating socket:', {
    forcedName: forcedClientName,
    sessionDataName: sessionData?.clientName,
    inputFieldName: clientNameInput?.value,
    finalName: clientName
  });
  
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
    transports: ['polling', 'websocket'],
    // Include persistent client ID and client name in socket handshake
    query: {
      clientIdentity: persistentClientId,
      clientName: clientName,
      mode: 'auth',
      timestamp: Date.now()
    }
  });
  
  if (clientName) {
    console.log('Including client name in connection:', clientName);
  }
  
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
  
  // Handle server ping requests to prevent being marked inactive
  socket.on('ping-clients', (data) => {
    console.log('Received server ping during authentication');
    
    try {
      // First try to get sessionId directly from socket
      let sessionId = socket.sessionId;
      
      // If not on socket, try to get from stored session data
      if (!sessionId) {
        const sessionData = AuthModule.getSessionData();
        if (sessionData && sessionData.sessionId) {
          sessionId = sessionData.sessionId;
          console.log(`Retrieved session ID ${sessionId} from stored session data`);
        }
      }
      
      // If we have a sessionId (from any source), respond
      if (sessionId) {
        console.log(`Responding to ping for session ${sessionId}`);
        
        // Get browser info for enhanced identification
        const browserInfo = getBrowserInfo();
        
        // Send enhanced ping response with all available info
        socket.emit('client-ping-response', {
          sessionId: sessionId,
          timestamp: Date.now(),
          clientId: socket.id,
          browserInfo: browserInfo,
          // Include any session passphrase if available 
          sessionToken: socket.sessionToken || (AuthModule.getSessionData()?.passphrase)
        });
      } else {
        console.log('No session ID available yet from any source, cannot respond to ping');
      }
    } catch (err) {
      console.error('Error handling ping in auth page:', err);
    }
  });
  
  // Store socket for reuse
  window.appSocket = socket;
  return socket;
}

// Initialize the authentication module
document.addEventListener('DOMContentLoaded', () => {
  // Set up password toggle
  if (passwordToggle) {
    displayMessage('Enter session details to connect', 'info');
    passwordToggle.addEventListener('click', togglePasswordVisibility);
  }
  
  // Check if user has saved session data
  const sessionData = AuthModule.getSessionData();
  
  // Instead of automatically reconnecting, just pre-fill the form
  if (sessionData && sessionData.sessionId) {
    // Pre-fill the form with saved session data
    sessionIdInput.value = sessionData.sessionId;
    if (sessionData.passphrase) {
      passphraseInput.value = sessionData.passphrase;
    }
    
    // Pre-fill client name if available
    if (sessionData.clientName) {
      clientNameInput.value = sessionData.clientName;
    }
    
    displayMessage(`Session "${sessionData.sessionId}" data found. Click Join to reconnect.`, 'info');
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
  const clientName = clientNameInput.value.trim();
  const passphrase = passphraseInput.value;
  
  if (!sessionId || !passphrase) {
    displayMessage('Please provide both session name and passphrase', 'error');
    return;
  }
  
  if (!clientName) {
    displayMessage('Please provide a client name', 'error');
    return;
  }
  
  // Disable form during login attempt
  setFormLoading(true);
  
  // Show authentication status
  showAuthStatus('Checking session existence...');
  
  // Attempt login with just the client name
  attemptLogin(sessionId, passphrase, clientName);
});

/**
 * Attempt to join or create a session
 * @param {string} sessionId - Session identifier
 * @param {string} passphrase - Secret passphrase
 * @param {string} clientName - Client name for identification
 */
function attemptLogin(sessionId, passphrase, clientName) {
  // Get browser information for user-agent tracking
  const browserInfo = getBrowserInfo();
  
  // Add client name to browser info
  browserInfo.clientName = clientName;
  
  console.log(`Attempting login with client name: ${clientName}`);
  
  // Get or create a socket connection WITH the client name
  // This is crucial - we need to pass the client name to force creation
  // of a new socket with the correct client name
  const socket = getSocketConnection(clientName);
  
  // Ensure the socket is connected before proceeding
  if (!socket.connected) {
    displayMessage('Connecting to server...', 'info');
    showAuthStatus('Connecting to server...');
    
    // Wait for connection before proceeding
    socket.once('connect', () => {
      console.log('Socket connected, proceeding with authentication');
      proceedWithAuthentication(socket, sessionId, passphrase, clientName);
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
  proceedWithAuthentication(socket, sessionId, passphrase, clientName);
}

/**
 * Proceed with authentication after ensuring socket connection
 * @param {Object} socket - Socket.io instance
 * @param {string} sessionId - Session identifier
 * @param {string} passphrase - Secret passphrase
 * @param {string} clientName - Client name for identification
 */
function proceedWithAuthentication(socket, sessionId, passphrase, clientName) {
  // Initialize auth module with the socket
  AuthModule.init(socket, { 
    onSuccess: handleAuthSuccess,
    onFailure: handleAuthFailure,
    onStatusUpdate: updateAuthStatus
  });
  
  // Use the auth module with client-side encryption
  AuthModule.createOrJoinSession(sessionId, passphrase, updateAuthStatus, clientName)
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
  clientNameInput.disabled = isLoading;
  passphraseInput.disabled = isLoading;
  if (passwordToggle) passwordToggle.disabled = isLoading;
  
  authButton.textContent = isLoading ? 'Connecting...' : 'Join Session';
}

// Socket event handlers are now set up in getSocketConnection()
