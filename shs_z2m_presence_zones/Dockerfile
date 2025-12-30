ARG BUILD_FROM
FROM $BUILD_FROM

# Install nodejs
RUN apk add --no-cache nodejs npm

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Build frontend
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Move built files to www directory for serving
RUN mkdir -p /app/www && cp -r dist/* /app/www/

# Copy server files
WORKDIR /app
COPY server.js ./

# Copy run script
COPY run.sh /run.sh
RUN chmod +x /run.sh

# Cleanup build directory
RUN rm -rf /build

ENTRYPOINT []
CMD ["/run.sh"]
