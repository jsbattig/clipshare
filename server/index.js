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
      
      // Send success response with current clipboard
      callback({ 
        ...result, 
        clipboard: currentContent 
      });
      
      // Notify other clients that a new client joined
      socket.to(sessionId).emit('client-joined', { clientId: socket.id });
    } else {
      // Authentication failed
      callback(result);
    }
  });
  
  // Handle clipboard updates
  socket.on('clipboard-update', (data) => {
    const { content } = data;
    const { sessionId } = socket;
    
    if (!sessionId) {
      return; // Client not authenticated
    }
    
    // Update clipboard content in session
    sessionManager.updateClipboardContent(sessionId, content);
    
    // Broadcast to all other clients in the session
    socket.to(sessionId).emit('clipboard-broadcast', { content });
    
    console.log(`Clipboard updated in session ${sessionId}`);
  });
  
  // Handle client disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    const { sessionId } = socket;
    if (sessionId) {
      // Remove client from session
      sessionManager.removeClientFromSession(sessionId, socket.id);
      
      // Notify other clients about disconnection
      socket.to(sessionId).emit('client-left', { clientId: socket.id });
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
