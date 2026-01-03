# SHS Z2M Presence Zone Configurator - Standalone Docker Image
# For users not running Home Assistant OS/Supervised

FROM node:20-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Build frontend
WORKDIR /build
COPY shs_z2m_presence_zones/package*.json ./
COPY shs_z2m_presence_zones/vite.config.js ./
COPY shs_z2m_presence_zones/index.html ./
COPY shs_z2m_presence_zones/src/ ./src/
RUN npm ci && npm run build

# Set up server
WORKDIR /app

# Copy built frontend
RUN mkdir -p /app/www && cp -r /build/dist/* /app/www/

# Copy server files and install production dependencies
COPY shs_z2m_presence_zones/server.js ./
COPY shs_z2m_presence_zones/package.json ./
RUN npm install --only=production express ws mqtt

# Create data directory for persistent storage
RUN mkdir -p /data

# Cleanup build artifacts
RUN rm -rf /build

# Expose the web UI port
EXPOSE 8099

# Environment variables (override these in docker-compose or docker run)
ENV PORT=8099
ENV MQTT_HOST=localhost
ENV MQTT_WS_PORT=1884
ENV MQTT_USERNAME=
ENV MQTT_PASSWORD=
ENV ROOM_CONFIGS_PATH=/data/room_configs.json

# Start the server
CMD ["node", "server.js"]
