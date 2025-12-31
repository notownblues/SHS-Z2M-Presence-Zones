import { RadarCanvas } from './radarCanvas.js';
import { ZoneManager } from './zoneManager.js';
import { StorageManager } from './storageManager.js';
import { DrawingManager } from './drawingManager.js';

// LocalStorage key for saving room name
const STORAGE_KEY = 'ld2450_zone_config_settings';

// WebSocket connection to backend server
let wsConnection = null;

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
            { occupied: false },
            { occupied: false },
            { occupied: false }
        ],
        // Store raw position data from MQTT
        positions: {
            t1: { x: 0, y: 0, distance: 0 },
            t2: { x: 0, y: 0, distance: 0 },
            t3: { x: 0, y: 0, distance: 0 }
        }
    },
    zones: {
        type: 0, // 0=off, 1=include, 2=exclude
        zones: [
            { enabled: false, shapeType: 'rectangle', x1: -1500, y1: 0, x2: 1500, y2: 3000, vertices: null, zoneType: 'detection' },
            { enabled: false, shapeType: 'rectangle', x1: -1500, y1: 0, x2: 1500, y2: 3000, vertices: null, zoneType: 'detection' },
            { enabled: false, shapeType: 'rectangle', x1: -1500, y1: 0, x2: 1500, y2: 3000, vertices: null, zoneType: 'detection' },
            { enabled: false, shapeType: 'rectangle', x1: -1500, y1: 0, x2: 1500, y2: 3000, vertices: null, zoneType: 'detection' },
            { enabled: false, shapeType: 'rectangle', x1: -1500, y1: 0, x2: 1500, y2: 3000, vertices: null, zoneType: 'detection' }
        ]
    },
    // Visual annotations (not sent to sensor)
    annotations: {
        furniture: [],
        entrances: [],
        edges: []  // Grey-out areas for room boundaries
    },
    // Canvas interaction state
    canvas: {
        mode: 'select', // 'select' | 'draw-rectangle' | 'draw-polygon' | 'place-furniture' | 'place-entrance'
        selectedItem: null,
        drawing: {
            active: false,
            startX: null,
            startY: null,
            vertices: []
        },
        placingFurniture: null,
        placingEntrance: false
    },
    ui: {
        activeZone: 1,
        mapRotation: 0 // 0, 90, 180, 270 degrees
    }
};

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
    // MQTT Connection (broker settings from addon config, topic from UI)
    mqttStatus: document.getElementById('mqttStatus'),
    mqttStatusText: document.getElementById('mqttStatusText'),
    mqttTopic: document.getElementById('mqttTopic'),
    roomName: document.getElementById('roomName'),
    saveRoomBtn: document.getElementById('saveRoomBtn'),
    deleteRoomBtn: document.getElementById('deleteRoomBtn'),
    sensorSelector: document.getElementById('sensorSelector'),
    positionReportingBtn: document.getElementById('positionReportingBtn'),
    positionReportingBtnMobile: document.getElementById('positionReportingBtnMobile'),

    // Mobile scroll controls
    furnitureGrid: document.getElementById('furnitureGrid'),
    scrollLeft: document.getElementById('scrollLeft'),
    scrollRight: document.getElementById('scrollRight'),

    // Dark Mode Toggle
    darkModeToggle: document.getElementById('darkModeToggle'),

    // Canvas & Shape Actions
    radarCanvas: document.getElementById('radarCanvas'),
    canvasContainer: document.querySelector('.canvas-container'),
    shapeActions: document.getElementById('shapeActions'),
    moveShapeBtn: document.getElementById('moveShapeBtn'),
    rotateShapeBtn: document.getElementById('rotateShapeBtn'),
    increaseSizeBtn: document.getElementById('increaseSizeBtn'),
    decreaseSizeBtn: document.getElementById('decreaseSizeBtn'),
    deleteShapeBtn: document.getElementById('deleteShapeBtn'),

    // Placement Done
    placementDone: document.getElementById('placementDone'),
    doneBtn: document.getElementById('doneBtn'),

    // Map Rotation
    rotateMapBtn: document.getElementById('rotateMapBtn'),

    // Save Indicator
    saveIndicator: document.getElementById('saveIndicator'),

    // Target Info
    targetCount: document.getElementById('targetCount'),
    occupancy: document.getElementById('occupancy'),
    occupancyIcon: document.getElementById('occupancyIcon'),
    targetList: document.getElementById('targetList'),

    // Zone Controls
    zoneType: document.getElementById('zoneType'),
    zoneCards: document.querySelectorAll('.zone-card'),

    // Zone hidden inputs (for state compatibility)
    zone1Enable: document.getElementById('zone1Enable'),
    zone1X1: document.getElementById('zone1X1'),
    zone1Y1: document.getElementById('zone1Y1'),
    zone1X2: document.getElementById('zone1X2'),
    zone1Y2: document.getElementById('zone1Y2'),
    zone1Status: document.getElementById('zone1Status'),
    zone1Info: document.getElementById('zone1Info'),
    zone1Card: document.getElementById('zone1Card'),
    zone1OccupancyIcon: document.getElementById('zone1OccupancyIcon'),

    zone2Enable: document.getElementById('zone2Enable'),
    zone2X1: document.getElementById('zone2X1'),
    zone2Y1: document.getElementById('zone2Y1'),
    zone2X2: document.getElementById('zone2X2'),
    zone2Y2: document.getElementById('zone2Y2'),
    zone2Status: document.getElementById('zone2Status'),
    zone2Info: document.getElementById('zone2Info'),
    zone2Card: document.getElementById('zone2Card'),
    zone2OccupancyIcon: document.getElementById('zone2OccupancyIcon'),

    zone3Enable: document.getElementById('zone3Enable'),
    zone3X1: document.getElementById('zone3X1'),
    zone3Y1: document.getElementById('zone3Y1'),
    zone3X2: document.getElementById('zone3X2'),
    zone3Y2: document.getElementById('zone3Y2'),
    zone3Status: document.getElementById('zone3Status'),
    zone3Info: document.getElementById('zone3Info'),
    zone3Card: document.getElementById('zone3Card'),
    zone3OccupancyIcon: document.getElementById('zone3OccupancyIcon'),

    zone4Enable: document.getElementById('zone4Enable'),
    zone4X1: document.getElementById('zone4X1'),
    zone4Y1: document.getElementById('zone4Y1'),
    zone4X2: document.getElementById('zone4X2'),
    zone4Y2: document.getElementById('zone4Y2'),
    zone4Status: document.getElementById('zone4Status'),
    zone4Info: document.getElementById('zone4Info'),
    zone4Card: document.getElementById('zone4Card'),
    zone4OccupancyIcon: document.getElementById('zone4OccupancyIcon'),

    zone5Enable: document.getElementById('zone5Enable'),
    zone5X1: document.getElementById('zone5X1'),
    zone5Y1: document.getElementById('zone5Y1'),
    zone5X2: document.getElementById('zone5X2'),
    zone5Y2: document.getElementById('zone5Y2'),
    zone5Status: document.getElementById('zone5Status'),
    zone5Info: document.getElementById('zone5Info'),
    zone5Card: document.getElementById('zone5Card'),
    zone5OccupancyIcon: document.getElementById('zone5OccupancyIcon'),

    // Zone Type Selectors
    zone1Type: document.getElementById('zone1Type'),
    zone2Type: document.getElementById('zone2Type'),
    zone3Type: document.getElementById('zone3Type'),
    zone4Type: document.getElementById('zone4Type'),
    zone5Type: document.getElementById('zone5Type'),

    // Buttons
    applyZonesBtn: document.getElementById('applyZonesBtn'),
    resetZonesBtn: document.getElementById('resetZonesBtn'),
    zone1ClearBtn: document.getElementById('zone1ClearBtn'),
    zone2ClearBtn: document.getElementById('zone2ClearBtn'),
    zone3ClearBtn: document.getElementById('zone3ClearBtn'),
    zone4ClearBtn: document.getElementById('zone4ClearBtn'),
    zone5ClearBtn: document.getElementById('zone5ClearBtn')
};

// ============================================================================
// Radar Canvas & Zone Manager
// ============================================================================

const radarCanvas = new RadarCanvas(elements.radarCanvas);
const zoneManager = new ZoneManager(state.zones);
const storageManager = new StorageManager();

// Track currently selected item for shape actions
let selectedItemType = null; // 'zone' | 'furniture' | 'entrance'
let selectedItemIndex = null;

// Drawing Manager with callbacks
const drawingManager = new DrawingManager(radarCanvas, state, {
    onModeChange: (mode) => {
        updateToolbarActiveState(mode);
        hideShapeActions();
        updatePlacementDoneVisibility(mode);
    },
    onZoneSelect: (index) => {
        radarCanvas.setSelectedZone(index);
        radarCanvas.setSelectedFurniture(null); // Clear furniture selection

        if (index !== null) {
            selectedItemType = 'zone';
            selectedItemIndex = index;
            updateZoneCardSelection(index);
            showShapeActions(state.zones.zones[index]);
        } else {
            selectedItemType = null;
            selectedItemIndex = null;
            updateZoneCardSelection(null);
            hideShapeActions();
        }
    },
    onZoneCreated: (index, zone) => {
        radarCanvas.setSelectedZone(index);
        selectedItemType = 'zone';
        selectedItemIndex = index;
        loadZoneFormValues();
        updateZoneCards();
        showShapeActions(zone);
        triggerAutoSave();
    },
    onZoneUpdate: (index, zone) => {
        loadZoneFormValues();
        updateZoneCards();
        if (selectedItemIndex === index) {
            showShapeActions(zone);
        }
        triggerAutoSave();
    },
    onZoneDeleted: (index) => {
        selectedItemType = null;
        selectedItemIndex = null;
        loadZoneFormValues();
        updateZoneCards();
        hideShapeActions();
        triggerAutoSave();
    },
    onPreviewUpdate: (preview) => {
        radarCanvas.setDrawingPreview(preview);
    },
    onFurniturePlaced: (furniture) => {
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
        triggerAutoSave();
        // Position Done button above placed furniture
        positionDoneButtonAtObject(furniture.x, furniture.y);
    },
    onFurnitureSelect: (index, furniture) => {
        radarCanvas.setSelectedFurniture(index);

        // Deselect zone when furniture is selected
        if (index !== null) {
            radarCanvas.setSelectedZone(null);
            selectedItemType = 'furniture';
            selectedItemIndex = index;
            updateZoneCardSelection(null);
            if (furniture) {
                showShapeActions(furniture);
            }
        } else {
            selectedItemType = null;
            selectedItemIndex = null;
            hideShapeActions();
        }
    },
    onFurnitureUpdate: (index, furniture) => {
        if (selectedItemIndex === index) {
            showShapeActions(furniture);
        }
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
        triggerAutoSave();
    },
    onFurnitureDeleted: (index) => {
        selectedItemType = null;
        selectedItemIndex = null;
        hideShapeActions();
        radarCanvas.setSelectedFurniture(null);
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
        triggerAutoSave();
    },
    onEntrancePlaced: (entrance) => {
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
        triggerAutoSave();
        // Position Done button above placed entrance
        positionDoneButtonAtObject(entrance.x, entrance.y);
    },
    onEntranceSelect: (index, entrance) => {
        radarCanvas.setSelectedEntrance(index);

        if (index !== null) {
            radarCanvas.setSelectedZone(null);
            radarCanvas.setSelectedFurniture(null);
            selectedItemType = 'entrance';
            selectedItemIndex = index;
            updateZoneCardSelection(null);
            if (entrance) {
                showShapeActions(entrance);
            }
        } else {
            selectedItemType = null;
            selectedItemIndex = null;
            hideShapeActions();
        }
    },
    onEntranceUpdate: (index, entrance) => {
        if (selectedItemIndex === index) {
            showShapeActions(entrance);
        }
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
        triggerAutoSave();
    },
    onEntranceDeleted: (index) => {
        selectedItemType = null;
        selectedItemIndex = null;
        hideShapeActions();
        radarCanvas.setSelectedEntrance(null);
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
        triggerAutoSave();
    },
    // Edge callbacks
    onEdgePlaced: (edge) => {
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
        triggerAutoSave();
    },
    onEdgeSelect: (index, edge) => {
        radarCanvas.setSelectedEdge(index);

        if (index !== null) {
            radarCanvas.setSelectedZone(null);
            radarCanvas.setSelectedFurniture(null);
            radarCanvas.setSelectedEntrance(null);
            selectedItemType = 'edge';
            selectedItemIndex = index;
            updateZoneCardSelection(null);
            if (edge) {
                showShapeActions(edge);
            }
        } else {
            selectedItemType = null;
            selectedItemIndex = null;
            hideShapeActions();
        }
    },
    onEdgeDeleted: (index) => {
        selectedItemType = null;
        selectedItemIndex = null;
        hideShapeActions();
        radarCanvas.setSelectedEdge(null);
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
        triggerAutoSave();
    },
    onError: (message) => {
        alert(message);
    }
});

/**
 * Update toolbar button active state
 */
function updateToolbarActiveState(mode) {
    // Update toolbar buttons
    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(btn => {
        const btnMode = btn.dataset.mode;

        if (btnMode === mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update furniture sidebar buttons
    const furnitureButtons = document.querySelectorAll('.furniture-item');
    furnitureButtons.forEach(btn => {
        const btnFurniture = btn.dataset.furniture;

        if (mode === 'place-furniture' && btnFurniture === state.canvas.placingFurniture) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

/**
 * Show/hide placement done button based on mode
 */
function updatePlacementDoneVisibility(mode) {
    if (!elements.placementDone) return;

    const showDone = ['draw-rectangle', 'draw-polygon', 'place-furniture', 'place-entrance', 'moving'].includes(mode);
    elements.placementDone.style.display = showDone ? 'flex' : 'none';

    // Reset to center when showing
    if (showDone) {
        elements.placementDone.style.top = '50%';
        elements.placementDone.style.left = '50%';
    }
}

/**
 * Position the Done button above a placed object
 * @param {number} sensorX - X coordinate in sensor space (mm)
 * @param {number} sensorY - Y coordinate in sensor space (mm)
 */
function positionDoneButtonAtObject(sensorX, sensorY) {
    if (!elements.placementDone || !radarCanvas) return;

    // Convert sensor coordinates to canvas coordinates
    const canvasX = radarCanvas.toCanvasX(sensorX);
    const canvasY = radarCanvas.toCanvasY(sensorY);

    // Get canvas dimensions
    const canvasRect = elements.radarCanvas.getBoundingClientRect();

    // Position button above the object (offset by 80px)
    const buttonY = Math.max(60, canvasY - 80);

    // Convert to percentage of canvas size
    const leftPercent = (canvasX / canvasRect.width) * 100;
    const topPercent = (buttonY / canvasRect.height) * 100;

    elements.placementDone.style.left = `${leftPercent}%`;
    elements.placementDone.style.top = `${topPercent}%`;
}

/**
 * Finish current placement/drawing and return to select mode
 */
function finishPlacement() {
    // If in move mode, finish the move first
    if (drawingManager.isMoving) {
        drawingManager.finishMoveMode();
    } else {
        drawingManager.setMode('select');
    }
    triggerAutoSave();
}

/**
 * Rotate the map view by 90 degrees
 */
function rotateMap() {
    state.ui.mapRotation = (state.ui.mapRotation + 90) % 360;
    radarCanvas.setMapRotation(state.ui.mapRotation);
    radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
}

/**
 * Trigger auto-save indicator and save to localStorage
 */
let autoSaveTimeout = null;
function triggerAutoSave() {
    if (!elements.saveIndicator) return;

    // Show "Saving..." briefly
    elements.saveIndicator.textContent = 'Saving...';
    elements.saveIndicator.classList.add('visible', 'saving');

    // Clear any pending timeout
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);

    // Save to server (async, fire-and-forget)
    saveCurrentSensorConfig();

    // Show "Saved" after a brief delay
    autoSaveTimeout = setTimeout(() => {
        elements.saveIndicator.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5"/>
            </svg>
            Saved
        `;
        elements.saveIndicator.classList.remove('saving');

        // Hide after 2 seconds
        setTimeout(() => {
            elements.saveIndicator.classList.remove('visible');
        }, 2000);
    }, 300);
}

/**
 * Show floating shape actions above selected shape
 * Accounts for map rotation to position buttons correctly
 */
function showShapeActions(shape) {
    if (!elements.shapeActions || !shape) return;

    // Get shape bounds in sensor coordinates
    let sensorX1, sensorY1, sensorX2, sensorY2;

    if (shape.x1 !== undefined) {
        // Zones and edges have x1,y1,x2,y2
        sensorX1 = Math.min(shape.x1, shape.x2);
        sensorY1 = Math.min(shape.y1, shape.y2);
        sensorX2 = Math.max(shape.x1, shape.x2);
        sensorY2 = Math.max(shape.y1, shape.y2);
    } else if (shape.width !== undefined && shape.height !== undefined) {
        // Furniture has center point + width/height
        const halfW = shape.width / 2;
        const halfH = shape.height / 2;
        sensorX1 = shape.x - halfW;
        sensorY1 = shape.y - halfH;
        sensorX2 = shape.x + halfW;
        sensorY2 = shape.y + halfH;
    } else {
        // Entrances - use center point with small radius
        sensorX1 = shape.x - 200;
        sensorY1 = shape.y - 200;
        sensorX2 = shape.x + 200;
        sensorY2 = shape.y + 200;
    }

    // Convert all 4 corners to canvas coordinates
    const corners = [
        { x: radarCanvas.toCanvasX(sensorX1), y: radarCanvas.toCanvasY(sensorY1) },
        { x: radarCanvas.toCanvasX(sensorX2), y: radarCanvas.toCanvasY(sensorY1) },
        { x: radarCanvas.toCanvasX(sensorX1), y: radarCanvas.toCanvasY(sensorY2) },
        { x: radarCanvas.toCanvasX(sensorX2), y: radarCanvas.toCanvasY(sensorY2) }
    ];

    // Apply map rotation to all corners
    const rotation = state.ui.mapRotation || 0;
    const cx = radarCanvas.width / 2;
    const cy = radarCanvas.height / 2;
    const angle = rotation * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const rotatedCorners = corners.map(corner => {
        const dx = corner.x - cx;
        const dy = corner.y - cy;
        return {
            x: cx + dx * cos - dy * sin,
            y: cy + dx * sin + dy * cos
        };
    });

    // Find the visual bounding box after rotation
    const minX = Math.min(...rotatedCorners.map(c => c.x));
    const maxX = Math.max(...rotatedCorners.map(c => c.x));
    const minY = Math.min(...rotatedCorners.map(c => c.y)); // Visual top (lowest Y = highest on screen)

    // Center X of the rotated shape
    const centerX = (minX + maxX) / 2;

    // Get canvas scaling for display
    const canvasRect = elements.radarCanvas.getBoundingClientRect();
    const scaleX = elements.radarCanvas.width / canvasRect.width;
    const scaleY = elements.radarCanvas.height / canvasRect.height;

    // Position bar above the visual top of the object
    const barHeight = 40;
    const gap = 15;
    const displayX = centerX / scaleX;
    const displayY = (minY / scaleY) - barHeight - gap;

    // Show/hide resize buttons based on item type (zones don't support resize)
    const showResizeButtons = selectedItemType !== 'zone';
    if (elements.increaseSizeBtn) {
        elements.increaseSizeBtn.style.display = showResizeButtons ? 'flex' : 'none';
    }
    if (elements.decreaseSizeBtn) {
        elements.decreaseSizeBtn.style.display = showResizeButtons ? 'flex' : 'none';
    }

    // Position the action buttons
    elements.shapeActions.style.left = `${displayX}px`;
    elements.shapeActions.style.top = `${Math.max(10, displayY)}px`;
    elements.shapeActions.style.transform = 'translateX(-50%)';
    elements.shapeActions.style.display = 'flex';
}

/**
 * Hide floating shape actions
 */
function hideShapeActions() {
    if (elements.shapeActions) {
        elements.shapeActions.style.display = 'none';
    }
}

/**
 * Start moving selected shape
 */
function moveSelectedShape() {
    if (selectedItemType && selectedItemIndex !== null) {
        drawingManager.startMoveMode(selectedItemType, selectedItemIndex);
        hideShapeActions();
    }
}

/**
 * Rotate selected shape by 45 degrees
 */
function rotateSelectedShape() {
    if (selectedItemType === 'zone' && selectedItemIndex !== null) {
        // Zones don't support rotation (they're axis-aligned for the sensor)
        alert('Zone rotation is not supported by the SHS01 sensor. Zones must be axis-aligned.');
    } else if (selectedItemType === 'furniture' && selectedItemIndex !== null) {
        const furniture = state.annotations.furniture[selectedItemIndex];
        if (furniture) {
            furniture.rotation = ((furniture.rotation || 0) + 45) % 360;
            showShapeActions(furniture);
            radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
            triggerAutoSave();
        }
    } else if (selectedItemType === 'entrance' && selectedItemIndex !== null) {
        drawingManager.rotateSelectedEntrance();
        const entrance = state.annotations.entrances[selectedItemIndex];
        if (entrance) {
            showShapeActions(entrance);
        }
    }
}

/**
 * Delete selected shape
 */
function deleteSelectedShape() {
    if (selectedItemType === 'zone' && selectedItemIndex !== null) {
        drawingManager.deleteSelectedZone();
    } else if (selectedItemType === 'furniture' && selectedItemIndex !== null) {
        drawingManager.deleteSelectedFurniture();
    } else if (selectedItemType === 'entrance' && selectedItemIndex !== null) {
        drawingManager.deleteSelectedEntrance();
    } else if (selectedItemType === 'edge' && selectedItemIndex !== null) {
        deleteSelectedEdge();
    }
}

/**
 * Delete the selected edge
 */
function deleteSelectedEdge() {
    if (selectedItemType !== 'edge' || selectedItemIndex === null) return;

    drawingManager.deleteSelectedEdge();
}

/**
 * Resize selected furniture or entrance by a scale factor
 * @param {number} scaleFactor - 1.1 to increase by 10%, 0.9 to decrease by 10%
 */
function resizeSelectedShape(scaleFactor) {
    const MIN_SIZE = 200;  // Minimum 200mm
    const MAX_SIZE = 4000; // Maximum 4000mm

    if (selectedItemType === 'furniture' && selectedItemIndex !== null) {
        const furniture = state.annotations.furniture[selectedItemIndex];
        if (furniture) {
            const newWidth = Math.round(furniture.width * scaleFactor);
            const newHeight = Math.round(furniture.height * scaleFactor);

            // Clamp to min/max
            furniture.width = Math.max(MIN_SIZE, Math.min(MAX_SIZE, newWidth));
            furniture.height = Math.max(MIN_SIZE, Math.min(MAX_SIZE, newHeight));

            showShapeActions(furniture);
            radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
            triggerAutoSave();
        }
    } else if (selectedItemType === 'entrance' && selectedItemIndex !== null) {
        const entrance = state.annotations.entrances[selectedItemIndex];
        if (entrance) {
            // Initialize width if not present (default 800mm door)
            if (!entrance.width) entrance.width = 800;

            const newWidth = Math.round(entrance.width * scaleFactor);
            entrance.width = Math.max(MIN_SIZE, Math.min(MAX_SIZE, newWidth));

            showShapeActions(entrance);
            radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
            triggerAutoSave();
        }
    } else if (selectedItemType === 'edge' && selectedItemIndex !== null) {
        const edge = state.annotations.edges[selectedItemIndex];
        if (edge) {
            // Scale edge dimensions from center
            const centerX = (edge.x1 + edge.x2) / 2;
            const centerY = (edge.y1 + edge.y2) / 2;
            const halfWidth = Math.abs(edge.x2 - edge.x1) / 2 * scaleFactor;
            const halfHeight = Math.abs(edge.y2 - edge.y1) / 2 * scaleFactor;

            edge.x1 = Math.round(centerX - halfWidth);
            edge.x2 = Math.round(centerX + halfWidth);
            edge.y1 = Math.round(centerY - halfHeight);
            edge.y2 = Math.round(centerY + halfHeight);

            // Clamp to sensor bounds
            edge.x1 = Math.max(-3000, Math.min(3000, edge.x1));
            edge.x2 = Math.max(-3000, Math.min(3000, edge.x2));
            edge.y1 = Math.max(0, Math.min(6000, edge.y1));
            edge.y2 = Math.max(0, Math.min(6000, edge.y2));

            showShapeActions(edge);
            radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
            triggerAutoSave();
        }
    }
}

/**
 * Update zone card selection state
 */
function updateZoneCardSelection(selectedIndex) {
    elements.zoneCards.forEach((card, index) => {
        card.classList.toggle('selected', index === selectedIndex);
    });
}

/**
 * Update zone cards with current zone info
 */
function updateZoneCards() {
    state.zones.zones.forEach((zone, index) => {
        const card = elements[`zone${index + 1}Card`];
        const info = elements[`zone${index + 1}Info`];

        if (card && info) {
            card.classList.toggle('enabled', zone.enabled);

            if (zone.enabled) {
                const width = Math.abs(zone.x2 - zone.x1);
                const height = Math.abs(zone.y2 - zone.y1);
                const shapeType = zone.shapeType === 'polygon' ? 'Polygon' : 'Rectangle';
                info.textContent = `${shapeType} • ${width}mm × ${height}mm`;
            } else {
                info.textContent = 'Click to draw on map';
            }
        }
    });
}

// ============================================================================
// WebSocket Connection to Backend Server
// ============================================================================

/**
 * Connect to backend WebSocket server
 */
function connectWebSocket() {
    // Build WebSocket URL - handle HA ingress path
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Get the base path (for HA ingress, this includes /api/hassio_ingress/xxxx/)
    let basePath = window.location.pathname;
    // Remove trailing slash and any filename
    if (basePath.endsWith('/')) {
        basePath = basePath.slice(0, -1);
    }
    const wsUrl = `${protocol}//${window.location.host}${basePath}/ws`;

    console.log('[WS] Location:', window.location.href);
    console.log('[WS] Base path:', basePath);
    console.log('[WS] Connecting to:', wsUrl);

    elements.mqttStatusText.textContent = 'Connecting to MQTT...';
    elements.mqttStatus.classList.remove('online');

    try {
        wsConnection = new WebSocket(wsUrl);
        console.log('[WS] WebSocket object created');
    } catch (error) {
        console.error('[WS] Failed to create WebSocket:', error);
        elements.mqttStatusText.textContent = 'Connection failed';
        return;
    }

    wsConnection.onopen = () => {
        console.log('WebSocket connected to backend');

        // Subscribe to MQTT topic if one is configured
        const topic = elements.mqttTopic.value;
        if (topic && topic.trim()) {
            wsConnection.send(JSON.stringify({
                type: 'subscribe',
                topic: topic
            }));
        }
    };

    wsConnection.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleBackendMessage(message);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    wsConnection.onclose = () => {
        console.log('WebSocket disconnected');
        state.mqtt.connected = false;
        updateConnectionStatus(false);

        // Reconnect after delay
        setTimeout(() => {
            if (!wsConnection || wsConnection.readyState === WebSocket.CLOSED) {
                connectWebSocket();
            }
        }, 3000);
    };

    wsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus(false, 'WebSocket error');
    };
}

/**
 * Handle messages from backend server
 */
function handleBackendMessage(message) {
    switch (message.type) {
        case 'mqtt_status':
            state.mqtt.connected = message.connected;
            if (message.connected) {
                updateConnectionStatus(true);
                if (elements.positionReportingBtn) {
                    elements.positionReportingBtn.disabled = false;
                }
                if (elements.positionReportingBtnMobile) {
                    elements.positionReportingBtnMobile.disabled = false;
                }
            } else {
                updateConnectionStatus(false, message.error);
                if (elements.positionReportingBtn) {
                    elements.positionReportingBtn.disabled = true;
                }
                if (elements.positionReportingBtnMobile) {
                    elements.positionReportingBtnMobile.disabled = true;
                }
            }
            break;

        case 'mqtt_message':
            handleMQTTMessage(message.topic, message.data);
            break;

        case 'config':
            console.log('Received config from backend:', message.mqtt);
            break;
    }
}

/**
 * Send message to backend via WebSocket
 */
function sendToBackend(message) {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify(message));
        return true;
    }
    console.error('WebSocket not connected');
    return false;
}

/**
 * Handle MQTT topic change - tell backend to subscribe to new topic
 */
function handleTopicChange(newTopic) {
    if (!newTopic || !newTopic.trim()) {
        return;
    }

    const oldTopic = state.mqtt.baseTopic;

    // Update state
    state.mqtt.baseTopic = newTopic;

    // Tell backend to unsubscribe from old topic and subscribe to new one
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        if (oldTopic) {
            sendToBackend({ type: 'unsubscribe', topic: oldTopic });
        }
        sendToBackend({ type: 'subscribe', topic: newTopic });
    }

    // Save to localStorage
    saveCredentials();
}

// ============================================================================
// MQTT Message Handling
// ============================================================================

function handleMQTTMessage(topic, data) {
    try {
        // Update target count from Zigbee2MQTT
        if (data.ld2450_target_count !== undefined) {
            state.sensor.targetCount = data.ld2450_target_count;
            updateTargetCountDisplay();
        }

        // Update occupancy
        if (data.occupancy_ld2450 !== undefined) {
            state.sensor.occupancy = data.occupancy_ld2450;
            updateOccupancyDisplay();
        }

        // Update position reporting status
        if (data.position_reporting !== undefined) {
            state.sensor.positionReporting = data.position_reporting;
            updatePositionReportingButton();
        }

        // Update zone occupancy
        if (data.zone1_occupied !== undefined) {
            state.sensor.zones[0].occupied = data.zone1_occupied;
            if (elements.zone1Status) {
                elements.zone1Status.textContent = data.zone1_occupied ? 'Occupied' : 'Clear';
                elements.zone1Status.classList.toggle('occupied', data.zone1_occupied);
            }
            elements.zone1OccupancyIcon?.classList.toggle('occupied', data.zone1_occupied);
        }
        if (data.zone2_occupied !== undefined) {
            state.sensor.zones[1].occupied = data.zone2_occupied;
            if (elements.zone2Status) {
                elements.zone2Status.textContent = data.zone2_occupied ? 'Occupied' : 'Clear';
                elements.zone2Status.classList.toggle('occupied', data.zone2_occupied);
            }
            elements.zone2OccupancyIcon?.classList.toggle('occupied', data.zone2_occupied);
        }
        if (data.zone3_occupied !== undefined) {
            state.sensor.zones[2].occupied = data.zone3_occupied;
            if (elements.zone3Status) {
                elements.zone3Status.textContent = data.zone3_occupied ? 'Occupied' : 'Clear';
                elements.zone3Status.classList.toggle('occupied', data.zone3_occupied);
            }
            elements.zone3OccupancyIcon?.classList.toggle('occupied', data.zone3_occupied);
        }
        if (data.zone4_occupied !== undefined) {
            state.sensor.zones[3].occupied = data.zone4_occupied;
            if (elements.zone4Status) {
                elements.zone4Status.textContent = data.zone4_occupied ? 'Occupied' : 'Clear';
                elements.zone4Status.classList.toggle('occupied', data.zone4_occupied);
            }
            elements.zone4OccupancyIcon?.classList.toggle('occupied', data.zone4_occupied);
        }
        if (data.zone5_occupied !== undefined) {
            state.sensor.zones[4].occupied = data.zone5_occupied;
            if (elements.zone5Status) {
                elements.zone5Status.textContent = data.zone5_occupied ? 'Occupied' : 'Clear';
                elements.zone5Status.classList.toggle('occupied', data.zone5_occupied);
            }
            elements.zone5OccupancyIcon?.classList.toggle('occupied', data.zone5_occupied);
        }

        // Update position data (Target 1, 2, 3 X/Y/Distance)
        if (data.target1_x !== undefined) state.sensor.positions.t1.x = data.target1_x;
        if (data.target1_y !== undefined) state.sensor.positions.t1.y = data.target1_y;
        if (data.target1_distance !== undefined) state.sensor.positions.t1.distance = data.target1_distance;

        if (data.target2_x !== undefined) state.sensor.positions.t2.x = data.target2_x;
        if (data.target2_y !== undefined) state.sensor.positions.t2.y = data.target2_y;
        if (data.target2_distance !== undefined) state.sensor.positions.t2.distance = data.target2_distance;

        if (data.target3_x !== undefined) state.sensor.positions.t3.x = data.target3_x;
        if (data.target3_y !== undefined) state.sensor.positions.t3.y = data.target3_y;
        if (data.target3_distance !== undefined) state.sensor.positions.t3.distance = data.target3_distance;

        // Build targets array from position data
        updateTargetsFromPositions();

        // Redraw canvas with current targets
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);

    } catch (error) {
        console.error('Error parsing MQTT message:', error);
    }
}

function updateTargetsFromPositions() {
    state.sensor.targets = [];

    // Minimum distance from sensor origin to display target (mm)
    const MIN_DISTANCE = 200;

    // Helper to check if target is valid (non-zero and far enough from sensor)
    const isValidTarget = (x, y) => {
        if (x === 0 && y === 0) return false;
        const distance = Math.sqrt(x * x + y * y);
        return distance >= MIN_DISTANCE;
    };

    // Add target 1 if active and far enough from sensor
    if (isValidTarget(state.sensor.positions.t1.x, state.sensor.positions.t1.y)) {
        state.sensor.targets.push({
            x: state.sensor.positions.t1.x,
            y: state.sensor.positions.t1.y,
            distance: state.sensor.positions.t1.distance,
            speed: 0
        });
    }

    // Add target 2 if active
    if (isValidTarget(state.sensor.positions.t2.x, state.sensor.positions.t2.y)) {
        state.sensor.targets.push({
            x: state.sensor.positions.t2.x,
            y: state.sensor.positions.t2.y,
            distance: state.sensor.positions.t2.distance,
            speed: 0
        });
    }

    // Add target 3 if active
    if (isValidTarget(state.sensor.positions.t3.x, state.sensor.positions.t3.y)) {
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
    if (!state.mqtt.connected) {
        alert('Not connected to MQTT broker');
        return;
    }

    // Toggle the state
    const newState = !state.sensor.positionReporting;

    // Publish to set topic via backend
    const topic = `${state.mqtt.baseTopic}/set`;
    const success = sendToBackend({
        type: 'publish',
        topic: topic,
        payload: { position_reporting: newState }
    });

    if (success) {
        // Optimistically update local state and UI
        state.sensor.positionReporting = newState;
        updatePositionReportingButton();
    } else {
        alert('Failed to toggle position reporting');
    }
}

function publishZoneConfig() {
    if (!state.mqtt.connected) {
        alert('Not connected to MQTT broker');
        return;
    }

    // Check if any zones are enabled
    const enabledZones = state.zones.zones.filter(z => z.enabled);

    // Warn if zones are configured but zone mode is Off
    if (enabledZones.length > 0 && state.zones.type === 0) {
        const proceed = confirm(
            'Warning: Zone Mode is set to "Off".\n\n' +
            'With Zone Mode off, zone occupancy will NOT be reported even though you have zones configured.\n\n' +
            'To enable zone-based occupancy detection:\n' +
            '• Set Zone Mode to "Include" to detect only INSIDE zones\n' +
            '• Set Zone Mode to "Exclude" to detect only OUTSIDE zones\n\n' +
            'Click OK to apply anyway, or Cancel to go back and change Zone Mode.'
        );
        if (!proceed) return;
    }

    // Warn if zone mode is set but no zones are enabled
    if (enabledZones.length === 0 && state.zones.type !== 0) {
        alert('Warning: Zone Mode is set but no zones are configured.\n\nDraw at least one zone on the map first.');
        return;
    }

    // Build zone configuration message wrapped in zone_config object
    // Z2M converter expects { zone_config: { zone_type, zone1_enabled, zone1_type, ... } }
    const config = {
        zone_config: {
            zone_type: state.zones.type,
            zone1_enabled: state.zones.zones[0].enabled,
            zone1_type: state.zones.zones[0].zoneType || 'detection',
            zone1_x1: state.zones.zones[0].x1,
            zone1_y1: state.zones.zones[0].y1,
            zone1_x2: state.zones.zones[0].x2,
            zone1_y2: state.zones.zones[0].y2,
            zone2_enabled: state.zones.zones[1].enabled,
            zone2_type: state.zones.zones[1].zoneType || 'detection',
            zone2_x1: state.zones.zones[1].x1,
            zone2_y1: state.zones.zones[1].y1,
            zone2_x2: state.zones.zones[1].x2,
            zone2_y2: state.zones.zones[1].y2,
            zone3_enabled: state.zones.zones[2].enabled,
            zone3_type: state.zones.zones[2].zoneType || 'detection',
            zone3_x1: state.zones.zones[2].x1,
            zone3_y1: state.zones.zones[2].y1,
            zone3_x2: state.zones.zones[2].x2,
            zone3_y2: state.zones.zones[2].y2,
            zone4_enabled: state.zones.zones[3].enabled,
            zone4_type: state.zones.zones[3].zoneType || 'detection',
            zone4_x1: state.zones.zones[3].x1,
            zone4_y1: state.zones.zones[3].y1,
            zone4_x2: state.zones.zones[3].x2,
            zone4_y2: state.zones.zones[3].y2,
            zone5_enabled: state.zones.zones[4].enabled,
            zone5_type: state.zones.zones[4].zoneType || 'detection',
            zone5_x1: state.zones.zones[4].x1,
            zone5_y1: state.zones.zones[4].y1,
            zone5_x2: state.zones.zones[4].x2,
            zone5_y2: state.zones.zones[4].y2
        }
    };

    // Publish to set topic via backend
    const topic = `${state.mqtt.baseTopic}/set`;
    console.log('[ZONE CONFIG] Publishing to:', topic);
    console.log('[ZONE CONFIG] Payload:', JSON.stringify(config, null, 2));

    const success = sendToBackend({
        type: 'publish',
        topic: topic,
        payload: config
    });

    if (success) {
        const zoneModeNames = ['Off', 'Include', 'Exclude'];
        const zoneDescriptions = enabledZones.map((_, i) => {
            const zoneNum = state.zones.zones.findIndex(z => z === enabledZones[i]) + 1;
            return `Zone ${zoneNum}`;
        }).join(', ');
        alert(
            `Zone configuration applied!\n\n` +
            `Mode: ${zoneModeNames[state.zones.type]}\n` +
            `Enabled: ${zoneDescriptions || 'None'}\n\n` +
            `Check serial output for firmware confirmation.`
        );
    } else {
        alert('Failed to apply zone configuration');
    }
}

// ============================================================================
// LocalStorage Functions
// ============================================================================

function saveCredentials() {
    // Only save room name and topic - broker settings come from addon config
    const settings = {
        baseTopic: elements.mqttTopic.value,
        roomName: elements.roomName.value
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadCredentials() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const settings = JSON.parse(saved);
            if (settings.baseTopic) {
                elements.mqttTopic.value = settings.baseTopic;
                state.mqtt.baseTopic = settings.baseTopic; // Also update state!
            }
            if (settings.roomName) elements.roomName.value = settings.roomName;
        }
    } catch (error) {
        console.error('Error loading credentials:', error);
    }
}

// ============================================================================
// Sensor Configuration Functions
// ============================================================================

/**
 * Populate the sensor selector dropdown with saved rooms
 */
function populateSensorSelector() {
    const savedRooms = storageManager.getSavedSensors();

    // Clear existing options except the placeholder
    elements.sensorSelector.innerHTML = '<option value="">-- Select a saved room --</option>';

    // Add "Create new room" option
    const createOption = document.createElement('option');
    createOption.value = '__create_new__';
    createOption.textContent = '+ Create new room';
    elements.sensorSelector.appendChild(createOption);

    // Add separator if there are saved rooms
    if (savedRooms.length > 0) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '───────────────';
        elements.sensorSelector.appendChild(separator);
    }

    // Add saved rooms
    savedRooms.forEach(roomName => {
        const option = document.createElement('option');
        option.value = roomName;
        option.textContent = roomName;
        elements.sensorSelector.appendChild(option);
    });

    // Select current room if it exists in saved rooms
    const currentRoom = elements.roomName.value;
    if (currentRoom && savedRooms.includes(currentRoom)) {
        elements.sensorSelector.value = currentRoom;
    }
}

/**
 * Load configuration for a specific room
 */
function loadSensorConfig(roomName) {
    const config = storageManager.getSensorConfig(roomName);

    if (config) {
        // Load zones with migration for old format
        state.zones = storageManager.migrateZoneConfig(config.zones);

        // Load annotations (with edges support)
        const annotations = config.annotations || storageManager.getDefaultAnnotations();
        state.annotations = {
            furniture: annotations.furniture || [],
            entrances: annotations.entrances || [],
            edges: annotations.edges || []
        };

        // Load MQTT topic if saved with the config - trigger reconnect
        if (config.mqttTopic && config.mqttTopic !== elements.mqttTopic.value) {
            elements.mqttTopic.value = config.mqttTopic;
            handleTopicChange(config.mqttTopic);
        }

        // Load map rotation
        if (config.mapRotation !== undefined) {
            state.ui.mapRotation = config.mapRotation;
            radarCanvas.setMapRotation(config.mapRotation);
        }
    } else {
        // Reset to defaults
        state.zones = storageManager.getDefaultZoneConfig();
        state.annotations = storageManager.getDefaultAnnotations();
        state.ui.mapRotation = 0;
        radarCanvas.setMapRotation(0);
    }

    // Update UI
    loadZoneFormValues();
    radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
}

/**
 * Save current configuration for the current room
 */
async function saveCurrentSensorConfig() {
    const roomName = elements.roomName.value;
    if (!roomName) {
        return false;
    }

    await storageManager.saveSensorConfig(roomName, {
        zones: state.zones,
        annotations: state.annotations,
        mqttTopic: elements.mqttTopic.value,
        mapRotation: state.ui.mapRotation
    });

    // Refresh sensor selector
    populateSensorSelector();
    return true;
}

/**
 * Manually save room configuration with visual feedback
 */
async function saveRoomManually() {
    const roomName = elements.roomName.value.trim();

    if (!roomName) {
        alert('Please enter a room name before saving.');
        elements.roomName.focus();
        return;
    }

    // Update the room name in the input (in case it was trimmed)
    elements.roomName.value = roomName;

    // Save the configuration
    const saved = await saveCurrentSensorConfig();

    if (saved) {
        // Visual feedback on the save button
        const btn = elements.saveRoomBtn;
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M20 6L9 17l-5-5"/>
            </svg>
            Saved!
        `;
        btn.disabled = true;

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }, 1500);
    }
}

/**
 * Delete room configuration
 */
async function deleteRoom() {
    const roomName = elements.roomName.value.trim();

    if (!roomName) {
        alert('Please enter or select a room name to delete.');
        return;
    }

    // Check if room exists
    if (!storageManager.hasSensorConfig(roomName)) {
        alert(`No saved configuration found for "${roomName}".`);
        return;
    }

    // Confirm deletion
    if (!confirm(`Are you sure you want to delete the configuration for "${roomName}"?\n\nThis cannot be undone.`)) {
        return;
    }

    // Delete the configuration
    await storageManager.deleteSensorConfig(roomName);

    // Clear current state
    elements.roomName.value = '';
    state.zones = storageManager.getDefaultZoneConfig();
    state.annotations = storageManager.getDefaultAnnotations();

    // Update UI
    populateSensorSelector();
    loadZoneFormValues();
    radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
}

/**
 * Handle room selector change
 */
function handleSensorSelection(event) {
    const selectedRoom = event.target.value;

    if (!selectedRoom) return;

    // Handle "Create new room" option
    if (selectedRoom === '__create_new__') {
        // Clear the form for new room
        elements.roomName.value = '';
        elements.roomName.focus();

        // Reset to default zone config
        state.zones = storageManager.getDefaultZoneConfig();
        state.annotations = storageManager.getDefaultAnnotations();
        state.ui.mapRotation = 0;
        radarCanvas.setMapRotation(0);

        // Update UI
        loadZoneFormValues();
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);

        // Reset selector to placeholder
        elements.sensorSelector.value = '';
        return;
    }

    // Update the room name input
    elements.roomName.value = selectedRoom;

    // Load the configuration for this room
    loadSensorConfig(selectedRoom);
}

// ============================================================================
// UI Update Functions
// ============================================================================

function updateConnectionStatus(connected, errorMessage = null) {
    if (connected) {
        elements.mqttStatus.classList.add('online');
        elements.mqttStatusText.textContent = 'Connected to MQTT';
        elements.mqttStatusText.title = '';
    } else {
        elements.mqttStatus.classList.remove('online');
        if (errorMessage) {
            elements.mqttStatusText.textContent = 'Connection failed';
            elements.mqttStatusText.title = errorMessage;
            console.error('MQTT connection error:', errorMessage);
        } else {
            elements.mqttStatusText.textContent = 'Disconnected from MQTT';
            elements.mqttStatusText.title = '';
        }
    }
}

function updateTargetCountDisplay() {
    elements.targetCount.textContent = state.sensor.targetCount;
}

function updateOccupancyDisplay() {
    elements.occupancy.textContent = state.sensor.occupancy ? 'Occupied' : 'Clear';
    elements.occupancy.style.color = state.sensor.occupancy ? '#3fb950' : '#8b949e';
    elements.occupancyIcon?.classList.toggle('occupied', state.sensor.occupancy);
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
    // Update desktop button
    if (elements.positionReportingBtn) {
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

    // Update mobile button
    if (elements.positionReportingBtnMobile) {
        const btnText = elements.positionReportingBtnMobile.querySelector('.btn-text');
        if (state.sensor.positionReporting) {
            elements.positionReportingBtnMobile.classList.add('btn-warning');
            elements.positionReportingBtnMobile.classList.remove('btn-purple');
            elements.positionReportingBtnMobile.title = 'Disable Position Reporting';
            if (btnText) btnText.textContent = 'Disable Position Reporting';
        } else {
            elements.positionReportingBtnMobile.classList.remove('btn-warning');
            elements.positionReportingBtnMobile.classList.add('btn-purple');
            elements.positionReportingBtnMobile.title = 'Enable Position Reporting';
            if (btnText) btnText.textContent = 'Enable Position Reporting';
        }
    }
}

function loadZoneFormValues() {
    // Zone Type
    elements.zoneType.value = state.zones.type;

    // Zone 1 (hidden inputs use .value)
    elements.zone1Enable.value = state.zones.zones[0].enabled;
    elements.zone1X1.value = state.zones.zones[0].x1;
    elements.zone1Y1.value = state.zones.zones[0].y1;
    elements.zone1X2.value = state.zones.zones[0].x2;
    elements.zone1Y2.value = state.zones.zones[0].y2;
    if (elements.zone1Type) {
        elements.zone1Type.value = state.zones.zones[0].zoneType || 'detection';
    }

    // Zone 2 (hidden inputs use .value)
    elements.zone2Enable.value = state.zones.zones[1].enabled;
    elements.zone2X1.value = state.zones.zones[1].x1;
    elements.zone2Y1.value = state.zones.zones[1].y1;
    elements.zone2X2.value = state.zones.zones[1].x2;
    elements.zone2Y2.value = state.zones.zones[1].y2;
    if (elements.zone2Type) {
        elements.zone2Type.value = state.zones.zones[1].zoneType || 'detection';
    }

    // Zone 3 (hidden inputs use .value)
    elements.zone3Enable.value = state.zones.zones[2].enabled;
    elements.zone3X1.value = state.zones.zones[2].x1;
    elements.zone3Y1.value = state.zones.zones[2].y1;
    elements.zone3X2.value = state.zones.zones[2].x2;
    elements.zone3Y2.value = state.zones.zones[2].y2;
    if (elements.zone3Type) {
        elements.zone3Type.value = state.zones.zones[2].zoneType || 'detection';
    }

    // Zone 4 (hidden inputs use .value)
    elements.zone4Enable.value = state.zones.zones[3].enabled;
    elements.zone4X1.value = state.zones.zones[3].x1;
    elements.zone4Y1.value = state.zones.zones[3].y1;
    elements.zone4X2.value = state.zones.zones[3].x2;
    elements.zone4Y2.value = state.zones.zones[3].y2;
    if (elements.zone4Type) {
        elements.zone4Type.value = state.zones.zones[3].zoneType || 'detection';
    }

    // Zone 5 (hidden inputs use .value)
    elements.zone5Enable.value = state.zones.zones[4].enabled;
    elements.zone5X1.value = state.zones.zones[4].x1;
    elements.zone5Y1.value = state.zones.zones[4].y1;
    elements.zone5X2.value = state.zones.zones[4].x2;
    elements.zone5Y2.value = state.zones.zones[4].y2;
    if (elements.zone5Type) {
        elements.zone5Type.value = state.zones.zones[4].zoneType || 'detection';
    }

    // Update zone cards UI
    updateZoneCards();
}

function saveZoneFormValues() {
    // Zone Type
    state.zones.type = parseInt(elements.zoneType.value);

    // Note: Zone enabled status is now managed by the drawing system, not form inputs
    // Hidden inputs just store current state for compatibility

    // Zone 1 - preserve shapeType and vertices
    state.zones.zones[0].x1 = parseInt(elements.zone1X1.value) || 0;
    state.zones.zones[0].y1 = parseInt(elements.zone1Y1.value) || 0;
    state.zones.zones[0].x2 = parseInt(elements.zone1X2.value) || 0;
    state.zones.zones[0].y2 = parseInt(elements.zone1Y2.value) || 0;
    if (!state.zones.zones[0].shapeType) state.zones.zones[0].shapeType = 'rectangle';
    if (state.zones.zones[0].vertices === undefined) state.zones.zones[0].vertices = null;

    // Zone 2 - preserve shapeType and vertices
    state.zones.zones[1].x1 = parseInt(elements.zone2X1.value) || 0;
    state.zones.zones[1].y1 = parseInt(elements.zone2Y1.value) || 0;
    state.zones.zones[1].x2 = parseInt(elements.zone2X2.value) || 0;
    state.zones.zones[1].y2 = parseInt(elements.zone2Y2.value) || 0;
    if (!state.zones.zones[1].shapeType) state.zones.zones[1].shapeType = 'rectangle';
    if (state.zones.zones[1].vertices === undefined) state.zones.zones[1].vertices = null;

    // Zone 3 - preserve shapeType and vertices
    state.zones.zones[2].x1 = parseInt(elements.zone3X1.value) || 0;
    state.zones.zones[2].y1 = parseInt(elements.zone3Y1.value) || 0;
    state.zones.zones[2].x2 = parseInt(elements.zone3X2.value) || 0;
    state.zones.zones[2].y2 = parseInt(elements.zone3Y2.value) || 0;
    if (!state.zones.zones[2].shapeType) state.zones.zones[2].shapeType = 'rectangle';
    if (state.zones.zones[2].vertices === undefined) state.zones.zones[2].vertices = null;

    // Zone 4 - preserve shapeType and vertices
    state.zones.zones[3].x1 = parseInt(elements.zone4X1.value) || 0;
    state.zones.zones[3].y1 = parseInt(elements.zone4Y1.value) || 0;
    state.zones.zones[3].x2 = parseInt(elements.zone4X2.value) || 0;
    state.zones.zones[3].y2 = parseInt(elements.zone4Y2.value) || 0;
    if (!state.zones.zones[3].shapeType) state.zones.zones[3].shapeType = 'rectangle';
    if (state.zones.zones[3].vertices === undefined) state.zones.zones[3].vertices = null;

    // Zone 5 - preserve shapeType and vertices
    state.zones.zones[4].x1 = parseInt(elements.zone5X1.value) || 0;
    state.zones.zones[4].y1 = parseInt(elements.zone5Y1.value) || 0;
    state.zones.zones[4].x2 = parseInt(elements.zone5X2.value) || 0;
    state.zones.zones[4].y2 = parseInt(elements.zone5Y2.value) || 0;
    if (!state.zones.zones[4].shapeType) state.zones.zones[4].shapeType = 'rectangle';
    if (state.zones.zones[4].vertices === undefined) state.zones.zones[4].vertices = null;

    // Redraw canvas with updated zones
    radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
}

function resetZones() {
    if (confirm('Reset all zones to default values?')) {
        state.zones = storageManager.getDefaultZoneConfig();
        state.annotations = storageManager.getDefaultAnnotations();
        loadZoneFormValues();
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
    }
}

function clearZone(zoneIndex) {
    // Reset zone to default (disabled, zeroed coordinates)
    state.zones.zones[zoneIndex] = {
        enabled: false,
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        type: 'detection'
    };

    // Update form values
    loadZoneFormValues();

    // Redraw canvas
    radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);

    // Trigger auto-save
    debouncedSave();
}

// ============================================================================
// Event Listeners
// ============================================================================

// Note: Connect button removed - MQTT auto-connects on start

// MQTT Topic Change - auto-reconnect when topic changes
if (elements.mqttTopic) {
    elements.mqttTopic.addEventListener('change', (e) => {
        handleTopicChange(e.target.value);
    });
}

// Zone Type Change
elements.zoneType.addEventListener('change', () => {
    saveZoneFormValues();
});

// Zone Input Changes (live preview)
const zoneInputs = [
    elements.zone1Enable, elements.zone1X1, elements.zone1Y1, elements.zone1X2, elements.zone1Y2,
    elements.zone2Enable, elements.zone2X1, elements.zone2Y1, elements.zone2X2, elements.zone2Y2,
    elements.zone3Enable, elements.zone3X1, elements.zone3Y1, elements.zone3X2, elements.zone3Y2,
    elements.zone4Enable, elements.zone4X1, elements.zone4Y1, elements.zone4X2, elements.zone4Y2,
    elements.zone5Enable, elements.zone5X1, elements.zone5Y1, elements.zone5X2, elements.zone5Y2
];

zoneInputs.forEach(input => {
    input.addEventListener('input', () => {
        saveZoneFormValues();
    });
});

// Zone Type Selectors - update zone type and redraw
[elements.zone1Type, elements.zone2Type, elements.zone3Type, elements.zone4Type, elements.zone5Type].forEach((select, index) => {
    if (select) {
        select.addEventListener('change', (e) => {
            state.zones.zones[index].zoneType = e.target.value;
            radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
            triggerAutoSave();
        });
        // Prevent click from bubbling to zone card
        select.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
});

// Apply Zones Button
elements.applyZonesBtn.addEventListener('click', async () => {
    saveZoneFormValues();
    await saveCurrentSensorConfig(); // Save to server
    publishZoneConfig(); // Send to sensor via MQTT
});

// Reset Zones Button
elements.resetZonesBtn.addEventListener('click', resetZones);

// Clear Zone Buttons
if (elements.zone1ClearBtn) elements.zone1ClearBtn.addEventListener('click', (e) => { e.stopPropagation(); clearZone(0); });
if (elements.zone2ClearBtn) elements.zone2ClearBtn.addEventListener('click', (e) => { e.stopPropagation(); clearZone(1); });
if (elements.zone3ClearBtn) elements.zone3ClearBtn.addEventListener('click', (e) => { e.stopPropagation(); clearZone(2); });
if (elements.zone4ClearBtn) elements.zone4ClearBtn.addEventListener('click', (e) => { e.stopPropagation(); clearZone(3); });
if (elements.zone5ClearBtn) elements.zone5ClearBtn.addEventListener('click', (e) => { e.stopPropagation(); clearZone(4); });

// Position Reporting Toggle Button
if (elements.positionReportingBtn) {
    elements.positionReportingBtn.addEventListener('click', togglePositionReporting);
}

// Mobile Position Reporting Toggle Button
if (elements.positionReportingBtnMobile) {
    elements.positionReportingBtnMobile.addEventListener('click', togglePositionReporting);
}

// Sensor Selector
if (elements.sensorSelector) {
    elements.sensorSelector.addEventListener('change', handleSensorSelection);
}

// Save Room Button
if (elements.saveRoomBtn) {
    elements.saveRoomBtn.addEventListener('click', saveRoomManually);
}

// Delete Room Button
if (elements.deleteRoomBtn) {
    elements.deleteRoomBtn.addEventListener('click', deleteRoom);
}

// Mobile Scroll Arrows for Objects Sidebar
if (elements.scrollLeft && elements.scrollRight && elements.furnitureGrid) {
    const scrollAmount = 150; // pixels to scroll

    elements.scrollLeft.addEventListener('click', () => {
        elements.furnitureGrid.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    });

    elements.scrollRight.addEventListener('click', () => {
        elements.furnitureGrid.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    });

    // Update arrow states based on scroll position
    function updateScrollArrows() {
        const grid = elements.furnitureGrid;
        const atStart = grid.scrollLeft <= 0;
        const atEnd = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 1;

        elements.scrollLeft.disabled = atStart;
        elements.scrollRight.disabled = atEnd;
    }

    elements.furnitureGrid.addEventListener('scroll', updateScrollArrows);
    // Initial state
    setTimeout(updateScrollArrows, 100);
}

// Toolbar Buttons
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        const furniture = btn.dataset.furniture;

        if (mode === 'place-furniture' && furniture) {
            state.canvas.placingFurniture = furniture;
            drawingManager.setMode('place-furniture');
        } else if (mode) {
            state.canvas.placingFurniture = null;
            drawingManager.setMode(mode);
        }
    });
});

// Shape Action Buttons
if (elements.moveShapeBtn) {
    elements.moveShapeBtn.addEventListener('click', moveSelectedShape);
}
if (elements.rotateShapeBtn) {
    elements.rotateShapeBtn.addEventListener('click', rotateSelectedShape);
}
if (elements.increaseSizeBtn) {
    elements.increaseSizeBtn.addEventListener('click', () => resizeSelectedShape(1.1));
}
if (elements.decreaseSizeBtn) {
    elements.decreaseSizeBtn.addEventListener('click', () => resizeSelectedShape(0.9));
}
if (elements.deleteShapeBtn) {
    elements.deleteShapeBtn.addEventListener('click', deleteSelectedShape);
}

// Done Button - finish placement mode
if (elements.doneBtn) {
    elements.doneBtn.addEventListener('click', finishPlacement);
}

// Map Rotate Button
if (elements.rotateMapBtn) {
    elements.rotateMapBtn.addEventListener('click', rotateMap);
}

// Zone Cards - click to select zone on canvas, or start drawing if not configured
elements.zoneCards.forEach((card, index) => {
    card.addEventListener('click', () => {
        const zone = state.zones.zones[index];
        if (zone.enabled) {
            // Zone exists - select it
            drawingManager.setMode('select');
            drawingManager.selectedZoneIndex = index;
            drawingManager.clearOtherSelections('zone');
            radarCanvas.setSelectedZone(index);
            radarCanvas.setSelectedFurniture(null);
            radarCanvas.setSelectedEntrance(null);
            selectedItemType = 'zone';
            selectedItemIndex = index;
            updateZoneCardSelection(index);
            showShapeActions(zone);
            radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
        } else {
            // Zone not configured - show helpful message and highlight the drawing tools
            updateZoneCardSelection(index);
            // Flash the drawing tools to guide user
            const rectangleTool = document.querySelector('[data-mode="draw-rectangle"]');
            const polygonTool = document.querySelector('[data-mode="draw-polygon"]');
            if (rectangleTool && polygonTool) {
                rectangleTool.classList.add('highlight');
                polygonTool.classList.add('highlight');
                setTimeout(() => {
                    rectangleTool.classList.remove('highlight');
                    polygonTool.classList.remove('highlight');
                }, 1500);
            }
        }
    });
});

// ============================================================================
// Dark Mode Toggle
// ============================================================================

const THEME_STORAGE_KEY = 'shs_z2m_theme';

function initTheme() {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
    // Default is dark mode (no data-theme attribute needed)
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? null : 'light';

    if (newTheme) {
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem(THEME_STORAGE_KEY);
    }
}

// Dark Mode Toggle Button
if (elements.darkModeToggle) {
    elements.darkModeToggle.addEventListener('click', toggleTheme);
}

// Furniture Sidebar Items - Click to place
document.querySelectorAll('.furniture-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        const furniture = btn.dataset.furniture;

        // Remove active class from all furniture items
        document.querySelectorAll('.furniture-item').forEach(b => b.classList.remove('active'));

        if (mode === 'place-furniture' && furniture) {
            btn.classList.add('active');
            state.canvas.placingFurniture = furniture;
            drawingManager.setMode('place-furniture');
        }
    });

    // Make furniture items draggable
    btn.setAttribute('draggable', 'true');
    btn.addEventListener('dragstart', (e) => {
        const furniture = btn.dataset.furniture;
        if (furniture) {
            e.dataTransfer.setData('furniture-type', furniture);
            e.dataTransfer.effectAllowed = 'copy';
        }
    });
});

// Canvas drag-drop for furniture placement
if (elements.radarCanvas) {
    elements.radarCanvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    elements.radarCanvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const furnitureType = e.dataTransfer.getData('furniture-type');
        if (!furnitureType || !radarCanvas) return;

        // Get canvas coordinates from drop position
        const rect = elements.radarCanvas.getBoundingClientRect();
        const scaleX = elements.radarCanvas.width / rect.width;
        const scaleY = elements.radarCanvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;

        // Convert to sensor coordinates (accounting for map rotation)
        const cx = radarCanvas.width / 2;
        const cy = radarCanvas.height / 2;
        const rotation = radarCanvas.mapRotation || 0;
        const angle = -rotation * Math.PI / 180;
        const dx = canvasX - cx;
        const dy = canvasY - cy;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const unrotatedX = cx + dx * cos - dy * sin;
        const unrotatedY = cy + dx * sin + dy * cos;
        const sensorX = radarCanvas.toSensorX(unrotatedX);
        const sensorY = radarCanvas.toSensorY(unrotatedY);

        // Get default size for this furniture type
        const sizes = {
            chair: { width: 700, height: 700 },
            'dining-chair': { width: 450, height: 450 },
            sofa: { width: 1800, height: 800 },
            bed: { width: 2000, height: 1500 },
            table: { width: 1200, height: 800 },
            desk: { width: 1400, height: 700 },
            'bedside-table': { width: 500, height: 500 },
            cabinet: { width: 800, height: 500 },
            drawers: { width: 800, height: 500 },
            wardrobe: { width: 1200, height: 600 },
            tv: { width: 1400, height: 200 },
            speaker: { width: 400, height: 600 },
            fridge: { width: 700, height: 700 },
            radiator: { width: 1000, height: 200 },
            fan: { width: 500, height: 500 },
            window: { width: 1200, height: 200 },
            lamp: { width: 350, height: 350 },
            plant: { width: 400, height: 400 }
        };
        const size = sizes[furnitureType] || { width: 500, height: 500 };

        // Create furniture at drop location
        const mapRotation = radarCanvas.mapRotation || 0;
        const furniture = {
            id: `furniture_${Date.now()}`,
            type: furnitureType,
            x: Math.round(sensorX / 100) * 100,
            y: Math.round(sensorY / 100) * 100,
            rotation: mapRotation,
            width: size.width,
            height: size.height
        };

        state.annotations.furniture.push(furniture);
        storageManager.saveAnnotations(state.annotations);
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
    });
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
    console.log('[INIT] Starting application...');

    // Initialize theme before anything else
    initTheme();

    // Immediately update status to show JS is running
    if (elements.mqttStatusText) {
        elements.mqttStatusText.textContent = 'Initializing...';
    }

    // Initialize storage manager (loads configs from server)
    console.log('[INIT] Initializing storage manager...');
    await storageManager.init();

    // Load saved room name from localStorage
    loadCredentials();

    // Populate sensor selector with saved rooms
    populateSensorSelector();

    // Try to load config for current room name
    const currentRoom = elements.roomName.value;
    if (currentRoom && storageManager.hasSensorConfig(currentRoom)) {
        loadSensorConfig(currentRoom);
    } else {
        // Load initial form values from state
        loadZoneFormValues();
    }

    // Update zone cards UI
    updateZoneCards();

    // Draw initial canvas state
    radarCanvas.drawFrame([], state.zones.zones, state.annotations);

    // Start animation loop for canvas
    function animate() {
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones, state.annotations);
        requestAnimationFrame(animate);
    }
    animate();

    // Connect to backend WebSocket server
    try {
        console.log('[INIT] Connecting to WebSocket...');
        connectWebSocket();
    } catch (error) {
        console.error('[INIT] WebSocket connection error:', error);
        elements.mqttStatusText.textContent = 'WebSocket error';
    }

    // Update UI based on topic state
    const topic = elements.mqttTopic.value;
    if (!topic || !topic.trim()) {
        elements.mqttStatusText.textContent = 'Enter MQTT topic to connect';
        elements.mqttStatus.classList.remove('online');
    }

    console.log('[INIT] Initialization complete');
}

// Start application
init().catch(error => {
    console.error('[INIT] Fatal error:', error);
});
