/**
 * StorageManager - Handles per-sensor configuration persistence
 * Uses server-side storage API for cross-device synchronization
 * Falls back to localStorage for development/non-addon mode
 */

const SENSOR_CONFIGS_KEY = 'ld2450_sensor_configs';

export class StorageManager {
    constructor() {
        this.configs = {};
        this.initialized = false;
        this.useServerStorage = true; // Will be set to false if server API is unavailable
    }

    /**
     * Get the base path for API calls (handles HA ingress path)
     */
    getBasePath() {
        let basePath = window.location.pathname;
        if (basePath.endsWith('/')) {
            basePath = basePath.slice(0, -1);
        }
        return basePath;
    }

    /**
     * Initialize storage manager - load configs from server
     * @returns {Promise<void>}
     */
    async init() {
        if (this.initialized) return;

        try {
            // Try to load from server
            const response = await fetch(`${this.getBasePath()}/api/rooms-all`);
            if (response.ok) {
                const data = await response.json();
                this.configs = data.configs || {};
                console.log(`[StorageManager] Loaded ${Object.keys(this.configs).length} rooms from server`);
                this.useServerStorage = true;
            } else {
                throw new Error(`Server returned ${response.status}`);
            }
        } catch (error) {
            console.warn('[StorageManager] Server storage unavailable, falling back to localStorage:', error.message);
            this.useServerStorage = false;
            this.configs = this.loadFromLocalStorage();
        }

        this.initialized = true;
    }

    /**
     * Load configs from localStorage (fallback for development)
     */
    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem(SENSOR_CONFIGS_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (error) {
            console.error('Error loading sensor configs from localStorage:', error);
        }
        return {};
    }

    /**
     * Save configs to localStorage (fallback for development)
     */
    saveToLocalStorage() {
        try {
            localStorage.setItem(SENSOR_CONFIGS_KEY, JSON.stringify(this.configs));
        } catch (error) {
            console.error('Error saving sensor configs to localStorage:', error);
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
     * @returns {Promise<boolean>} - Success status
     */
    async saveSensorConfig(roomName, config) {
        const configData = {
            zones: config.zones || this.getDefaultZoneConfig(),
            annotations: config.annotations || this.getDefaultAnnotations(),
            mqttTopic: config.mqttTopic || '',
            mapRotation: config.mapRotation || 0,
            lastModified: new Date().toISOString()
        };

        // Update local cache immediately for responsiveness
        this.configs[roomName] = configData;

        if (this.useServerStorage) {
            try {
                const response = await fetch(`${this.getBasePath()}/api/rooms/${encodeURIComponent(roomName)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(configData)
                });

                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}`);
                }

                console.log(`[StorageManager] Saved room "${roomName}" to server`);
                return true;
            } catch (error) {
                console.error(`[StorageManager] Failed to save to server:`, error.message);
                // Fall back to localStorage
                this.saveToLocalStorage();
                return false;
            }
        } else {
            this.saveToLocalStorage();
            return true;
        }
    }

    /**
     * Delete configuration for a specific room
     * @param {string} roomName - Room name
     * @returns {Promise<boolean>} - Success status
     */
    async deleteSensorConfig(roomName) {
        if (!this.configs[roomName]) {
            return false;
        }

        // Update local cache immediately
        delete this.configs[roomName];

        if (this.useServerStorage) {
            try {
                const response = await fetch(`${this.getBasePath()}/api/rooms/${encodeURIComponent(roomName)}`, {
                    method: 'DELETE'
                });

                if (!response.ok && response.status !== 404) {
                    throw new Error(`Server returned ${response.status}`);
                }

                console.log(`[StorageManager] Deleted room "${roomName}" from server`);
                return true;
            } catch (error) {
                console.error(`[StorageManager] Failed to delete from server:`, error.message);
                this.saveToLocalStorage();
                return false;
            }
        } else {
            this.saveToLocalStorage();
            return true;
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

        const defaultZone = { enabled: false, shapeType: 'rectangle', x1: -1500, y1: 0, x2: 1500, y2: 3000, vertices: null, zoneType: 'detection' };

        // Migrate existing zones
        const migratedZones = zones.zones.map(zone => ({
            enabled: zone.enabled || false,
            shapeType: zone.shapeType || 'rectangle',
            x1: zone.x1 !== undefined ? zone.x1 : -1500,
            y1: zone.y1 !== undefined ? zone.y1 : 0,
            x2: zone.x2 !== undefined ? zone.x2 : 1500,
            y2: zone.y2 !== undefined ? zone.y2 : 3000,
            vertices: zone.vertices || null,
            zoneType: zone.zoneType || 'detection'
        }));

        // Pad with default zones if fewer than 5 zones exist (for backwards compatibility)
        while (migratedZones.length < 5) {
            migratedZones.push({ ...defaultZone });
        }

        return {
            type: zones.type || 0,
            zones: migratedZones
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
     * @returns {Promise<boolean>} - Success status
     */
    async importConfigs(jsonString) {
        try {
            const imported = JSON.parse(jsonString);

            // Merge with existing configs
            for (const [roomName, config] of Object.entries(imported)) {
                await this.saveSensorConfig(roomName, config);
            }

            return true;
        } catch (error) {
            console.error('Error importing configs:', error);
            return false;
        }
    }

    /**
     * Refresh configs from server (useful for syncing between tabs/devices)
     * @returns {Promise<void>}
     */
    async refresh() {
        if (!this.useServerStorage) return;

        try {
            const response = await fetch(`${this.getBasePath()}/api/rooms-all`);
            if (response.ok) {
                const data = await response.json();
                this.configs = data.configs || {};
                console.log(`[StorageManager] Refreshed ${Object.keys(this.configs).length} rooms from server`);
            }
        } catch (error) {
            console.warn('[StorageManager] Failed to refresh from server:', error.message);
        }
    }
}
