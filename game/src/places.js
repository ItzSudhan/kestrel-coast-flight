// The named places of the Kestrel Coast, laid out by hand: the islands, the two airstrips with
// their runway headings, the harbour town, Gannet Rock's lighthouse and the rescue boat's drift.
// Pure data and runway geometry, shared by terrain, physics, missions, HUD and renderer.

/** Islands: centre, radii, hill peak, cliff lift at the shore, and a few shaping knobs. */
export const ISLANDS = [
  { name: 'Kestrel Isle', x: -200, z: 500, rx: 2700, rz: 1750, peak: 250, cliff: 0, beach: 1.4, shelf: 140, seed: 11, northHills: true },
  { name: 'Gannet Rock', x: 1900, z: -2550, rx: 520, rz: 430, peak: 46, cliff: 34, beach: 0.5, shelf: 200, seed: 23 },
  { name: 'Puffin Cay', x: 5300, z: -500, rx: 950, rz: 1350, peak: 70, cliff: 0, beach: 1.6, shelf: 120, seed: 37 },
  { name: 'West Skerry', x: -3500, z: -1700, rx: 480, rz: 360, peak: 52, cliff: 10, beach: 0.8, shelf: 160, seed: 41 },
  { name: 'Seal Holm', x: -4300, z: 2300, rx: 380, rz: 300, peak: 30, cliff: 6, beach: 1, shelf: 150, seed: 53 },
  { name: 'South Holm', x: 2700, z: 3300, rx: 640, rz: 460, peak: 64, cliff: 0, beach: 1.4, shelf: 130, seed: 67 },
];

/**
 * Airstrips. `heading` is the runway's low-numbered direction in degrees; each runway is named
 * for both ends (09 lands heading 090, 27 lands heading 270).
 */
export const AIRSTRIPS = [
  { id: 'kestrel', name: 'Kestrel Field', x: -1650, z: 800, heading: 90, length: 1000, width: 36, elev: 14, ends: ['09', '27'] },
  { id: 'puffin', name: 'Puffin Cay Strip', x: 5300, z: -450, heading: 0, length: 800, width: 26, elev: 12, ends: ['36', '18'] },
];

/** The harbour town of Kestrel Harbour, south of Kestrel Field. */
export const TOWN = { name: 'Kestrel Harbour', x: -900, z: 1750, radius: 520 };

/** Gannet Rock lighthouse (its foot; the tower stands on the rock's top). */
export const LIGHTHOUSE = { name: 'Gannet Light', x: 1900, z: -2560 };

/** Where the flare boat drifts in the search-and-rescue sortie. */
export const FLARE_BOAT = { x: -2300, z: -3700 };

/** The world's extent in metres, for terrain meshing and the minimap. */
export const MAP = { minX: -6200, maxX: 7400, minZ: -5600, maxZ: 5200 };

/** Unit vector along the runway's low-numbered heading, and to its right, in (x, z). */
export function runwayAxes(strip, reversed = false) {
  const h = ((reversed ? strip.heading + 180 : strip.heading) * Math.PI) / 180;
  return { ax: Math.sin(h), az: -Math.cos(h), rx: Math.cos(h), rz: Math.sin(h) };
}

/** A point in a runway's own frame: metres along its low-numbered heading and to its right. */
export function runwayLocal(strip, x, z) {
  const { ax, az, rx, rz } = runwayAxes(strip);
  const dx = x - strip.x;
  const dz = z - strip.z;
  return { along: dx * ax + dz * az, across: dx * rx + dz * rz };
}

/** The runway (if any) whose paved area holds the point, with its local frame. */
export function runwayAt(x, z, margin = 0) {
  for (const strip of AIRSTRIPS) {
    const local = runwayLocal(strip, x, z);
    if (Math.abs(local.along) <= strip.length / 2 + margin && Math.abs(local.across) <= strip.width / 2 + margin) {
      return { strip, ...local };
    }
  }
  return null;
}

/**
 * The threshold (touchdown end) of a runway for landing in one direction: `reversed` lands on the
 * high-numbered end. Returns its world point, landing heading and name.
 */
export function runwayThreshold(strip, reversed = false) {
  const { ax, az } = runwayAxes(strip, reversed);
  return {
    x: strip.x - (ax * strip.length) / 2,
    z: strip.z - (az * strip.length) / 2,
    heading: reversed ? (strip.heading + 180) % 360 : strip.heading,
    name: strip.ends[reversed ? 1 : 0],
    ax,
    az,
  };
}

/** Which end a pilot heading `headingDeg` would be landing on. */
export function landingEnd(strip, headingDeg) {
  const diff = Math.abs((((headingDeg - strip.heading) % 360) + 540) % 360 - 180);
  return diff > 90;
}
