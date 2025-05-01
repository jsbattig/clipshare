# ClipShare - Real-time Clipboard Synchronization

ClipShare is a web-based application that enables real-time clipboard synchronization across multiple devices. Users can share clipboard content including text, images, and files within a secure session.

## Features

- **Real-time Synchronization**: Clipboard changes are instantly synchronized across all connected devices
- **Multiple Content Types**: Supports text, images, and files (including multiple files as ZIP archives)
- **Secure Sessions**: Session-based authentication with passphrase protection
- **Clipboard Monitoring**: Automatic detection of clipboard changes while running
- **Cross-Platform**: Works on any device with a modern web browser
- **File Drag & Drop**: Easy sharing of files via drag and drop interface
- **Docker Deployment**: Containerized for easy deployment

## Architecture

ClipShare uses a client-server architecture:

- **Frontend**: Pure JavaScript, HTML, and CSS web application
- **Backend**: Node.js server with Express.js and Socket.IO
- **Communication**: Real-time WebSocket connection via Socket.IO
- **State Management**: In-memory session storage (no database required)
- **Deployment**: Docker containerization with GitHub Actions CI/CD pipeline

## Installation and Local Development

### Prerequisites

- Node.js (v14+)
- npm (v6+)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/clipshare.git
   cd clipshare
   ```

2. Install dependencies:
   ```bash
   npm run install-all
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Access the application at http://localhost:3000

## Docker Deployment

### Build and Run with Docker Compose

1. Build and start the container:
   ```bash
   docker-compose up -d
   ```

2. Access the application at http://localhost:3000

3. Stop the container:
   ```bash
   docker-compose down
   ```

### Manual Docker Build

1. Build the Docker image:
   ```bash
   docker build -t clipshare:latest .
   ```

2. Run the container:
   ```bash
   docker run -p 3000:3000 clipshare:latest
   ```

## GitHub CI/CD Integration

The project includes GitHub Actions workflow for automated building and publishing to GitHub Container Registry:

1. When code is pushed to the main/master branch, a new Docker image is built and published
2. The image is tagged with both `latest` and a short SHA of the commit
3. To use the published image:
   ```bash
   docker pull ghcr.io/yourusername/clipshare:latest
   docker run -p 3000:3000 ghcr.io/yourusername/clipshare:latest
   ```

## How to Use

1. Open the application in a web browser
2. Create or join a session with a unique ID and passphrase
3. Share the session ID and passphrase with other users you want to share your clipboard with
4. Any clipboard content (text, image, or file) will automatically synchronize between all devices in the session

## Browser Clipboard API Limitations

- Clipboard access requires HTTPS in production (except on localhost)
- Browser permissions may be required for clipboard access
- Some browsers have limited support for image/file clipboard operations
- For best results, use the latest version of Chrome, Firefox, or Edge

## License

MIT
