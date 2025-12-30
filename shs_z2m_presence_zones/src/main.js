import mqtt from 'mqtt';
import { RadarCanvas } from './radarCanvas.js';
import { ZoneManager } from './zoneManager.js';

// ============================================================================
// Application State
// ============================================================================

const state = {
    mqtt: {
        client: null,
        connected: false,
        broker: 'ws://localhost:9001',
        username: '',
        password: '',
        baseTopic: 'zigbee2mqtt/SHS01'
    },
    sensor: {
        targets: [],
        targetCount: 0,
        occupancy: false,
        positionReporting: false,
        zones: [
            { occupied: false },
            { occupied: false },
            { occupied: false }
        ],
        positions: {
            t1: { x: 0, y: 0, distance: 0 },
            t2: { x: 0, y: 0, distance: 0 },
            t3: { x: 0, y: 0, distance: 0 }
        }
    },
    zones: {
        type: 0,
        zones: [
            { enabled: false, x1: -1500, y1: 0, x2: 1500, y2: 3000 },
            { enabled: false, x1: -1500, y1: 0, x2: 1500, y2: 3000 },
            { enabled: false, x1: -1500, y1: 0, x2: 1500, y2: 3000 }
        ]
    },
    ui: {
        activeZone: 1
    }
};

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
    mqttStatus: document.getElementById('mqttStatus'),
    mqttStatusText: document.getElementById('mqttStatusText'),
    positionReportingBtn: document.getElementById('positionReportingBtn'),
    radarCanvas: document.getElementById('radarCanvas'),
    targetCount: document.getElementById('targetCount'),
    occupancy: document.getElementById('occupancy'),
    targetList: document.getElementById('targetList'),
    zoneType: document.getElementById('zoneType'),
    zoneTabs: document.querySelectorAll('.zone-tab'),
    zone1Editor: document.getElementById('zone1Editor'),
    zone2Editor: document.getElementById('zone2Editor'),
    zone3Editor: document.getElementById('zone3Editor'),
    zone1Enable: document.getElementById('zone1Enable'),
    zone1X1: document.getElementById('zone1X1'),
    zone1Y1: document.getElementById('zone1Y1'),
    zone1X2: document.getElementById('zone1X2'),
    zone1Y2: document.getElementById('zone1Y2'),
    zone1Status: document.getElementById('zone1Status'),
    zone2Enable: document.getElementById('zone2Enable'),
    zone2X1: document.getElementById('zone2X1'),
    zone2Y1: document.getElementById('zone2Y1'),
    zone2X2: document.getElementById('zone2X2'),
    zone2Y2: document.getElementById('zone2Y2'),
    zone2Status: document.getElementById('zone2Status'),
    zone3Enable: document.getElementById('zone3Enable'),
    zone3X1: document.getElementById('zone3X1'),
    zone3Y1: document.getElementById('zone3Y1'),
    zone3X2: document.getElementById('zone3X2'),
    zone3Y2: document.getElementById('zone3Y2'),
    zone3Status: document.getElementById('zone3Status'),
    applyZonesBtn: document.getElementById('applyZonesBtn'),
    resetZonesBtn: document.getElementById('resetZonesBtn')
};

// ============================================================================
// Radar Canvas & Zone Manager
// ============================================================================

const radarCanvas = new RadarCanvas(elements.radarCanvas);
const zoneManager = new ZoneManager(state.zones);

// ============================================================================
// Configuration Loading
// ============================================================================

async function loadConfig() {
    try {
        const response = await fetch('./config.json');
        if (response.ok) {
            const config = await response.json();
            console.log('Loaded config:', config);

            if (config.mqtt) {
                const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = config.mqtt.host || 'localhost';
                const wsPort = config.mqtt.wsPort || 1884;

                state.mqtt.broker = `${wsProtocol}//${host}:${wsPort}`;
                state.mqtt.username = config.mqtt.username || '';
                state.mqtt.password = config.mqtt.password || '';
                state.mqtt.baseTopic = config.mqtt.baseTopic || 'zigbee2mqtt/SHS01';
            }
            return true;
        }
    } catch (error) {
        console.error('Failed to load config:', error);
    }
    return false;
}

// ============================================================================
// MQTT Functions
// ============================================================================

function connectMQTT() {
    const options = {
        clientId: `ld2450-configurator-${Math.random().toString(16).slice(2, 8)}`,
        clean: true,
        reconnectPeriod: 5000
    };

    if (state.mqtt.username) {
        options.username = state.mqtt.username;
        options.password = state.mqtt.password;
    }

    console.log('Connecting to MQTT broker:', state.mqtt.broker);
    elements.mqttStatusText.textContent = 'Connecting...';

    state.mqtt.client = mqtt.connect(state.mqtt.broker, options);

    state.mqtt.client.on('connect', () => {
        console.log('Connected to MQTT broker');
        state.mqtt.connected = true;
        updateConnectionStatus(true);

        state.mqtt.client.subscribe(state.mqtt.baseTopic, (err) => {
            if (err) {
                console.error('Failed to subscribe:', err);
            } else {
                console.log('Subscribed to:', state.mqtt.baseTopic);
            }
        });

        if (elements.positionReportingBtn) {
            elements.positionReportingBtn.disabled = false;
        }
    });

    state.mqtt.client.on('error', (error) => {
        console.error('MQTT error:', error);
        updateConnectionStatus(false);
    });

    state.mqtt.client.on('close', () => {
        console.log('Disconnected from MQTT broker');
        state.mqtt.connected = false;
        updateConnectionStatus(false);
    });

    state.mqtt.client.on('message', handleMQTTMessage);
}

// ============================================================================
// MQTT Message Handling
// ============================================================================

function handleMQTTMessage(topic, message) {
    try {
        const data = JSON.parse(message.toString());

        if (data.ld2450_target_count !== undefined) {
            state.sensor.targetCount = data.ld2450_target_count;
            updateTargetCountDisplay();
        }

        if (data.occupancy_ld2450 !== undefined) {
            state.sensor.occupancy = data.occupancy_ld2450;
            updateOccupancyDisplay();
        }

        if (data.position_reporting !== undefined) {
            state.sensor.positionReporting = data.position_reporting;
            updatePositionReportingButton();
        }

        if (data.zone1_occupied !== undefined) {
            state.sensor.zones[0].occupied = data.zone1_occupied;
            elements.zone1Status.textContent = data.zone1_occupied ? 'Occupied' : 'Clear';
            elements.zone1Status.classList.toggle('occupied', data.zone1_occupied);
        }
        if (data.zone2_occupied !== undefined) {
            state.sensor.zones[1].occupied = data.zone2_occupied;
            elements.zone2Status.textContent = data.zone2_occupied ? 'Occupied' : 'Clear';
            elements.zone2Status.classList.toggle('occupied', data.zone2_occupied);
        }
        if (data.zone3_occupied !== undefined) {
            state.sensor.zones[2].occupied = data.zone3_occupied;
            elements.zone3Status.textContent = data.zone3_occupied ? 'Occupied' : 'Clear';
            elements.zone3Status.classList.toggle('occupied', data.zone3_occupied);
        }

        if (data.target1_x !== undefined) state.sensor.positions.t1.x = data.target1_x;
        if (data.target1_y !== undefined) state.sensor.positions.t1.y = data.target1_y;
        if (data.target1_distance !== undefined) state.sensor.positions.t1.distance = data.target1_distance;

        if (data.target2_x !== undefined) state.sensor.positions.t2.x = data.target2_x;
        if (data.target2_y !== undefined) state.sensor.positions.t2.y = data.target2_y;
        if (data.target2_distance !== undefined) state.sensor.positions.t2.distance = data.target2_distance;

        if (data.target3_x !== undefined) state.sensor.positions.t3.x = data.target3_x;
        if (data.target3_y !== undefined) state.sensor.positions.t3.y = data.target3_y;
        if (data.target3_distance !== undefined) state.sensor.positions.t3.distance = data.target3_distance;

        updateTargetsFromPositions();
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones);

    } catch (error) {
        console.error('Error parsing MQTT message:', error);
    }
}

function updateTargetsFromPositions() {
    state.sensor.targets = [];

    if (state.sensor.positions.t1.x !== 0 || state.sensor.positions.t1.y !== 0) {
        state.sensor.targets.push({
            x: state.sensor.positions.t1.x,
            y: state.sensor.positions.t1.y,
            distance: state.sensor.positions.t1.distance,
            speed: 0
        });
    }

    if (state.sensor.positions.t2.x !== 0 || state.sensor.positions.t2.y !== 0) {
        state.sensor.targets.push({
            x: state.sensor.positions.t2.x,
            y: state.sensor.positions.t2.y,
            distance: state.sensor.positions.t2.distance,
            speed: 0
        });
    }

    if (state.sensor.positions.t3.x !== 0 || state.sensor.positions.t3.y !== 0) {
        state.sensor.targets.push({
            x: state.sensor.positions.t3.x,
            y: state.sensor.positions.t3.y,
            distance: state.sensor.positions.t3.distance,
            speed: 0
        });
    }

    updateTargetListDisplay();
}

function togglePositionReporting() {
    if (!state.mqtt.connected || !state.mqtt.client) {
        alert('Not connected to MQTT broker');
        return;
    }

    const newState = !state.sensor.positionReporting;
    const topic = `${state.mqtt.baseTopic}/set`;

    state.mqtt.client.publish(topic, JSON.stringify({ position_reporting: newState }), { retain: false }, (err) => {
        if (err) {
            console.error('Failed to toggle position reporting:', err);
        } else {
            console.log('Toggled position reporting:', newState);
        }
    });
}

function publishZoneConfig() {
    if (!state.mqtt.connected || !state.mqtt.client) {
        alert('Not connected to MQTT broker');
        return;
    }

    const config = {
        zone_type: state.zones.type,
        zone1_enabled: state.zones.zones[0].enabled,
        zone1_x1: state.zones.zones[0].x1,
        zone1_y1: state.zones.zones[0].y1,
        zone1_x2: state.zones.zones[0].x2,
        zone1_y2: state.zones.zones[0].y2,
        zone2_enabled: state.zones.zones[1].enabled,
        zone2_x1: state.zones.zones[1].x1,
        zone2_y1: state.zones.zones[1].y1,
        zone2_x2: state.zones.zones[1].x2,
        zone2_y2: state.zones.zones[1].y2,
        zone3_enabled: state.zones.zones[2].enabled,
        zone3_x1: state.zones.zones[2].x1,
        zone3_y1: state.zones.zones[2].y1,
        zone3_x2: state.zones.zones[2].x2,
        zone3_y2: state.zones.zones[2].y2
    };

    const topic = `${state.mqtt.baseTopic}/set`;
    state.mqtt.client.publish(topic, JSON.stringify(config), { retain: false }, (err) => {
        if (err) {
            console.error('Failed to publish zone config:', err);
            alert('Failed to apply zone configuration');
        } else {
            console.log('Published zone config:', config);
            alert('Zone configuration applied successfully!');
        }
    });
}

// ============================================================================
// UI Update Functions
// ============================================================================

function updateConnectionStatus(connected) {
    if (connected) {
        elements.mqttStatus.classList.add('online');
        elements.mqttStatusText.textContent = 'Connected';
    } else {
        elements.mqttStatus.classList.remove('online');
        elements.mqttStatusText.textContent = 'Disconnected';
    }
}

function updateTargetCountDisplay() {
    elements.targetCount.textContent = state.sensor.targetCount;
}

function updateOccupancyDisplay() {
    elements.occupancy.textContent = state.sensor.occupancy ? 'Occupied' : 'Clear';
    elements.occupancy.style.color = state.sensor.occupancy ? '#3fb950' : '#8b949e';
}

function updateTargetListDisplay() {
    if (state.sensor.targets.length === 0) {
        elements.targetList.innerHTML = '<p class="text-muted">No targets detected</p>';
        return;
    }

    elements.targetList.innerHTML = state.sensor.targets.map((target, i) => `
        <div class="target-item">
            <strong>Target ${i + 1}:</strong>
            X=${target.x}mm, Y=${target.y}mm,
            Dist=${Math.round(target.distance)}mm
        </div>
    `).join('');
}

function updatePositionReportingButton() {
    if (!elements.positionReportingBtn) return;

    if (state.sensor.positionReporting) {
        elements.positionReportingBtn.textContent = 'Disable Position Reporting';
        elements.positionReportingBtn.classList.add('btn-warning');
        elements.positionReportingBtn.classList.remove('btn-secondary');
    } else {
        elements.positionReportingBtn.textContent = 'Enable Position Reporting';
        elements.positionReportingBtn.classList.remove('btn-warning');
        elements.positionReportingBtn.classList.add('btn-secondary');
    }
}

function switchZoneTab(zoneNumber) {
    elements.zoneTabs.forEach(tab => {
        tab.classList.toggle('active', parseInt(tab.dataset.zone) === zoneNumber);
    });

    elements.zone1Editor.style.display = zoneNumber === 1 ? 'block' : 'none';
    elements.zone2Editor.style.display = zoneNumber === 2 ? 'block' : 'none';
    elements.zone3Editor.style.display = zoneNumber === 3 ? 'block' : 'none';

    state.ui.activeZone = zoneNumber;
}

function loadZoneFormValues() {
    elements.zoneType.value = state.zones.type;

    elements.zone1Enable.checked = state.zones.zones[0].enabled;
    elements.zone1X1.value = state.zones.zones[0].x1;
    elements.zone1Y1.value = state.zones.zones[0].y1;
    elements.zone1X2.value = state.zones.zones[0].x2;
    elements.zone1Y2.value = state.zones.zones[0].y2;

    elements.zone2Enable.checked = state.zones.zones[1].enabled;
    elements.zone2X1.value = state.zones.zones[1].x1;
    elements.zone2Y1.value = state.zones.zones[1].y1;
    elements.zone2X2.value = state.zones.zones[1].x2;
    elements.zone2Y2.value = state.zones.zones[1].y2;

    elements.zone3Enable.checked = state.zones.zones[2].enabled;
    elements.zone3X1.value = state.zones.zones[2].x1;
    elements.zone3Y1.value = state.zones.zones[2].y1;
    elements.zone3X2.value = state.zones.zones[2].x2;
    elements.zone3Y2.value = state.zones.zones[2].y2;
}

function saveZoneFormValues() {
    state.zones.type = parseInt(elements.zoneType.value);

    state.zones.zones[0].enabled = elements.zone1Enable.checked;
    state.zones.zones[0].x1 = parseInt(elements.zone1X1.value);
    state.zones.zones[0].y1 = parseInt(elements.zone1Y1.value);
    state.zones.zones[0].x2 = parseInt(elements.zone1X2.value);
    state.zones.zones[0].y2 = parseInt(elements.zone1Y2.value);

    state.zones.zones[1].enabled = elements.zone2Enable.checked;
    state.zones.zones[1].x1 = parseInt(elements.zone2X1.value);
    state.zones.zones[1].y1 = parseInt(elements.zone2Y1.value);
    state.zones.zones[1].x2 = parseInt(elements.zone2X2.value);
    state.zones.zones[1].y2 = parseInt(elements.zone2Y2.value);

    state.zones.zones[2].enabled = elements.zone3Enable.checked;
    state.zones.zones[2].x1 = parseInt(elements.zone3X1.value);
    state.zones.zones[2].y1 = parseInt(elements.zone3Y1.value);
    state.zones.zones[2].x2 = parseInt(elements.zone3X2.value);
    state.zones.zones[2].y2 = parseInt(elements.zone3Y2.value);

    radarCanvas.drawFrame(state.sensor.targets, state.zones.zones);
}

function resetZones() {
    if (confirm('Reset all zones to default values?')) {
        state.zones = {
            type: 0,
            zones: [
                { enabled: false, x1: -1500, y1: 0, x2: 1500, y2: 3000 },
                { enabled: false, x1: -1500, y1: 0, x2: 1500, y2: 3000 },
                { enabled: false, x1: -1500, y1: 0, x2: 1500, y2: 3000 }
            ]
        };
        loadZoneFormValues();
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones);
    }
}

// ============================================================================
// Event Listeners
// ============================================================================

elements.zoneTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        switchZoneTab(parseInt(tab.dataset.zone));
    });
});

elements.zoneType.addEventListener('change', () => {
    saveZoneFormValues();
});

const zoneInputs = [
    elements.zone1Enable, elements.zone1X1, elements.zone1Y1, elements.zone1X2, elements.zone1Y2,
    elements.zone2Enable, elements.zone2X1, elements.zone2Y1, elements.zone2X2, elements.zone2Y2,
    elements.zone3Enable, elements.zone3X1, elements.zone3Y1, elements.zone3X2, elements.zone3Y2
];

zoneInputs.forEach(input => {
    input.addEventListener('input', () => {
        saveZoneFormValues();
    });
});

elements.applyZonesBtn.addEventListener('click', () => {
    saveZoneFormValues();
    publishZoneConfig();
});

elements.resetZonesBtn.addEventListener('click', resetZones);

if (elements.positionReportingBtn) {
    elements.positionReportingBtn.addEventListener('click', togglePositionReporting);
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
    console.log('SHS Z2M Presence Zone Configurator initialized');

    // Load config and auto-connect
    await loadConfig();

    loadZoneFormValues();
    radarCanvas.drawFrame([], state.zones.zones);

    function animate() {
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones);
        requestAnimationFrame(animate);
    }
    animate();

    updateConnectionStatus(false);

    // Auto-connect to MQTT
    connectMQTT();
}

init();
