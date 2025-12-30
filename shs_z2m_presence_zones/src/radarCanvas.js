/**
 * RadarCanvas - Handles 2D visualization of SHS01 radar data
 * Draws sensor origin, detection zones, and real-time target positions
 */

export class RadarCanvas {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // SHS01 coordinate system (millimeters)
        this.SENSOR_RANGE = {
            X_MIN: -3000,  // -3m left
            X_MAX: 3000,   // +3m right
            Y_MIN: 0,      // 0m at sensor
            Y_MAX: 6000    // 6m forward
        };

        // Visual settings - will be updated based on theme
        this.updateColors();

        // Watch for theme changes
        this.themeObserver = new MutationObserver(() => this.updateColors());
        this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        // Drawing state
        this.drawingPreview = null;
        this.selectedZoneIndex = null;
        this.selectedFurnitureIndex = null;
        this.selectedEntranceIndex = null;
        this.selectedEdgeIndex = null;
        this.mapRotation = 0; // 0, 90, 180, 270

        // Initialize
        this.resize();

        // Handle window resize
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        // Get canvas container size
        const container = this.canvas.parentElement;
        const size = Math.min(container.clientWidth, container.clientHeight, 900);

        // Set canvas size
        this.canvas.width = size;
        this.canvas.height = size;

        // Calculate scaling
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.centerX = this.width / 2;
        this.centerY = this.height;

        // Pixels per millimeter
        this.scaleX = this.width / (this.SENSOR_RANGE.X_MAX - this.SENSOR_RANGE.X_MIN);
        this.scaleY = this.height / (this.SENSOR_RANGE.Y_MAX - this.SENSOR_RANGE.Y_MIN);
    }

    /**
     * Update colors based on current theme
     */
    updateColors() {
        const isLightMode = document.documentElement.getAttribute('data-theme') === 'light';

        if (isLightMode) {
            this.COLORS = {
                background: '#f6f8fa',
                grid: '#d0d7de',
                gridLabel: '#656d76',
                sensor: '#0969da',
                target: '#1a7f37',
                targetInactive: '#8c959f',
                zone1: 'rgba(9, 105, 218, 0.15)',
                zone1Border: '#0969da',
                zone2: 'rgba(154, 103, 0, 0.15)',
                zone2Border: '#9a6700',
                zone3: 'rgba(207, 34, 46, 0.15)',
                zone3Border: '#cf222e',
                zone4: 'rgba(139, 92, 246, 0.15)',
                zone4Border: '#8b5cf6',
                zone5: 'rgba(6, 182, 212, 0.15)',
                zone5Border: '#06b6d4',
                preview: 'rgba(0, 0, 0, 0.2)',
                previewBorder: '#1f2328',
                selection: '#0969da',
                handle: '#ffffff',
                furniture: 'rgba(101, 109, 118, 0.4)',
                furnitureBorder: '#656d76',
                entrance: '#9a6700',
                edge: 'rgba(140, 149, 159, 0.5)',
                edgeBorder: '#8c959f',
                edgePreview: 'rgba(140, 149, 159, 0.3)'
            };
        } else {
            this.COLORS = {
                background: '#21262d',
                grid: '#30363d',
                gridLabel: '#484f58',
                sensor: '#58a6ff',
                target: '#3fb950',
                targetInactive: '#6e7681',
                zone1: 'rgba(88, 166, 255, 0.2)',
                zone1Border: '#58a6ff',
                zone2: 'rgba(210, 153, 34, 0.2)',
                zone2Border: '#d29922',
                zone3: 'rgba(248, 81, 73, 0.2)',
                zone3Border: '#f85149',
                zone4: 'rgba(139, 92, 246, 0.2)',
                zone4Border: '#a78bfa',
                zone5: 'rgba(6, 182, 212, 0.2)',
                zone5Border: '#22d3ee',
                preview: 'rgba(255, 255, 255, 0.3)',
                previewBorder: '#ffffff',
                selection: '#58a6ff',
                handle: '#ffffff',
                furniture: 'rgba(139, 148, 158, 0.5)',
                furnitureBorder: '#8b949e',
                entrance: '#d29922',
                edge: 'rgba(80, 80, 80, 0.7)',
                edgeBorder: '#6e7681',
                edgePreview: 'rgba(80, 80, 80, 0.4)'
            };
        }
    }

    /**
     * Convert sensor coordinates (mm) to canvas coordinates (px)
     */
    toCanvasX(x) {
        return this.centerX + (x * this.scaleX);
    }

    toCanvasY(y) {
        return this.centerY - (y * this.scaleY);
    }

    /**
     * Convert canvas coordinates (px) to sensor coordinates (mm)
     */
    toSensorX(canvasX) {
        return (canvasX - this.centerX) / this.scaleX;
    }

    toSensorY(canvasY) {
        return (this.centerY - canvasY) / this.scaleY;
    }

    /**
     * Set the drawing preview state
     */
    setDrawingPreview(preview) {
        this.drawingPreview = preview;
    }

    /**
     * Set the selected zone index
     */
    setSelectedZone(index) {
        this.selectedZoneIndex = index;
    }

    /**
     * Set the selected furniture index
     */
    setSelectedFurniture(index) {
        this.selectedFurnitureIndex = index;
    }

    /**
     * Set map rotation (0, 90, 180, 270 degrees)
     */
    setMapRotation(degrees) {
        this.mapRotation = degrees % 360;
    }

    /**
     * Transform sensor coordinates to room/display coordinates based on map rotation.
     * This accounts for the physical orientation of the sensor in the room.
     *
     * The transformation ensures that when drawn through toCanvasX/Y, the result
     * appears at the correct visual position for the given rotation.
     *
     * When sensor is at bottom (0°): no transformation needed
     * When sensor is at top (180°): flip X, invert Y (sensor at top looking down)
     * When sensor is at left (90°): swap X/Y with adjustments
     * When sensor is at right (270°): swap X/Y with different adjustments
     */
    transformSensorToRoom(sensorX, sensorY) {
        const Y_MAX = this.SENSOR_RANGE.Y_MAX; // 6000mm

        switch (this.mapRotation) {
            case 0:
                // Sensor at bottom looking up - no change
                return { x: sensorX, y: sensorY };
            case 90:
                // Sensor on left looking right
                // sensor LEFT (X-) = visual TOP, sensor RIGHT (X+) = visual BOTTOM
                // sensor NEAR (Y small) = visual LEFT, sensor FAR (Y large) = visual RIGHT
                return { x: sensorY - 3000, y: sensorX + 3000 };
            case 180:
                // Sensor on top looking down
                // Keep X same, invert Y
                return { x: sensorX, y: Y_MAX - sensorY };
            case 270:
                // Sensor on right looking left
                // sensor LEFT (X-) = visual BOTTOM, sensor RIGHT (X+) = visual TOP
                // sensor NEAR (Y small) = visual RIGHT, sensor FAR (Y large) = visual LEFT
                return { x: -(sensorY - 3000), y: -sensorX + 3000 };
            default:
                return { x: sensorX, y: sensorY };
        }
    }

    /**
     * Transform room/display coordinates back to sensor coordinates.
     * This is the inverse of transformSensorToRoom.
     */
    transformRoomToSensor(roomX, roomY) {
        const Y_MAX = this.SENSOR_RANGE.Y_MAX; // 6000mm

        switch (this.mapRotation) {
            case 0:
                return { x: roomX, y: roomY };
            case 90:
                // Inverse of 90° transform: x = sensorY - 3000, y = sensorX + 3000
                // So: sensorX = roomY - 3000, sensorY = roomX + 3000
                return { x: roomY - 3000, y: roomX + 3000 };
            case 180:
                // Inverse of 180° transform
                return { x: roomX, y: Y_MAX - roomY };
            case 270:
                // Inverse of 270° transform: x = 3000 - sensorY, y = 3000 - sensorX
                // So: sensorY = 3000 - roomX, sensorX = 3000 - roomY
                return { x: 3000 - roomY, y: 3000 - roomX };
            default:
                return { x: roomX, y: roomY };
        }
    }

    /**
     * Draw text that stays upright regardless of map rotation
     */
    drawUprightText(text, x, y, options = {}) {
        const { align = 'center', baseline = 'middle', font = '11px monospace', color = this.COLORS.gridLabel } = options;

        this.ctx.save();
        this.ctx.translate(x, y);

        // Counter-rotate to keep text upright
        if (this.mapRotation !== 0) {
            this.ctx.rotate(-this.mapRotation * Math.PI / 180);
        }

        this.ctx.font = font;
        this.ctx.fillStyle = color;
        this.ctx.textAlign = align;
        this.ctx.textBaseline = baseline;
        this.ctx.fillText(text, 0, 0);

        this.ctx.restore();
    }

    /**
     * Set the selected entrance index
     */
    setSelectedEntrance(index) {
        this.selectedEntranceIndex = index;
    }

    setSelectedEdge(index) {
        this.selectedEdgeIndex = index;
    }

    /**
     * Main draw function - called every frame
     */
    drawFrame(targets = [], zones = [], annotations = null) {
        // Clear canvas
        this.ctx.fillStyle = this.COLORS.background;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Apply map rotation for all elements (grid, zones, targets, furniture)
        this.ctx.save();
        if (this.mapRotation !== 0) {
            this.ctx.translate(this.width / 2, this.height / 2);
            this.ctx.rotate(this.mapRotation * Math.PI / 180);
            this.ctx.translate(-this.width / 2, -this.height / 2);
        }

        // Draw edges first (grey-out areas behind everything)
        if (annotations && annotations.edges) {
            this.drawEdges(annotations.edges);
        }

        // Draw grid
        this.drawGrid();

        // Draw zones in sensor coordinates (canvas rotation handles visual display)
        zones.forEach((zone, index) => {
            if (zone.enabled) {
                this.drawZone(zone, index, index === this.selectedZoneIndex);
            }
        });

        // Draw selection handles for selected zone
        if (this.selectedZoneIndex !== null && zones[this.selectedZoneIndex]?.enabled) {
            this.drawSelectionHandles(zones[this.selectedZoneIndex]);
        }

        // Draw drawing preview
        if (this.drawingPreview) {
            this.drawPreview(this.drawingPreview);
        }

        // Draw annotations (furniture, entrances) if provided
        if (annotations) {
            this.drawAnnotations(annotations);
        }

        // Draw sensor origin (inside rotated context so it moves with rotation)
        this.drawSensorOrigin();

        // Restore context after rotation
        this.ctx.restore();

        // Draw targets OUTSIDE the rotated context using explicit transformation
        // This gives more predictable and debuggable results
        console.log(`[DRAW FRAME] targets.length = ${targets.length}`);
        if (targets.length > 0) {
            console.log(`[DRAW FRAME] Drawing ${targets.length} targets:`, JSON.stringify(targets));
        }
        targets.forEach((target, index) => {
            this.drawTarget(target, index);
        });
    }

    /**
     * Draw annotations (furniture and entrances)
     */
    drawAnnotations(annotations) {
        // Draw furniture
        if (annotations.furniture && annotations.furniture.length > 0) {
            annotations.furniture.forEach((furniture, index) => {
                const isSelected = index === this.selectedFurnitureIndex;
                this.drawFurniture(furniture, isSelected);
            });
        }

        // Draw entrances
        if (annotations.entrances && annotations.entrances.length > 0) {
            annotations.entrances.forEach((entrance, index) => {
                const isSelected = index === this.selectedEntranceIndex;
                this.drawEntrance(entrance, isSelected);
            });
        }
    }

    /**
     * Draw a furniture item
     */
    drawFurniture(furniture, isSelected = false) {
        const x = this.toCanvasX(furniture.x);
        const y = this.toCanvasY(furniture.y);

        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate((furniture.rotation || 0) * Math.PI / 180);

        const halfW = (furniture.width * this.scaleX) / 2;
        const halfH = (furniture.height * this.scaleY) / 2;

        // Draw selection outline if selected
        if (isSelected) {
            this.ctx.strokeStyle = this.COLORS.selection;
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 4]);
            this.ctx.strokeRect(-halfW - 4, -halfH - 4, halfW * 2 + 8, halfH * 2 + 8);
            this.ctx.setLineDash([]);
        }

        // Draw based on furniture type with simpler, cleaner icons
        switch (furniture.type) {
            case 'table':
                this.drawSimpleTable(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'desk':
                this.drawSimpleDesk(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'bedside-table':
                this.drawSimpleBedsideTable(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'chair':
                this.drawSimpleChair(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'dining-chair':
                this.drawSimpleDiningChair(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'bed':
                this.drawSimpleBed(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'sofa':
                this.drawSimpleSofa(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'plant':
                this.drawSimplePlant(0, 0, Math.min(halfW, halfH));
                break;
            case 'cabinet':
                this.drawSimpleCabinet(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'drawers':
                this.drawSimpleDrawers(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'wardrobe':
                this.drawSimpleWardrobe(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'lamp':
                this.drawSimpleLamp(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'tv':
                this.drawSimpleTV(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'speaker':
                this.drawSimpleSpeaker(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'fridge':
                this.drawSimpleFridge(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'radiator':
                this.drawSimpleRadiator(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            case 'fan':
                this.drawSimpleFan(0, 0, Math.min(halfW, halfH));
                break;
            case 'window':
                this.drawSimpleWindow(-halfW, -halfH, halfW * 2, halfH * 2);
                break;
            default:
                // Generic rectangle
                this.ctx.fillStyle = 'rgba(100, 100, 110, 0.6)';
                this.roundRect(-halfW, -halfH, halfW * 2, halfH * 2, 4);
                this.ctx.fill();
                this.ctx.strokeStyle = 'rgba(140, 140, 150, 0.8)';
                this.ctx.lineWidth = 1.5;
                this.roundRect(-halfW, -halfH, halfW * 2, halfH * 2, 4);
                this.ctx.stroke();
        }

        // Draw resize handles if selected
        if (isSelected) {
            this.drawFurnitureHandle(-halfW, -halfH);
            this.drawFurnitureHandle(halfW, -halfH);
            this.drawFurnitureHandle(-halfW, halfH);
            this.drawFurnitureHandle(halfW, halfH);
        }

        this.ctx.restore();
    }

    /**
     * Draw a furniture resize handle (small circle)
     */
    drawFurnitureHandle(x, y) {
        const size = 7;
        this.ctx.fillStyle = this.COLORS.handle;
        this.ctx.strokeStyle = this.COLORS.selection;
        this.ctx.lineWidth = 2;

        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
    }

    // Polished top-down furniture icons
    drawSimpleTable(x, y, w, h) {
        const r = 4;

        // Table frame (dark wood border)
        this.ctx.fillStyle = '#6B4423';
        this.roundRect(x, y, w, h, r);
        this.ctx.fill();

        // Table surface (lighter wood)
        this.ctx.fillStyle = '#D4A574';
        this.roundRect(x + 3, y + 3, w - 6, h - 6, r - 1);
        this.ctx.fill();

        // Wood grain lines (horizontal)
        this.ctx.strokeStyle = 'rgba(139, 90, 43, 0.3)';
        this.ctx.lineWidth = 1;
        const grainSpacing = h / 5;
        for (let i = 1; i < 5; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + 8, y + grainSpacing * i);
            this.ctx.lineTo(x + w - 8, y + grainSpacing * i);
            this.ctx.stroke();
        }

        // Center decoration (optional placemats/items indicator)
        this.ctx.fillStyle = 'rgba(107, 68, 35, 0.2)';
        const centerW = w * 0.4;
        const centerH = h * 0.25;
        this.roundRect(x + (w - centerW) / 2, y + (h - centerH) / 2, centerW, centerH, 2);
        this.ctx.fill();

        // Border
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        this.ctx.lineWidth = 2;
        this.roundRect(x, y, w, h, r);
        this.ctx.stroke();
    }

    drawSimpleDesk(x, y, w, h) {
        const r = 2;

        // Desk body (darker wood)
        this.ctx.fillStyle = '#5D4037';
        this.roundRect(x, y, w, h, r);
        this.ctx.fill();

        // Desk surface (lighter)
        this.ctx.fillStyle = '#8D6E63';
        this.roundRect(x + 2, y + 2, w - 4, h - 4, r);
        this.ctx.fill();

        // Drawer section (left side)
        this.ctx.fillStyle = '#6D4C41';
        this.roundRect(x + 4, y + h * 0.4, w * 0.35, h * 0.55, 1);
        this.ctx.fill();

        // Drawer handle
        this.ctx.fillStyle = '#FFD700';
        this.ctx.beginPath();
        this.ctx.arc(x + w * 0.22, y + h * 0.67, 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Computer/monitor area (right side)
        this.ctx.fillStyle = '#4A4A4A';
        this.roundRect(x + w * 0.55, y + h * 0.15, w * 0.35, h * 0.25, 1);
        this.ctx.fill();

        // Screen
        this.ctx.fillStyle = '#6B6B6B';
        this.roundRect(x + w * 0.58, y + h * 0.2, w * 0.28, h * 0.15, 1);
        this.ctx.fill();
    }

    drawSimpleBedsideTable(x, y, w, h) {
        const r = 3;

        // Table frame
        this.ctx.fillStyle = '#6B4423';
        this.roundRect(x, y, w, h, r);
        this.ctx.fill();

        // Table surface
        this.ctx.fillStyle = '#8B5A2B';
        this.roundRect(x + 2, y + 2, w - 4, h - 4, r - 1);
        this.ctx.fill();

        // Drawer divider line
        this.ctx.strokeStyle = '#5D4037';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x + 2, y + h / 2);
        this.ctx.lineTo(x + w - 2, y + h / 2);
        this.ctx.stroke();

        // Top drawer handle
        this.ctx.fillStyle = '#FFD700';
        this.ctx.beginPath();
        this.ctx.arc(x + w / 2, y + h * 0.25, 2.5, 0, Math.PI * 2);
        this.ctx.fill();

        // Bottom drawer handle
        this.ctx.beginPath();
        this.ctx.arc(x + w / 2, y + h * 0.75, 2.5, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawSimpleChair(x, y, w, h) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const r = 4;

        // Main chair color - warm coral/orange
        const chairColor = '#E07850';
        const chairDark = '#C05A38';
        const chairLight = '#F09070';

        // Back rest (top curved part)
        this.ctx.fillStyle = chairDark;
        this.roundRect(x + w * 0.1, y, w * 0.8, h * 0.35, r);
        this.ctx.fill();

        // Main seat body
        this.ctx.fillStyle = chairColor;
        this.roundRect(x, y + h * 0.25, w, h * 0.6, r);
        this.ctx.fill();

        // Seat cushion (lighter center)
        this.ctx.fillStyle = chairLight;
        this.roundRect(x + w * 0.15, y + h * 0.35, w * 0.7, h * 0.4, r - 1);
        this.ctx.fill();

        // Armrests
        this.ctx.fillStyle = chairDark;
        this.roundRect(x - w * 0.05, y + h * 0.2, w * 0.18, h * 0.55, r);
        this.ctx.fill();
        this.roundRect(x + w * 0.87, y + h * 0.2, w * 0.18, h * 0.55, r);
        this.ctx.fill();

        // Subtle shadow/border
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        this.ctx.lineWidth = 1.5;
        this.roundRect(x - w * 0.05, y, w * 1.1, h * 0.85, r);
        this.ctx.stroke();
    }

    drawSimpleDiningChair(x, y, w, h) {
        const r = 2;
        const cx = x + w / 2;
        const cy = y + h / 2;

        // Top-down view of dining chair
        // Chair seat (square with rounded corners)
        this.ctx.fillStyle = '#D4A574';
        this.roundRect(x + w * 0.15, y + h * 0.3, w * 0.7, h * 0.6, r);
        this.ctx.fill();

        // Seat cushion (slightly smaller, darker)
        this.ctx.fillStyle = '#C4956A';
        this.roundRect(x + w * 0.22, y + h * 0.37, w * 0.56, h * 0.46, r);
        this.ctx.fill();

        // Chair back (curved top edge - viewed from above)
        this.ctx.fillStyle = '#8B5A2B';
        this.roundRect(x + w * 0.1, y + h * 0.05, w * 0.8, h * 0.2, r);
        this.ctx.fill();

        // Back slats (vertical lines on backrest)
        this.ctx.strokeStyle = '#6B4423';
        this.ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const slotX = x + w * (0.3 + i * 0.2);
            this.ctx.beginPath();
            this.ctx.moveTo(slotX, y + h * 0.08);
            this.ctx.lineTo(slotX, y + h * 0.22);
            this.ctx.stroke();
        }

        // Four legs (corners)
        this.ctx.fillStyle = '#5D4037';
        const legSize = Math.min(w, h) * 0.1;
        // Front legs
        this.ctx.beginPath();
        this.ctx.arc(x + w * 0.22, y + h * 0.82, legSize, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x + w * 0.78, y + h * 0.82, legSize, 0, Math.PI * 2);
        this.ctx.fill();
        // Back legs
        this.ctx.beginPath();
        this.ctx.arc(x + w * 0.22, y + h * 0.38, legSize, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x + w * 0.78, y + h * 0.38, legSize, 0, Math.PI * 2);
        this.ctx.fill();

        // Border
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.lineWidth = 1;
        this.roundRect(x + w * 0.1, y + h * 0.05, w * 0.8, h * 0.85, r);
        this.ctx.stroke();
    }

    drawSimpleBed(x, y, w, h) {
        const r = 4;

        // Bed frame (dark wood)
        this.ctx.fillStyle = '#5D4037';
        this.roundRect(x, y, w, h, r);
        this.ctx.fill();

        // Mattress (light gray/white)
        this.ctx.fillStyle = '#E8E8E8';
        this.roundRect(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.84, r - 1);
        this.ctx.fill();

        // Headboard (darker, at top)
        this.ctx.fillStyle = '#4A3228';
        this.roundRect(x, y, w * 0.12, h, r);
        this.ctx.fill();

        // Pillows (cream colored)
        this.ctx.fillStyle = '#F5F0E6';
        // Top pillow
        this.roundRect(x + w * 0.15, y + h * 0.12, w * 0.25, h * 0.32, 3);
        this.ctx.fill();
        // Bottom pillow
        this.roundRect(x + w * 0.15, y + h * 0.56, w * 0.25, h * 0.32, 3);
        this.ctx.fill();

        // Blanket fold line
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(x + w * 0.45, y + h * 0.1);
        this.ctx.lineTo(x + w * 0.45, y + h * 0.9);
        this.ctx.stroke();

        // Border
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.lineWidth = 1.5;
        this.roundRect(x, y, w, h, r);
        this.ctx.stroke();
    }

    drawSimpleSofa(x, y, w, h) {
        const r = 5;

        // Sofa color - blue like in the reference
        const sofaColor = '#4A6FA5';
        const sofaDark = '#3A5A8A';
        const sofaLight = '#6090C0';

        // Main body shadow/base
        this.ctx.fillStyle = sofaDark;
        this.roundRect(x, y, w, h * 0.9, r);
        this.ctx.fill();

        // Back rest
        this.ctx.fillStyle = sofaDark;
        this.roundRect(x + w * 0.1, y, w * 0.8, h * 0.3, r);
        this.ctx.fill();

        // Main seat
        this.ctx.fillStyle = sofaColor;
        this.roundRect(x + w * 0.08, y + h * 0.2, w * 0.84, h * 0.6, r);
        this.ctx.fill();

        // Left cushion
        this.ctx.fillStyle = sofaLight;
        this.roundRect(x + w * 0.12, y + h * 0.28, w * 0.35, h * 0.45, r - 1);
        this.ctx.fill();

        // Right cushion
        this.ctx.fillStyle = sofaLight;
        this.roundRect(x + w * 0.53, y + h * 0.28, w * 0.35, h * 0.45, r - 1);
        this.ctx.fill();

        // Armrests
        this.ctx.fillStyle = sofaDark;
        this.roundRect(x - w * 0.02, y + h * 0.1, w * 0.14, h * 0.7, r);
        this.ctx.fill();
        this.roundRect(x + w * 0.88, y + h * 0.1, w * 0.14, h * 0.7, r);
        this.ctx.fill();

        // Border
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        this.ctx.lineWidth = 1.5;
        this.roundRect(x - w * 0.02, y, w * 1.04, h * 0.9, r);
        this.ctx.stroke();
    }

    drawSimplePlant(x, y, radius) {
        // Pot (terracotta brown)
        const potH = radius * 0.6;
        const potTopW = radius * 0.5;
        const potBotW = radius * 0.35;

        this.ctx.fillStyle = '#8B5A2B';
        this.ctx.beginPath();
        this.ctx.moveTo(x - potTopW, y);
        this.ctx.lineTo(x + potTopW, y);
        this.ctx.lineTo(x + potBotW, y + potH);
        this.ctx.lineTo(x - potBotW, y + potH);
        this.ctx.closePath();
        this.ctx.fill();

        // Pot rim
        this.ctx.fillStyle = '#A0522D';
        this.ctx.beginPath();
        this.ctx.ellipse(x, y, potTopW, potTopW * 0.25, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Foliage - multiple overlapping circles for tree/bush look
        const leafColor = '#4CAF50';
        const leafDark = '#388E3C';

        // Bottom leaves
        this.ctx.fillStyle = leafDark;
        this.ctx.beginPath();
        this.ctx.arc(x - radius * 0.3, y - radius * 0.2, radius * 0.4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x + radius * 0.3, y - radius * 0.2, radius * 0.4, 0, Math.PI * 2);
        this.ctx.fill();

        // Top leaves
        this.ctx.fillStyle = leafColor;
        this.ctx.beginPath();
        this.ctx.arc(x, y - radius * 0.5, radius * 0.5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x - radius * 0.2, y - radius * 0.3, radius * 0.35, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x + radius * 0.2, y - radius * 0.3, radius * 0.35, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawSimpleCabinet(x, y, w, h) {
        const r = 3;

        // Cabinet body (dark wood)
        this.ctx.fillStyle = '#5D4037';
        this.roundRect(x, y, w, h, r);
        this.ctx.fill();

        // Cabinet top surface (lighter)
        this.ctx.fillStyle = '#8D6E63';
        this.roundRect(x + w * 0.05, y + h * 0.05, w * 0.9, h * 0.9, r - 1);
        this.ctx.fill();

        // Drawer/door lines
        this.ctx.strokeStyle = '#4A3228';
        this.ctx.lineWidth = 2;

        // Horizontal divider
        this.ctx.beginPath();
        this.ctx.moveTo(x + w * 0.1, y + h * 0.5);
        this.ctx.lineTo(x + w * 0.9, y + h * 0.5);
        this.ctx.stroke();

        // Vertical divider (for doors)
        this.ctx.beginPath();
        this.ctx.moveTo(x + w * 0.5, y + h * 0.55);
        this.ctx.lineTo(x + w * 0.5, y + h * 0.95);
        this.ctx.stroke();

        // Door handles
        this.ctx.fillStyle = '#FFD700';
        this.ctx.beginPath();
        this.ctx.arc(x + w * 0.35, y + h * 0.75, w * 0.04, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x + w * 0.65, y + h * 0.75, w * 0.04, 0, Math.PI * 2);
        this.ctx.fill();

        // Drawer handle
        this.ctx.beginPath();
        this.ctx.arc(x + w * 0.5, y + h * 0.3, w * 0.04, 0, Math.PI * 2);
        this.ctx.fill();

        // Border
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.lineWidth = 1.5;
        this.roundRect(x, y, w, h, r);
        this.ctx.stroke();
    }

    drawSimpleDrawers(x, y, w, h) {
        const r = 3;

        // Outer frame
        this.ctx.fillStyle = '#5D4037';
        this.roundRect(x, y, w, h, r);
        this.ctx.fill();

        // Three drawer sections
        const drawerHeight = (h - 8) / 3;
        const gap = 2;

        for (let i = 0; i < 3; i++) {
            const drawerY = y + 2 + i * (drawerHeight + gap);

            // Drawer face
            this.ctx.fillStyle = '#8D6E63';
            this.roundRect(x + 2, drawerY, w - 4, drawerHeight, 1);
            this.ctx.fill();

            // Drawer handle (silver/chrome)
            this.ctx.fillStyle = '#C0C0C0';
            this.ctx.beginPath();
            this.ctx.arc(x + w / 2, drawerY + drawerHeight / 2, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Border
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.lineWidth = 1;
        this.roundRect(x, y, w, h, r);
        this.ctx.stroke();
    }

    drawSimpleWardrobe(x, y, w, h) {
        const r = 3;

        // Outer frame (dark wood)
        this.ctx.fillStyle = '#4A3228';
        this.roundRect(x, y, w, h, r);
        this.ctx.fill();

        // Left door
        this.ctx.fillStyle = '#6B4423';
        this.roundRect(x + 2, y + 2, w / 2 - 3, h - 4, 1);
        this.ctx.fill();

        // Right door
        this.ctx.fillStyle = '#6B4423';
        this.roundRect(x + w / 2 + 1, y + 2, w / 2 - 3, h - 4, 1);
        this.ctx.fill();

        // Center divider line
        this.ctx.strokeStyle = '#3D2817';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x + w / 2, y + 2);
        this.ctx.lineTo(x + w / 2, y + h - 2);
        this.ctx.stroke();

        // Door handles (silver/chrome)
        this.ctx.fillStyle = '#C0C0C0';
        this.ctx.beginPath();
        this.ctx.arc(x + w * 0.4, y + h / 2, 2.5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x + w * 0.6, y + h / 2, 2.5, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawSimpleLamp(x, y, w, h) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const radius = Math.min(w, h) / 2;

        // Outer glow (subtle)
        const gradient = this.ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
        gradient.addColorStop(0, 'rgba(255, 235, 150, 0.4)');
        gradient.addColorStop(0.7, 'rgba(255, 235, 150, 0.15)');
        gradient.addColorStop(1, 'rgba(255, 235, 150, 0)');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Lamp shade (cream/yellow)
        this.ctx.fillStyle = '#F0E68C';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
        this.ctx.fill();

        // Inner shade detail
        this.ctx.fillStyle = '#FFFACD';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius * 0.4, 0, Math.PI * 2);
        this.ctx.fill();

        // Center (bulb/base)
        this.ctx.fillStyle = '#DAA520';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius * 0.15, 0, Math.PI * 2);
        this.ctx.fill();

        // Border
        this.ctx.strokeStyle = 'rgba(180, 150, 50, 0.5)';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
        this.ctx.stroke();
    }

    drawSimpleTV(x, y, w, h) {
        const r = 2;

        // TV body (dark)
        this.ctx.fillStyle = '#1a1a1a';
        this.roundRect(x, y, w, h, r);
        this.ctx.fill();

        // Screen (inner rectangle)
        const padding = Math.min(w, h) * 0.1;
        this.ctx.fillStyle = '#4a90d9';
        this.roundRect(x + padding, y + padding, w - padding * 2, h - padding * 2, r);
        this.ctx.fill();

        // Border
        this.ctx.strokeStyle = 'rgba(80, 80, 80, 0.8)';
        this.ctx.lineWidth = 1.5;
        this.roundRect(x, y, w, h, r);
        this.ctx.stroke();
    }

    drawSimpleSpeaker(x, y, w, h) {
        const r = 4;

        // Speaker body
        this.ctx.fillStyle = '#2d2d2d';
        this.roundRect(x, y, w, h, r);
        this.ctx.fill();

        // Top speaker cone (small)
        const coneRadius = Math.min(w, h) * 0.2;
        const topConeY = y + h * 0.25;
        this.ctx.fillStyle = '#3d3d3d';
        this.ctx.beginPath();
        this.ctx.arc(x + w / 2, topConeY, coneRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // Bottom speaker cone (large)
        const bigConeRadius = Math.min(w, h) * 0.35;
        const bottomConeY = y + h * 0.65;
        this.ctx.beginPath();
        this.ctx.arc(x + w / 2, bottomConeY, bigConeRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // Border
        this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
        this.ctx.lineWidth = 1.5;
        this.roundRect(x, y, w, h, r);
        this.ctx.stroke();
    }

    drawSimpleFridge(x, y, w, h) {
        const r = 3;

        // Fridge body
        this.ctx.fillStyle = '#E0E0E0';
        this.roundRect(x, y, w, h, r);
        this.ctx.fill();

        // Freezer section (top)
        this.ctx.fillStyle = '#F5F5F5';
        this.roundRect(x + 2, y + 2, w - 4, h * 0.3, r);
        this.ctx.fill();

        // Main compartment
        this.ctx.fillStyle = '#F5F5F5';
        this.roundRect(x + 2, y + h * 0.35, w - 4, h * 0.62, r);
        this.ctx.fill();

        // Divider line
        this.ctx.strokeStyle = '#BDBDBD';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x + 2, y + h * 0.33);
        this.ctx.lineTo(x + w - 2, y + h * 0.33);
        this.ctx.stroke();

        // Handle
        this.ctx.fillStyle = '#9E9E9E';
        this.ctx.fillRect(x + w * 0.8, y + h * 0.15, 3, h * 0.12);
        this.ctx.fillRect(x + w * 0.8, y + h * 0.5, 3, h * 0.2);
    }

    drawSimpleRadiator(x, y, w, h) {
        const r = 2;

        // Radiator body
        this.ctx.fillStyle = '#E0E0E0';
        this.roundRect(x, y, w, h, r);
        this.ctx.fill();

        // Radiator fins
        const finCount = Math.floor(w / 15);
        const finWidth = 4;
        const gap = (w - finCount * finWidth) / (finCount + 1);

        this.ctx.fillStyle = '#BDBDBD';
        for (let i = 0; i < finCount; i++) {
            const finX = x + gap + i * (finWidth + gap);
            this.roundRect(finX, y + 2, finWidth, h - 4, 1);
            this.ctx.fill();
        }

        // Border
        this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
        this.ctx.lineWidth = 1;
        this.roundRect(x, y, w, h, r);
        this.ctx.stroke();
    }

    drawSimpleFan(cx, cy, radius) {
        // Outer circle
        this.ctx.fillStyle = '#E8E8E8';
        this.ctx.strokeStyle = '#BDBDBD';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();

        // Fan blades
        this.ctx.fillStyle = '#78909C';
        for (let i = 0; i < 4; i++) {
            this.ctx.save();
            this.ctx.translate(cx, cy);
            this.ctx.rotate((i * Math.PI) / 2);
            this.ctx.beginPath();
            this.ctx.ellipse(0, -radius * 0.5, radius * 0.15, radius * 0.4, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }

        // Center hub
        this.ctx.fillStyle = '#424242';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius * 0.15, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawSimpleWindow(x, y, w, h) {
        const r = 2;

        // Window frame (brown)
        this.ctx.fillStyle = '#5D4037';
        this.roundRect(x, y, w, h, r);
        this.ctx.fill();

        // Glass panes (light blue)
        this.ctx.fillStyle = '#87CEEB';
        const paneW = (w - 6) / 2;
        const paneH = h - 4;
        this.ctx.fillRect(x + 2, y + 2, paneW, paneH);
        this.ctx.fillRect(x + paneW + 4, y + 2, paneW, paneH);

        // Center divider
        this.ctx.fillStyle = '#5D4037';
        this.ctx.fillRect(x + paneW + 2, y, 2, h);
    }

    // Keep old functions for backwards compatibility (they're just aliases now)
    drawTableIcon(x, y, w, h) { this.drawSimpleTable(x, y, w, h); }
    drawChairIcon(x, y, w, h) { this.drawSimpleChair(x, y, w, h); }
    drawBedIcon(x, y, w, h) { this.drawSimpleBed(x, y, w, h); }
    drawPlantIcon(x, y, r) { this.drawSimplePlant(x, y, r); }

    /**
     * Helper to draw rounded rectangles
     */
    roundRect(x, y, w, h, r) {
        this.ctx.beginPath();
        this.ctx.moveTo(x + r, y);
        this.ctx.lineTo(x + w - r, y);
        this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        this.ctx.lineTo(x + w, y + h - r);
        this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.ctx.lineTo(x + r, y + h);
        this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        this.ctx.lineTo(x, y + r);
        this.ctx.quadraticCurveTo(x, y, x + r, y);
        this.ctx.closePath();
    }

    /**
     * Draw an entrance marker (door swing arc style)
     */
    drawEntrance(entrance, isSelected = false) {
        const x = this.toCanvasX(entrance.x);
        const y = this.toCanvasY(entrance.y);
        const doorLength = 35; // Length of the door
        const direction = (entrance.direction || 0) * Math.PI / 180;

        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(direction);

        // Selection highlight
        if (isSelected) {
            this.ctx.strokeStyle = this.COLORS.selection;
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 4]);
            this.ctx.beginPath();
            this.ctx.arc(0, 0, doorLength + 10, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // Door swing arc (dashed quarter circle)
        this.ctx.strokeStyle = '#2C3E50';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([4, 4]);
        this.ctx.beginPath();
        // Arc from 0 to 90 degrees (quarter circle)
        this.ctx.arc(0, 0, doorLength, -Math.PI / 2, 0);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Door (solid line from hinge point)
        this.ctx.strokeStyle = '#5D6D7E';
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(doorLength, 0);
        this.ctx.stroke();

        // Wall segment (perpendicular to door at hinge)
        this.ctx.strokeStyle = '#7F8C8D';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(0, -doorLength);
        this.ctx.stroke();

        // Hinge point (small filled circle)
        this.ctx.fillStyle = '#5D6D7E';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 4, 0, Math.PI * 2);
        this.ctx.fill();

        // Door handle (small circle on door)
        this.ctx.fillStyle = '#95A5A6';
        this.ctx.beginPath();
        this.ctx.arc(doorLength * 0.75, 0, 3, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();

        // Label (upright)
        if (entrance.label) {
            this.drawUprightText(entrance.label, x, y + doorLength + 15, {
                font: '10px sans-serif',
                color: '#5D6D7E'
            });
        }
    }

    drawGrid() {
        this.ctx.strokeStyle = this.COLORS.grid;
        this.ctx.lineWidth = 1;

        // Vertical lines (X axis) - every 1m
        for (let x = -3000; x <= 3000; x += 1000) {
            const canvasX = this.toCanvasX(x);

            this.ctx.beginPath();
            this.ctx.moveTo(canvasX, 0);
            this.ctx.lineTo(canvasX, this.height);
            this.ctx.stroke();

            // Label (upright)
            if (x !== 0) {
                this.drawUprightText(`${x / 1000}m`, canvasX, this.height - 10, { baseline: 'bottom' });
            }
        }

        // Horizontal lines (Y axis) - every 1m
        for (let y = 0; y <= 6000; y += 1000) {
            const canvasY = this.toCanvasY(y);

            this.ctx.beginPath();
            this.ctx.moveTo(0, canvasY);
            this.ctx.lineTo(this.width, canvasY);
            this.ctx.stroke();

            // Label (upright)
            if (y !== 0) {
                this.drawUprightText(`${y / 1000}m`, 25, canvasY, { align: 'left' });
            }
        }

        // Axes (thicker)
        this.ctx.strokeStyle = this.COLORS.gridLabel;
        this.ctx.lineWidth = 2;

        // Y axis (center vertical line)
        this.ctx.beginPath();
        this.ctx.moveTo(this.centerX, 0);
        this.ctx.lineTo(this.centerX, this.height);
        this.ctx.stroke();

        // X axis (bottom horizontal line)
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.centerY);
        this.ctx.lineTo(this.width, this.centerY);
        this.ctx.stroke();
    }

    drawSensorOrigin() {
        const x = this.toCanvasX(0);
        const y = this.toCanvasY(0);

        // Sensor circle
        this.ctx.fillStyle = this.COLORS.sensor;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 8, 0, Math.PI * 2);
        this.ctx.fill();

        // Detection cone (180° arc)
        this.ctx.strokeStyle = this.COLORS.sensor;
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.arc(x, y, 30, Math.PI, 0, false);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Label (upright)
        this.drawUprightText('SHS01', x, y - 20, {
            font: '12px sans-serif',
            color: this.COLORS.sensor
        });
    }

    drawZone(zone, index, isSelected = false) {
        // Zone colors
        const colors = [
            { fill: this.COLORS.zone1, border: this.COLORS.zone1Border },
            { fill: this.COLORS.zone2, border: this.COLORS.zone2Border },
            { fill: this.COLORS.zone3, border: this.COLORS.zone3Border },
            { fill: this.COLORS.zone4, border: this.COLORS.zone4Border },
            { fill: this.COLORS.zone5, border: this.COLORS.zone5Border }
        ];
        const color = colors[index] || colors[0];

        // Check if polygon zone
        if (zone.shapeType === 'polygon' && zone.vertices && zone.vertices.length >= 3) {
            this.drawPolygonZone(zone, index, color, isSelected);
        } else {
            this.drawRectangleZone(zone, index, color, isSelected);
        }
    }

    drawRectangleZone(zone, index, color, isSelected) {
        const x1 = this.toCanvasX(zone.x1);
        const y1 = this.toCanvasY(zone.y1);
        const x2 = this.toCanvasX(zone.x2);
        const y2 = this.toCanvasY(zone.y2);

        const width = x2 - x1;
        const height = y2 - y1;

        // Fill
        this.ctx.fillStyle = color.fill;
        this.ctx.fillRect(x1, y1, width, height);

        // Border (thicker if selected)
        this.ctx.strokeStyle = isSelected ? this.COLORS.selection : color.border;
        this.ctx.lineWidth = isSelected ? 3 : 2;
        this.ctx.strokeRect(x1, y1, width, height);

        // Label (upright) - centered inside the zone
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;
        const zoneType = zone.zoneType === 'interference' ? 'Interference' : 'Detection';
        // Draw zone number (on top)
        this.drawUprightText(`Zone ${index + 1}`, centerX, centerY + 8, {
            font: 'bold 12px sans-serif',
            color: color.border,
            align: 'center'
        });
        // Draw zone type below
        this.drawUprightText(`(${zoneType})`, centerX, centerY - 8, {
            font: '11px sans-serif',
            color: color.border,
            align: 'center'
        });
    }

    drawPolygonZone(zone, index, color, isSelected) {
        const vertices = zone.vertices;
        if (!vertices || vertices.length < 3) return;

        // Draw polygon fill
        this.ctx.beginPath();
        const first = vertices[0];
        this.ctx.moveTo(this.toCanvasX(first.x), this.toCanvasY(first.y));

        for (let i = 1; i < vertices.length; i++) {
            this.ctx.lineTo(this.toCanvasX(vertices[i].x), this.toCanvasY(vertices[i].y));
        }
        this.ctx.closePath();

        this.ctx.fillStyle = color.fill;
        this.ctx.fill();

        // Border
        this.ctx.strokeStyle = isSelected ? this.COLORS.selection : color.border;
        this.ctx.lineWidth = isSelected ? 3 : 2;
        this.ctx.stroke();

        // Draw bounding box outline (dashed) to show what sensor receives
        const x1 = this.toCanvasX(zone.x1);
        const y1 = this.toCanvasY(zone.y1);
        const x2 = this.toCanvasX(zone.x2);
        const y2 = this.toCanvasY(zone.y2);

        this.ctx.setLineDash([4, 4]);
        this.ctx.strokeStyle = color.border;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        this.ctx.setLineDash([]);

        // Label (upright) - centered inside the zone
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;
        const zoneType = zone.zoneType === 'interference' ? 'Interference' : 'Detection';
        // Draw zone number (on top)
        this.drawUprightText(`Zone ${index + 1}`, centerX, centerY + 8, {
            font: 'bold 12px sans-serif',
            color: color.border,
            align: 'center'
        });
        // Draw zone type below
        this.drawUprightText(`(${zoneType})`, centerX, centerY - 8, {
            font: '11px sans-serif',
            color: color.border,
            align: 'center'
        });

        // Draw vertex points
        this.ctx.fillStyle = color.border;
        vertices.forEach(v => {
            this.ctx.beginPath();
            this.ctx.arc(this.toCanvasX(v.x), this.toCanvasY(v.y), 4, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    /**
     * Draw selection handles for a zone
     */
    drawSelectionHandles(zone) {
        if (zone.shapeType === 'polygon') {
            // For polygons, draw handles at each vertex
            if (zone.vertices) {
                zone.vertices.forEach(v => {
                    this.drawHandle(this.toCanvasX(v.x), this.toCanvasY(v.y));
                });
            }
        } else {
            // For rectangles, draw 8 handles (corners + midpoints)
            const x1 = this.toCanvasX(zone.x1);
            const y1 = this.toCanvasY(zone.y1);
            const x2 = this.toCanvasX(zone.x2);
            const y2 = this.toCanvasY(zone.y2);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            // Corners
            this.drawHandle(x1, y1);
            this.drawHandle(x2, y1);
            this.drawHandle(x1, y2);
            this.drawHandle(x2, y2);

            // Midpoints
            this.drawHandle(midX, y1);
            this.drawHandle(midX, y2);
            this.drawHandle(x1, midY);
            this.drawHandle(x2, midY);
        }
    }

    /**
     * Draw a resize handle
     */
    drawHandle(x, y) {
        const size = 8;
        this.ctx.fillStyle = this.COLORS.handle;
        this.ctx.strokeStyle = this.COLORS.selection;
        this.ctx.lineWidth = 2;

        this.ctx.fillRect(x - size, y - size, size * 2, size * 2);
        this.ctx.strokeRect(x - size, y - size, size * 2, size * 2);
    }

    /**
     * Draw drawing preview (rectangle or polygon being drawn)
     */
    drawPreview(preview) {
        if (preview.type === 'rectangle' && preview.rect) {
            this.drawRectanglePreview(preview.rect, preview.rect.isEdge);
        } else if (preview.type === 'polygon' && preview.vertices) {
            this.drawPolygonPreview(preview.vertices);
        } else if (preview.isEdge) {
            // Direct edge preview from updateEdgePreview
            this.drawRectanglePreview(preview, true);
        }
    }

    /**
     * Draw rectangle preview while drawing
     * @param {boolean} isEdge - If true, use edge colors instead of zone colors
     */
    drawRectanglePreview(rect, isEdge = false) {
        const x1 = this.toCanvasX(rect.x1);
        const y1 = this.toCanvasY(rect.y1);
        const x2 = this.toCanvasX(rect.x2);
        const y2 = this.toCanvasY(rect.y2);

        // Fill - use edge color if drawing an edge
        this.ctx.fillStyle = isEdge ? this.COLORS.edgePreview : this.COLORS.preview;
        this.ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

        // Border (dashed)
        this.ctx.setLineDash([6, 4]);
        this.ctx.strokeStyle = isEdge ? this.COLORS.edgeBorder : this.COLORS.previewBorder;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        this.ctx.setLineDash([]);

        // Dimensions label (upright)
        const width = Math.round(Math.abs(rect.x2 - rect.x1));
        const height = Math.round(Math.abs(rect.y2 - rect.y1));
        this.drawUprightText(`${width}mm × ${height}mm`, (x1 + x2) / 2, Math.min(y1, y2) - 10, {
            font: '12px monospace',
            color: isEdge ? this.COLORS.edgeBorder : this.COLORS.previewBorder
        });
    }

    /**
     * Draw polygon preview while drawing
     */
    drawPolygonPreview(vertices) {
        if (vertices.length === 0) return;

        this.ctx.beginPath();
        const first = vertices[0];
        this.ctx.moveTo(this.toCanvasX(first.x), this.toCanvasY(first.y));

        for (let i = 1; i < vertices.length; i++) {
            this.ctx.lineTo(this.toCanvasX(vertices[i].x), this.toCanvasY(vertices[i].y));
        }

        // If more than 2 vertices, close the polygon for preview
        if (vertices.length > 2) {
            this.ctx.closePath();
            this.ctx.fillStyle = this.COLORS.preview;
            this.ctx.fill();
        }

        // Draw lines
        this.ctx.setLineDash([6, 4]);
        this.ctx.strokeStyle = this.COLORS.previewBorder;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw vertex points
        this.ctx.fillStyle = this.COLORS.previewBorder;
        vertices.forEach((v, i) => {
            this.ctx.beginPath();
            this.ctx.arc(this.toCanvasX(v.x), this.toCanvasY(v.y), i === 0 ? 6 : 4, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Label for first vertex (click to close) - upright
        if (vertices.length >= 3) {
            this.drawUprightText('Click to close', this.toCanvasX(first.x), this.toCanvasY(first.y) - 12, {
                font: '10px sans-serif',
                color: this.COLORS.previewBorder
            });
        }
    }

    drawTarget(target, index) {
        console.log(`[DRAW TARGET] Called for target ${index} with data:`, target);

        // Transform sensor coordinates to room/display coordinates based on rotation
        // This is done explicitly since targets are drawn outside the rotated context
        const transformed = this.transformSensorToRoom(target.x, target.y);
        const x = this.toCanvasX(transformed.x);
        const y = this.toCanvasY(transformed.y);

        console.log(`[DRAW TARGET ${index}] sensor(${target.x}, ${target.y}) -> transformed(${transformed.x}, ${transformed.y}) -> canvas(${Math.round(x)}, ${Math.round(y)}) canvas: ${this.width}x${this.height}`);

        // Sensor origin also needs transformation for distance line
        const sensorTransformed = this.transformSensorToRoom(0, 0);
        const sensorX = this.toCanvasX(sensorTransformed.x);
        const sensorY = this.toCanvasY(sensorTransformed.y);

        // Target circle
        this.ctx.fillStyle = this.COLORS.target;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 6, 0, Math.PI * 2);
        this.ctx.fill();

        // Target ring (pulsing effect)
        this.ctx.strokeStyle = this.COLORS.target;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 10 + Math.sin(Date.now() / 200 + index) * 3, 0, Math.PI * 2);
        this.ctx.stroke();

        // Distance line from sensor origin
        this.ctx.strokeStyle = this.COLORS.target;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([3, 3]);
        this.ctx.beginPath();
        this.ctx.moveTo(sensorX, sensorY);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Label
        this.ctx.font = 'bold 11px sans-serif';
        this.ctx.fillStyle = this.COLORS.target;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`T${index + 1}`, x, y - 15);

        // Distance label
        this.ctx.font = '10px monospace';
        this.ctx.fillText(`${Math.round(target.distance / 10) / 100}m`, x, y + 20);
    }

    /**
     * Draw room edge rectangles (grey-out areas)
     */
    drawEdges(edges) {
        if (!edges || edges.length === 0) return;

        edges.forEach((edge, index) => {
            const isSelected = index === this.selectedEdgeIndex;
            this.drawEdge(edge, isSelected);
        });
    }

    /**
     * Draw a single edge rectangle
     */
    drawEdge(edge, isSelected = false) {
        const x1 = this.toCanvasX(edge.x1);
        const y1 = this.toCanvasY(edge.y1);
        const x2 = this.toCanvasX(edge.x2);
        const y2 = this.toCanvasY(edge.y2);

        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        const width = maxX - minX;
        const height = maxY - minY;

        // Fill
        this.ctx.fillStyle = this.COLORS.edge;
        this.ctx.fillRect(minX, minY, width, height);

        // Border
        this.ctx.strokeStyle = isSelected ? this.COLORS.selection : this.COLORS.edgeBorder;
        this.ctx.lineWidth = isSelected ? 2 : 1;
        this.ctx.strokeRect(minX, minY, width, height);

        // Draw handles if selected
        if (isSelected) {
            this.drawEdgeHandles(edge);
        }
    }

    /**
     * Draw resize handles for selected edge
     */
    drawEdgeHandles(edge) {
        const x1 = this.toCanvasX(edge.x1);
        const y1 = this.toCanvasY(edge.y1);
        const x2 = this.toCanvasX(edge.x2);
        const y2 = this.toCanvasY(edge.y2);

        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;

        // 8 handles: corners + midpoints
        const handles = [
            { x: minX, y: minY }, // NW
            { x: maxX, y: minY }, // NE
            { x: minX, y: maxY }, // SW
            { x: maxX, y: maxY }, // SE
            { x: midX, y: minY }, // N
            { x: midX, y: maxY }, // S
            { x: minX, y: midY }, // W
            { x: maxX, y: midY }  // E
        ];

        handles.forEach(handle => {
            this.ctx.fillStyle = this.COLORS.handle;
            this.ctx.strokeStyle = this.COLORS.selection;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.rect(handle.x - 6, handle.y - 6, 12, 12);
            this.ctx.fill();
            this.ctx.stroke();
        });
    }
}
