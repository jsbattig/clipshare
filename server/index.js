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

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);
  
  // Store socket's client ID for heartbeat system
  socket.clientIdentifier = socket.id;

  // Set up heartbeat interval for this socket
  let heartbeatInterval = null;
  
  // Handle session join/create
  socket.on('join-session', (data, callback) => {
    const { sessionId, passphrase } = data;
    
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
      
      // Add client to session
      sessionManager.addClientToSession(sessionId, socket.id);
      
      // Join socket.io room for this session
      socket.join(sessionId);
      
      // Get current clipboard content
      const currentContent = sessionManager.getClipboardContent(sessionId);
      
      // Get the current client count after this client joined
      const clientCount = sessionManager.getClientCount(sessionId);
      
      // Send success response with current clipboard and client count
      callback({ 
        ...result, 
        clipboard: currentContent,
        clientCount: clientCount
      });
      
      // Broadcast updated client count to ALL clients in the session (including sender)
      io.to(sessionId).emit('client-count-update', { 
        clientCount: clientCount
      });
      
      // Notify other clients that a new client joined
      socket.to(sessionId).emit('client-joined', { 
        clientId: socket.id,
        clientCount: clientCount
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
      // Broadcast to all other clients in the session
      socket.to(sessionId).emit('clipboard-broadcast', clipboardData);
      console.log(`Clipboard updated (${type}) in session ${sessionId} by client ${socket.id}`);
    } else {
      console.log(`Clipboard update rejected (older timestamp) in session ${sessionId}`);
    }
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
