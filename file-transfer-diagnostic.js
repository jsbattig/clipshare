/**
 * ClipShare File Transfer Diagnostic
 * 
 * This script tests the socket.io-stream implementation by sending files 
 * and monitoring the transfer process.
 */

// Socket instance for testing
let socket = null;

// Transfer module state
let fileStreamReady = false;
let ss = null;

// Setup socket.io connection
function setupSocketConnection() {
    logMessage('Setting up socket connection...', 'info');
    
    // Connect to the server
    socket = io({
        path: '/socket.io',
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
        query: {
            clientIdentity: 'diagnostic-test-' + Date.now(),
            clientName: 'Diagnostic Tool',
            mode: 'test'
        }
    });
    
    socket.on('connect', () => {
        logMessage(`Socket connected with ID: ${socket.id}`, 'success');
        
        // Join test session
        joinTestSession();
    });
    
    socket.on('connect_error', (error) => {
        logMessage(`Connection error: ${error.message}`, 'error');
    });
    
    socket.on('disconnect', (reason) => {
        logMessage(`Socket disconnected: ${reason}`, 'error');
    });
    
    // Load socket.io-stream
    loadSocketIOStream();
}

// Load socket.io-stream from CDN
function loadSocketIOStream() {
    logMessage('Loading socket.io-stream...', 'info');
    
    // Check if already loaded
    if (typeof window.ss !== 'undefined') {
        ss = window.ss;
        fileStreamReady = true;
        logMessage('socket.io-stream already loaded', 'success');
        return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io-stream/0.9.1/socket.io-stream.min.js';
    script.async = true;
    
    script.onload = function() {
        logMessage('socket.io-stream loaded successfully', 'success');
        ss = window.ss;
        fileStreamReady = true;
    };
    
    script.onerror = function() {
        logMessage('Failed to load socket.io-stream', 'error');
    };
    
    document.head.appendChild(script);
}

// Join test session
function joinTestSession() {
    const sessionId = 'test-session';
    const passphrase = 'test';
    
    logMessage(`Joining test session: ${sessionId}`, 'info');
    
    socket.emit('create-new-session', { sessionId }, (response) => {
        if (response.success) {
            logMessage('Test session created successfully', 'success');
        } else {
            logMessage(`Session creation failed: ${response.message}`, 'info');
            
            // Try joining instead
            socket.emit('join-session', { 
                sessionId, 
                passphrase,
                browserInfo: {
                    name: 'Diagnostic Tool',
                    os: 'Diagnostic',
                    clientName: 'File Transfer Test'
                } 
            }, (joinResponse) => {
                if (joinResponse.success) {
                    logMessage('Joined existing test session', 'success');
                } else {
                    logMessage(`Failed to join session: ${joinResponse.message}`, 'error');
                }
            });
        }
    });
}

// Process the selected file
function processFile(file) {
    logMessage(`Selected file: ${file.name} (${file.size} bytes, ${file.type})`, 'info');
    
    // Read file content
    const reader = new FileReader();
    
    reader.onload = function(e) {
        logMessage(`File read successfully: ${e.target.result.length} bytes`, 'success');
        
        // Convert to data URL for sharing
        readAsDataURL(file);
    };
    
    reader.onerror = function() {
        logMessage(`Error reading file: ${reader.error}`, 'error');
    };
    
    reader.readAsText(file);
}

// Read file as data URL
function readAsDataURL(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        logMessage(`File converted to Data URL: ${e.target.result.substring(0, 50)}...`, 'success');
        
        // Send file using streaming
        sendFileViaStream(file, e.target.result);
    };
    
    reader.onerror = function() {
        logMessage(`Error converting file: ${reader.error}`, 'error');
    };
    
    reader.readAsDataURL(file);
}

// Send file using socket.io-stream
function sendFileViaStream(file, dataUrl) {
    if (!socket || !socket.connected) {
        logMessage('Cannot send file: Socket not connected', 'error');
        return;
    }
    
    if (!fileStreamReady || !ss) {
        logMessage('Socket.IO Stream not ready yet. Please try again.', 'error');
        return;
    }
    
    try {
        logMessage(`Preparing file for streaming: ${file.name}`, 'info');
        
        // Create file data object
        const fileData = {
            type: 'file',
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || 'application/octet-stream',
            content: dataUrl,
            _displayFileName: file.name,
            timestamp: Date.now()
        };
        
        // Create a stream
        const stream = ss.createStream();
        
        // Show progress message with filename
        logMessage(`Starting stream for file: ${file.name}`, 'info');
        
        // Emit the stream with metadata
        ss(socket).emit('file-stream', stream, {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || 'application/octet-stream',
            type: 'file',
            originClient: socket.id,
            timestamp: Date.now()
        });
        
        // Convert file data to string
        const contentString = JSON.stringify(fileData);
        
        // Create a buffer from the string (browser-compatible approach)
        // Convert string to ArrayBuffer first
        const encoder = new TextEncoder();
        const contentArray = encoder.encode(contentString);
        const totalSize = contentArray.length;
        
        // Create a readable stream using socket.io-stream's approach
        const bufferStream = ss.createStream();
        
        // Write the content to the stream
        bufferStream.write(contentString);
        bufferStream.end();
        
        // Set up progress tracking
        let bytesSent = 0;
        
        // Pipe through a progress stream first
        const progressStream = ss.createStream();
        progressStream.on('data', (chunk) => {
            bytesSent += chunk.length;
            
            // Update progress periodically (every ~50KB)
            if (bytesSent % 50000 < 16384) {
                const percent = Math.floor((bytesSent / totalSize) * 100);
                logMessage(`Sending file: ${file.name} (${percent}%)`, 'info');
            }
        });
        
        progressStream.on('end', () => {
            logMessage(`File sent successfully: ${file.name} (${bytesSent} bytes)`, 'success');
        });
        
        // Pipe the buffer through progress stream to the output stream
        bufferStream.pipe(progressStream).pipe(stream);
        
        return true;
    } catch (error) {
        logMessage(`Error sending file stream: ${error.message}`, 'error');
        console.error('Detailed error:', error);
        return false;
    }
}

// Logging function
function logMessage(message, type = 'info') {
    const logContainer = document.getElementById('logContainer');
    if (!logContainer) return;
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
    console.log(`${type.toUpperCase()}: ${message}`);
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize when DOM is ready
    const initButton = document.getElementById('initButton');
    if (initButton) {
        initButton.addEventListener('click', setupSocketConnection);
    }
    
    // Set up drop zone event listeners
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('active');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('active');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('active');
            
            if (e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                processFile(file);
            }
        });
    }
    
    // Set up file select button
    const selectFileBtn = document.getElementById('selectFileBtn');
    if (selectFileBtn) {
        selectFileBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    const file = e.target.files[0];
                    processFile(file);
                }
            });
            input.click();
        });
    }
    
    // Set up test file button
    const testFileBtn = document.getElementById('testFileBtn');
    if (testFileBtn) {
        testFileBtn.addEventListener('click', () => {
            fetch('test-file.txt')
                .then(response => response.blob())
                .then(blob => {
                    const file = new File([blob], 'test-file.txt', { type: 'text/plain' });
                    processFile(file);
                })
                .catch(error => {
                    logMessage(`Error loading test file: ${error.message}`, 'error');
                });
        });
    }
    
    logMessage('Diagnostic tool loaded. Click "Initialize" to begin.', 'info');
});
