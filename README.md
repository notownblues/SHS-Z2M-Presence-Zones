# SHS Z2M Presence Zone Configurator

Web-based zone configurator for SHS01 mmWave presence sensor integrated with Zigbee2MQTT.

## Features

- **Real-time Target Visualization** - 2D canvas display of detected targets
- **Interactive Zone Configuration** - Draw and edit up to 3 detection/exclusion zones
- **MQTT Integration** - Connect to Zigbee2MQTT broker for live sensor data
- **Dark Theme UI** - Mobile-friendly interface optimized for tablets and phones
- **Zone Modes**:
  - **Disabled**: Detect all targets (no filtering)
  - **Detection**: Only detect targets inside defined zones
  - **Filter**: Exclude targets inside defined zones (detect outside only)

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Zigbee2MQTT running with MQTT broker (e.g., Mosquitto)
- SHS01 presence sensor paired with Zigbee2MQTT

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will open automatically at `http://localhost:3000`

### Building for Production

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Configuration

### MQTT Connection

1. Enter your MQTT broker WebSocket URL (e.g., `ws://192.168.1.100:9001`)
2. Add username/password if authentication is enabled
3. Set the base topic matching your Zigbee2MQTT device (e.g., `zigbee2mqtt/0xa085e3fffedcf6d4`)
4. Click **Connect**

### Zone Configuration

1. **Zone Mode**: Select detection mode:
   - Disabled: No filtering
   - Detection: Include zones only
   - Filter: Exclude zones

2. **Edit Zones**: Use tabs to switch between Zone 1, 2, and 3
   - Enable/disable each zone
   - Set X1, Y1 (corner 1) and X2, Y2 (corner 2) coordinates in millimeters
   - Live preview on canvas as you adjust values

3. **Apply**: Click **Apply Zones** to send configuration to the sensor via MQTT

### Coordinate System

The SHS01 sensor uses millimeter coordinates:
- **X axis**: -3000mm (left) to +3000mm (right)
- **Y axis**: 0mm (at sensor) to 6000mm (forward)
- **Origin**: Sensor location at (0, 0)

## MQTT Topics

The app subscribes to and publishes the following topics:

**Subscribe (sensor data)**:
- `{baseTopic}` - Receives sensor updates including:
  - `ld2450_target_count` - Number of active targets (0-3)
  - `occupancy_ld2450` - Overall occupancy state
  - `zone1_occupied`, `zone2_occupied`, `zone3_occupied` - Zone occupancy states

**Publish (configuration)**:
- `{baseTopic}/set` - Sends zone configuration:
  ```json
  {
    "zone_type": 0,
    "zone1_enabled": true,
    "zone1_x1": -1500,
    "zone1_y1": 0,
    "zone1_x2": 1500,
    "zone1_y2": 3000,
    ...
  }
  ```

## Tech Stack

- **Vanilla JavaScript** (ES6 modules)
- **Vite** - Build tool and dev server
- **MQTT.js** - MQTT over WebSocket
- **HTML5 Canvas** - 2D visualization
- **CSS3** - Dark theme with modern styling

## Project Structure

```
presence-zone-configurator/
├── src/
│   ├── main.js           # Main application logic
│   ├── radarCanvas.js    # Canvas visualization
│   ├── zoneManager.js    # Zone validation and logic
│   └── style.css         # Dark theme styles
├── index.html            # Main HTML entry point
├── package.json          # Dependencies
├── vite.config.js        # Vite configuration
└── README.md             # This file
```

## Troubleshooting

### Cannot connect to MQTT broker

- Ensure MQTT broker has WebSocket support enabled
- Check firewall rules allow WebSocket connections
- Verify broker URL and port (default WebSocket port is 9001 for Mosquitto)
- Test with `mosquitto_sub -h localhost -t "#" -v` to verify broker is running

### No sensor data appearing

- Verify the base topic matches your Zigbee2MQTT device name
- Check Zigbee2MQTT logs to ensure sensor is paired and reporting
- Use MQTT Explorer or `mosquitto_sub` to verify sensor is publishing data

### Zones not applying

- Ensure MQTT connection is established (status indicator shows "Connected")
- Check that zone coordinates are within valid range
- Verify the sensor firmware supports zone configuration
- Check Zigbee2MQTT logs for any errors when applying configuration

## License

MIT License - See LICENSE file for details

## Credits

Inspired by [Everything Smart Home](https://github.com/EverythingSmartHome/everything-presence-addons)
