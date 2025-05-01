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

## Deployment with HAProxy

For improved security and clipboard API support, ClipShare can be deployed behind HAProxy with TLS termination.

### Benefits of Using HAProxy

- **HTTPS Support**: Enables secure connections which improve clipboard API permissions in browsers
- **WebSocket Proxying**: Properly handles WebSocket connections for real-time updates
- **Load Balancing**: Can distribute traffic across multiple ClipShare instances if needed
- **TLS Termination**: Handles encryption/decryption, reducing load on application servers

### HAProxy Configuration

Here's a sample HAProxy configuration for ClipShare:

```
global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin expose-fd listeners
    stats timeout 30s
    user haproxy
    group haproxy
    daemon

defaults
    log global
    mode http
    option httplog
    option dontlognull
    timeout connect 5000
    timeout client 50000
    timeout server 50000

frontend https_front
    # SSL settings
    bind *:443 ssl crt /path/to/your/cert.pem
    
    # Define ACLs for WebSocket detection
    acl is_websocket hdr(Upgrade) -i WebSocket
    
    # Set headers for WebSocket/HTTPS
    http-request set-header X-Forwarded-Proto https
    
    # Use appropriate backend based on connection type
    use_backend clipshare_ws if is_websocket
    default_backend clipshare_http

# HTTP backend - for regular HTTP traffic
backend clipshare_http
    balance roundrobin
    option httpclose
    option forwardfor
    server clipshare1 127.0.0.1:3000 check

# WebSocket backend - for WebSocket connections
backend clipshare_ws
    balance roundrobin
    option httpclose
    option forwardfor
    server clipshare1 127.0.0.1:3000 check
```

### Setting Up HAProxy

1. **Install HAProxy**:
   ```
   sudo apt-get update
   sudo apt-get install haproxy
   ```

2. **Configure HAProxy**:
   - Save the configuration above to `/etc/haproxy/haproxy.cfg`
   - Replace `/path/to/your/cert.pem` with your actual SSL certificate path
   - Adjust the backend server address (127.0.0.1:3000) to match your ClipShare server

3. **Obtain SSL Certificate**:
   - You can use Let's Encrypt for free certificates:
     ```
     sudo apt-get install certbot
     sudo certbot certonly --standalone -d your-domain.com
     ```
   - Combine the cert and key for HAProxy:
     ```
     cat /etc/letsencrypt/live/your-domain.com/fullchain.pem /etc/letsencrypt/live/your-domain.com/privkey.pem > /path/to/your/cert.pem
     ```

4. **Start HAProxy**:
   ```
   sudo systemctl restart haproxy
   ```

5. **Access ClipShare via HTTPS**:
   ```
   https://your-domain.com
   ```

### Troubleshooting

- **WebSocket Connection Issues**: Ensure your HAProxy configuration properly forwards the WebSocket upgrade headers
- **Certificate Problems**: Verify your certificate is properly formatted and accessible to HAProxy
- **Connection Timeouts**: Adjust the timeout settings in HAProxy configuration if needed

## Docker Images

Pre-built Docker images are available on GitHub Packages:

```
docker pull ghcr.io/jsbattig/clipshare:latest
```

## License

MIT License
