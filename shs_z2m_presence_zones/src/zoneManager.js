/**
 * ZoneManager - Handles zone logic and validation
 */

export class ZoneManager {
    constructor(zonesConfig) {
        this.config = zonesConfig;
    }

    /**
     * Check if a point (x, y) is inside a zone
     */
    isPointInZone(x, y, zone) {
        const minX = Math.min(zone.x1, zone.x2);
        const maxX = Math.max(zone.x1, zone.x2);
        const minY = Math.min(zone.y1, zone.y2);
        const maxY = Math.max(zone.y1, zone.y2);

        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }

    /**
     * Check if a target should be detected based on zone configuration
     * Returns true if target should be included in detection
     */
    shouldDetectTarget(target) {
        const { type, zones } = this.config;

        // Mode 0: Disabled - detect all targets
        if (type === 0) {
            return true;
        }

        // Check if target is in any enabled zone
        let inAnyZone = false;
        for (const zone of zones) {
            if (zone.enabled && this.isPointInZone(target.x, target.y, zone)) {
                inAnyZone = true;
                break;
            }
        }

        // Mode 1: Detection - only detect targets INSIDE zones
        if (type === 1) {
            return inAnyZone;
        }

        // Mode 2: Filter - only detect targets OUTSIDE zones (exclude zones)
        if (type === 2) {
            return !inAnyZone;
        }

        return true;
    }

    /**
     * Filter targets based on zone configuration
     */
    filterTargets(targets) {
        return targets.filter(target => this.shouldDetectTarget(target));
    }

    /**
     * Validate zone coordinates
     */
    validateZone(zone) {
        const errors = [];

        // Check if coordinates are within sensor range
        if (zone.x1 < -3000 || zone.x1 > 3000) {
            errors.push('X1 must be between -3000 and 3000mm');
        }
        if (zone.x2 < -3000 || zone.x2 > 3000) {
            errors.push('X2 must be between -3000 and 3000mm');
        }
        if (zone.y1 < 0 || zone.y1 > 6000) {
            errors.push('Y1 must be between 0 and 6000mm');
        }
        if (zone.y2 < 0 || zone.y2 > 6000) {
            errors.push('Y2 must be between 0 and 6000mm');
        }

        // Check if zone has valid area
        if (zone.x1 === zone.x2 || zone.y1 === zone.y2) {
            errors.push('Zone must have non-zero area');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Get zone statistics
     */
    getZoneStats() {
        const enabledZones = this.config.zones.filter(z => z.enabled);

        return {
            totalZones: this.config.zones.length,
            enabledZones: enabledZones.length,
            mode: this.config.type === 0 ? 'disabled' :
                  this.config.type === 1 ? 'detection' : 'filter'
        };
    }
}
