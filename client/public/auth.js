/**
 * Authentication script for ClipShare
 * Handles session creation/joining and authentication
 */

// Initialize socket connection
const socket = io();

// DOM Elements
const authForm = document.getElementById('auth-form');
const sessionIdInput = document.getElementById('session-id');
const passphraseInput = document.getElementById('passphrase');
const authButton = document.getElementById('auth-button');
const authMessage = document.getElementById('auth-message');

// Check if user is already authenticated
document.addEventListener('DOMContentLoaded', () => {
  const sessionData = getSessionData();
  
  // If session data exists, try to reconnect
  if (sessionData && sessionData.sessionId && sessionData.passphrase) {
    displayMessage('Reconnecting to session...', 'info');
    attemptLogin(sessionData.sessionId, sessionData.passphrase);
  }
});

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
  displayMessage('Connecting to session...', 'info');
  
  // Attempt login
  attemptLogin(sessionId, passphrase);
});

/**
 * Attempt to join or create a session
 */
function attemptLogin(sessionId, passphrase) {
  socket.emit('join-session', { sessionId, passphrase }, (response) => {
    setFormLoading(false);
    
    if (response.success) {
      // Save session data to localStorage
      saveSessionData(sessionId, passphrase);
      
      // Display success message
      const messageText = response.isNewSession 
        ? 'New session created! Redirecting...' 
        : 'Session joined! Redirecting...';
      
      displayMessage(messageText, 'success');
      
      // Redirect to app page
      setTimeout(() => {
        window.location.href = '/app.html';
      }, 1500);
    } else {
      // Display error message
      displayMessage(response.message || 'Failed to join session', 'error');
    }
  });
}

/**
 * Display a message to the user
 */
function displayMessage(message, type = 'info') {
  authMessage.textContent = message;
  authMessage.className = `message ${type}`;
}

/**
 * Set form loading state
 */
function setFormLoading(isLoading) {
  authButton.disabled = isLoading;
  sessionIdInput.disabled = isLoading;
  passphraseInput.disabled = isLoading;
  
  authButton.textContent = isLoading ? 'Connecting...' : 'Join Session';
}

/**
 * Save session data to localStorage for persistence
 */
function saveSessionData(sessionId, passphrase) {
  const sessionData = { sessionId, passphrase };
  localStorage.setItem('clipshare_session', JSON.stringify(sessionData));
}

/**
 * Get session data from localStorage
 */
function getSessionData() {
  const data = localStorage.getItem('clipshare_session');
  return data ? JSON.parse(data) : null;
}

// Socket connection handlers
socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('connect_error', () => {
  displayMessage('Connection error. Please try again.', 'error');
  setFormLoading(false);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
