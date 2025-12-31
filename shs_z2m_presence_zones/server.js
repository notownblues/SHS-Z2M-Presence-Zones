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
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Room configurations storage path
// Use /share/ for persistence across addon reinstalls (mapped via config.yaml)
// Falls back to /data/ if /share/ is not available
const SHARE_PATH = '/share/shs_z2m_presence_zones/room_configs.json';
const DATA_PATH = '/data/room_configs.json';
const ROOM_CONFIGS_PATH = process.env.ROOM_CONFIGS_PATH ||
    (existsSync('/share') ? SHARE_PATH : DATA_PATH);
const ROOM_CONFIGS_DIR = path.dirname(ROOM_CONFIGS_PATH);

// Ensure the data directory exists
function ensureDataDirectory() {
    try {
        if (!existsSync(ROOM_CONFIGS_DIR)) {
            mkdirSync(ROOM_CONFIGS_DIR, { recursive: true });
            console.log(`[STORAGE] Created data directory: ${ROOM_CONFIGS_DIR}`);
        }
    } catch (error) {
        console.error(`[STORAGE] Error creating data directory:`, error.message);
    }
}

// Create data directory on startup
ensureDataDirectory();

// Migrate data from /data/ to /share/ if needed
function migrateDataToShare() {
    // Only migrate if we're using /share/ and old data exists in /data/
    if (ROOM_CONFIGS_PATH === SHARE_PATH && existsSync(DATA_PATH) && !existsSync(SHARE_PATH)) {
        try {
            console.log(`[STORAGE] Migrating data from ${DATA_PATH} to ${SHARE_PATH}`);
            const oldData = readFileSync(DATA_PATH, 'utf8');
            ensureDataDirectory();
            writeFileSync(SHARE_PATH, oldData, 'utf8');
            console.log(`[STORAGE] Migration successful!`);
        } catch (error) {
            console.error(`[STORAGE] Migration failed:`, error.message);
        }
    }
}

migrateDataToShare();

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

// ============================================================================
// Room Configuration Storage Functions
// ============================================================================

/**
 * Load all room configurations from persistent storage
 */
function loadRoomConfigs() {
    try {
        if (existsSync(ROOM_CONFIGS_PATH)) {
            const raw = readFileSync(ROOM_CONFIGS_PATH, 'utf8');
            const configs = JSON.parse(raw);
            console.log(`[STORAGE] Loaded ${Object.keys(configs).length} room configurations`);
            return configs;
        }
    } catch (error) {
        console.error(`[STORAGE] Error loading room configs:`, error.message);
    }
    return {};
}

/**
 * Save all room configurations to persistent storage
 */
function saveRoomConfigs(configs) {
    try {
        // Ensure directory exists before writing
        ensureDataDirectory();

        const data = JSON.stringify(configs, null, 2);
        writeFileSync(ROOM_CONFIGS_PATH, data, 'utf8');
        console.log(`[STORAGE] Saved ${Object.keys(configs).length} room configurations to ${ROOM_CONFIGS_PATH}`);

        // Verify the write was successful
        if (existsSync(ROOM_CONFIGS_PATH)) {
            const savedData = readFileSync(ROOM_CONFIGS_PATH, 'utf8');
            if (savedData === data) {
                console.log(`[STORAGE] Verified: Data written successfully`);
                return true;
            } else {
                console.error(`[STORAGE] Warning: Written data doesn't match!`);
            }
        }
        return true;
    } catch (error) {
        console.error(`[STORAGE] Error saving room configs:`, error.message);
        console.error(`[STORAGE] Path: ${ROOM_CONFIGS_PATH}`);
        console.error(`[STORAGE] Stack:`, error.stack);
        return false;
    }
}

// In-memory cache of room configurations
let roomConfigs = loadRoomConfigs();

// Express app
const app = express();
const server = createServer(app);

// JSON body parser for API endpoints
app.use(express.json());

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

// ============================================================================
// Room Configuration API Endpoints
// ============================================================================

/**
 * GET /api/rooms - List all saved room names
 */
app.get('/api/rooms', (req, res) => {
    const roomNames = Object.keys(roomConfigs);
    console.log(`[API] GET /api/rooms - Found ${roomNames.length} rooms`);
    res.json({ rooms: roomNames });
});

/**
 * GET /api/rooms/:name - Get configuration for a specific room
 */
app.get('/api/rooms/:name', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const config = roomConfigs[roomName];

    if (config) {
        console.log(`[API] GET /api/rooms/${roomName} - Found`);
        res.json({ room: roomName, config });
    } else {
        console.log(`[API] GET /api/rooms/${roomName} - Not found`);
        res.status(404).json({ error: 'Room not found' });
    }
});

/**
 * POST /api/rooms/:name - Save configuration for a specific room
 */
app.post('/api/rooms/:name', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const config = req.body;

    if (!config || typeof config !== 'object') {
        console.log(`[API] POST /api/rooms/${roomName} - Invalid config`);
        return res.status(400).json({ error: 'Invalid configuration' });
    }

    // Add timestamp
    config.lastModified = new Date().toISOString();

    // Save to in-memory cache
    roomConfigs[roomName] = config;

    // Persist to file
    if (saveRoomConfigs(roomConfigs)) {
        console.log(`[API] POST /api/rooms/${roomName} - Saved successfully`);
        res.json({ success: true, room: roomName });
    } else {
        console.error(`[API] POST /api/rooms/${roomName} - Failed to save`);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

/**
 * DELETE /api/rooms/:name - Delete configuration for a specific room
 */
app.delete('/api/rooms/:name', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);

    if (!roomConfigs[roomName]) {
        console.log(`[API] DELETE /api/rooms/${roomName} - Not found`);
        return res.status(404).json({ error: 'Room not found' });
    }

    // Delete from in-memory cache
    delete roomConfigs[roomName];

    // Persist to file
    if (saveRoomConfigs(roomConfigs)) {
        console.log(`[API] DELETE /api/rooms/${roomName} - Deleted successfully`);
        res.json({ success: true, room: roomName });
    } else {
        console.error(`[API] DELETE /api/rooms/${roomName} - Failed to delete`);
        res.status(500).json({ error: 'Failed to delete configuration' });
    }
});

/**
 * GET /api/rooms-all - Get all room configurations (for initial load/sync)
 */
app.get('/api/rooms-all', (req, res) => {
    console.log(`[API] GET /api/rooms-all - Returning ${Object.keys(roomConfigs).length} rooms`);
    res.json({ configs: roomConfigs });
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
    console.log(`[SERVER] SHS Z2M Presence Zone Configurator v2.6.7`);
    console.log(`[SERVER] Listening on port ${PORT}`);
    console.log(`[SERVER] MQTT broker: ws://${config.mqtt_host}:${config.mqtt_ws_port}`);
    console.log(`[STORAGE] Room configs path: ${ROOM_CONFIGS_PATH}`);
    console.log(`[STORAGE] Room configs exist: ${existsSync(ROOM_CONFIGS_PATH)}`);
    console.log(`[STORAGE] Loaded rooms: ${Object.keys(roomConfigs).join(', ') || '(none)'}`);
});
