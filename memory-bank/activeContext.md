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

**Client Identification Improvement (May 2, 2025):**
- Added mandatory "Client Name" field to login form for better device identification
- Implemented external IP detection using ipify.org API with appropriate fallbacks
- Enhanced the Connected Devices panel to show user-provided names instead of "Unknown on Unknown"
- Improved client tracking by storing the client name and IP with session data
- Eliminated reliance on proxy IPs which were providing irrelevant information
- Enhanced browser info tracking to include client identification details

**Promise Chain Bug Fix (May 2, 2025):**
- Fixed authentication promise chain error that was causing uncaught exceptions
- Identified that `UIManager.updateConnectionStatus()` was being called but didn't exist
- Added proper Session module import and replaced calls with `Session.setConnectionStatus()`
- Learned importance of properly completing Promise chains in authentication flows
- Enhanced debugging and error handling for Promise-based operations

**Recent Troubleshooting (May 1, 2025):**
- Identified and diagnosed issues with localStorage key inconsistencies
- Discovered that the application was using both 'clipboard-session' and 'clipshare_session' keys
- Attempted to fix by standardizing on 'clipshare_session' across the codebase
- Found additional issues with missing utility functions for file handling
- Ultimately rolled back to commit db428d57 after fixes unintentionally broke functionality
- Learned the importance of incremental, focused changes with thorough testing

**Recent Improvements (May 1, 2025):**
- Refactored the monolithic clipboard.js into a modular architecture with clear separation of concerns
- Fixed clipboard ping-pong issue with images where multiple browser tabs were causing update loops
- Implemented robust image comparison with multi-point sampling hashing
- Added image normalization to prevent metadata differences from triggering unnecessary updates
- Enhanced the grace period system with content-type specific durations (longer for images)
- Added detailed logging for tracking clipboard content changes

**Authentication & Security Enhancement (May 1, 2025):**
- Refactored authentication system to use client-side encryption (AES)
- Implemented a secure authentication flow where passphrases never leave the client
- Created quorum-based authorization where existing authorized clients verify new ones
- Added session banning mechanism for potential security breaches (10-minute timeout)
- Enhanced UI with real-time authentication status feedback
- Added password visibility toggle and form validation
- Restructured server-side session management to focus on verification rather than credential storage

**Cross-OS Fixes (May 1, 2025):**
- Simplified clipboard synchronization from automatic to manual
- Removed automatic clipboard monitoring completely
- Changed to manual paste/copy model for cross-OS compatibility
- Eliminated clipboard monitoring toggle and related code
- Added clear manual synchronization instructions to UI
- Added auto-disappearing error messages (5-second timeout)
- Renamed ClipboardMonitor to ClipboardUtils to reflect new purpose

## Next Steps
Immediate next steps for the project:

1. ~~**Fix Authentication Key Inconsistency**~~ ✓ COMPLETED
   - ~~Carefully implement standardized 'clipshare_session' localStorage key usage~~
   - ~~Test thoroughly across all authentication flows~~
   - ~~Ensure no regression of functionality~~

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
   - ~~Prioritize image support as next content type~~ ✓ COMPLETED
   - Enhance image handling with additional optimizations
   - Add support for more specialized content types (styled text, additional file formats)

6. **UI Enhancements**
   - Add clipboard history feature (limited entries)
   - Improve mobile experience

7. ~~**Security Enhancements**~~ ✓ COMPLETED
   - ~~Add optional end-to-end encryption~~
   - ~~Implement secure WebSocket connections~~

## Active Decisions & Considerations

### Manual vs. Automatic Clipboard Operations
We've switched from automatic monitoring to manual copy/paste because:
- Eliminates complex cross-OS synchronization issues
- Provides a more predictable user experience
- Removes the need for complex content comparison algorithms
- Ensures clear user intent for all clipboard operations

### In-Memory Storage
Current decision to use in-memory storage:
- Simplifies implementation
- Matches requirement for no database
- Privacy benefit of not persisting clipboard data
- Trade-off: No persistence across server restarts

### Authentication Approach
Enhanced encryption-based authentication approach:
- Client-side encryption using AES for verifying session membership
- Quorum-based authorization for added security (existing clients verify new ones)
- Low barrier to entry - still simple to use
- No sensitive data stored on server (passphrase never leaves client)
- No need for user accounts or database
- Session banning for suspicious activities with 10-minute timeout

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

### Authentication and Security
Lessons from security enhancements:
- Client-side encryption provides better security without server complexity
- Quorum-based verification offers robust protection against unauthorized access
- Temporary session banning helps mitigate brute-force attacks
- Clear visual feedback during authentication improves user experience
