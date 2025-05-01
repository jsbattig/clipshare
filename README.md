# ClipShare - Synchronized Clipboard

ClipShare is a real-time clipboard synchronization application that allows you to share clipboard content across multiple devices. Simply create a session, join from other devices, and your clipboard contents will stay in sync.

## Features

- **Real-time Clipboard Synchronization**: Changes to the clipboard on any connected device are instantly propagated to all other devices.
- **Session-based Sharing**: Create or join sessions with a simple name and passphrase.
- **Secure**: Your clipboard data is only shared with devices in the same session.
- **Text Support**: Currently supports synchronizing text content.
- **Browser-based**: Works in any modern browser with clipboard API support.
- **Dockerized**: Easy deployment with Docker and Docker Compose.

## How it Works

ClipShare uses WebSockets to create a real-time connection between devices. When the clipboard changes on one device, the content is sent to the server and then broadcast to all other devices in the same session.

## Quick Start

### Using Docker Compose (Recommended)

1. Clone the repository:
   ```
   git clone https://github.com/jsbattig/clipshare.git
   cd clipshare
   ```

2. Start the application:
   ```
   docker compose up -d
   ```

3. Access the application in your browser:
   ```
   http://localhost:3000
   ```

### Manual Installation

1. Clone the repository:
   ```
   git clone https://github.com/jsbattig/clipshare.git
   cd clipshare
   ```

2. Install dependencies:
   ```
   npm run install-all
   ```

3. Start the server:
   ```
   npm start
   ```

4. Access the application in your browser:
   ```
   http://localhost:3000
   ```

## Development

If you want to make changes to the application, you can run it in development mode:

1. Install dependencies:
   ```
   npm run install-all
   ```

2. Start the server in development mode:
   ```
   npm run dev
   ```

3. Make changes to the files in the `server` or `client` directories
   - The server will automatically restart when you make changes
   - Refresh the browser to see client-side changes

## Usage

1. **Create a Session**:
   - Visit the application in your browser
   - Enter a session name and passphrase
   - Click "Join Session"

2. **Join from Another Device**:
   - Visit the application on another device
   - Enter the same session name and passphrase
   - Click "Join Session"

3. **Sync Clipboard**:
   - Copy text on one device
   - The content will automatically appear on all other devices
   - You can also manually paste content into the textarea to share it

4. **Monitoring Controls**:
   - Toggle the "Monitoring" switch to enable/disable automatic clipboard synchronization
   - Use the "Refresh" button to manually pull from your clipboard
   - Use the "Clear" button to clear the shared clipboard content
   - Use the "Copy" button to copy the current content to your clipboard

## Technical Details

### Architecture

- **Frontend**: HTML, CSS, vanilla JavaScript
- **Backend**: Node.js with Express
- **Real-time Communication**: Socket.IO
- **Authentication**: Simple passphrase-based session authentication
- **Data Storage**: In-memory (data persists only while the server is running)

### Security Considerations

- This application uses simple passphrase authentication without encryption
- Data is transmitted over WebSockets without additional encryption
- For production use with sensitive data, consider adding TLS/HTTPS

### Browser Compatibility

ClipShare requires a browser that supports the Clipboard API:
- Chrome 66+
- Firefox 63+
- Edge 79+
- Safari 13.1+

Some browsers may require permission to access the clipboard, which will be requested when you first use the application.

## Docker Images

Pre-built Docker images are available on GitHub Packages:

```
docker pull ghcr.io/jsbattig/clipshare:latest
```

## License

MIT License
