/**
 * ClipShare Main Application
 * 
 * Main entry point for the ClipShare application. 
 * Initializes all modules and coordinates their interaction.
 */

import { CONFIG } from './modules/config.js';
import * as Utils from './modules/utils.js';
import * as UIManager from './modules/ui-manager.js';
import * as Session from './modules/session.js'; // Add Session module import
import * as ClipboardUtils from './modules/clipboard-monitor.js';
import * as ContentHandlers from './modules/content-handlers.js';
import * as FileOperations from './modules/file-operations.js';
import * as SocketEvents from './modules/socket-events.js';
import * as EventHandlers from './modules/event-handlers.js';
import * as AuthModule from './modules/auth-module.js';

// Application state
let appInitialized = false;

/**
 * Initialize the Socket.io connection
 * @returns {Object} Socket.io instance
 */
function initializeSocket() {
  // Get persistent client ID
  const persistentClientId = AuthModule.getClientId();
  
  // Get client name from session data
  const sessionData = AuthModule.getSessionData();
  const clientName = sessionData?.clientName || null;
  
  console.log('Initializing socket with persistent client ID:', persistentClientId);
  console.log('Including client name in socket connection:', clientName);
  
  // Initialize socket connection with proxy support
  const socket = io({
    path: CONFIG.socket.path,
    reconnectionAttempts: CONFIG.socket.reconnectionAttempts,
    reconnectionDelay: CONFIG.socket.reconnectionDelay,
    reconnectionDelayMax: CONFIG.socket.reconnectionDelayMax,
    timeout: CONFIG.socket.timeout,
    // Auto-detect if we're using HTTPS
    secure: window.location.protocol === 'https:',
    // Include persistent client ID and client name in socket handshake query params
    query: {
      clientIdentity: persistentClientId,
      clientName: clientName, // Include client name in connection
      mode: 'app',
      timestamp: Date.now()
    }
  });
  
  // Expose the socket instance globally for UI functions to access
  // Use window.appSocket for consistent naming across all modules
  window.appSocket = socket;
  // Also set socketInstance for backward compatibility
  window.socketInstance = socket;
  
  // Debug socket connection state
  socket.on('connect', () => {
    console.log('Socket connected with ID:', socket.id);
    console.log('Using persistent client ID:', persistentClientId);
    
    // Immediately after connection, send our identity information with client name
    socket.emit('client-identity', {
      socketId: socket.id,
      persistentId: persistentClientId,
      clientName: clientName, // Include client name in identity event
      timestamp: Date.now(),
      reconnecting: true,
      browser: navigator.userAgent
    });
    
    console.log('Sent client identity with name:', clientName);
  });
  
  return socket;
}

/**
 * Initialize the application
 */
function initializeApp() {
  if (appInitialized) return;
  
  try {
    console.log('Initializing ClipShare application with manual clipboard operations...');
    
    // Initialize socket
    const socket = initializeSocket();
    
    // Initialize auth module with the socket instance
    AuthModule.init(socket, {
      onSuccess: handleAuthSuccess,
      onFailure: handleAuthFailure,
      onStatusUpdate: UIManager.displayMessage
    });
    
    // Check authentication
    const sessionData = AuthModule.getSessionData();
    if (!sessionData) {
      console.log('No valid session data found, redirecting to login');
      window.location.href = '/';
      return;
    }
    
    // Update session display
    const sessionNameEl = Utils.getElement('session-name');
    if (sessionNameEl) {
      sessionNameEl.textContent = sessionData.sessionId;
    }
    
    // Update client name display
    const clientNameEl = Utils.getElement('client-name-display');
    if (clientNameEl && sessionData.clientName) {
      clientNameEl.textContent = `(${sessionData.clientName})`;
    }
    
    // Initialize socket events with callbacks
    SocketEvents.init(socket, {
      onClipboardUpdate: (content, sendToServer) => {
        ContentHandlers.updateClipboardContent(
          content, 
          sendToServer, 
          SocketEvents.sendClipboardUpdate
        );
      },
      onFileUpdate: (fileData) => {
        ContentHandlers.setSharedFile(fileData);
        ContentHandlers.handleFileContent(fileData);
      },
      onClientListUpdate: (clients) => {
        UIManager.updateConnectedDevices(clients);
      }
    });
    
    // Set up all event listeners
    EventHandlers.setupEventListeners();
    
    // Set up DOM observers for filename decryption
    UIManager.setupFilenameObserver();
    UIManager.setupSharedFilesObserver();
    
    // Set up logout button to use auth module
    const logoutBtn = Utils.getElement('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        AuthModule.logout();
      });
    }
    
    // Mark as initialized
    appInitialized = true;
    console.log('ClipShare application initialized successfully');
    
  } catch (err) {
    console.error('Error initializing application:', err);
    UIManager.displayMessage('Failed to initialize application: ' + err.message, 'error');
  }
}

/**
 * Handle successful authentication event
 * @param {Object} sessionData - Session data
 */
function handleAuthSuccess(sessionData) {
  console.log(`Successfully authenticated in session: ${sessionData.sessionId}`);
  UIManager.displayMessage('Authentication successful!', 'success', 3000);
  
  // Update connection status using Session module
  Session.setConnectionStatus(true, UIManager.displayMessage);
}

/**
 * Handle authentication failure event
 * @param {string} error - Error message
 */
function handleAuthFailure(error) {
  console.error('Authentication failed:', error);
  UIManager.displayMessage(`Authentication failed: ${error}`, 'error');
  
  // Update connection status using Session module
  Session.setConnectionStatus(false, UIManager.displayMessage);
  
  // Redirect to login page after a delay
  setTimeout(() => {
    window.location.href = '/';
  }, 3000);
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
