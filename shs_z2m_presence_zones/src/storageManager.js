/**
 * StorageManager - Handles per-sensor configuration persistence
 * Stores zone configurations and annotations per MQTT topic
 */

const SENSOR_CONFIGS_KEY = 'ld2450_sensor_configs';
const MQTT_CREDENTIALS_KEY = 'ld2450_zone_config_settings';

export class StorageManager {
    constructor() {
        this.configs = this.loadAllConfigs();
    }

    /**
     * Load all sensor configurations from localStorage
     */
    loadAllConfigs() {
        try {
            const saved = localStorage.getItem(SENSOR_CONFIGS_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (error) {
            console.error('Error loading sensor configs:', error);
        }
        return {};
    }

    /**
     * Save all configurations to localStorage
     */
    saveAllConfigs() {
        try {
            localStorage.setItem(SENSOR_CONFIGS_KEY, JSON.stringify(this.configs));
        } catch (error) {
            console.error('Error saving sensor configs:', error);
        }
    }

    /**
     * Get configuration for a specific room
     * @param {string} roomName - Room name (e.g., 'Living Room')
     * @returns {object|null} - Room configuration or null if not found
     */
    getSensorConfig(roomName) {
        return this.configs[roomName] || null;
    }

    /**
     * Save configuration for a specific room
     * @param {string} roomName - Room name
     * @param {object} config - Configuration object containing zones, annotations, and mqttTopic
     */
    saveSensorConfig(roomName, config) {
        this.configs[roomName] = {
            zones: config.zones || {
                type: 0,
                zones: [
                    { enabled: false, shapeType: 'rectangle', x1: -1500, y1: 0, x2: 1500, y2: 3000, vertices: null, zoneType: 'detection' },
                    { enabled: false, shapeType: 'rectangle', x1: -1500, y1: 0, x2: 1500, y2: 3000, vertices: null, zoneType: 'detection' },
                    { enabled: false, shapeType: 'rectangle', x1: -1500, y1: 0, x2: 1500, y2: 3000, vertices: null, zoneType: 'detection' }
                ]
            },
            annotations: config.annotations || {
                furniture: [],
                entrances: [],
                edges: []
            },
            mqttTopic: config.mqttTopic || '',
            mapRotation: config.mapRotation || 0,
            lastModified: new Date().toISOString()
        };
        this.saveAllConfigs();
    }

    /**
     * Delete configuration for a specific room
     * @param {string} roomName - Room name
     */
    deleteSensorConfig(roomName) {
        if (this.configs[roomName]) {
            delete this.configs[roomName];
            this.saveAllConfigs();
        }
    }

    /**
     * Get list of all saved room names
     * @returns {string[]} - Array of room names with saved configurations
     */
    getSavedSensors() {
        return Object.keys(this.configs);
    }

    /**
     * Check if a room has a saved configuration
     * @param {string} roomName - Room name
     * @returns {boolean}
     */
    hasSensorConfig(roomName) {
        return !!this.configs[roomName];
    }

    /**
     * Get default zone configuration
     * @returns {object}
     */
    getDefaultZoneConfig() {
        return {
            type: 0,
            zones: [
                { enabled: false, shapeType: 'rectangle', x1: -1500, y1: 0, x2: 1500, y2: 3000, vertices: null, zoneType: 'detection' },
                { enabled: false, shapeType: 'rectangle', x1: -1500, y1: 0, x2: 1500, y2: 3000, vertices: null, zoneType: 'detection' },
                { enabled: false, shapeType: 'rectangle', x1: -1500, y1: 0, x2: 1500, y2: 3000, vertices: null, zoneType: 'detection' }
            ]
        };
    }

    /**
     * Get default annotations
     * @returns {object}
     */
    getDefaultAnnotations() {
        return {
            furniture: [],
            entrances: [],
            edges: []
        };
    }

    /**
     * Migrate old zone format to new format with shapeType and vertices
     * @param {object} zones - Old zone configuration
     * @returns {object} - Migrated zone configuration
     */
    migrateZoneConfig(zones) {
        if (!zones || !zones.zones) {
            return this.getDefaultZoneConfig();
        }

        return {
            type: zones.type || 0,
            zones: zones.zones.map(zone => ({
                enabled: zone.enabled || false,
                shapeType: zone.shapeType || 'rectangle',
                x1: zone.x1 !== undefined ? zone.x1 : -1500,
                y1: zone.y1 !== undefined ? zone.y1 : 0,
                x2: zone.x2 !== undefined ? zone.x2 : 1500,
                y2: zone.y2 !== undefined ? zone.y2 : 3000,
                vertices: zone.vertices || null,
                zoneType: zone.zoneType || 'detection'
            }))
        };
    }

    /**
     * Export all configurations as JSON string (for backup)
     * @returns {string}
     */
    exportConfigs() {
        return JSON.stringify(this.configs, null, 2);
    }

    /**
     * Import configurations from JSON string
     * @param {string} jsonString
     * @returns {boolean} - Success status
     */
    importConfigs(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.configs = { ...this.configs, ...imported };
            this.saveAllConfigs();
            return true;
        } catch (error) {
            console.error('Error importing configs:', error);
            return false;
        }
    }
}
