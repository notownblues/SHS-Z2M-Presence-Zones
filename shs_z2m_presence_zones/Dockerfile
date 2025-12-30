ARG BUILD_FROM
FROM $BUILD_FROM

# Install nodejs
RUN apk add --no-cache nodejs npm

# Build frontend first
WORKDIR /build
COPY package*.json ./
COPY vite.config.js ./
COPY index.html ./
COPY src/ ./src/
RUN npm ci && npm run build

# Set up server
WORKDIR /app

# Copy built frontend
RUN mkdir -p /app/www && cp -r /build/dist/* /app/www/

# Copy server files and install server dependencies
COPY server.js ./
COPY package.json ./
RUN npm install --only=production express ws mqtt

# Copy run script
COPY run.sh /run.sh
RUN chmod +x /run.sh

# Cleanup
RUN rm -rf /build

ENTRYPOINT []
CMD ["/run.sh"]
