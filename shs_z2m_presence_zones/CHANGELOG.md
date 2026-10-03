# Changelog

## 2.8.0

### New: Corner mount support

You can now mount the sensor in a room corner, aimed 45° down the room diagonal.

- New **Sensor Mount** setting in the Room & Sensor panel: **Wall** or **Corner (45°)**
- In Corner mode the rotate button moves the sensor between the four corners
- The corner map shows distances from the sensor's corner, its facing direction, its 6m range, and a dashed outline of where zones can go
- Zones appear tilted 45°, because the sensor checks rectangles along its own axes. What you see is exactly what the sensor checks.
- Zones drawn past the sensor's range are trimmed automatically, so they are always accepted by the sensor
- Room edges (grey-out areas) stay aligned with the walls in corner rooms
- The mount type and corner are saved with each room

### Notes

- Wall mount behaviour is unchanged. Existing rooms load as Wall.
- If you switch an existing room to Corner, your zones stay correct. Furniture, doors and room edges may need moving.

## 2.7.2

- Fix target X-axis mirrored when sensor is at bottom of map (0° rotation)

## 2.7.1

- Incorrect X-axis fix targeting wrong rotation case (superseded by 2.7.2)

## 2.7.0

- Add Docker standalone support
- Update README with Docker standalone installation

## 2.6.4

- Apply zone coordinate transformation to edges for consistent rotation handling
- Fix object selection broken by coordinate conversion changes
- Fix zone dragging direction and text orientation at rotated angles
- Fix zone/target display consistency
- Fix target/zone display mismatch at 180° rotation
- Fix room config persistence across addon reinstalls
- Add persistent storage for room configs

## 2.6.3

- Further mobile UI improvements

## 2.6.2

- Fix mobile UI issues and add touch support

## 2.6.1

- Mobile optimization and project cleanup

## 2.6.0

- Server-side room configuration storage
- Add warning about Position Reporting traffic

## 2.5.3

- Fix entrance resize
- Filter targets near sensor origin

## 2.5.2

- Orange pulsating sensor dot with white ring

## 2.5.1

- Remove target label, larger dot
- Fix zone Clear button

## 2.5.0

- New target dot design and sensor styling

## 2.4.10

- Fix null element crash blocking target position parsing

## 2.4.4

- UI improvements and bug fixes

## 2.4.3

- UI fixes: dining chair, occupancy icons, zone labels

## 2.4.2

- Zone 4/5 support, UI improvements, target styling

## 2.3.3

- Add edge resize and status/occupancy icons

## 2.3.2

- UI improvements and bug fixes

## 2.3.1

- Fix furniture icons on map
- Add light mode canvas

## 2.3.0

- Add furniture sidebar and dark mode toggle

## 2.2.9

- Fix target direction at 90° and 270° rotations

## 2.2.8

- Fix coordinate transforms for all rotation angles

## 2.2.0

- Server-side MQTT with addon logging

## 2.1.0

- MQTT config improvements and new features

## 2.0.0

- Major update with new features
