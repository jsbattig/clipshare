// ClipShare login script using Socket.IO client directly
const { io } = require('socket.io-client');
const CryptoJS = require('crypto-js');

// Configuration
const CONFIG = {
  sessionId: 'test',
  passphrase: 'test',
  clientName: 'test',  // Changed from 'wsl' to 'test'
  verificationText: "ClipShare is freaking awesome",
  serverUrl: 'http://localhost:3000'
};

// Generate encrypted verification data
function generateVerificationData(sessionId, passphrase) {
  const verificationText = sessionId + CONFIG.verificationText;
  const encrypted = CryptoJS.AES.encrypt(verificationText, passphrase).toString();
  return encrypted;
}

// Get or create a client ID
function getClientId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  const userAgentHash = CryptoJS.MD5('node-script').toString().substring(0, 8);
  return `client_${timestamp}_${random}_${userAgentHash}`;
}

// Connect and authenticate
function connect() {
  console.log(`Connecting to ${CONFIG.serverUrl}...`);
  
  const clientId = getClientId();
  console.log(`Generated client ID: ${clientId}`);
  
  const socket = io(CONFIG.serverUrl, {
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    transports: ['polling', 'websocket'],
    query: {
      clientIdentity: clientId,
      clientName: CONFIG.clientName,
      mode: 'auth',
      timestamp: Date.now()
    }
  });

  // Event handlers
  socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
    console.log(`Checking if session '${CONFIG.sessionId}' exists...`);
    
    // Check if session exists
    socket.emit('check-session-exists', { sessionId: CONFIG.sessionId }, (response) => {
      console.log('Session check response:', response);
      
      if (response.exists && response.hasActiveClients) {
        console.log('Session exists with active clients. Requesting to join...');
        requestToJoinSession(socket);
      } else if (response.banned) {
        console.log('This session has been banned temporarily for security reasons');
        socket.disconnect();
      } else if (response.exists) {
        console.log('Session exists but has no active clients. Requesting to join...');
        requestToJoinSession(socket);
      } else {
        console.log('Session does not exist. Creating new session...');
        createNewSession(socket);
      }
    });
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });

  socket.on('verification-result', (data) => {
    console.log(`Received verification result: ${data.approved ? 'Approved' : 'Denied'}`);
    if (data.approved) {
      console.log('Authentication successful! Session joined.');
      
      // Save session data to local storage equivalent
      const sessionData = {
        sessionId: CONFIG.sessionId,
        passphrase: CONFIG.passphrase,
        timestamp: Date.now(),
        clientName: CONFIG.clientName
      };
      console.log('Session data saved:', sessionData);
      
      // Keep connection alive for clipboard operations
      console.log('Connection established and authenticated.');
      console.log('Press Ctrl+C to disconnect and exit.');
    } else {
      console.log('Verification failed. Access denied.');
      socket.disconnect();
    }
  });

  socket.on('verify-join-request', (data) => {
    console.log('Received verification request from another client:', data);
    // This won't happen in our test scenario unless multiple clients are connected
  });

  // Return socket for further use
  return socket;
}

// Request to join an existing session
function requestToJoinSession(socket) {
  // Generate encrypted verification data
  const verificationData = generateVerificationData(CONFIG.sessionId, CONFIG.passphrase);
  console.log('Generated encrypted verification data');
  
  // Browser info mock
  const browserInfo = {
    name: 'Node.js Script',
    os: 'Script Environment',
    userAgent: 'ClipShare Test Script',
    windowId: Math.random().toString(36).substring(2, 10),
    persistentId: getClientId(),
    timestamp: Date.now(),
    clientName: CONFIG.clientName
  };
  
  console.log(`Sending join request for session '${CONFIG.sessionId}'`);
  
  // Send join request with encrypted verification data
  socket.emit('request-session-join', {
    sessionId: CONFIG.sessionId,
    encryptedVerification: verificationData,
    browserInfo,
    clientName: CONFIG.clientName
  }, (response) => {
    console.log('Join request response:', response);
    
    if (response.accepted) {
      console.log('Join request sent. Waiting for verification...');
      // Wait for verification-result event (handled by socket listener)
    } else {
      console.log('Failed to request session join:', response.message);
      socket.disconnect();
    }
  });
}

// Create a new session
function createNewSession(socket) {
  console.log(`Creating new session '${CONFIG.sessionId}'`);
  
  socket.emit('create-new-session', { sessionId: CONFIG.sessionId }, (response) => {
    console.log('Create session response:', response);
    
    if (response.success) {
      console.log('Session created successfully!');
      
      // Save session data locally
      const sessionData = {
        sessionId: CONFIG.sessionId,
        passphrase: CONFIG.passphrase,
        timestamp: Date.now(),
        clientName: CONFIG.clientName
      };
      console.log('Session data saved:', sessionData);
      
      // Keep connection alive for clipboard operations
      console.log('Connection established and authenticated.');
      console.log('Press Ctrl+C to disconnect and exit.');
    } else {
      console.log('Failed to create session:', response.message);
      socket.disconnect();
    }
  });
}

// Start the connection process
const socket = connect();

// Handle script termination
process.on('SIGINT', () => {
  console.log('Disconnecting...');
  if (socket.connected) {
    socket.disconnect();
  }
  process.exit();
});
