/**
 * Room outline helpers.
 *
 * The room outline is a polygon (3-8 points) stored in the same coordinates as Room Edges:
 * sensor coordinates for wall mounts, room coordinates for corner mounts. It is sent to the
 * sensor with the zones, and the firmware ignores targets outside it (e.g. people seen
 * through a wall). It does not use any of the 5 zone slots.
 */

export const BOUNDARY_MIN_POINTS = 3;
export const BOUNDARY_MAX_POINTS = 8;

const MAP_RANGE = { X_MIN: -3000, X_MAX: 3000, Y_MIN: 0, Y_MAX: 6000 };
const SNAP_MM = 100;
const EDGE_TOLERANCE_MM = 200;

/**
 * Ray-casting point-in-polygon test (matches the firmware's ld2450_point_in_boundary)
 */
export function pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x, yi = points[i].y;
        const xj = points[j].x, yj = points[j].y;
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Snap a point to the 100mm grid and keep it on the map
 */
export function snapClampPoint(point) {
    const snap = v => Math.round(v / SNAP_MM) * SNAP_MM;
    return {
        x: Math.max(MAP_RANGE.X_MIN, Math.min(MAP_RANGE.X_MAX, snap(point.x))),
        y: Math.max(MAP_RANGE.Y_MIN, Math.min(MAP_RANGE.Y_MAX, snap(point.y)))
    };
}

/**
 * Build an initial outline from existing Room Edges.
 * Starts from the whole map and shrinks it by each edge strip that touches a side of the
 * remaining rectangle and spans its full width/height (the usual "grey out beyond this wall"
 * edges). Edges that don't fit that pattern are left alone.
 * @returns {{points: Array<{x:number,y:number}>, usedEdges: Set<object>}}
 */
export function outlineFromEdges(edges = []) {
    const room = { x1: MAP_RANGE.X_MIN, y1: MAP_RANGE.Y_MIN, x2: MAP_RANGE.X_MAX, y2: MAP_RANGE.Y_MAX };
    const usedEdges = new Set();
    const tol = EDGE_TOLERANCE_MM;

    let changed = true;
    while (changed) {
        changed = false;
        for (const edge of edges) {
            if (usedEdges.has(edge)) continue;
            const ex1 = Math.min(edge.x1, edge.x2), ex2 = Math.max(edge.x1, edge.x2);
            const ey1 = Math.min(edge.y1, edge.y2), ey2 = Math.max(edge.y1, edge.y2);
            const spansX = ex1 <= room.x1 + tol && ex2 >= room.x2 - tol;
            const spansY = ey1 <= room.y1 + tol && ey2 >= room.y2 - tol;

            let cut = false;
            if (spansX && ey2 >= room.y2 - tol && ey1 > room.y1 + tol) {
                room.y2 = ey1; cut = true;
            } else if (spansX && ey1 <= room.y1 + tol && ey2 < room.y2 - tol) {
                room.y1 = ey2; cut = true;
            } else if (spansY && ex2 >= room.x2 - tol && ex1 > room.x1 + tol) {
                room.x2 = ex1; cut = true;
            } else if (spansY && ex1 <= room.x1 + tol && ex2 < room.x2 - tol) {
                room.x1 = ex2; cut = true;
            }

            if (cut) {
                usedEdges.add(edge);
                changed = true;
            }
        }
    }

    const points = [
        { x: room.x1, y: room.y1 },
        { x: room.x2, y: room.y1 },
        { x: room.x2, y: room.y2 },
        { x: room.x1, y: room.y2 }
    ].map(snapClampPoint);

    return { points, usedEdges };
}
