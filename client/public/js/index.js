/**
 * ClipShare Main Application
 * 
 * Main entry point for the ClipShare application. 
 * Initializes all modules and coordinates their interaction.
 */

import { CONFIG } from './modules/config.js';
import * as Utils from './modules/utils.js';
import * as Session from './modules/session.js';
import * as UIManager from './modules/ui-manager.js';
import * as ClipboardMonitor from './modules/clipboard-monitor.js';
import * as ContentHandlers from './modules/content-handlers.js';
import * as FileOperations from './modules/file-operations.js';
import * as SocketEvents from './modules/socket-events.js';
import * as EventHandlers from './modules/event-handlers.js';

// Application state
let appInitialized = false;

/**
 * Initialize the Socket.io connection
 * @returns {Object} Socket.io instance
 */
function initializeSocket() {
  // Initialize socket connection with proxy support
  const socket = io({
    path: CONFIG.socket.path,
    reconnectionAttempts: CONFIG.socket.reconnectionAttempts,
    reconnectionDelay: CONFIG.socket.reconnectionDelay,
    reconnectionDelayMax: CONFIG.socket.reconnectionDelayMax,
    timeout: CONFIG.socket.timeout,
    // Auto-detect if we're using HTTPS
    secure: window.location.protocol === 'https:'
  });
  
  return socket;
}

/**
 * Initialize the application
 */
function initializeApp() {
  if (appInitialized) return;
  
  try {
    console.log('Initializing ClipShare application...');
    
    // Initialize socket
    const socket = initializeSocket();
    
    // Initialize session with the socket instance
    const sessionData = Session.initSession(socket);
    
    // Check authentication
    if (!sessionData) {
      console.log('No valid session data found, redirecting to login');
      window.location.href = '/';
      return;
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
      }
    });
    
    // Initialize clipboard monitoring
    ClipboardMonitor.init({
      isMonitoring: true
    });
    
    // Start clipboard monitoring with callback
    ClipboardMonitor.startMonitoring(
      (content, sendToServer) => {
        ContentHandlers.updateClipboardContent(
          content, 
          sendToServer, 
          SocketEvents.sendClipboardUpdate
        );
      },
      UIManager.updateSyncStatus
    );
    
    // Set up all event listeners
    EventHandlers.setupEventListeners();
    
    // Set page visibility detection
    setupVisibilityDetection();
    
    // Mark as initialized
    appInitialized = true;
    console.log('ClipShare application initialized successfully');
    
  } catch (err) {
    console.error('Error initializing application:', err);
    UIManager.displayMessage('Failed to initialize application: ' + err.message, 'error');
  }
}

/**
 * Set up page visibility detection
 */
function setupVisibilityDetection() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Tab became visible - immediately check clipboard
      if (ClipboardMonitor.getMonitoringState()) {
        ClipboardMonitor.refreshFromClipboard((content, sendToServer) => {
          ContentHandlers.updateClipboardContent(
            content, 
            sendToServer, 
            SocketEvents.sendClipboardUpdate
          );
        });
        UIManager.updateSyncStatus('Tab active - monitoring resumed');
      }
    } else {
      // Tab hidden
      UIManager.updateSyncStatus('Tab inactive - monitoring paused');
    }
  });
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
