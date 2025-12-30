#!/bin/sh

CONFIG_PATH=/data/options.json

# Read config values
MQTT_HOST=$(jq -r '.mqtt_host' $CONFIG_PATH)
MQTT_WS_PORT=$(jq -r '.mqtt_ws_port' $CONFIG_PATH)
MQTT_USERNAME=$(jq -r '.mqtt_username' $CONFIG_PATH)
MQTT_PASSWORD=$(jq -r '.mqtt_password' $CONFIG_PATH)
MQTT_BASE_TOPIC=$(jq -r '.mqtt_base_topic' $CONFIG_PATH)

echo "Configuring MQTT WebSocket: ${MQTT_HOST}:${MQTT_WS_PORT}"
echo "Base topic: ${MQTT_BASE_TOPIC}"

# Generate config.json for the web app
cat > /var/www/html/config.json << EOF
{
  "mqtt": {
    "host": "${MQTT_HOST}",
    "wsPort": ${MQTT_WS_PORT},
    "username": "${MQTT_USERNAME}",
    "password": "${MQTT_PASSWORD}",
    "baseTopic": "${MQTT_BASE_TOPIC}"
  }
}
EOF

echo "Starting nginx..."
exec nginx -g "daemon off;"
