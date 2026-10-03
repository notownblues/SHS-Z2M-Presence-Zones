# Changelog

## 2.10.0

### New: Room-aligned zones for corner mounts

On a corner mount, zones used to appear as tilted diamonds, because the sensor could only check rectangles along its own axes. A zone over a table that is square to the walls was impossible. Now:

- Zones are drawn **square to the walls** on corner mounts, just like on wall mounts. Draw a rectangle over your dining table and that is exactly the area the sensor checks.
- Moving the sensor to another corner (rotate button) leaves your zones where they are in the room
- Diagonal or odd-shaped areas: use the **Polygon** tool (up to 8 corners)

### Improved: Polygon zones really work

- Polygon zones are now sent to the sensor as drawn. Until now the sensor received only the rectangle around them.
- Drag a polygon's corners to reshape it, or drag the whole zone to move it

### Requirements

- Needs **SHS01 firmware v1.3.0** and the **updated Zigbee2MQTT converter** from the [SHS-Z2M-Presence](https://github.com/notownblues/SHS-Z2M-Presence) repository. With older firmware the sensor uses the smallest sensor-aligned rectangle around each corner or polygon zone. Wall-mount rectangle zones work as before with any firmware.

### Notes

- Corner rooms saved with 2.8.0 or 2.9.0 keep their tilted zones exactly, turned into polygons. Delete them and draw a new rectangle to get a room-aligned zone.
- Switching the Sensor Mount between Wall and Corner keeps zones, room edges and the room outline in place on the map
- Fixed: the **CLEAR** button on a zone card did not save the change

## 2.9.0

### New: Room Outline (the sensor ignores people outside your room)

Until now the grey "Room Edge" areas were only a drawing aid. The sensor still counted people it saw through walls. The new **Room Outline** tool replaces them, and the sensor really ignores everything outside the outline.

- Click the **Room Outline** button in the toolbar. If you already drew grey edges along the sides of the map, they are turned into the outline automatically.
- Drag a corner to move it, or drag the dot in the middle of a wall to move the whole wall
- Double-click a wall to add a corner (for L-shaped rooms, up to 8 corners), double-click a corner to remove it
- Click **Save to Sensor** to send it. People outside the outline no longer count towards occupancy, the target count or any zone.
- People outside the outline are shown faded on the map, so you can see what is being ignored
- Works with wall and corner mounts
- Does not use any of your 5 zones

### Requirements

- Needs **SHS01 firmware v1.1.0** and the **updated Zigbee2MQTT converter** from the [SHS-Z2M-Presence](https://github.com/notownblues/SHS-Z2M-Presence) repository. With older firmware the outline is only drawn, not used by the sensor.

### Notes

- Firmware v1.1.0 also fixes **Zone Mode**: Include and Exclude now really decide which Detection zones count towards the sensor's main occupancy. Setups with only Interference zones behave exactly as before.
- Existing grey edges that don't fit the outline stay on the map and can still be selected and deleted.

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
