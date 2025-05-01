# Active Context: ClipShare

## Current Focus
The current focus is on implementing the core clipboard synchronization functionality with a simple, intuitive user interface. We're prioritizing:

1. Real-time bidirectional clipboard synchronization between devices
2. Simple session-based authentication
3. Clean, responsive user interface
4. Docker containerization for easy deployment

## Recent Changes
Initial implementation of the application with:
- Basic session management and authentication system
- Real-time WebSocket communication for clipboard updates
- Client-side clipboard monitoring with polling
- Mobile-responsive UI with clear status indicators
- Docker and Docker Compose configuration
- GitHub integration with Actions workflow

**Recent Troubleshooting (May 1, 2025):**
- Identified and diagnosed issues with localStorage key inconsistencies
- Discovered that the application was using both 'clipboard-session' and 'clipshare_session' keys
- Attempted to fix by standardizing on 'clipshare_session' across the codebase
- Found additional issues with missing utility functions for file handling
- Ultimately rolled back to commit db428d57 after fixes unintentionally broke functionality
- Learned the importance of incremental, focused changes with thorough testing

## Next Steps
Immediate next steps for the project:

1. **Fix Authentication Key Inconsistency**
   - Carefully implement standardized 'clipshare_session' localStorage key usage
   - Test thoroughly across all authentication flows
   - Ensure no regression of functionality

2. **Utility Function Implementation**
   - Add missing file utility functions: getFileExtension() and getMimeTypeFromExtension()
   - Test file handling functionality
   - Document these utility functions properly

3. **Enhanced Browser Support**
   - Implement additional fallback methods for clipboard access
   - Test in more browser environments

4. **Improved Error Handling**
   - Add more robust error handling for network disruptions
   - Enhance permission request workflow for clipboard access

5. **Additional Content Type Support**
   - Research and implement support for additional clipboard content types
   - Prioritize image support as next content type

6. **UI Enhancements**
   - Add clipboard history feature (limited entries)
   - Improve mobile experience

7. **Security Enhancements**
   - Add optional end-to-end encryption
   - Implement secure WebSocket connections

## Active Decisions & Considerations

### Polling vs. Event-Based Monitoring
We've chosen polling for clipboard monitoring because:
- No standardized clipboard change event API exists across browsers
- Polling provides more consistent behavior across platforms
- 1-second interval balances responsiveness with performance

### In-Memory Storage
Current decision to use in-memory storage:
- Simplifies implementation
- Matches requirement for no database
- Privacy benefit of not persisting clipboard data
- Trade-off: No persistence across server restarts

### Authentication Approach
Simple passphrase-based approach chosen because:
- Low barrier to entry for users
- Matches requirement for simplicity
- No need for user accounts or database
- Trade-off: Limited security for sensitive data

### Code Stability and Rollbacks
- Commit db428d57 has been established as the last known stable version
- Future fixes will be implemented in smaller, more focused increments
- Testing will be performed more thoroughly before pushing changes

## Important Patterns & Preferences

### Code Organization
- Modular approach with clear separation of concerns
- Server-side: Express for HTTP, Socket.IO for real-time
- Client-side: Vanilla JS with modular functions

### Coding Style
- Modern JavaScript (ES6+) features
- Descriptive function and variable names
- Comprehensive comments and documentation
- Defensive coding for browser compatibility

### UI Design
- Clean, minimalist interface
- Clear status indicators
- Mobile-responsive design
- Intuitive controls with helpful tooltips

## Learnings & Project Insights

### Clipboard API Complexity
Working with the Clipboard API has revealed several challenges:
- Security restrictions vary by browser
- Permissions model is inconsistent
- User-initiated actions often required for access
- Need for fallback approaches in various scenarios

### Real-Time Sync Considerations
Important insights about real-time synchronization:
- Need to carefully manage event loops to prevent recursion
- Importance of efficient diffing to avoid unnecessary updates
- Connection status handling critical for user experience
- Reconnection strategies essential for robust experience

### WebSocket Best Practices
Learnings about WebSocket implementation:
- Room-based approach works well for session isolation
- Important to validate authentication on reconnection
- Client connection tracking helps with UI status updates
- Need to consider scalability for future enhancements

### Code Stability and Change Management
Key lessons from recent troubleshooting:
- Seemingly minor changes (like localStorage key names) can have cascading effects
- Missing utility functions can break functionality in non-obvious ways
- When implementing fixes, focus on one issue at a time with comprehensive testing
- Having a reliable rollback point is crucial for maintaining application stability
- Git force-push can be a necessary tool when reverting to a stable state
