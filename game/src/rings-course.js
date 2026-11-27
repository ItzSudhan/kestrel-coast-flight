// The Beacon Rings course: eight lit rings that take the pilot off Kestrel Field, round the
// island's east coast, past Gannet Light and the north shore, out over the western sea and back
// onto the final approach for runway 09. Each ring faces along the course; a pass is a crossing
// of its plane inside its radius.

/** Ring radius, metres. */
export const RING_RADIUS = 24;

/** Ring centres (x, altitude, z), in course order. */
export const RING_COURSE = [
  { x: 200, y: 230, z: 820 },
  { x: 2300, y: 250, z: 250 },
  { x: 1250, y: 210, z: -2150 },
  { x: -650, y: 230, z: -1850 },
  { x: -2450, y: 210, z: -1250 },
  { x: -3950, y: 190, z: -250 },
  { x: -3680, y: 130, z: 330 },
  { x: -2760, y: 64, z: 798 },
];

/** Unit normals: each ring faces from the ring before it toward the ring after it. */
export function ringNormals(rings, start = { x: -2150, y: 14, z: 800 }, end = { x: -2150, y: 14, z: 800 }) {
  return rings.map((ring, index) => {
    const prev = index === 0 ? start : rings[index - 1];
    const next = index === rings.length - 1 ? end : rings[index + 1];
    const ax = ring.x - prev.x;
    const az = ring.z - prev.z;
    const bx = next.x - ring.x;
    const bz = next.z - ring.z;
    const la = Math.hypot(ax, az) || 1;
    const lb = Math.hypot(bx, bz) || 1;
    const last = index === rings.length - 1;
    const nx = (last ? 0 : ax / la) + bx / lb;
    const nz = (last ? 0 : az / la) + bz / lb;
    const l = Math.hypot(nx, nz) || 1;
    return { x: nx / l, y: 0, z: nz / l };
  });
}

/**
 * Did the step from `from` to `to` pass through the ring? Returns the miss distance from the
 * ring's centre at the crossing (metres) when it crossed the ring's plane, else null.
 */
export function ringCrossing(ring, normal, from, to) {
  const da = (from.x - ring.x) * normal.x + (from.y - ring.y) * normal.y + (from.z - ring.z) * normal.z;
  const db = (to.x - ring.x) * normal.x + (to.y - ring.y) * normal.y + (to.z - ring.z) * normal.z;
  if (da > 0 || db < 0 || da === db) return null;
  const t = da / (da - db);
  const x = from.x + (to.x - from.x) * t - ring.x;
  const y = from.y + (to.y - from.y) * t - ring.y;
  const z = from.z + (to.z - from.z) * t - ring.z;
  return Math.hypot(x, y, z);
}

/** Total course length, metres, from a start point through every ring. */
export function courseLength(rings, start) {
  let total = 0;
  let prev = start;
  for (const ring of rings) {
    total += Math.hypot(ring.x - prev.x, ring.y - prev.y, ring.z - prev.z);
    prev = ring;
  }
  return total;
}
