/**
 * ClipShare Configuration
 * 
 * Centralized configuration settings for the ClipShare application.
 * Exported as a module for use in other components.
 */

export const CONFIG = {
  // Polling configuration
  polling: {
    interval: 1000,              // Check clipboard every 1 second
    typingTimeout: 3000,         // Resume polling 3 seconds after typing stops
    syncGracePeriod: 3000,       // Grace period after receiving updates
  },
  
  // Synchronization settings
  sync: {
    minTimeBetweenSyncs: 2000,   // Minimum time between sync attempts
    imageSyncRetries: 3,         // Number of times to retry syncing images
    imageSyncRetryDelay: 1000    // Delay between image sync retries
  },
  
  // File handling limits
  files: {
    maxFileSize: 50 * 1024 * 1024, // 50MB maximum file size
    fileChunkSize: 1024 * 1024,    // 1MB chunks for file transfer
    maxImageSize: 800              // Maximum size for images before thumbnailing
  },
  
  // Storage keys
  storage: {
    sessionKey: 'clipshare_session' // IMPORTANT: Must use this consistently
  },
  
  // Socket.io configuration
  socket: {
    path: '/socket.io',
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
  },
  
  // Content types
  contentTypes: {
    TEXT: 'text',
    IMAGE: 'image',
    FILE: 'file',
    EMPTY: 'empty'
  }
};
