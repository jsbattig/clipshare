const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const sessionManager = require('./session-manager');
const { SESSION_CONSTANTS } = sessionManager;

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
const PING_INTERVAL = 5000;  // 5 seconds between pings
const PING_TIMEOUT = 2500;   // 2.5 seconds to wait for responses before cleanup
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
  // Extract persistent client identity from handshake query if available
  const queryParams = socket.handshake.query || {};
  const persistentClientId = queryParams.clientIdentity || null;
  const connectionMode = queryParams.mode || 'unknown';
  const clientName = queryParams.clientName || null;
  
  console.log(`Socket query parameters:`, {
    clientIdentity: queryParams.clientIdentity,
    clientName: queryParams.clientName,
    mode: queryParams.mode,
    timestamp: queryParams.timestamp,
    rawQuery: JSON.stringify(queryParams)
  });
  
  // Store persistent identity on the socket object for later use
  socket.clientIdentifier = socket.id; // Fallback to socket ID
  socket.persistentIdentity = persistentClientId;
  socket.connectionMode = connectionMode;
  socket.connectionTimestamp = Date.now();
  socket.clientName = clientName; // Store client name on socket object
  
  console.log(`New client connected: ${socket.id} (${connectionMode} mode)`);
  console.log(`Socket properties set:`, {
    clientIdentifier: socket.clientIdentifier,
    persistentIdentity: socket.persistentIdentity,
    connectionMode: socket.connectionMode,
    clientName: socket.clientName
  });
  
  if (persistentClientId) {
    console.log(`- With persistent identity: ${persistentClientId}`);
  }
  if (clientName) {
    console.log(`- With client name: ${clientName}`);
  } else {
    console.log(`- WARNING: No client name provided in connection parameters`);
  }
  
  // Handle client identity information (used for tracking across page changes)
  socket.on('client-identity', (data) => {
    const { persistentId, reconnecting, socketId, browser, clientName } = data;
    
    console.log(`Received identity information from client ${socket.id}:`);
    console.log(`- Persistent ID: ${persistentId}`);
    console.log(`- Client name: ${clientName || 'not provided'}`);
    console.log(`- Reconnecting: ${reconnecting ? 'yes' : 'no'}`);
    
    // Store client name if provided
    if (clientName) {
      socket.clientName = clientName;
    }
    
    // Store updated information
    socket.persistentClientId = persistentId;
    socket.isReconnecting = reconnecting;
    
    // If this is a reconnection, check for any session this client might belong to
    if (reconnecting && persistentId) {
      // Get all active sessions
      const activeSessions = sessionManager.getActiveSessions() || [];
      
      console.log(`Checking ${activeSessions.length} active sessions for reconnecting client ${persistentId}`);
      
      // Look through each session for this client's previous socket ID
      let foundPreviousSession = false;
      let oldSocketId = null;
      let sessionToRejoin = null;
      let wasAuthorized = false;
      
      // Debug - log session details to help diagnose the issue
      activeSessions.forEach(sessionId => {
        const sessionInfo = sessionManager.getSessionInfo(sessionId);
        console.log(`DEBUG - Session ${sessionId} info:`, JSON.stringify(sessionInfo, null, 2));
        
        // Check active clients first
        const clientsList = sessionManager.getSessionClientsInfo(sessionId);
        console.log(`DEBUG - Session ${sessionId} has ${clientsList.length} active clients`);
        
        // Log each active client's info to debug persistent ID storage
        clientsList.forEach(client => {
          console.log(`Client ${client.id} info:`);
          console.log(`- Browser: ${client.browserName}`);
          console.log(`- Connected at: ${client.connectedAt}`);
          console.log(`- browserInfo:`, JSON.stringify(client.browserInfo || {}));
          
          // Check both direct browser info and nested properties
          if (client.browserInfo && client.browserInfo.persistentId === persistentId) {
            console.log(`MATCH FOUND! Client ${client.id} has matching persistent ID`);
            oldSocketId = client.id;
            sessionToRejoin = sessionId;
            wasAuthorized = sessionManager.isClientAuthorized(sessionId, client.id);
            foundPreviousSession = true;
          }
        });
        
        // If not found in active clients, check historical clients
        if (!foundPreviousSession) {
          console.log(`DEBUG - Checking historical clients for session ${sessionId}`);
          
          // We need to use sessionManager to access historical clients
          const sessionData = sessionManager.getSessionData(sessionId);
          if (sessionData && sessionData.historicalClients) {
            // Look for matching persistent ID in historical clients
            const historicalClient = sessionData.historicalClients[persistentId];
          
            if (historicalClient) {
              console.log(`MATCH FOUND in historical clients! ${persistentId}`);
              console.log(`- Last socket ID: ${historicalClient.lastSocketId}`);
              console.log(`- Last seen: ${new Date(historicalClient.lastSeen).toISOString()}`);
              console.log(`- Was authorized: ${historicalClient.wasAuthorized}`);
              
              oldSocketId = historicalClient.lastSocketId;
              sessionToRejoin = sessionId;
              wasAuthorized = historicalClient.wasAuthorized;
              foundPreviousSession = true;
            }
          }
        }
      });
      
      if (foundPreviousSession && sessionToRejoin) {
        console.log(`Found previous session ${sessionToRejoin} for reconnecting client ${persistentId}`);
        console.log(`Old socket ID was: ${oldSocketId}, was authorized: ${wasAuthorized}`);
        
        // Store session ID on socket
        socket.sessionId = sessionToRejoin;
        
        // Join the room
        socket.join(sessionToRejoin);
        
        if (wasAuthorized) {
          // Add client info with authorization preserved
          const clientInfo = {
            id: socket.id,
            ip: socket.handshake.address,
            browserInfo: {
              ...(socket.browserInfo || {}),
              persistentId: persistentId
            },
            connectedAt: new Date().toISOString()
          };
          
          // Add to session with authorized flag preserved
          sessionManager.addClientWithInfo(sessionToRejoin, socket.id, clientInfo, true);
          
          // Get current clipboard content
          const currentContent = sessionManager.getClipboardContent(sessionToRejoin);
          const clientCount = sessionManager.getClientCount(sessionToRejoin);
          const clientsList = sessionManager.getSessionClientsInfo(sessionToRejoin);
          
          // Send verification result to client to complete the rejoin
          socket.emit('verification-result', {
            approved: true,
            sessionId: sessionToRejoin,
            clipboard: currentContent,
            clientCount,
            clients: clientsList
          });
          
          console.log(`Reconnected and re-authorized client ${socket.id} (${persistentId}) to previous session ${sessionToRejoin}`);
        } else {
          // Just update connection info without authorization
          console.log(`Client reconnected but wasn't previously authorized - not reauthorizing`);
        }
      } else {
        console.log(`No previous session found for reconnecting client ${persistentId}`);
      }
    }
  });

  // Set up heartbeat interval for this socket (legacy - can be removed once ping system is fully tested)
  let heartbeatInterval = null;
  
  // Helper function to handle verification completion callback
  function handleVerificationComplete(verificationResult) {
    const { approved, sessionId, clientId } = verificationResult;
    
    // If verification approved, add to session
    if (approved) {
      console.log(`Verification approved for client ${clientId} in session ${sessionId}`);
      
      // Get client info if available - ensure persistentId and clientName are included
      const clientInfo = {
        id: clientId,
        ip: socket.handshake.address,
        browserInfo: {
          ...(socket.browserInfo || {}),
          name: socket.browserInfo?.name || 'Unknown',
          os: socket.browserInfo?.os || 'Unknown',
          persistentId: socket.persistentIdentity || socket.persistentClientId,
          // Include client name from socket object directly with fallback to browserInfo
          clientName: socket.clientName || socket.browserInfo?.clientName || null
          // externalIp removed
        },
        connectedAt: new Date().toISOString()
      };
      
      if (SESSION_CONSTANTS.DEBUG_MODE) {
        console.log(`Client info for ${clientId}:`);
        console.log(`- Client name: ${clientInfo.browserInfo.clientName}`);
        console.log(`- Socket client name: ${socket.clientName}`);
      }
      
      // Add to session with authorized flag - this also marks the client as active
      sessionManager.addClientWithInfo(sessionId, clientId, clientInfo, true);
      
      // Get current clipboard content and client info
      const currentContent = sessionManager.getClipboardContent(sessionId);
      const clientCount = sessionManager.getClientCount(sessionId);
      const clientsList = sessionManager.getSessionClientsInfo(sessionId);
      
      // Enhanced debugging for client list
      if (SESSION_CONSTANTS.DEBUG_MODE) {
        console.log('Client list being sent to newly verified client:');
        console.log(JSON.stringify(clientsList, null, 2));
        console.log(`Active clients: ${clientsList.filter(c => c.active).length}/${clientsList.length}`);
      }
      
      // Send success to client with client list
      socket.emit('verification-result', {
        approved: true,
        sessionId,
        clipboard: currentContent,
        clientCount,
        clients: clientsList
      });
      
      // Immediately send client list update to all clients
      io.to(sessionId).emit('client-list-update', {
        clients: clientsList
      });
      
      // Broadcast client joined to others
      socket.to(sessionId).emit('client-joined', {
        clientId: socket.id,
        clientCount,
        clientInfo
      });
    } else {
      console.log(`Verification denied for client ${clientId} in session ${sessionId}`);
      
      // Send failure to client
      socket.emit('verification-result', {
        approved: false,
        sessionId,
        message: 'Verification failed. Access denied.'
      });
      
      // Remove from room
      socket.leave(sessionId);
    }
  }
  
  // Function to broadcast verification request to authorized clients
  function broadcastVerificationRequest(sessionId, clientId, encryptedVerification) {
    // Get all authorized clients
    const authorizedClients = sessionManager.getAuthorizedClients(sessionId);
    
    if (authorizedClients.length === 0) {
      console.log(`No authorized clients in session ${sessionId} to verify client ${clientId}`);
      return;
    }
    
    // IMPORTANT: Get all clients currently in the socket.io room (connected)
    const room = io.sockets.adapter.rooms.get(sessionId);
    const connectedSocketIds = room ? Array.from(room) : [];
    
    console.log(`Debug info for session ${sessionId}:`);
    console.log(`- Total authorized clients: ${authorizedClients.length}`);
    console.log(`- Connected sockets: ${connectedSocketIds.length}`);
    console.log(`- Connected socket IDs: ${JSON.stringify(connectedSocketIds)}`);
    console.log(`- Authorized client IDs: ${JSON.stringify(authorizedClients)}`);
    
    // More robust check for connected sockets
    const connectedAuthorizedClients = [];
    
    // Check each authorized client to see if it's really connected
    for (const authId of authorizedClients) {
      // Check both the room membership and get the actual socket
      const inRoom = connectedSocketIds.includes(authId);
      const socket = io.sockets.sockets.get(authId);
      
      if (inRoom && socket && socket.connected) {
        connectedAuthorizedClients.push(authId);
        console.log(`Verified client ${authId} is connected and authorized`);
      } else {
        // Log why it's not connected
        console.log(`Client ${authId} is authorized but not connected: ${inRoom ? 'in room' : 'not in room'}, socket exists: ${!!socket}, connected: ${socket?.connected}`);
      }
    }
    
    console.log(`- Connected authorized clients: ${connectedAuthorizedClients.length}`);
    
    if (connectedAuthorizedClients.length === 0) {
      console.log(`No connected authorized clients in session ${sessionId} to verify client ${clientId}`);
      
      // Auto-authorize this client since there are no connected authorized clients
      const result = sessionManager.finalizeVerification(sessionId, clientId, true);
      console.log(`Auto-authorized client ${clientId} due to no connected authorized clients`);
      return;
    }
    
    console.log(`Broadcasting verification request to ${connectedAuthorizedClients.length} connected authorized clients`);
    
    // Send verification request to all connected authorized clients
    connectedAuthorizedClients.forEach(authorizedClientId => {
      console.log(`Sending verification request to client ${authorizedClientId}`);
      io.to(authorizedClientId).emit('verify-join-request', {
        sessionId,
        clientId,
        encryptedVerification
      });
    });
  }
  
  // Handle session existence check
  socket.on('check-session-exists', (data, callback) => {
    const { sessionId } = data;
    
    if (!sessionId) {
      return callback({ 
        exists: false, 
        hasActiveClients: false,
        connectedAuthorizedClients: 0,
        message: 'Session ID is required' 
      });
    }
    
    // Check if session exists and has active clients
    const result = sessionManager.checkSessionExists(sessionId);
    
    if (SESSION_CONSTANTS.DEBUG_MODE) {
      console.log(`Session check for ${sessionId}:`, result);
    }
    
    callback(result);
  });
  
  // Handle new session creation
  socket.on('create-new-session', (data, callback) => {
    const { sessionId } = data;
    
    if (!sessionId) {
      return callback({ 
        success: false, 
        message: 'Session ID is required' 
      });
    }
    
    // Create new session
    const result = sessionManager.createNewSession(sessionId);
    
    if (result.success) {
      // Store session info on socket object for easy access
      socket.sessionId = sessionId;
      
      // Join socket.io room for this session
      socket.join(sessionId);
      
      // Capture client information properly including persistent ID and client name
      const clientInfo = {
        id: socket.id,
        ip: socket.handshake.address,
        browserInfo: {
          name: "Unknown",
          os: "Unknown",
          persistentId: socket.persistentIdentity || socket.persistentClientId,
          // Include client name from socket object directly with fallback to browserInfo
          clientName: socket.clientName || socket.browserInfo?.clientName || null
          // externalIp removed
        },
        connectedAt: new Date().toISOString()
      };
      
      console.log(`Creating session with client info:`, JSON.stringify(clientInfo));
      
      // Add client to session with full info and mark as authorized
      sessionManager.addClientWithInfo(sessionId, socket.id, clientInfo, true);
      
      // Get current clipboard content (empty for new sessions)
      const currentContent = sessionManager.getClipboardContent(sessionId);
      
      // Include additional information in response
      callback({
        ...result,
        clipboard: currentContent,
        clientCount: 1, // Just this client
        clients: [{ id: socket.id, active: true }]
      });
      
      console.log(`New session created: ${sessionId} by client ${socket.id}`);
    } else {
      // Session creation failed
      callback(result);
    }
  });
  
  // Handle request for immediate client list update (prevents waiting for ping cycle)
  socket.on('request-client-list-update', (data) => {
    const { sessionId } = data;
    
    // Verify this client is part of the session
    if (!sessionId || sessionId !== socket.sessionId) {
      console.warn(`Invalid client list update request from ${socket.id} for session ${sessionId}`);
      return;
    }
    
    console.log(`Client ${socket.id} requested immediate client list update for session ${sessionId}`);
    
    // Get the current client list and send it right away
    const clientsList = sessionManager.getSessionClientsInfo(sessionId);
    socket.emit('client-list-update', {
      clients: clientsList
    });
  });
  
  // Handle join request
  socket.on('request-session-join', (data, callback) => {
    const { sessionId, encryptedVerification, clientName } = data;
    
    if (!sessionId || !encryptedVerification) {
      return callback({ 
        accepted: false, 
        message: 'Session ID and verification data are required' 
      });
    }
    
    // Store session ID in socket for future reference
    socket.sessionId = sessionId;
    
    // Store browser info for later use
    socket.browserInfo = data.browserInfo;
    
    // Store client name directly on socket for future reference
    if (clientName) {
      socket.clientName = clientName;
      console.log(`Stored client name on socket: ${clientName}`);
    } else if (data.browserInfo?.clientName) {
      socket.clientName = data.browserInfo.clientName;
      console.log(`Stored client name from browserInfo: ${data.browserInfo.clientName}`);
    }
    
    // Register join request for verification
    const result = sessionManager.registerJoinRequest(
      sessionId, 
      socket.id, 
      encryptedVerification,
      (verificationResult) => {
        // This callback will be called when verification is complete
        handleVerificationComplete(verificationResult);
      }
    );
    
    // If request accepted for verification, join the room to receive broadcasts
    if (result.accepted) {
      // Join socket.io room for this session
      socket.join(sessionId);
      
      // If auto-authorized (first client), no need for verification
      if (result.autoAuthorized) {
      // Add client info with authorized flag and persistent identity
      const clientInfo = {
        id: socket.id,
        ip: socket.handshake.address,
        browserInfo: {
          ...(socket.browserInfo || {}),
          name: socket.browserInfo?.name || 'Unknown',
          os: socket.browserInfo?.os || 'Unknown',
          persistentId: socket.persistentIdentity || socket.persistentClientId,
          // Prioritize client name from socket object, then from browser info
          clientName: socket.clientName || socket.browserInfo?.clientName || null
        },
        connectedAt: new Date().toISOString()
      };
      
      console.log(`Auto-authorizing client ${socket.id} with name: ${clientInfo.browserInfo.clientName}`);
        
        sessionManager.addClientWithInfo(sessionId, socket.id, clientInfo, true);
        
        // Get current clipboard content
        const currentContent = sessionManager.getClipboardContent(sessionId);
        
        // Send verification result to client
        socket.emit('verification-result', {
          approved: true,
          sessionId,
          clipboard: currentContent,
          clientCount: 1,
          clients: [{ id: socket.id, active: true }]
        });
      } else {
        // Broadcast verification request to all authorized clients
        broadcastVerificationRequest(sessionId, socket.id, encryptedVerification);
      }
    }
    
    callback(result);
  });
  
  // Handle verification result from an authorized client
  socket.on('submit-verification-result', (data) => {
    const { sessionId, clientId, approved } = data;
    
    if (!sessionId || !clientId || approved === undefined) {
      console.warn('Invalid verification result data:', data);
      return;
    }
    
    // Submit verification result from this client
    const result = sessionManager.submitVerificationResult(
      sessionId,
      socket.id, // verifier client ID
      clientId,  // target client ID
      approved
    );
    
    if (result.success && result.banned) {
      // Session was banned due to verification failure
      // Notify all clients in the session
      io.to(sessionId).emit('session-banned', {
        sessionId,
        reason: 'Verification failure - possible security breach'
      });
    }
  });
  
  // Handle client ping response
  socket.on('client-ping-response', (data) => {
    const { sessionId } = data;
    
    // Verify the session ID matches what we expect
    if (sessionId && sessionId === socket.sessionId) {
      // Check if client is authorized in this session
      const isAuthorized = sessionManager.isClientAuthorized(sessionId, socket.id);
      
      if (isAuthorized) {
        // Client is authorized - record as responsive
        console.log(`Received valid ping response from client ${socket.id} in session ${sessionId}`);
        
        // This will return true if the client wasn't active before
        const wasNewlyActivated = sessionManager.recordPingResponse(sessionId, socket.id);
        
        // Broadcast updates immediately if client was newly activated
        if (wasNewlyActivated) {
          // Get updated counts and lists
          const activeClientCount = sessionManager.getActiveSessionClients(sessionId).length;
          const clientsList = sessionManager.getSessionClientsInfo(sessionId);
          
          // Broadcast updates to all clients in the session
          io.to(sessionId).emit('client-count-update', { 
            clientCount: activeClientCount 
          });
          
          io.to(sessionId).emit('client-list-update', {
            clients: clientsList
          });
          
          console.log(`Real-time update: Client ${socket.id} is now active (${activeClientCount} active clients)`);
        }
      } else {
        // Not authorized - potential security issue
        console.warn(`Security: Unauthorized client ${socket.id} in ping response`);
        
        // Notify client they need to reconnect/reauthorize
        socket.emit('session-inactive', { 
          message: 'Your session authentication has expired. Please reconnect to continue.' 
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
    const { sessionId, passphrase, browserInfo, clientName } = data;
    
    if (!sessionId || !passphrase) {
      return callback({ 
        success: false, 
        message: 'Session ID and passphrase are required' 
      });
    }
    
    // Check if session exists first - there's no joinSession function anymore
    // Instead we'll check if session exists and then add the client directly
    const checkResult = sessionManager.checkSessionExists(sessionId);
    
    // Create result object with default success
    const result = { 
      success: checkResult.exists, 
      message: checkResult.exists ? 'Session joined' : 'Session does not exist'
    };

    if (checkResult.banned) {
      result.success = false;
      result.message = 'This session is temporarily banned for security reasons';
      return callback(result);
    }
    
    if (result.success) {
      // Store session info on socket object for easy access
      socket.sessionId = sessionId;
      
      // No need to register separately - we'll use getActiveSessions()
      
      // Capture client information including IP address and persistent ID
      const clientInfo = {
        id: socket.id,
        ip: socket.handshake.address,
        browserInfo: {
          ...(browserInfo || {}),
          name: browserInfo?.name || 'Unknown',
          os: browserInfo?.os || 'Unknown',
          // Make sure persistentId is included
          persistentId: socket.persistentIdentity || socket.persistentClientId
        },
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
    
    // Check if client is authorized in this session
    const isAuthorized = sessionManager.isClientAuthorized(sessionId, socket.id);
    if (!isAuthorized) {
      console.warn(`Unauthorized clipboard update from client ${socket.id}`);
      // Notify client they need to reconnect/reauthorize
      socket.emit('session-inactive', { 
        message: 'You are not authorized to update this session. Please reconnect.' 
      });
      return;
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
    
    // Check if client is authorized in this session
    const isAuthorized = sessionManager.isClientAuthorized(sessionId, socket.id);
    if (!isAuthorized) {
      console.warn(`Unauthorized file update from client ${socket.id}`);
      // Notify client they need to reconnect/reauthorize
      socket.emit('session-inactive', { 
        message: 'You are not authorized to share files in this session. Please reconnect.' 
      });
      return;
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
