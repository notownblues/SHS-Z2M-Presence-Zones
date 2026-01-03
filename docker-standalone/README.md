# Docker Standalone Installation

This folder contains Docker configuration for running the SHS Z2M Presence Zone Configurator **without Home Assistant**.

## Prerequisites

- Docker and Docker Compose installed
- MQTT broker with **WebSocket support enabled** (port 1884 by default)
- Zigbee2MQTT connected to your MQTT broker

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/notownblues/SHS-Z2M-Presence-Zones.git
   cd SHS-Z2M-Presence-Zones/docker-standalone
   ```

2. Edit `docker-compose.yml` with your MQTT settings:
   ```yaml
   environment:
     - MQTT_HOST=192.168.1.100    # Your MQTT broker IP
     - MQTT_WS_PORT=1884          # WebSocket port
     - MQTT_USERNAME=myuser       # Optional
     - MQTT_PASSWORD=mypass       # Optional
   ```

3. Start the container:
   ```bash
   docker compose up -d
   ```

4. Access the web UI at: **http://localhost:8099**

## Alternative: Docker Run

```bash
docker build -t shs-presence-zones -f docker-standalone/Dockerfile ..

docker run -d \
  --name shs-presence-zones \
  -p 8099:8099 \
  -e MQTT_HOST=192.168.1.100 \
  -e MQTT_WS_PORT=1884 \
  -e MQTT_USERNAME=myuser \
  -e MQTT_PASSWORD=mypass \
  -v shs-data:/data \
  shs-presence-zones
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MQTT_HOST` | Yes | `localhost` | MQTT broker hostname or IP |
| `MQTT_WS_PORT` | No | `1884` | MQTT WebSocket port |
| `MQTT_USERNAME` | No | (empty) | MQTT username |
| `MQTT_PASSWORD` | No | (empty) | MQTT password |

## Enabling MQTT WebSocket

The configurator uses MQTT over WebSocket (not the standard port 1883). Make sure your broker has WebSocket enabled.

### Mosquitto

Add to your `mosquitto.conf`:
```
listener 1884
protocol websockets
```

### Zigbee2MQTT's Built-in MQTT

If using Zigbee2MQTT's built-in MQTT server, WebSocket is enabled by default on port 1884.

## Networking Notes

If the container cannot reach your MQTT broker:

1. **Same host**: Use `host.docker.internal` (Docker Desktop) or `172.17.0.1` (Linux)
2. **Network mode**: Try `network_mode: host` in docker-compose.yml
3. **Docker network**: Put both containers on the same Docker network

## Data Persistence

Room configurations are stored in `/data/room_configs.json` inside the container. The docker-compose file mounts this as a named volume (`shs-data`) to persist data across container restarts.
