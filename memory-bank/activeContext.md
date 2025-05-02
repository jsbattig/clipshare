# Active Context: ClipShare

## Current Focus
The current focus is on implementing the core clipboard synchronization functionality with a simple, intuitive user interface. We're prioritizing:

1. Real-time bidirectional clipboard synchronization between devices
2. Simple session-based authentication
3. Clean, responsive user interface
4. Docker containerization for easy deployment

## Recent Changes

**Complete Worker-Based File Processing (May 2, 2025):**
- Moved both file reading and encryption to Web Worker to completely eliminate socket disconnections:
  - **Root Cause Analysis**: The file reading process itself was causing blocking, even before encryption started
  - **Implementation**: 
    1. Enhanced `file-processor.worker.js` to handle direct File objects for complete processing
    2. Created new `processRawFileWithWorker` function to skip reading files on the main thread
    3. Updated main file processing flow to pass files directly to the worker
    4. Added fallback mechanism for browsers that don't support transferring File objects
    5. Lowered the worker threshold to 50KB to ensure medium files use the worker too
  - **User Experience Improvements**:
    - Completely eliminated socket disconnections for files of any size
    - Better progress reporting, including dedicated "Reading file in background thread" stage
    - Even more responsive UI as all heavy operations happen off the main thread
  - **Technical Details**:
    - Worker now performs both FileReader operations and encryption in background
    - Added graceful degradation paths for all operations
    - Implemented structured error handling throughout the process
    - Maintained backward compatibility with previous methods
  - **Key Insight**: By moving the entire file operation chain (reading and encryption) to a separate thread, we keep the main thread completely free for UI and socket operations

**Web Worker Implementation for Large File Processing (May 2, 2025):**
- Implemented advanced background processing for large files to prevent any socket disconnections:
  - **Root Cause Analysis**: Even with async encryption, the main thread could still be blocked for too long with very large files
  - **Implementation**: 
    1. Created dedicated `file-processor.worker.js` Web Worker for heavy encryption operations
    2. Modified file processing to use Web Workers for files larger than 500KB
    3. Used async encryption as fallback for smaller files and when Web Workers aren't available
    4. Implemented detailed progress reporting from the worker to the main thread
    5. Added graceful error handling and fallback mechanisms
  - **User Experience Improvements**:
    - Reliable processing of files of any size without disconnections
    - Detailed progress percentage and stage reporting during encryption
    - Completely responsive UI during large file encryption
  - **Technical Details**:
    - Web Worker runs in a separate thread, completely isolating heavy computation
    - Communication via structured message passing between worker and main thread
    - Automatic fallback to previous async method when needed
    - ZIP archive handling also converted to use Web Workers for large files
  - **Key Insight**: By moving encryption completely off the main thread, we ensure socket connections remain stable regardless of file size

**Asynchronous Encryption for File Sharing (May 2, 2025):**
- Fixed file-sharing socket disconnection issues by making encryption non-blocking:
  - **Root Cause Analysis**: Large file encryption was blocking the main thread, causing Socket.IO to disconnect
  - **Implementation**: 
    1. Added `encryptDataAsync` and `encryptClipboardContentAsync` functions to encryption.js
    2. Modified file processing to use async encryption for files larger than 50KB
    3. Delayed UI updates (hiding drop zone) until after encryption completes
    4. Added informative progress messages during file processing
  - **User Experience Improvements**:
    - No more disconnection notifications when sharing small/medium files
    - Visual feedback during encryption of larger files
    - Files remain properly shared to all connected clients
  - **Technical Benefits**:
    - Main thread is no longer blocked during encryption
    - Socket connections remain stable throughout file processing
    - Better handling of ZIP archives and larger files
  - **Key Insight**: Socket.IO has built-in monitoring that disconnects sockets when the main thread is blocked for too long

**Fixed File Sharing & Socket Disconnection Issues (May 2, 2025):**
- Fixed critical issues with file sharing and socket disconnections:
  - Previously: When files were dropped onto the sender, disconnections occurred and files weren't shared
  - Root Cause: Decryption attempts on content that wasn't actually encrypted caused errors
  - Multiple components were improved:
    1. **Encryption Module**: Added robust validation to prevent decryption attempts on non-encrypted content
    2. **Content Handlers**: Added sender-side detection to skip unnecessary decryption 
    3. **Socket Events**: Completely rewrote file sending logic with comprehensive error handling
  - Added extensive debugging and logging throughout the file transmission flow
  - Implemented proper try/catch blocks to prevent socket disconnections
  - Made encryption operations more robust to prevent failures
- Result: Files now properly transmit from sender to receiver without disconnections

**Unified Download Architecture (May 2, 2025):**
- Completely refactored file download functionality to use a single unified approach:
  - Removed duplicate download methods across modules
  - Centralized all download functionality in ContentHandlers.downloadFile()
  - Created a prioritized system to select the best available file data:
    1. First tries globally stored original file data (sender side)
    2. Then checks for attached original data on the shared file
    3. Next looks for direct data URLs in the current shared file
    4. Finally attempts decryption as a last resort
  - Made all file paths use the robust Blob-based download method
  - Updated all event handlers to use the unified download function
  - Improved error reporting and validation throughout the process
  - Added detailed logging to trace the download process
- Key insight: Having a single download code path simplifies maintenance and ensures consistent behavior

**Blob-Based Download Fix (May 2, 2025):**
- Fixed persistent download issues showing "Network issue" error in browser:
  - Identified root cause: Direct use of data URLs in href attributes doesn't work well for large files
  - Implemented a robust Blob-based download approach:
    - Added downloadAsBlob helper function to convert data URLs to Blobs
    - Created Object URLs from Blobs for more reliable downloads
    - Implemented proper cleanup with URL.revokeObjectURL
    - Added extensive validation and error handling
    - Fixed in both content-handlers.js and file-operations.js to ensure all download paths use this approach
  - Added more detailed error reporting and debugging
  - Fixed success messages to always show the correct original filename
- Key insight: Using URL.createObjectURL with Blobs is more reliable than direct data URLs for downloads

**Simplified File Download Fix (May 2, 2025):**
- Fixed continuing issue with file downloads on the sender side:
  - Previously: Downloads were showing success message but failing with "Network issue" errors
  - Issue: Complex object references and data transformations were causing reference loss
- Implemented a simplified direct approach:
  - Store original file data globally in window.originalFileData immediately upon file drop
  - Modified download function to use this global data first when available (sender-side)
  - Eliminated complex reference chains that were prone to failure
  - Made download robust against any reference loss in the application flow
- Key insight: Sender already has original unencrypted data - no need for complex sharing between modules
- This approach ensures the sender-side always has a direct path to download original content

**Fixed Sender-Side File Download Issue (May 2, 2025):**
- Fixed persistent issue where file downloads still failed on the sender side despite earlier fixes
- Identified root cause: Original file data was not being properly persisted between module boundaries
- Implemented robust solution:
  - Added extensive debugging to trace data flow through the application
  - Exported ContentHandlers to window object to enable direct access from file-operations.js
  - Added file data verification on upload to ensure original content is properly stored
  - Enhanced download function with multiple fallback decryption attempts as a safety net
  - Added detailed logging to verify the original file data is preserved
- Added proper reference checking to ensure _originalData stays intact throughout the application
- The file download "Network issue" error is now resolved on both sender and receiver sides

**Major File Handling Encryption Fix (May 2, 2025):**
- Fixed critical issues with encrypted file handling on both sender and receiver sides:
  - Files were displaying encrypted filenames on sender side
  - Download attempts showed "file downloaded successfully" but actually failed
  - Browser showed "Network issue" errors when attempting to download files
  - Success messages incorrectly displayed encrypted filenames
- Implemented a comprehensive storage-based approach:
  - **Sender side:** Store complete unencrypted original file (`_originalData`) before encryption
  - **Receiver side:** Fully decrypt all file data immediately upon receipt and store decrypted version
  - **Download handling:** Use original unencrypted file directly without trying to decrypt at download time
- Fixed root cause: Previously attempting to decrypt content at usage time rather than at receipt time
- Key insight: File data should be encrypted only for transmission, but stored decrypted in memory
- Added extensive logging and better error handling for encryption/decryption operations
- Maintained security with content still encrypted during transmission between clients

**Fixed Encrypted Filename Display and Download Issues (May 2, 2025):**
- Fixed multiple issues with file display and download functionality:
  - Fixed source-side issue showing encrypted filenames instead of original filenames
  - Fixed download mechanism that was failing with "network issues"
  - Improved transparency of encryption/decryption process with detailed logging
- Implemented a comprehensive solution:
  - Added `_displayFileName` to preserve original filename for source clients
  - Fixed decryption flow to handle entire encrypted strings instead of trying to parse encrypted data
  - Modified download process to properly decrypt content before creating download links
  - Enhanced the UI to dynamically use available filenames (original or decrypted)
  - Fixed notifications to always show human-readable filenames
- Root cause identified: content being encrypted as a whole string must be decrypted as a whole string
- Maintained security while improving user experience - encryption still happens for all content in transit

**Fixed File Download with Encryption (May 2, 2025):**
- Fixed critical issue where file downloads were failing due to encrypted content not being decrypted
- Enhanced download functionality to properly decrypt both the filename and file content before download
- Fixed UI display issues that were showing encrypted filenames instead of readable names
- Improved the encryption workflow to maintain seamless user experience:
  - Added proper decryption in the `downloadFile()` function to handle encrypted data URLs
  - Removed the "Encrypted file" placeholder in UI and properly used decrypted names
  - Added more robust error handling for decryption failures
  - Maintained complete security with all content still encrypted during transmission

**Fixed Encrypted Filename Display (May 2, 2025):**
- Fixed UI issue where encrypted filenames were displayed to users instead of readable names
- Added filename decryption in multiple components to ensure proper display:
  - Enhanced content-handlers.js with specific filename decryption functionality
  - Modified socket-events.js to decrypt filenames when showing file notifications
  - Updated UI-manager.js to detect and handle encrypted filenames gracefully
- Added multiple decryption fallbacks to ensure filenames always appear readable
- Improved logging to better diagnose encryption/decryption issues
- Applied fix for both source and target browsers in file sharing

**Fixed Encryption Issues (May 2, 2025):**
- Fixed issues with content encryption where encrypted content was displaying instead of decrypted content
- Removed dependency on `_encrypted` flag - now all content is always encrypted in transit
- Modified encryption module to always attempt decryption on incoming content
- Enhanced socket-events.js with improved logging and error handling for decryption
- Updated file-operations.js to strictly enforce encryption for all file transmissions
- Added better error messages when encryption fails
- Ensured all content types (text, images, files) properly use encryption/decryption

**Content Encryption Implementation (May 2, 2025):**
- Implemented end-to-end encryption for all clipboard content (text, images, files)
- Created new encryption.js module utilizing the already-included CryptoJS library
- Added transparent encryption/decryption using session passphrase as key
- Modified socket-events.js to encrypt all content before sending to server
- Updated file-operations.js to encrypt files and ZIP archives
- Updated content-handlers.js to import encryption functions
- Modified app.html to rename "Manual Synchronization" section to "Notes"
- Added encryption information note to inform users about privacy protections
- Server never has access to unencrypted content, enhancing privacy

Initial implementation of the application with:
- Basic session management and authentication system
- Real-time WebSocket communication for clipboard updates
- Client-side clipboard monitoring with polling
- Mobile-responsive UI with clear status indicators
- Docker and Docker Compose configuration
- GitHub integration with Actions workflow

**Client Name Display Fix (May 2, 2025):**
- Fixed issue where browser name was showing instead of user-provided client name in Connected Devices panel
- Modified UI manager to prioritize user-provided client name over browser information
- Added retrieval of client name from local storage as fallback for current client
- Enhanced server-side client info structure to make client name more accessible
- Added detailed logging to trace client name through the entire app
- Fixed data structure inconsistencies between server and client

**Server Join Session Error Fix (May 2, 2025):**
- Fixed TypeError in server code where sessionManager.joinSession function was missing
- Replaced nonexistent joinSession function with proper session existence check
- Enhanced session joining logic to properly handle banned sessions
- Fixed issue that was preventing login and client list display
- Added proper error handling to ensure smooth login experience

**Connected Devices Display Fix (May 2, 2025):**
- Fixed issue where client name wasn't appearing in Connected Devices panel after login redirect
- Added client name persistence through page redirect from login to main app
- Modified app page socket initialization to include client name from stored session data
- Added client name to client-identity event sent after connecting
- Implemented immediate client list update mechanism to avoid waiting for ping cycle
- Enhanced debugging to trace client name flow throughout the entire authentication process

**Client Name Flow Fix (May 2, 2025):**
- Fixed critical socket connection issue where client name wasn't properly passed to server
- Enhanced socket connection creation to force new connection with updated client name
- Modified login flow to ensure client name is passed correctly at initial socket creation
- Added extensive debug logging to trace client name throughout the connection process
- Fixed timing issues in socket parameter passing

**Client Identification Display Fix (May 2, 2025):**
- Fixed client name display in Connected Devices panel
- Added proper client name flow from login form to server to UI display
- Ensured client name is included in socket connection parameters
- Fixed issues with client name storage on socket object
- Added debug logging for client name tracking
- Enhanced socket-server handshake to preserve client name
- Improved UI rendering to prioritize client name display
- Complete removal of IP addresses from client-facing information

**Client Identification Simplification (May 2, 2025):**
- Simplified client identification by removing IP detection and display
- Modified Connected Devices panel to show only client names
- Removed ipify.org API dependency for external IP detection
- Streamlined client tracking by focusing only on user-provided names
- Eliminated potential external service dependencies
- Reduced potential privacy concerns by not tracking or displaying IP addresses

**Client Identification Improvement (May 2, 2025):**
- Added mandatory "Client Name" field to login form for better device identification
- Enhanced the Connected Devices panel to show user-provided names instead of "Unknown on Unknown"
- Improved client tracking by storing client name with session data
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

7. ~~**Content Encryption Implementation**~~ ✅ COMPLETED
   - ~~Create encryption module using CryptoJS~~
   - ~~Implement client-side encryption/decryption for all content types~~
   - ~~Ensure transparent operation with no change to user experience~~
   - ~~Update UI to rename "Manual Synchronization" to "Notes" section~~
   - ~~Add information about encryption to the Notes section~~

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
