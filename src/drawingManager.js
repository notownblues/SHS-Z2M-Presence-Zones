/**
 * DrawingManager - Handles mouse interactions for zone drawing
 * Manages drawing modes: select, draw-rectangle, draw-polygon, place-furniture, place-entrance
 */

export class DrawingManager {
    constructor(radarCanvas, state, callbacks) {
        this.radarCanvas = radarCanvas;
        this.canvas = radarCanvas.canvas;
        this.state = state;
        this.callbacks = callbacks || {};

        // Drawing state
        this.mode = 'select';
        this.isDrawing = false;
        this.isDragging = false;
        this.startPoint = null;
        this.currentPoint = null;
        this.polygonVertices = [];
        this.selectedZoneIndex = null;
        this.selectedFurnitureIndex = null;
        this.selectedEntranceIndex = null;
        this.selectedEdgeIndex = null;
        this.selectedHandle = null;
        this.dragOffset = { x: 0, y: 0 };

        // Preview state
        this.previewRect = null;
        this.previewPolygon = [];

        // Handle size for hit testing
        this.handleSize = 10;
        this.furnitureHandleSize = 9;

        // Right-click drag state
        this.isRightClickDragging = false;

        // Bind event handlers
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleContextMenu = this.handleContextMenu.bind(this);

        // Attach event listeners
        this.bindEvents();
    }

    bindEvents() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('dblclick', this.handleDoubleClick);
        this.canvas.addEventListener('contextmenu', this.handleContextMenu);
        document.addEventListener('keydown', this.handleKeyDown);
    }

    destroy() {
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('dblclick', this.handleDoubleClick);
        this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
        document.removeEventListener('keydown', this.handleKeyDown);
    }

    /**
     * Prevent context menu on canvas (for right-click drag)
     */
    handleContextMenu(event) {
        event.preventDefault();
    }

    /**
     * Set the current drawing mode
     */
    setMode(mode) {
        this.mode = mode;
        this.resetDrawingState();
        this.updateCursor();

        // Notify callback
        if (this.callbacks.onModeChange) {
            this.callbacks.onModeChange(mode);
        }
    }

    /**
     * Reset drawing state
     */
    resetDrawingState() {
        this.isDrawing = false;
        this.isDragging = false;
        this.isMoving = false;  // Explicit move mode (activated by Move button)
        this.movingItemType = null;
        this.movingItemIndex = null;
        this.startPoint = null;
        this.currentPoint = null;
        this.polygonVertices = [];
        this.previewRect = null;
        this.previewPolygon = [];
        this.selectedHandle = null;
        // Don't reset selection indexes - preserve selection when switching modes

        // Clear preview on canvas
        if (this.callbacks.onPreviewUpdate) {
            this.callbacks.onPreviewUpdate(null);
        }
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        this.selectedZoneIndex = null;
        this.selectedFurnitureIndex = null;
        this.selectedHandle = null;
        if (this.callbacks.onZoneSelect) {
            this.callbacks.onZoneSelect(null);
        }
        if (this.callbacks.onFurnitureSelect) {
            this.callbacks.onFurnitureSelect(null);
        }
    }

    /**
     * Update canvas cursor based on mode
     */
    updateCursor() {
        switch (this.mode) {
            case 'select':
                this.canvas.style.cursor = 'default';
                break;
            case 'draw-rectangle':
            case 'draw-polygon':
            case 'draw-edge':
                this.canvas.style.cursor = 'crosshair';
                break;
            case 'place-furniture':
            case 'place-entrance':
                this.canvas.style.cursor = 'copy';
                break;
            default:
                this.canvas.style.cursor = 'default';
        }
    }

    /**
     * Get canvas coordinates from mouse event
     */
    getCanvasCoords(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }

    /**
     * Convert canvas coords to sensor coords.
     * This accounts for map rotation by undoing the visual rotation
     * before converting to sensor coordinates.
     * Used for both drawing zones and hit detection.
     */
    toSensorCoords(canvasX, canvasY) {
        // Undo the visual rotation to get the unrotated canvas position
        const cx = this.radarCanvas.width / 2;
        const cy = this.radarCanvas.height / 2;
        const rotation = this.radarCanvas.mapRotation || 0;
        const angle = -rotation * Math.PI / 180; // Negative to inverse rotate

        const dx = canvasX - cx;
        const dy = canvasY - cy;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const unrotatedX = cx + dx * cos - dy * sin;
        const unrotatedY = cy + dx * sin + dy * cos;

        // Convert to sensor coordinates
        return {
            x: this.radarCanvas.toSensorX(unrotatedX),
            y: this.radarCanvas.toSensorY(unrotatedY)
        };
    }

    /**
     * Convert sensor coords to canvas coords for hit detection.
     * Since zones are drawn in the rotated canvas context, we need to apply
     * the same transformation here for consistent hit detection.
     */
    toCanvasCoords(sensorX, sensorY) {
        // First get unrotated canvas coords
        const unrotatedX = this.radarCanvas.toCanvasX(sensorX);
        const unrotatedY = this.radarCanvas.toCanvasY(sensorY);

        // Apply the same visual rotation as the canvas context
        const cx = this.radarCanvas.width / 2;
        const cy = this.radarCanvas.height / 2;
        const rotation = this.radarCanvas.mapRotation || 0;
        const angle = rotation * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const dx = unrotatedX - cx;
        const dy = unrotatedY - cy;

        return {
            x: cx + dx * cos - dy * sin,
            y: cy + dx * sin + dy * cos
        };
    }

    /**
     * Find next available zone slot (0-2)
     */
    getNextAvailableZoneSlot() {
        for (let i = 0; i < 3; i++) {
            if (!this.state.zones.zones[i].enabled) {
                return i;
            }
        }
        return -1; // No slots available
    }

    /**
     * Check if a point is inside a zone (for selection)
     */
    isPointInZone(sensorX, sensorY, zone) {
        if (!zone.enabled) return false;

        if (zone.shapeType === 'polygon' && zone.vertices) {
            return this.isPointInPolygon(sensorX, sensorY, zone.vertices);
        }

        // Rectangle check
        const minX = Math.min(zone.x1, zone.x2);
        const maxX = Math.max(zone.x1, zone.x2);
        const minY = Math.min(zone.y1, zone.y2);
        const maxY = Math.max(zone.y1, zone.y2);

        return sensorX >= minX && sensorX <= maxX && sensorY >= minY && sensorY <= maxY;
    }

    /**
     * Check if a point is inside a polygon (ray casting algorithm)
     */
    isPointInPolygon(x, y, vertices) {
        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;

            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Get resize handle at point (returns handle info or null)
     * Handle types match VISUAL positions (accounting for inverted Y axis):
     * - In sensor coords: y1 = min Y (near sensor), y2 = max Y (far from sensor)
     * - In canvas coords: y1 → bottom (high canvas Y), y2 → top (low canvas Y)
     * - So visual NW (top-left) = sensor (x1, y2)
     */
    getHandleAtPoint(canvasX, canvasY, zone, zoneIndex) {
        if (!zone.enabled || zone.shapeType === 'polygon') return null;

        const corners = this.getZoneCorners(zone);
        // Handle positions mapped to VISUAL corners (not sensor corners)
        // Visual NW = sensor (minX, maxY), Visual SE = sensor (maxX, minY), etc.
        const handles = [
            { type: 'nw', x: corners.x1, y: corners.y2, updateX: 'x1', updateY: 'y2' }, // visual top-left
            { type: 'ne', x: corners.x2, y: corners.y2, updateX: 'x2', updateY: 'y2' }, // visual top-right
            { type: 'sw', x: corners.x1, y: corners.y1, updateX: 'x1', updateY: 'y1' }, // visual bottom-left
            { type: 'se', x: corners.x2, y: corners.y1, updateX: 'x2', updateY: 'y1' }, // visual bottom-right
            { type: 'n', x: (corners.x1 + corners.x2) / 2, y: corners.y2, updateX: null, updateY: 'y2' }, // visual top
            { type: 's', x: (corners.x1 + corners.x2) / 2, y: corners.y1, updateX: null, updateY: 'y1' }, // visual bottom
            { type: 'w', x: corners.x1, y: (corners.y1 + corners.y2) / 2, updateX: 'x1', updateY: null }, // visual left
            { type: 'e', x: corners.x2, y: (corners.y1 + corners.y2) / 2, updateX: 'x2', updateY: null }  // visual right
        ];

        for (const handle of handles) {
            const canvasHandle = this.toCanvasCoords(handle.x, handle.y);
            const dx = canvasX - canvasHandle.x;
            const dy = canvasY - canvasHandle.y;
            if (Math.sqrt(dx * dx + dy * dy) <= this.handleSize) {
                return { ...handle, zoneIndex };
            }
        }

        return null;
    }

    /**
     * Get zone corners in sensor coordinates
     */
    getZoneCorners(zone) {
        return {
            x1: Math.min(zone.x1, zone.x2),
            y1: Math.min(zone.y1, zone.y2),
            x2: Math.max(zone.x1, zone.x2),
            y2: Math.max(zone.y1, zone.y2)
        };
    }

    /**
     * Get edge handle at point (similar to zone handles)
     */
    getEdgeHandleAtPoint(canvasX, canvasY, edge) {
        if (!edge) return null;

        const corners = {
            x1: Math.min(edge.x1, edge.x2),
            y1: Math.min(edge.y1, edge.y2),
            x2: Math.max(edge.x1, edge.x2),
            y2: Math.max(edge.y1, edge.y2)
        };

        // Handle positions for corners and edges
        const handles = [
            { type: 'nw', x: corners.x1, y: corners.y2, updateX: 'x1', updateY: 'y2' },
            { type: 'ne', x: corners.x2, y: corners.y2, updateX: 'x2', updateY: 'y2' },
            { type: 'sw', x: corners.x1, y: corners.y1, updateX: 'x1', updateY: 'y1' },
            { type: 'se', x: corners.x2, y: corners.y1, updateX: 'x2', updateY: 'y1' },
            { type: 'n', x: (corners.x1 + corners.x2) / 2, y: corners.y2, updateX: null, updateY: 'y2' },
            { type: 's', x: (corners.x1 + corners.x2) / 2, y: corners.y1, updateX: null, updateY: 'y1' },
            { type: 'w', x: corners.x1, y: (corners.y1 + corners.y2) / 2, updateX: 'x1', updateY: null },
            { type: 'e', x: corners.x2, y: (corners.y1 + corners.y2) / 2, updateX: 'x2', updateY: null }
        ];

        for (const handle of handles) {
            const canvasHandle = this.toCanvasCoords(handle.x, handle.y);
            const dx = canvasX - canvasHandle.x;
            const dy = canvasY - canvasHandle.y;
            if (Math.sqrt(dx * dx + dy * dy) <= this.handleSize) {
                return handle;
            }
        }

        return null;
    }

    /**
     * Handle mouse down event
     */
    handleMouseDown(event) {
        const canvasCoords = this.getCanvasCoords(event);
        const sensorCoords = this.toSensorCoords(canvasCoords.x, canvasCoords.y);

        // Right-click drag for selected items
        if (event.button === 2) {
            this.handleRightClickDrag(canvasCoords, sensorCoords);
            return;
        }

        switch (this.mode) {
            case 'select':
            case 'moving':
                // If in move mode, clicking places the item
                if (this.isMoving) {
                    this.finishMoveMode();
                    return;
                }
                this.handleSelectMouseDown(canvasCoords, sensorCoords);
                break;
            case 'draw-rectangle':
                this.handleRectangleMouseDown(sensorCoords);
                break;
            case 'draw-polygon':
                this.handlePolygonClick(sensorCoords);
                break;
            case 'place-furniture':
                this.handleFurniturePlacement(sensorCoords);
                break;
            case 'place-entrance':
                this.handleEntrancePlacement(sensorCoords);
                break;
            case 'draw-edge':
                this.handleEdgeMouseDown(sensorCoords);
                break;
        }
    }

    /**
     * Handle right-click drag for moving selected items
     */
    handleRightClickDrag(canvasCoords, sensorCoords) {
        // Check if we're clicking on the selected zone
        if (this.selectedZoneIndex !== null) {
            const zone = this.state.zones.zones[this.selectedZoneIndex];
            if (zone && zone.enabled && this.isPointInZone(sensorCoords.x, sensorCoords.y, zone)) {
                this.isRightClickDragging = true;
                this.isDragging = true;
                const corners = this.getZoneCorners(zone);
                this.dragOffset = {
                    x: sensorCoords.x - (corners.x1 + corners.x2) / 2,
                    y: sensorCoords.y - (corners.y1 + corners.y2) / 2
                };
                this.canvas.style.cursor = 'move';
                return;
            }
        }

        // Check if we're clicking on the selected furniture
        if (this.selectedFurnitureIndex !== null) {
            const furniture = this.state.annotations.furniture[this.selectedFurnitureIndex];
            if (furniture && this.isPointInFurniture(sensorCoords.x, sensorCoords.y, furniture)) {
                this.isRightClickDragging = true;
                this.isDragging = true;
                this.dragOffset = {
                    x: sensorCoords.x - furniture.x,
                    y: sensorCoords.y - furniture.y
                };
                this.canvas.style.cursor = 'move';
                return;
            }
        }

        // Check if we're clicking on the selected entrance
        if (this.selectedEntranceIndex !== null) {
            const entrance = this.state.annotations.entrances[this.selectedEntranceIndex];
            if (entrance && this.isPointInEntrance(sensorCoords.x, sensorCoords.y, entrance)) {
                this.isRightClickDragging = true;
                this.isDragging = true;
                this.dragOffset = {
                    x: sensorCoords.x - entrance.x,
                    y: sensorCoords.y - entrance.y
                };
                this.canvas.style.cursor = 'move';
                return;
            }
        }

        // Check if we're clicking on the selected edge
        if (this.selectedEdgeIndex !== null) {
            const edge = this.state.annotations.edges[this.selectedEdgeIndex];
            if (edge && this.isPointInEdge(sensorCoords.x, sensorCoords.y, edge)) {
                this.isRightClickDragging = true;
                this.isDragging = true;
                this.dragOffset = {
                    x: sensorCoords.x - (edge.x1 + edge.x2) / 2,
                    y: sensorCoords.y - (edge.y1 + edge.y2) / 2
                };
                this.canvas.style.cursor = 'move';
                return;
            }
        }
    }

    /**
     * Handle select mode mouse down
     */
    handleSelectMouseDown(canvasCoords, sensorCoords) {
        // Check for handle click first (for selected furniture - resizing)
        if (this.selectedFurnitureIndex !== null) {
            const furniture = this.state.annotations.furniture[this.selectedFurnitureIndex];
            const handle = this.getFurnitureHandleAtPoint(canvasCoords.x, canvasCoords.y, furniture);
            if (handle) {
                this.selectedHandle = { ...handle, itemType: 'furniture', index: this.selectedFurnitureIndex };
                this.isDragging = true;
                this.startPoint = sensorCoords;
                return;
            }
            // If clicking on already-selected furniture (not handle), start dragging
            if (this.isPointInFurniture(sensorCoords.x, sensorCoords.y, furniture)) {
                this.isDragging = true;
                this.dragOffset = {
                    x: sensorCoords.x - furniture.x,
                    y: sensorCoords.y - furniture.y
                };
                this.canvas.style.cursor = 'move';
                return;
            }
        }

        // Check for handle click (for selected zone - resizing)
        if (this.selectedZoneIndex !== null) {
            const zone = this.state.zones.zones[this.selectedZoneIndex];
            const handle = this.getHandleAtPoint(canvasCoords.x, canvasCoords.y, zone, this.selectedZoneIndex);
            if (handle) {
                this.selectedHandle = { ...handle, itemType: 'zone' };
                this.isDragging = true;
                this.startPoint = sensorCoords;
                return;
            }
            // If clicking on already-selected zone (not handle), start dragging
            if (zone.enabled && this.isPointInZone(sensorCoords.x, sensorCoords.y, zone)) {
                this.isDragging = true;
                const corners = this.getZoneCorners(zone);
                this.dragOffset = {
                    x: sensorCoords.x - (corners.x1 + corners.x2) / 2,
                    y: sensorCoords.y - (corners.y1 + corners.y2) / 2
                };
                this.canvas.style.cursor = 'move';
                return;
            }
        }

        // If clicking on already-selected entrance, start dragging
        if (this.selectedEntranceIndex !== null) {
            const entrance = this.state.annotations.entrances[this.selectedEntranceIndex];
            if (entrance && this.isPointInEntrance(sensorCoords.x, sensorCoords.y, entrance)) {
                this.isDragging = true;
                this.dragOffset = {
                    x: sensorCoords.x - entrance.x,
                    y: sensorCoords.y - entrance.y
                };
                this.canvas.style.cursor = 'move';
                return;
            }
        }

        // Check for handle click (for selected edge - resizing)
        if (this.selectedEdgeIndex !== null) {
            const edge = this.state.annotations.edges[this.selectedEdgeIndex];
            const handle = this.getEdgeHandleAtPoint(canvasCoords.x, canvasCoords.y, edge);
            if (handle) {
                this.selectedHandle = { ...handle, itemType: 'edge', index: this.selectedEdgeIndex };
                this.isDragging = true;
                this.startPoint = sensorCoords;
                return;
            }
            // If clicking on already-selected edge (not handle), start dragging
            if (edge && this.isPointInEdge(sensorCoords.x, sensorCoords.y, edge)) {
                this.isDragging = true;
                this.dragOffset = {
                    x: sensorCoords.x - (edge.x1 + edge.x2) / 2,
                    y: sensorCoords.y - (edge.y1 + edge.y2) / 2
                };
                this.canvas.style.cursor = 'move';
                return;
            }
        }

        // Check for entrance click first (they're small and on top)
        for (let i = this.state.annotations.entrances.length - 1; i >= 0; i--) {
            const entrance = this.state.annotations.entrances[i];
            if (this.isPointInEntrance(sensorCoords.x, sensorCoords.y, entrance)) {
                this.clearOtherSelections('entrance');
                this.selectedEntranceIndex = i;
                if (this.callbacks.onEntranceSelect) {
                    this.callbacks.onEntranceSelect(i, entrance);
                }
                return;
            }
        }

        // Check for furniture click (furniture is drawn on top)
        for (let i = this.state.annotations.furniture.length - 1; i >= 0; i--) {
            const furniture = this.state.annotations.furniture[i];
            if (this.isPointInFurniture(sensorCoords.x, sensorCoords.y, furniture)) {
                this.clearOtherSelections('furniture');
                this.selectedFurnitureIndex = i;
                if (this.callbacks.onFurnitureSelect) {
                    this.callbacks.onFurnitureSelect(i, furniture);
                }
                return;
            }
        }

        // Check for zone click
        for (let i = 0; i < this.state.zones.zones.length; i++) {
            const zone = this.state.zones.zones[i];
            if (this.isPointInZone(sensorCoords.x, sensorCoords.y, zone)) {
                this.clearOtherSelections('zone');
                this.selectedZoneIndex = i;
                if (this.callbacks.onZoneSelect) {
                    this.callbacks.onZoneSelect(i);
                }
                return;
            }
        }

        // Check for edge click (edges are drawn behind zones, so check last)
        const edges = this.state.annotations.edges || [];
        for (let i = edges.length - 1; i >= 0; i--) {
            const edge = edges[i];
            if (this.isPointInEdge(sensorCoords.x, sensorCoords.y, edge)) {
                this.clearOtherSelections('edge');
                this.selectedEdgeIndex = i;
                if (this.callbacks.onEdgeSelect) {
                    this.callbacks.onEdgeSelect(i, edge);
                }
                return;
            }
        }

        // Clicked on empty area - deselect all
        this.clearOtherSelections(null);
    }

    /**
     * Start move mode for a selected item
     * Called when user clicks the Move button
     */
    startMoveMode(itemType, itemIndex) {
        this.isMoving = true;
        this.movingItemType = itemType;
        this.movingItemIndex = itemIndex;

        // Calculate initial offset based on item type
        if (itemType === 'zone') {
            const zone = this.state.zones.zones[itemIndex];
            const corners = this.getZoneCorners(zone);
            this.dragOffset = {
                x: 0,
                y: 0
            };
            // Store original center
            this.moveOrigin = {
                x: (corners.x1 + corners.x2) / 2,
                y: (corners.y1 + corners.y2) / 2
            };
        } else if (itemType === 'furniture') {
            const furniture = this.state.annotations.furniture[itemIndex];
            this.dragOffset = { x: 0, y: 0 };
            this.moveOrigin = { x: furniture.x, y: furniture.y };
        } else if (itemType === 'entrance') {
            const entrance = this.state.annotations.entrances[itemIndex];
            this.dragOffset = { x: 0, y: 0 };
            this.moveOrigin = { x: entrance.x, y: entrance.y };
        }

        this.radarCanvas.canvas.style.cursor = 'move';

        // Show placement done button
        if (this.callbacks.onModeChange) {
            this.callbacks.onModeChange('moving');
        }
    }

    /**
     * Finish move mode and place the item
     */
    finishMoveMode() {
        if (!this.isMoving) return;

        // Store values before clearing
        const itemType = this.movingItemType;
        const itemIndex = this.movingItemIndex;

        this.isMoving = false;
        this.movingItemType = null;
        this.movingItemIndex = null;
        this.moveOrigin = null;
        this.radarCanvas.canvas.style.cursor = 'default';

        // Trigger save with stored values
        if (itemType === 'zone' && this.callbacks.onZoneUpdate) {
            this.callbacks.onZoneUpdate(itemIndex, this.state.zones.zones[itemIndex]);
        } else if (itemType === 'furniture' && this.callbacks.onFurnitureUpdate) {
            this.callbacks.onFurnitureUpdate(itemIndex, this.state.annotations.furniture[itemIndex]);
        } else if (itemType === 'entrance' && this.callbacks.onEntranceUpdate) {
            this.callbacks.onEntranceUpdate(itemIndex, this.state.annotations.entrances[itemIndex]);
        }

        if (this.callbacks.onModeChange) {
            this.callbacks.onModeChange('select');
        }
    }

    /**
     * Clear selections except for the specified type
     */
    clearOtherSelections(keepType) {
        if (keepType !== 'zone' && this.selectedZoneIndex !== null) {
            this.selectedZoneIndex = null;
            if (this.callbacks.onZoneSelect) {
                this.callbacks.onZoneSelect(null);
            }
        }
        if (keepType !== 'furniture' && this.selectedFurnitureIndex !== null) {
            this.selectedFurnitureIndex = null;
            if (this.callbacks.onFurnitureSelect) {
                this.callbacks.onFurnitureSelect(null);
            }
        }
        if (keepType !== 'entrance' && this.selectedEntranceIndex !== null) {
            this.selectedEntranceIndex = null;
            if (this.callbacks.onEntranceSelect) {
                this.callbacks.onEntranceSelect(null);
            }
        }
        if (keepType !== 'edge' && this.selectedEdgeIndex !== null) {
            this.selectedEdgeIndex = null;
            if (this.callbacks.onEdgeSelect) {
                this.callbacks.onEdgeSelect(null);
            }
        }
    }

    /**
     * Check if point is near an entrance
     */
    isPointInEntrance(sensorX, sensorY, entrance) {
        const dx = sensorX - entrance.x;
        const dy = sensorY - entrance.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance <= 300; // 300mm hit radius for entrances
    }

    /**
     * Check if a point is inside a furniture item
     */
    isPointInFurniture(sensorX, sensorY, furniture) {
        const halfW = furniture.width / 2;
        const halfH = furniture.height / 2;

        // For rotated furniture, transform the point into furniture-local coordinates
        const rotation = (furniture.rotation || 0) * Math.PI / 180;
        const dx = sensorX - furniture.x;
        const dy = sensorY - furniture.y;

        // Rotate point back
        const cos = Math.cos(-rotation);
        const sin = Math.sin(-rotation);
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;

        return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
    }

    /**
     * Get furniture resize handle at point
     */
    getFurnitureHandleAtPoint(canvasX, canvasY, furniture) {
        if (!furniture) return null;

        // Get furniture center in sensor coords, then convert to rotated canvas coords
        const centerCanvas = this.toCanvasCoords(furniture.x, furniture.y);
        const cx = centerCanvas.x;
        const cy = centerCanvas.y;

        const halfW = (furniture.width * this.radarCanvas.scaleX) / 2;
        const halfH = (furniture.height * this.radarCanvas.scaleY) / 2;

        // Combined rotation: map rotation + furniture rotation
        const mapRotation = (this.radarCanvas.mapRotation || 0) * Math.PI / 180;
        const furnitureRotation = (furniture.rotation || 0) * Math.PI / 180;
        const totalRotation = mapRotation + furnitureRotation;

        const cos = Math.cos(totalRotation);
        const sin = Math.sin(totalRotation);

        // Define handles in local coordinates (relative to center)
        const localHandles = [
            { type: 'nw', lx: -halfW, ly: -halfH },
            { type: 'ne', lx: halfW, ly: -halfH },
            { type: 'sw', lx: -halfW, ly: halfH },
            { type: 'se', lx: halfW, ly: halfH }
        ];

        for (const handle of localHandles) {
            // Rotate local coords by combined rotation
            const rx = handle.lx * cos - handle.ly * sin;
            const ry = handle.lx * sin + handle.ly * cos;

            const handleX = cx + rx;
            const handleY = cy + ry;

            const dx = canvasX - handleX;
            const dy = canvasY - handleY;
            if (Math.sqrt(dx * dx + dy * dy) <= this.furnitureHandleSize + 4) {
                return { type: handle.type, handleX, handleY };
            }
        }

        return null;
    }

    /**
     * Handle rectangle drawing mouse down
     */
    handleRectangleMouseDown(sensorCoords) {
        const slot = this.getNextAvailableZoneSlot();
        if (slot === -1) {
            if (this.callbacks.onError) {
                this.callbacks.onError('Maximum 3 zones. Delete one to add another.');
            }
            return;
        }

        this.isDrawing = true;
        this.startPoint = sensorCoords;
        this.currentPoint = sensorCoords;
    }

    /**
     * Handle mouse move event
     */
    handleMouseMove(event) {
        const canvasCoords = this.getCanvasCoords(event);
        const sensorCoords = this.toSensorCoords(canvasCoords.x, canvasCoords.y);
        this.currentPoint = sensorCoords;

        switch (this.mode) {
            case 'select':
            case 'moving':
                this.handleSelectMouseMove(canvasCoords, sensorCoords);
                break;
            case 'draw-rectangle':
                if (this.isDrawing) {
                    this.updateRectanglePreview(sensorCoords);
                }
                break;
            case 'draw-polygon':
                if (this.polygonVertices.length > 0) {
                    this.updatePolygonPreview(sensorCoords);
                }
                break;
            case 'draw-edge':
                if (this.isDrawing) {
                    this.updateEdgePreview(sensorCoords);
                }
                break;
        }
    }

    /**
     * Update edge drawing preview
     */
    updateEdgePreview(sensorCoords) {
        this.previewRect = {
            x1: Math.round(this.startPoint.x / 100) * 100,
            y1: Math.round(this.startPoint.y / 100) * 100,
            x2: Math.round(sensorCoords.x / 100) * 100,
            y2: Math.round(sensorCoords.y / 100) * 100,
            isEdge: true  // Flag to identify as edge preview
        };

        if (this.callbacks.onPreviewUpdate) {
            this.callbacks.onPreviewUpdate(this.previewRect);
        }
    }

    /**
     * Handle select mode mouse move
     */
    handleSelectMouseMove(canvasCoords, sensorCoords) {
        // Handle explicit move mode (Move button was clicked)
        if (this.isMoving) {
            if (this.movingItemType === 'zone') {
                this.moveZoneToPosition(sensorCoords);
            } else if (this.movingItemType === 'furniture') {
                this.moveFurnitureToPosition(sensorCoords);
            } else if (this.movingItemType === 'entrance') {
                this.moveEntranceToPosition(sensorCoords);
            }
            return;
        }

        if (!this.isDragging) {
            // Update cursor for furniture handles
            if (this.selectedFurnitureIndex !== null) {
                const furniture = this.state.annotations.furniture[this.selectedFurnitureIndex];
                const handle = this.getFurnitureHandleAtPoint(canvasCoords.x, canvasCoords.y, furniture);
                if (handle) {
                    this.canvas.style.cursor = this.getHandleCursor(handle.type);
                    return;
                } else if (this.isPointInFurniture(sensorCoords.x, sensorCoords.y, furniture)) {
                    this.canvas.style.cursor = 'move';
                    return;
                }
            }

            // Update cursor for zone handles
            if (this.selectedZoneIndex !== null) {
                const zone = this.state.zones.zones[this.selectedZoneIndex];
                const handle = this.getHandleAtPoint(canvasCoords.x, canvasCoords.y, zone, this.selectedZoneIndex);
                if (handle) {
                    this.canvas.style.cursor = this.getHandleCursor(handle.type);
                    return;
                } else if (this.isPointInZone(sensorCoords.x, sensorCoords.y, zone)) {
                    this.canvas.style.cursor = 'move';
                    return;
                }
            }

            // Update cursor for edge handles
            if (this.selectedEdgeIndex !== null) {
                const edge = this.state.annotations.edges[this.selectedEdgeIndex];
                const handle = this.getEdgeHandleAtPoint(canvasCoords.x, canvasCoords.y, edge);
                if (handle) {
                    this.canvas.style.cursor = this.getHandleCursor(handle.type);
                    return;
                } else if (this.isPointInEdge(sensorCoords.x, sensorCoords.y, edge)) {
                    this.canvas.style.cursor = 'move';
                    return;
                }
            }

            // Check if hovering over any furniture
            for (let i = this.state.annotations.furniture.length - 1; i >= 0; i--) {
                if (this.isPointInFurniture(sensorCoords.x, sensorCoords.y, this.state.annotations.furniture[i])) {
                    this.canvas.style.cursor = 'pointer';
                    return;
                }
            }

            // Check if hovering over any zone
            for (const zone of this.state.zones.zones) {
                if (this.isPointInZone(sensorCoords.x, sensorCoords.y, zone)) {
                    this.canvas.style.cursor = 'pointer';
                    return;
                }
            }

            this.canvas.style.cursor = 'default';
            return;
        }

        // Handle dragging
        if (this.selectedHandle) {
            if (this.selectedHandle.itemType === 'furniture') {
                this.resizeFurniture(sensorCoords);
            } else if (this.selectedHandle.itemType === 'edge') {
                this.resizeEdge(sensorCoords);
            } else {
                this.resizeZone(sensorCoords);
            }
        } else if (this.selectedEntranceIndex !== null) {
            this.moveEntrance(sensorCoords);
        } else if (this.selectedFurnitureIndex !== null) {
            this.moveFurniture(sensorCoords);
        } else if (this.selectedZoneIndex !== null) {
            this.moveZone(sensorCoords);
        } else if (this.selectedEdgeIndex !== null) {
            this.moveEdge(sensorCoords);
        }
    }

    /**
     * Move edge to new position
     */
    moveEdge(sensorCoords) {
        const edge = this.state.annotations.edges[this.selectedEdgeIndex];
        if (!edge) return;

        const width = Math.abs(edge.x2 - edge.x1);
        const height = Math.abs(edge.y2 - edge.y1);

        const newCenterX = sensorCoords.x - this.dragOffset.x;
        const newCenterY = sensorCoords.y - this.dragOffset.y;

        // Calculate new bounds
        const halfW = width / 2;
        const halfH = height / 2;

        // Clamp to sensor range
        const newX1 = Math.max(-3000, Math.min(3000 - width, Math.round((newCenterX - halfW) / 100) * 100));
        const newY1 = Math.max(0, Math.min(6000 - height, Math.round((newCenterY - halfH) / 100) * 100));

        edge.x1 = newX1;
        edge.y1 = newY1;
        edge.x2 = newX1 + width;
        edge.y2 = newY1 + height;

        // Trigger redraw
        this.radarCanvas.drawFrame(
            [],
            this.state.zones.zones,
            this.state.annotations
        );

        if (this.callbacks.onEdgeUpdate) {
            this.callbacks.onEdgeUpdate(this.selectedEdgeIndex, edge);
        }
    }

    /**
     * Move furniture to new position (drag mode - legacy)
     */
    moveFurniture(sensorCoords) {
        const furniture = this.state.annotations.furniture[this.selectedFurnitureIndex];

        const newX = sensorCoords.x - this.dragOffset.x;
        const newY = sensorCoords.y - this.dragOffset.y;

        // Clamp to sensor range
        const halfW = furniture.width / 2;
        const halfH = furniture.height / 2;
        furniture.x = Math.max(-3000 + halfW, Math.min(3000 - halfW, Math.round(newX / 50) * 50));
        furniture.y = Math.max(halfH, Math.min(6000 - halfH, Math.round(newY / 50) * 50));

        if (this.callbacks.onFurnitureUpdate) {
            this.callbacks.onFurnitureUpdate(this.selectedFurnitureIndex, furniture);
        }
    }

    /**
     * Move furniture to cursor position (explicit move mode)
     */
    moveFurnitureToPosition(sensorCoords) {
        const furniture = this.state.annotations.furniture[this.movingItemIndex];
        if (!furniture) return;

        // Snap to grid and clamp
        const halfW = furniture.width / 2;
        const halfH = furniture.height / 2;
        furniture.x = Math.max(-3000 + halfW, Math.min(3000 - halfW, Math.round(sensorCoords.x / 50) * 50));
        furniture.y = Math.max(halfH, Math.min(6000 - halfH, Math.round(sensorCoords.y / 50) * 50));

        // Live update without triggering save
        this.radarCanvas.drawFrame(
            [],
            this.state.zones.zones,
            this.state.annotations
        );
    }

    /**
     * Move zone to cursor position (explicit move mode)
     */
    moveZoneToPosition(sensorCoords) {
        const zone = this.state.zones.zones[this.movingItemIndex];
        if (!zone || !zone.enabled) return;

        // Calculate zone dimensions
        const width = Math.abs(zone.x2 - zone.x1);
        const height = Math.abs(zone.y2 - zone.y1);

        // Snap to grid
        const centerX = Math.round(sensorCoords.x / 100) * 100;
        const centerY = Math.round(sensorCoords.y / 100) * 100;

        // Calculate new bounds
        const halfW = width / 2;
        const halfH = height / 2;

        // Clamp to sensor range
        const newX1 = Math.max(-3000, Math.min(3000 - width, centerX - halfW));
        const newY1 = Math.max(0, Math.min(6000 - height, centerY - halfH));

        zone.x1 = newX1;
        zone.y1 = newY1;
        zone.x2 = newX1 + width;
        zone.y2 = newY1 + height;

        // Live update without triggering save
        this.radarCanvas.drawFrame(
            [],
            this.state.zones.zones,
            this.state.annotations
        );
    }

    /**
     * Move entrance to cursor position (explicit move mode)
     */
    moveEntranceToPosition(sensorCoords) {
        const entrance = this.state.annotations.entrances[this.movingItemIndex];
        if (!entrance) return;

        // Snap to grid and clamp
        entrance.x = Math.max(-3000, Math.min(3000, Math.round(sensorCoords.x / 50) * 50));
        entrance.y = Math.max(0, Math.min(6000, Math.round(sensorCoords.y / 50) * 50));

        // Live update without triggering save
        this.radarCanvas.drawFrame(
            [],
            this.state.zones.zones,
            this.state.annotations
        );
    }

    /**
     * Resize furniture using handle
     */
    resizeFurniture(sensorCoords) {
        const furniture = this.state.annotations.furniture[this.selectedFurnitureIndex];
        const handle = this.selectedHandle;

        // Calculate distance from center to current mouse position
        const dx = sensorCoords.x - furniture.x;
        const dy = sensorCoords.y - furniture.y;

        // For rotated furniture, rotate back to get local coords
        const rotation = (furniture.rotation || 0) * Math.PI / 180;
        const cos = Math.cos(-rotation);
        const sin = Math.sin(-rotation);
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;

        // Update width and height based on handle type
        const minSize = 200;
        switch (handle.type) {
            case 'se':
                furniture.width = Math.max(minSize, Math.abs(localX) * 2);
                furniture.height = Math.max(minSize, Math.abs(localY) * 2);
                break;
            case 'nw':
                furniture.width = Math.max(minSize, Math.abs(localX) * 2);
                furniture.height = Math.max(minSize, Math.abs(localY) * 2);
                break;
            case 'ne':
                furniture.width = Math.max(minSize, Math.abs(localX) * 2);
                furniture.height = Math.max(minSize, Math.abs(localY) * 2);
                break;
            case 'sw':
                furniture.width = Math.max(minSize, Math.abs(localX) * 2);
                furniture.height = Math.max(minSize, Math.abs(localY) * 2);
                break;
        }

        // Round to 50mm grid
        furniture.width = Math.round(furniture.width / 50) * 50;
        furniture.height = Math.round(furniture.height / 50) * 50;

        if (this.callbacks.onFurnitureUpdate) {
            this.callbacks.onFurnitureUpdate(this.selectedFurnitureIndex, furniture);
        }
    }

    /**
     * Get cursor for resize handle
     */
    getHandleCursor(handleType) {
        const cursors = {
            'nw': 'nwse-resize',
            'se': 'nwse-resize',
            'ne': 'nesw-resize',
            'sw': 'nesw-resize',
            'n': 'ns-resize',
            's': 'ns-resize',
            'e': 'ew-resize',
            'w': 'ew-resize'
        };
        return cursors[handleType] || 'default';
    }

    /**
     * Resize zone using handle
     * Uses updateX/updateY from handle to know which zone coordinates to modify
     */
    resizeZone(sensorCoords) {
        const zone = this.state.zones.zones[this.selectedZoneIndex];
        const handle = this.selectedHandle;

        // Clamp to sensor range and snap to grid
        const x = Math.max(-3000, Math.min(3000, Math.round(sensorCoords.x / 100) * 100));
        const y = Math.max(0, Math.min(6000, Math.round(sensorCoords.y / 100) * 100));

        // Update the zone coordinates specified by the handle
        if (handle.updateX) {
            zone[handle.updateX] = x;
        }
        if (handle.updateY) {
            zone[handle.updateY] = y;
        }

        if (this.callbacks.onZoneUpdate) {
            this.callbacks.onZoneUpdate(this.selectedZoneIndex, zone);
        }
    }

    /**
     * Resize edge using handle
     */
    resizeEdge(sensorCoords) {
        const edge = this.state.annotations.edges[this.selectedEdgeIndex];
        if (!edge) return;

        const handle = this.selectedHandle;

        // Clamp to sensor range and snap to grid
        const x = Math.max(-3000, Math.min(3000, Math.round(sensorCoords.x / 100) * 100));
        const y = Math.max(0, Math.min(6000, Math.round(sensorCoords.y / 100) * 100));

        // Update the edge coordinates specified by the handle
        if (handle.updateX) {
            edge[handle.updateX] = x;
        }
        if (handle.updateY) {
            edge[handle.updateY] = y;
        }

        // Trigger redraw
        this.radarCanvas.drawFrame(
            [],
            this.state.zones.zones,
            this.state.annotations
        );

        if (this.callbacks.onEdgeUpdate) {
            this.callbacks.onEdgeUpdate(this.selectedEdgeIndex, edge);
        }
    }

    /**
     * Move entire zone
     */
    moveZone(sensorCoords) {
        const zone = this.state.zones.zones[this.selectedZoneIndex];
        const corners = this.getZoneCorners(zone);

        const centerX = sensorCoords.x - this.dragOffset.x;
        const centerY = sensorCoords.y - this.dragOffset.y;

        const halfWidth = (corners.x2 - corners.x1) / 2;
        const halfHeight = (corners.y2 - corners.y1) / 2;

        // Calculate new corners
        let newX1 = centerX - halfWidth;
        let newX2 = centerX + halfWidth;
        let newY1 = centerY - halfHeight;
        let newY2 = centerY + halfHeight;

        // Clamp to sensor range
        if (newX1 < -3000) {
            newX1 = -3000;
            newX2 = newX1 + (corners.x2 - corners.x1);
        }
        if (newX2 > 3000) {
            newX2 = 3000;
            newX1 = newX2 - (corners.x2 - corners.x1);
        }
        if (newY1 < 0) {
            newY1 = 0;
            newY2 = newY1 + (corners.y2 - corners.y1);
        }
        if (newY2 > 6000) {
            newY2 = 6000;
            newY1 = newY2 - (corners.y2 - corners.y1);
        }

        zone.x1 = Math.round(newX1 / 100) * 100;
        zone.x2 = Math.round(newX2 / 100) * 100;
        zone.y1 = Math.round(newY1 / 100) * 100;
        zone.y2 = Math.round(newY2 / 100) * 100;

        if (this.callbacks.onZoneUpdate) {
            this.callbacks.onZoneUpdate(this.selectedZoneIndex, zone);
        }
    }

    /**
     * Update rectangle preview while drawing
     */
    updateRectanglePreview(sensorCoords) {
        this.previewRect = {
            x1: this.startPoint.x,
            y1: this.startPoint.y,
            x2: sensorCoords.x,
            y2: sensorCoords.y
        };

        if (this.callbacks.onPreviewUpdate) {
            this.callbacks.onPreviewUpdate({ type: 'rectangle', rect: this.previewRect });
        }
    }

    /**
     * Update polygon preview while drawing
     */
    updatePolygonPreview(sensorCoords) {
        this.previewPolygon = [...this.polygonVertices, sensorCoords];

        if (this.callbacks.onPreviewUpdate) {
            this.callbacks.onPreviewUpdate({ type: 'polygon', vertices: this.previewPolygon });
        }
    }

    /**
     * Handle mouse up event
     */
    handleMouseUp(event) {
        const canvasCoords = this.getCanvasCoords(event);
        const sensorCoords = this.toSensorCoords(canvasCoords.x, canvasCoords.y);

        // Handle right-click release (end drag)
        if (event.button === 2 && this.isRightClickDragging) {
            this.isRightClickDragging = false;
            this.isDragging = false;
            this.canvas.style.cursor = 'default';
            // Trigger save for the moved item
            if (this.selectedEdgeIndex !== null && this.callbacks.onEdgeUpdate) {
                const edge = this.state.annotations.edges[this.selectedEdgeIndex];
                this.callbacks.onEdgeUpdate(this.selectedEdgeIndex, edge);
            }
            return;
        }

        switch (this.mode) {
            case 'select':
                this.isDragging = false;
                this.isRightClickDragging = false;
                this.selectedHandle = null;
                break;
            case 'draw-rectangle':
                if (this.isDrawing) {
                    this.finishRectangle(sensorCoords);
                }
                break;
            case 'draw-edge':
                if (this.isDrawing) {
                    this.completeEdgeDrawing();
                }
                break;
        }
    }

    /**
     * Delete the selected furniture item
     */
    deleteSelectedFurniture() {
        if (this.selectedFurnitureIndex === null) return;

        if (this.callbacks.onFurnitureDeleted) {
            this.callbacks.onFurnitureDeleted(this.selectedFurnitureIndex);
        }

        this.state.annotations.furniture.splice(this.selectedFurnitureIndex, 1);
        this.selectedFurnitureIndex = null;
    }

    /**
     * Finish drawing rectangle
     */
    finishRectangle(sensorCoords) {
        const slot = this.getNextAvailableZoneSlot();
        if (slot === -1) return;

        // Snap to 100mm grid
        const x1 = Math.round(this.startPoint.x / 100) * 100;
        const y1 = Math.round(this.startPoint.y / 100) * 100;
        const x2 = Math.round(sensorCoords.x / 100) * 100;
        const y2 = Math.round(sensorCoords.y / 100) * 100;

        // Check minimum size
        if (Math.abs(x2 - x1) < 200 || Math.abs(y2 - y1) < 200) {
            if (this.callbacks.onError) {
                this.callbacks.onError('Zone too small. Minimum size is 200mm x 200mm.');
            }
            this.resetDrawingState();
            return;
        }

        // Create zone
        const zone = this.state.zones.zones[slot];
        zone.enabled = true;
        zone.shapeType = 'rectangle';
        zone.x1 = Math.min(x1, x2);
        zone.y1 = Math.min(y1, y2);
        zone.x2 = Math.max(x1, x2);
        zone.y2 = Math.max(y1, y2);
        zone.vertices = null;
        // Preserve existing zoneType or default to 'detection'
        if (!zone.zoneType) zone.zoneType = 'detection';

        this.resetDrawingState();
        this.selectedZoneIndex = slot;

        // Switch back to select mode
        this.setMode('select');

        if (this.callbacks.onZoneCreated) {
            this.callbacks.onZoneCreated(slot, zone);
        }
    }

    /**
     * Handle double click for polygon completion
     */
    handleDoubleClick(event) {
        if (this.mode !== 'draw-polygon') return;

        if (this.polygonVertices.length >= 3) {
            this.finishPolygon();
        }
    }

    /**
     * Handle polygon vertex click
     */
    handlePolygonClick(sensorCoords) {
        const slot = this.getNextAvailableZoneSlot();
        if (slot === -1) {
            if (this.callbacks.onError) {
                this.callbacks.onError('Maximum 3 zones. Delete one to add another.');
            }
            return;
        }

        // Snap to 100mm grid
        const point = {
            x: Math.round(sensorCoords.x / 100) * 100,
            y: Math.round(sensorCoords.y / 100) * 100
        };

        // Check if clicking near first vertex to close polygon
        if (this.polygonVertices.length >= 3) {
            const first = this.polygonVertices[0];
            const dist = Math.sqrt(Math.pow(point.x - first.x, 2) + Math.pow(point.y - first.y, 2));
            if (dist < 300) {
                this.finishPolygon();
                return;
            }
        }

        this.polygonVertices.push(point);

        if (this.callbacks.onPreviewUpdate) {
            this.callbacks.onPreviewUpdate({ type: 'polygon', vertices: this.polygonVertices });
        }
    }

    /**
     * Finish drawing polygon
     */
    finishPolygon() {
        const slot = this.getNextAvailableZoneSlot();
        if (slot === -1) return;

        if (this.polygonVertices.length < 3) {
            if (this.callbacks.onError) {
                this.callbacks.onError('Polygon needs at least 3 vertices.');
            }
            this.resetDrawingState();
            return;
        }

        // Calculate bounding box for sensor
        const xs = this.polygonVertices.map(v => v.x);
        const ys = this.polygonVertices.map(v => v.y);

        const zone = this.state.zones.zones[slot];
        zone.enabled = true;
        zone.shapeType = 'polygon';
        zone.vertices = [...this.polygonVertices];
        zone.x1 = Math.min(...xs);
        zone.y1 = Math.min(...ys);
        zone.x2 = Math.max(...xs);
        zone.y2 = Math.max(...ys);
        // Preserve existing zoneType or default to 'detection'
        if (!zone.zoneType) zone.zoneType = 'detection';

        this.resetDrawingState();
        this.selectedZoneIndex = slot;

        // Switch back to select mode
        this.setMode('select');

        if (this.callbacks.onZoneCreated) {
            this.callbacks.onZoneCreated(slot, zone);
        }
    }

    /**
     * Handle furniture placement
     */
    handleFurniturePlacement(sensorCoords) {
        if (!this.state.canvas.placingFurniture) return;

        // Set initial rotation to match map rotation so furniture appears upright
        const mapRotation = this.radarCanvas.mapRotation || 0;

        const furniture = {
            id: `furniture_${Date.now()}`,
            type: this.state.canvas.placingFurniture,
            x: Math.round(sensorCoords.x / 100) * 100,
            y: Math.round(sensorCoords.y / 100) * 100,
            rotation: mapRotation,
            width: this.getFurnitureDefaultSize(this.state.canvas.placingFurniture).width,
            height: this.getFurnitureDefaultSize(this.state.canvas.placingFurniture).height
        };

        this.state.annotations.furniture.push(furniture);

        if (this.callbacks.onFurniturePlaced) {
            this.callbacks.onFurniturePlaced(furniture);
        }
    }

    /**
     * Get default furniture size
     */
    getFurnitureDefaultSize(type) {
        const sizes = {
            // Seating
            chair: { width: 700, height: 700 },
            'dining-chair': { width: 450, height: 450 },
            sofa: { width: 1800, height: 800 },
            bed: { width: 2000, height: 1500 },
            // Tables
            table: { width: 1200, height: 800 },
            desk: { width: 1400, height: 700 },
            'bedside-table': { width: 500, height: 500 },
            // Storage
            cabinet: { width: 800, height: 500 },
            drawers: { width: 800, height: 500 },
            wardrobe: { width: 1200, height: 600 },
            // Electronics
            tv: { width: 1400, height: 200 },
            speaker: { width: 400, height: 600 },
            // Appliances
            fridge: { width: 700, height: 700 },
            radiator: { width: 1000, height: 200 },
            fan: { width: 500, height: 500 },
            // Fixtures
            window: { width: 1200, height: 200 },
            lamp: { width: 350, height: 350 },
            plant: { width: 400, height: 400 }
        };
        return sizes[type] || { width: 500, height: 500 };
    }

    /**
     * Handle entrance placement
     */
    handleEntrancePlacement(sensorCoords) {
        const entrance = {
            id: `entrance_${Date.now()}`,
            x: Math.round(sensorCoords.x / 100) * 100,
            y: Math.round(sensorCoords.y / 100) * 100,
            direction: 0,
            label: `Entry ${this.state.annotations.entrances.length + 1}`
        };

        this.state.annotations.entrances.push(entrance);

        // Switch back to select mode
        this.setMode('select');

        if (this.callbacks.onEntrancePlaced) {
            this.callbacks.onEntrancePlaced(entrance);
        }
    }

    /**
     * Handle keyboard events
     */
    handleKeyDown(event) {
        if (event.key === 'Escape') {
            this.resetDrawingState();
            this.setMode('select');
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
            if (this.mode === 'select') {
                if (this.selectedEntranceIndex !== null) {
                    this.deleteSelectedEntrance();
                } else if (this.selectedFurnitureIndex !== null) {
                    this.deleteSelectedFurniture();
                } else if (this.selectedZoneIndex !== null) {
                    this.deleteSelectedZone();
                }
            }
        }
    }

    /**
     * Delete the selected entrance
     */
    deleteSelectedEntrance() {
        if (this.selectedEntranceIndex === null) return;

        if (this.callbacks.onEntranceDeleted) {
            this.callbacks.onEntranceDeleted(this.selectedEntranceIndex);
        }

        this.state.annotations.entrances.splice(this.selectedEntranceIndex, 1);
        this.selectedEntranceIndex = null;
    }

    /**
     * Move entrance to new position
     */
    moveEntrance(sensorCoords) {
        const entrance = this.state.annotations.entrances[this.selectedEntranceIndex];

        const newX = sensorCoords.x - this.dragOffset.x;
        const newY = sensorCoords.y - this.dragOffset.y;

        // Clamp to sensor range
        entrance.x = Math.max(-3000, Math.min(3000, Math.round(newX / 50) * 50));
        entrance.y = Math.max(0, Math.min(6000, Math.round(newY / 50) * 50));

        if (this.callbacks.onEntranceUpdate) {
            this.callbacks.onEntranceUpdate(this.selectedEntranceIndex, entrance);
        }
    }

    /**
     * Rotate entrance by 45 degrees
     */
    rotateSelectedEntrance() {
        if (this.selectedEntranceIndex === null) return;

        const entrance = this.state.annotations.entrances[this.selectedEntranceIndex];
        entrance.direction = ((entrance.direction || 0) + 45) % 360;

        if (this.callbacks.onEntranceUpdate) {
            this.callbacks.onEntranceUpdate(this.selectedEntranceIndex, entrance);
        }
    }

    /**
     * Delete the currently selected zone
     */
    deleteSelectedZone() {
        if (this.selectedZoneIndex === null) return;

        const zone = this.state.zones.zones[this.selectedZoneIndex];
        zone.enabled = false;
        zone.shapeType = 'rectangle';
        zone.vertices = null;

        if (this.callbacks.onZoneDeleted) {
            this.callbacks.onZoneDeleted(this.selectedZoneIndex);
        }

        this.selectedZoneIndex = null;
    }

    /**
     * Get current preview state for rendering
     */
    getPreviewState() {
        return {
            mode: this.mode,
            isDrawing: this.isDrawing,
            previewRect: this.previewRect,
            previewPolygon: this.previewPolygon,
            selectedZoneIndex: this.selectedZoneIndex,
            polygonVertices: this.polygonVertices
        };
    }

    // ========================================================================
    // Edge Drawing Functions
    // ========================================================================

    /**
     * Check if a point is inside an edge rectangle
     */
    isPointInEdge(sensorX, sensorY, edge) {
        const minX = Math.min(edge.x1, edge.x2);
        const maxX = Math.max(edge.x1, edge.x2);
        const minY = Math.min(edge.y1, edge.y2);
        const maxY = Math.max(edge.y1, edge.y2);
        return sensorX >= minX && sensorX <= maxX && sensorY >= minY && sensorY <= maxY;
    }

    /**
     * Handle edge drawing mouse down - start drawing an edge rectangle
     */
    handleEdgeMouseDown(sensorCoords) {
        this.isDrawing = true;
        this.startPoint = sensorCoords;
        this.currentPoint = sensorCoords;
        this.drawingEdge = true;
    }

    /**
     * Complete edge drawing
     */
    completeEdgeDrawing() {
        if (!this.startPoint || !this.currentPoint) return;

        // Snap to grid (100mm)
        const x1 = Math.round(this.startPoint.x / 100) * 100;
        const y1 = Math.round(this.startPoint.y / 100) * 100;
        const x2 = Math.round(this.currentPoint.x / 100) * 100;
        const y2 = Math.round(this.currentPoint.y / 100) * 100;

        // Minimum size check
        if (Math.abs(x2 - x1) < 100 || Math.abs(y2 - y1) < 100) {
            this.resetDrawingState();
            this.drawingEdge = false;
            return;
        }

        // Create edge
        const edge = {
            id: `edge_${Date.now()}`,
            x1: Math.min(x1, x2),
            y1: Math.min(y1, y2),
            x2: Math.max(x1, x2),
            y2: Math.max(y1, y2)
        };

        // Initialize edges array if needed
        if (!this.state.annotations.edges) {
            this.state.annotations.edges = [];
        }

        this.state.annotations.edges.push(edge);

        this.resetDrawingState();
        this.drawingEdge = false;

        // Switch back to select mode
        this.setMode('select');

        if (this.callbacks.onEdgePlaced) {
            this.callbacks.onEdgePlaced(edge);
        }
    }

    /**
     * Delete selected edge
     */
    deleteSelectedEdge() {
        if (this.selectedEdgeIndex === null) return;

        if (this.callbacks.onEdgeDeleted) {
            this.callbacks.onEdgeDeleted(this.selectedEdgeIndex);
        }

        this.state.annotations.edges.splice(this.selectedEdgeIndex, 1);
        this.selectedEdgeIndex = null;
    }
}
