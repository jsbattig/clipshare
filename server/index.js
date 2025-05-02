const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const sessionManager = require('./session-manager');

// Create Express app
const app = express();
const server = http.createServer(app);

// Trust proxy settings for HAProxy
app.set('trust proxy', true);

// Configure CORS
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../client/public')));

// Create Socket.io server
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins in development
    methods: ['GET', 'POST']
  },
  // Add these for proxy support
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  // Handle path and potential proxy issues
  path: '/socket.io'
});

// Constants for ping mechanism
const PING_INTERVAL = 15000; // 15 seconds between pings
const PING_TIMEOUT = 5000;   // 5 seconds to wait for responses before cleanup
const FORCE_RESET_INTERVAL = 60000; // 60 seconds between force resets

// Function to format current time for logging
function getLogTimestamp() {
  return new Date().toISOString();
}

// Create Socket.io server with explicit reference for ping system
console.log(`[${getLogTimestamp()}] Initializing Socket.IO server`);

// Socket.io initialization code already exists above...

// Log that we're setting up the ping mechanism
console.log(`[${getLogTimestamp()}] Setting up ping mechanism...`);
console.log(`Ping interval: ${PING_INTERVAL}ms, timeout: ${PING_TIMEOUT}ms`);
console.log(`Force reset interval: ${FORCE_RESET_INTERVAL}ms`);

// Set up ping interval for session monitoring
const pingInterval = setInterval(() => {
  try {
    // Log with timestamp
    console.log(`[${getLogTimestamp()}] Running ping cycle...`);
    
    // Get all active sessions with safety check
    const activeSessions = sessionManager.getActiveSessions() || [];
    console.log(`Ping cycle: Found ${activeSessions.length} active sessions`);
    
    // Verify io object
    if (!io || typeof io.to !== 'function') {
      console.error('Socket.IO object not available for ping cycle');
      return;
    }
    
    // Enhanced logging
    console.log(`Active sessions status: ${JSON.stringify(sessionManager.getSessionsStatus())}`);
    
    // Process each session
    activeSessions.forEach(sessionId => {
      console.log(`Sending ping to session ${sessionId}`);
      
      // Verify room exists before trying to send
      const room = io.sockets.adapter.rooms.get(sessionId);
      if (!room) {
        console.log(`No Socket.IO room found for session ${sessionId}, skipping ping`);
        return;
      }
      
      const socketCount = room.size;
      console.log(`Room ${sessionId} has ${socketCount} connected sockets`);
      
      // Send ping with more detailed data
      io.to(sessionId).emit('ping-clients', { 
        timestamp: Date.now(),
        sessionId: sessionId,
        server_time: getLogTimestamp()
      });
      
      // After timeout, clean up non-responsive clients
      setTimeout(() => {
        try {
          const result = sessionManager.cleanupNonResponsiveClients(sessionId);
          
          if (result.count > 0) {
            console.log(`Cleaned up ${result.count} non-responsive clients from session ${sessionId}`);
            console.log(`Removed clients: ${result.removedIds.join(', ')}`);
            
            // Update client count for everyone
            const activeClientCount = sessionManager.getActiveSessionClients(sessionId).length;
            
            // Check again if room exists before broadcasting
            if (io.sockets.adapter.rooms.get(sessionId)) {
              io.to(sessionId).emit('client-count-update', { 
                clientCount: activeClientCount 
              });
              
              // Update client list for everyone
              const clientsList = sessionManager.getSessionClientsInfo(sessionId);
              io.to(sessionId).emit('client-list-update', {
                clients: clientsList
              });
            } else {
              console.log(`Room ${sessionId} no longer exists, can't send updates`);
            }
          }
        } catch (timeoutErr) {
          console.error(`Error in ping timeout handler for session ${sessionId}:`, timeoutErr);
        }
      }, PING_TIMEOUT);
    });
  } catch (err) {
    console.error(`[${getLogTimestamp()}] Error in ping interval:`, err);
  }
}, PING_INTERVAL);

// Set up force reset interval to ensure client lists stay in sync
const forceResetInterval = setInterval(() => {
  try {
    const timestamp = getLogTimestamp();
    console.log(`[${timestamp}] Running force reset cycle...`);
    
    const activeSessions = sessionManager.getActiveSessions();
    console.log(`Force reset cycle: Found ${activeSessions.length} active sessions`);
    
    // Verify io object
    if (!io || typeof io.sockets?.adapter?.rooms === 'undefined') {
      console.error('Socket.IO rooms adapter not available for force reset');
      return;
    }
    
    activeSessions.forEach(sessionId => {
      try {
        // Get room info for this session
        const room = io.sockets.adapter.rooms.get(sessionId);
        const connectedSockets = room ? Array.from(room) : [];
        
        console.log(`Force reset for session ${sessionId}: ${connectedSockets.length} connected sockets`);
        
        // Reset active client list to match socket.io room membership
        sessionManager.resetActiveClients(sessionId, connectedSockets);
        
        // Only broadcast if we have a room
        if (room) {
          // Update client count and list for everyone
          io.to(sessionId).emit('client-count-update', { 
            clientCount: connectedSockets.length 
          });
          
          const clientsList = sessionManager.getSessionClientsInfo(sessionId);
          io.to(sessionId).emit('client-list-update', {
            clients: clientsList
          });
        }
      } catch (sessionErr) {
        console.error(`Error processing session ${sessionId} during force reset:`, sessionErr);
      }
    });
  } catch (err) {
    console.error(`[${getLogTimestamp()}] Error in force reset interval:`, err);
  }
}, FORCE_RESET_INTERVAL);

// Log that intervals are set up
console.log(`[${getLogTimestamp()}] Ping intervals set up successfully`);

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);
  
  // Store socket's client ID for heartbeat system
  socket.clientIdentifier = socket.id;

  // Set up heartbeat interval for this socket (legacy - can be removed once ping system is fully tested)
  let heartbeatInterval = null;
  
  // Handle client ping response
  socket.on('client-ping-response', (data) => {
    const { sessionId, sessionToken } = data;
    
    // Security verification:
    // Verify the session ID matches what we expect and authenticate with session manager
    if (sessionId && sessionId === socket.sessionId) {
      // Use session manager's joinSession to verify the token is correct
      const result = sessionManager.joinSession(sessionId, sessionToken);
      
      if (result.success) {
        // Token is valid - record this client as responsive
        console.log(`Received valid ping response from client ${socket.id} in session ${sessionId}`);
        sessionManager.recordPingResponse(sessionId, socket.id);
      } else {
        // Invalid token - potential security issue
        console.warn(`Security: Invalid session token in ping response from ${socket.id}`);
        
        // Notify client they need to reconnect
        socket.emit('session-inactive', { 
          message: 'Your session authentication has failed. Please reconnect to continue.' 
        });
      }
    } else if (socket.sessionId) {
      // Session ID mismatch - potential security issue
      console.warn(`Security: Session ID mismatch in ping response from ${socket.id}`);
      
      // Notify client they need to reconnect
      socket.emit('session-inactive', { 
        message: 'Your session authentication has failed. Please reconnect to continue.' 
      });
    }
  });

  // Handle session join/create
  socket.on('join-session', (data, callback) => {
    const { sessionId, passphrase, browserInfo } = data;
    
    if (!sessionId || !passphrase) {
      return callback({ 
        success: false, 
        message: 'Session ID and passphrase are required' 
      });
    }
    
    const result = sessionManager.joinSession(sessionId, passphrase);
    
    if (result.success) {
      // Store session info on socket object for easy access
      socket.sessionId = sessionId;
      
      // No need to register separately - we'll use getActiveSessions()
      
      // Capture client information including IP address
      const clientInfo = {
        id: socket.id,
        ip: socket.handshake.address,
        browserInfo: browserInfo || { name: 'Unknown', os: 'Unknown' },
        connectedAt: new Date().toISOString()
      };
      
      // Add client to session with detailed info
      sessionManager.addClientWithInfo(sessionId, socket.id, clientInfo);
      
      // Join socket.io room for this session
      socket.join(sessionId);
      
      // Get current clipboard content
      const currentContent = sessionManager.getClipboardContent(sessionId);
      
      // Get the current client count after this client joined
      const clientCount = sessionManager.getClientCount(sessionId);
      
      // Get detailed client list
      const clientsList = sessionManager.getSessionClientsInfo(sessionId);
      
      // Send success response with current clipboard, client count, and clients list
      callback({ 
        ...result, 
        clipboard: currentContent,
        clientCount: clientCount,
        clients: clientsList
      });
      
      // Broadcast updated client count to ALL clients in the session (including sender)
      io.to(sessionId).emit('client-count-update', { 
        clientCount: clientCount
      });
      
      // Broadcast detailed client list to ALL clients in the session
      io.to(sessionId).emit('client-list-update', {
        clients: clientsList
      });
      
      // Notify other clients that a new client joined
      socket.to(sessionId).emit('client-joined', { 
        clientId: socket.id,
        clientCount: clientCount,
        clientInfo: clientInfo
      });
      
      // Set up heartbeat interval to periodically broadcast client count
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      
      heartbeatInterval = setInterval(() => {
        if (socket.sessionId) {
          const currentCount = sessionManager.getClientCount(socket.sessionId);
          io.to(socket.sessionId).emit('client-count-update', { 
            clientCount: currentCount 
          });
        }
      }, 10000); // Every 10 seconds
    } else {
      // Authentication failed
      callback(result);
    }
  });
  
  // Handle clipboard updates
  socket.on('clipboard-update', (data) => {
    const { content, type = 'text', timestamp, clientInfo } = data;
    const { sessionId } = socket;
    
    if (!sessionId) {
      return; // Client not authenticated
    }
    
    // Create properly formatted clipboard data with timestamp
    let clipboardData;
    if (typeof content === 'string' && !type) {
      // Legacy format
      clipboardData = { 
        type: 'text', 
        content,
        timestamp: Date.now(), // Use server timestamp to avoid clock skew
        clientInfo: clientInfo || { windowId: 'unknown' }
      };
    } else {
      // New format
      clipboardData = { 
        type, 
        content,
        timestamp: Date.now(), // Use server timestamp to avoid clock skew
        clientInfo: clientInfo || { windowId: 'unknown' }
      };
      
      // Preserve imageType if available
      if (type === 'image' && data.imageType) {
        clipboardData.imageType = data.imageType;
      }
      
      // Preserve content hash if provided
      if (data.contentHash) {
        clipboardData.contentHash = data.contentHash;
      }
    }
    
    // Update clipboard content in session, tracking origin client
    const wasUpdated = sessionManager.updateClipboardContent(
      sessionId, 
      clipboardData, 
      socket.id
    );
    
    // Only broadcast if update was actually applied (prevents update loops)
    if (wasUpdated) {
    // Broadcast only to active clients in the session
    const activeClients = sessionManager.getActiveSessionClients(sessionId);
    activeClients.forEach(clientId => {
      if (clientId !== socket.id) { // Don't send back to originator
        io.to(clientId).emit('clipboard-broadcast', clipboardData);
      }
    });
      console.log(`Clipboard updated (${type}) in session ${sessionId} by client ${socket.id}`);
    } else {
      console.log(`Clipboard update rejected (older timestamp) in session ${sessionId}`);
    }
  });
  
  // Handle file updates
  socket.on('file-update', (fileData) => {
    const { sessionId } = socket;
    
    if (!sessionId) {
      return; // Client not authenticated
    }
    
    // Add origin client information if not present
    if (!fileData.originClient) {
      fileData.originClient = socket.id;
    }
    
    // Timestamp if not present
    if (!fileData.timestamp) {
      fileData.timestamp = Date.now();
    }
    
    console.log(`File shared in session ${sessionId}: ${fileData.fileName || 'unnamed file'} (from client ${socket.id})`);
    
    // Broadcast only to active clients in the session
    const activeClients = sessionManager.getActiveSessionClients(sessionId);
    activeClients.forEach(clientId => {
      if (clientId !== socket.id) { // Don't send back to originator
        io.to(clientId).emit('file-broadcast', fileData);
      }
    });
  });
  
  // Handle client disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // Clear heartbeat interval
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    
    const { sessionId } = socket;
    if (sessionId) {
      // Remove client from session
      sessionManager.removeClientFromSession(sessionId, socket.id);
      
      // Get accurate client count from session manager
      const remainingClients = sessionManager.getClientCount(sessionId);
      
      // Broadcast updated client count to ALL remaining clients
      io.to(sessionId).emit('client-count-update', { 
        clientCount: remainingClients 
      });
      
      // Notify other clients about disconnection
      io.to(sessionId).emit('client-left', { 
        clientId: socket.id,
        clientCount: remainingClients
      });
      
      // If there are clients left, broadcast updated client list
      if (remainingClients > 0) {
        const updatedClientsList = sessionManager.getSessionClientsInfo(sessionId);
        io.to(sessionId).emit('client-list-update', {
          clients: updatedClientsList
        });
      }
    }
  });
});

// Server route for health check
app.get('/health', (req, res) => {
  res.status(200).send({ status: 'ok' });
});

// Fallback route - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
