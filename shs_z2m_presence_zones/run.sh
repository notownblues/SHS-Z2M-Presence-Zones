#!/bin/sh

echo "[STARTUP] SHS Z2M Presence Zone Configurator"
echo "[STARTUP] Starting server..."

# Set environment variables for the Node.js server
export CONFIG_PATH=/data/options.json
export PORT=8099

# Start the Node.js server
cd /app
exec node server.js
