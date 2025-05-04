# Multi-stage build for ClipShare application

# Stage 1: Build and install dependencies
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies
RUN npm run install-all

# Copy app source
COPY . .

# Stage 2: Create production image
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules

# Copy server files
COPY server/package*.json ./server/
COPY --from=build /app/server/node_modules ./server/node_modules
COPY server ./server

# Copy client files
COPY client ./client

# Expose port
EXPOSE 3000

# Set node environment
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
