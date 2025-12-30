ARG BUILD_FROM
FROM $BUILD_FROM

# Install nginx and nodejs for building
RUN apk add --no-cache nginx nodejs npm jq

# Create directories
RUN mkdir -p /run/nginx /var/www/html

# Copy and build the web app
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN cp -r dist/* /var/www/html/

# Copy nginx configuration
COPY nginx.conf /etc/nginx/http.d/default.conf

# Copy run script
COPY run.sh /run.sh
RUN chmod +x /run.sh

# Cleanup
RUN rm -rf /build

WORKDIR /

ENTRYPOINT []
CMD ["/run.sh"]
