# Technical Context: ClipShare

## Technology Stack

### Frontend
- **HTML5**: Semantic markup for structure
- **CSS3**: Styling with CSS variables for theming
- **Vanilla JavaScript**: No framework dependency for simplicity
- **Clipboard API**: Modern browser API for clipboard access
- **WebSockets**: Real-time communication via Socket.IO client

### Backend
- **Node.js**: JavaScript runtime environment
- **Express.js**: Web application framework
- **Socket.IO**: WebSocket library for real-time bidirectional communication
- **In-memory Storage**: Simple JavaScript objects for data storage

### DevOps & Deployment
- **Docker**: Containerization for consistent deployment
- **Docker Compose**: Multi-container Docker applications
- **GitHub**: Source code repository
- **GitHub Actions**: CI/CD pipeline automation
- **GitHub Packages**: Docker image hosting

## Technical Constraints

### Browser Clipboard API Limitations
- **Security Restrictions**: Browsers restrict clipboard access for security reasons
  - Requires user permission or user-initiated actions
  - No clipboard event API in most browsers
  - Must use polling for monitoring
  - Different implementation across browsers
- **Compatibility**: Implementation varies across browsers
  - Primary support: Chrome, Firefox, Edge, Safari (newer versions)
  - Fallback mechanisms needed for broader support

### WebSocket Considerations
- **Connection Management**: Must handle reconnections gracefully
- **Event Propagation**: Prevent infinite update loops
- **Scalability**: Current implementation uses in-memory state (not horizontally scalable)

### Authentication Limitations
- **Simple Authentication**: Passphrase-based with no encryption
- **Session Management**: Browser localStorage for persistence
  - **Critical: Use consistent key name 'clipshare_session'**
  - Mixing key names (e.g., 'clipboard-session') causes authentication loops
- **No User Accounts**: Sessions exist only while active

### Utility Function Dependencies
- **File Handling Utilities**: Several critical functions must be implemented:
  - `getFileExtension()` - For extracting file extensions
  - `getMimeTypeFromExtension()` - For determining MIME types
  - Failure to implement these causes application errors

## Development Environment

### Local Development Setup
```bash
# Install dependencies
npm run install-all

# Start development server with auto-restart
npm run dev

# Access the application
# http://localhost:3000
```

### Docker Development
```bash
# Build and run with Docker Compose
docker compose up -d

# Access the application
# http://localhost:3000
```

## Testing Approach
- **Manual Testing**: Currently relies on manual verification
- **Browser Compatibility**: Tested on Chrome, Firefox, Edge, Safari
- **Cross-Device Testing**: Verified on Windows, macOS, Linux
- **Future Enhancements**: Add automated tests for core functionality

## Code Stability
- **Known Stable Commit**: db428d57 (May 1, 2025) - Verified working state
- **Critical Areas to Test**:
  - Authentication flow with localStorage
  - File handling with utility functions
  - Clipboard monitoring initialization
- **Careful Changes**: Make incremental, focused changes with thorough testing

## Security Considerations

### Data Protection
- **In-memory Only**: No persistent storage of clipboard data
- **Session Isolation**: Content only shared within explicit sessions
- **No Logging**: Clipboard content not logged or stored

### Authentication
- **Passphrase Protection**: Simple barrier to entry
- **No Encryption**: Passphrases and content transmitted without encryption
- **Session Tokens**: Stored in browser localStorage
  - JSON structure: `{sessionId, passphrase, timestamp}`
  - Key name: 'clipshare_session'

### Network Security
- **WebSocket Communication**: No built-in encryption
- **HTTPS Recommended**: Should be deployed behind HTTPS for production use

## Deployment Options

### Docker Deployment
Preferred deployment method using Docker:
```bash
docker pull ghcr.io/jsbattig/clipshare:latest
docker run -p 3000:80 ghcr.io/jsbattig/clipshare:latest
```

### Docker Compose Deployment
For more configurable deployment:
```yaml
version: '3.8'
services:
  clipshare:
    image: ghcr.io/jsbattig/clipshare:latest
    ports:
      - "3000:3000"
    restart: unless-stopped
```

### Manual Deployment
For non-containerized environments:
```bash
git clone https://github.com/jsbattig/clipshare.git
cd clipshare
npm run install-all
NODE_ENV=production npm start
```

## Performance Characteristics
- **Memory Usage**: Lightweight (~50-100MB RAM depending on load)
- **Scaling Limitations**: In-memory storage limits horizontal scaling
- **Connection Overhead**: Each client maintains a WebSocket connection
- **Network Traffic**: Proportional to clipboard update frequency and content size

## Troubleshooting Common Issues

### Authentication Loops
- **Symptom**: Continuous redirection to login page
- **Cause**: Inconsistent localStorage key names
- **Solution**: Ensure all authentication code uses 'clipshare_session' consistently

### JavaScript Errors on Startup
- **Symptom**: "X is not defined" errors in browser console
- **Cause**: Missing utility functions or incorrect initialization order
- **Solution**: Ensure all referenced functions are implemented before they're called

### File Handling Issues
- **Symptom**: File dropping doesn't work, file type icons missing
- **Cause**: Missing utility functions for file operations
- **Solution**: Implement getFileExtension() and getMimeTypeFromExtension() functions
