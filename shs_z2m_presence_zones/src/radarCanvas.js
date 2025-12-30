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

        // Visual settings
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
            zone3Border: '#f85149'
        };

        // Initialize
        this.resize();

        // Handle window resize
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        // Get canvas container size
        const container = this.canvas.parentElement;
        const size = Math.min(container.clientWidth, container.clientHeight, 600);

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
     * Main draw function - called every frame
     */
    drawFrame(targets = [], zones = []) {
        // Clear canvas
        this.ctx.fillStyle = this.COLORS.background;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw grid
        this.drawGrid();

        // Draw zones
        zones.forEach((zone, index) => {
            if (zone.enabled) {
                this.drawZone(zone, index);
            }
        });

        // Draw sensor origin
        this.drawSensorOrigin();

        // Draw targets
        targets.forEach((target, index) => {
            this.drawTarget(target, index);
        });
    }

    drawGrid() {
        this.ctx.strokeStyle = this.COLORS.grid;
        this.ctx.lineWidth = 1;
        this.ctx.font = '11px monospace';
        this.ctx.fillStyle = this.COLORS.gridLabel;
        this.ctx.textAlign = 'center';

        // Vertical lines (X axis) - every 1m
        for (let x = -3000; x <= 3000; x += 1000) {
            const canvasX = this.toCanvasX(x);

            this.ctx.beginPath();
            this.ctx.moveTo(canvasX, 0);
            this.ctx.lineTo(canvasX, this.height);
            this.ctx.stroke();

            // Label
            if (x !== 0) {
                this.ctx.fillText(`${x / 1000}m`, canvasX, this.height - 5);
            }
        }

        // Horizontal lines (Y axis) - every 1m
        for (let y = 0; y <= 6000; y += 1000) {
            const canvasY = this.toCanvasY(y);

            this.ctx.beginPath();
            this.ctx.moveTo(0, canvasY);
            this.ctx.lineTo(this.width, canvasY);
            this.ctx.stroke();

            // Label
            if (y !== 0) {
                this.ctx.fillText(`${y / 1000}m`, 25, canvasY + 4);
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

        // Label
        this.ctx.fillStyle = this.COLORS.sensor;
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('SHS01', x, y - 20);
    }

    drawZone(zone, index) {
        const x1 = this.toCanvasX(zone.x1);
        const y1 = this.toCanvasY(zone.y1);
        const x2 = this.toCanvasX(zone.x2);
        const y2 = this.toCanvasY(zone.y2);

        const width = x2 - x1;
        const height = y2 - y1;

        // Zone colors
        const colors = [
            { fill: this.COLORS.zone1, border: this.COLORS.zone1Border },
            { fill: this.COLORS.zone2, border: this.COLORS.zone2Border },
            { fill: this.COLORS.zone3, border: this.COLORS.zone3Border }
        ];
        const color = colors[index] || colors[0];

        // Fill
        this.ctx.fillStyle = color.fill;
        this.ctx.fillRect(x1, y1, width, height);

        // Border
        this.ctx.strokeStyle = color.border;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x1, y1, width, height);

        // Label
        this.ctx.fillStyle = color.border;
        this.ctx.font = 'bold 14px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Zone ${index + 1}`, x1 + 10, y1 + 20);
    }

    drawTarget(target, index) {
        const x = this.toCanvasX(target.x);
        const y = this.toCanvasY(target.y);
        const side = target.x < 0 ? 'LEFT' : (target.x > 0 ? 'RIGHT' : 'CENTER');
        const canvasSide = x < this.centerX ? 'LEFT' : (x > this.centerX ? 'RIGHT' : 'CENTER');
        console.log(`[DEBUG] T${index+1}: sensor=${target.x}mm (${side}) → canvas=${Math.round(x)}px (${canvasSide}) [center=${this.centerX}]`);

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

        // Distance line from sensor
        this.ctx.strokeStyle = this.COLORS.target;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([3, 3]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.centerX, this.centerY);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Label
        this.ctx.fillStyle = this.COLORS.target;
        this.ctx.font = 'bold 11px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`T${index + 1}`, x, y - 15);

        // Distance label
        this.ctx.font = '10px monospace';
        this.ctx.fillText(`${Math.round(target.distance / 10) / 100}m`, x, y + 20);
    }
}
