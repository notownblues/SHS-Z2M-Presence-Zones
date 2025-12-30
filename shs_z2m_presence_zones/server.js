/**
 * SHS Z2M Presence Zone Configurator - Backend Server
 *
 * This server:
 * 1. Serves static files (the built web app)
 * 2. Connects to MQTT broker and logs all events to stdout (addon logs)
 * 3. Proxies MQTT messages to/from the frontend via WebSocket
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import mqtt from 'mqtt';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const PORT = process.env.PORT || 8099;
const CONFIG_PATH = process.env.CONFIG_PATH || '/data/options.json';

// Load addon config
let config = {
    mqtt_host: 'homeassistant.local',
    mqtt_ws_port: 1884,
    mqtt_username: '',
    mqtt_password: ''
};

function loadConfig() {
    try {
        if (existsSync(CONFIG_PATH)) {
            const raw = readFileSync(CONFIG_PATH, 'utf8');
            config = JSON.parse(raw);
            console.log(`[CONFIG] Loaded from ${CONFIG_PATH}`);
            console.log(`[CONFIG] MQTT Host: ${config.mqtt_host}`);
            console.log(`[CONFIG] MQTT WS Port: ${config.mqtt_ws_port}`);
            console.log(`[CONFIG] MQTT Username: ${config.mqtt_username ? '(set)' : '(not set)'}`);
        } else {
            console.log(`[CONFIG] ${CONFIG_PATH} not found, using defaults`);
        }
    } catch (error) {
        console.error(`[CONFIG] Error loading config:`, error.message);
    }
}

loadConfig();

// Express app
const app = express();
const server = createServer(app);

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});

// Serve static files
const staticPath = path.join(__dirname, 'www');
console.log(`[SERVER] Serving static files from: ${staticPath}`);
app.use(express.static(staticPath));

// Serve config endpoint for frontend
app.get('/config.json', (req, res) => {
    res.json({
        mqtt: {
            host: config.mqtt_host,
            wsPort: config.mqtt_ws_port,
            username: config.mqtt_username,
            password: config.mqtt_password
        }
    });
});

// WebSocket server for frontend connections
const wss = new WebSocketServer({ server, path: '/ws' });

// Log WebSocket upgrade attempts
server.on('upgrade', (request, socket, head) => {
    console.log(`[WS] Upgrade request for: ${request.url}`);
});

// Track MQTT client and subscriptions
let mqttClient = null;
let currentTopic = null;
const frontendClients = new Set();

// Connect to MQTT broker
function connectMQTT(topic) {
    if (!topic) {
        console.log('[MQTT] No topic specified, skipping connection');
        return;
    }

    // Disconnect existing client if topic changed
    if (mqttClient && currentTopic !== topic) {
        console.log(`[MQTT] Topic changed from "${currentTopic}" to "${topic}", reconnecting...`);
        mqttClient.end(true);
        mqttClient = null;
    }

    if (mqttClient) {
        console.log('[MQTT] Already connected');
        return;
    }

    currentTopic = topic;
    const brokerUrl = `ws://${config.mqtt_host}:${config.mqtt_ws_port}`;

    console.log(`[MQTT] Connecting to ${brokerUrl}...`);

    const options = {
        clientId: `shs-z2m-server-${Math.random().toString(16).slice(2, 8)}`,
        clean: true,
        reconnectPeriod: 5000
    };

    if (config.mqtt_username) {
        options.username = config.mqtt_username;
        options.password = config.mqtt_password;
        console.log(`[MQTT] Using authentication as "${config.mqtt_username}"`);
    }

    mqttClient = mqtt.connect(brokerUrl, options);

    mqttClient.on('connect', () => {
        console.log(`[MQTT] Connected to broker`);

        // Subscribe to the sensor topic
        mqttClient.subscribe(topic, (err) => {
            if (err) {
                console.error(`[MQTT] Subscribe error:`, err.message);
            } else {
                console.log(`[MQTT] Subscribed to: ${topic}`);
            }
        });

        // Notify frontend clients
        broadcastToFrontend({ type: 'mqtt_status', connected: true });
    });

    mqttClient.on('message', (msgTopic, payload) => {
        try {
            const data = JSON.parse(payload.toString());
            console.log(`[MQTT] Message on ${msgTopic}:`, JSON.stringify(data).substring(0, 200));

            // Forward to frontend clients
            broadcastToFrontend({ type: 'mqtt_message', topic: msgTopic, data });
        } catch (error) {
            console.error(`[MQTT] Parse error:`, error.message);
        }
    });

    mqttClient.on('error', (error) => {
        console.error(`[MQTT] Error:`, error.message);
        broadcastToFrontend({ type: 'mqtt_status', connected: false, error: error.message });
    });

    mqttClient.on('close', () => {
        console.log(`[MQTT] Disconnected`);
        broadcastToFrontend({ type: 'mqtt_status', connected: false });
    });

    mqttClient.on('reconnect', () => {
        console.log(`[MQTT] Reconnecting...`);
        broadcastToFrontend({ type: 'mqtt_status', connected: false, reconnecting: true });
    });

    mqttClient.on('offline', () => {
        console.log(`[MQTT] Offline`);
    });
}

// Broadcast message to all frontend WebSocket clients
function broadcastToFrontend(message) {
    const payload = JSON.stringify(message);
    frontendClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// Publish message to MQTT
function publishToMQTT(topic, payload) {
    if (!mqttClient || !mqttClient.connected) {
        console.error('[MQTT] Cannot publish - not connected');
        return false;
    }

    console.log(`[MQTT] Publishing to ${topic}:`, JSON.stringify(payload).substring(0, 200));
    mqttClient.publish(topic, JSON.stringify(payload), { retain: false }, (err) => {
        if (err) {
            console.error(`[MQTT] Publish error:`, err.message);
        }
    });
    return true;
}

// Handle WebSocket connections from frontend
wss.on('connection', (ws) => {
    console.log('[WS] Frontend client connected');
    frontendClients.add(ws);

    // Send current MQTT status
    ws.send(JSON.stringify({
        type: 'mqtt_status',
        connected: mqttClient?.connected || false
    }));

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log(`[WS] Received:`, message.type);

            switch (message.type) {
                case 'subscribe':
                    // Client wants to subscribe to a topic
                    console.log(`[WS] Subscribe request for topic: ${message.topic}`);
                    connectMQTT(message.topic);
                    break;

                case 'publish':
                    // Client wants to publish a message
                    publishToMQTT(message.topic, message.payload);
                    break;

                case 'unsubscribe':
                    // Client wants to unsubscribe
                    if (mqttClient && message.topic) {
                        mqttClient.unsubscribe(message.topic, (err) => {
                            if (err) {
                                console.error(`[MQTT] Unsubscribe error:`, err.message);
                            } else {
                                console.log(`[MQTT] Unsubscribed from: ${message.topic}`);
                            }
                        });
                    }
                    break;

                case 'get_config':
                    // Send config to client
                    ws.send(JSON.stringify({
                        type: 'config',
                        mqtt: {
                            host: config.mqtt_host,
                            wsPort: config.mqtt_ws_port,
                            username: config.mqtt_username,
                            password: config.mqtt_password
                        }
                    }));
                    break;
            }
        } catch (error) {
            console.error('[WS] Message parse error:', error.message);
        }
    });

    ws.on('close', () => {
        console.log('[WS] Frontend client disconnected');
        frontendClients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('[WS] Error:', error.message);
        frontendClients.delete(ws);
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] SHS Z2M Presence Zone Configurator v2.5.1`);
    console.log(`[SERVER] Listening on port ${PORT}`);
    console.log(`[SERVER] MQTT broker: ws://${config.mqtt_host}:${config.mqtt_ws_port}`);
});
