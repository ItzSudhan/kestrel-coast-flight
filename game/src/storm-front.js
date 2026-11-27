// The storm rolling in off the sea from the north: how far out it is, how fast it closes, the
// rain wall that marks it and its lightning (the wind it drives is in wind-and-gusts.js). Every
// sortie runs against it; when it reaches the coast, the coast is closed.
import { clamp, createRandom } from './random.js';

/** The storm rolls in from bearing 020° (NNE) toward the islands; distances are measured from here. */
export const STORM_BEARING = 20;
export const STORM_ORIGIN = { x: 0, z: 500 };
export const STORM_NORMAL = { x: Math.sin((STORM_BEARING * Math.PI) / 180), z: -Math.cos((STORM_BEARING * Math.PI) / 180) };

/** How far out from the origin, along the storm's bearing, its rain wall stands for `km`. */
export function stormWallOffset(km) {
  return 2300 + km * 380;
}

/** Metres from a point to the rain wall (positive on the clear side, negative inside the rain). */
export function distanceToWall(storm, x, z) {
  const along = (x - STORM_ORIGIN.x) * STORM_NORMAL.x + (z - STORM_ORIGIN.z) * STORM_NORMAL.z;
  return stormWallOffset(storm.km) - along;
}

/** A storm `km` out, closing at `kmPerSecond`, with a base wind (kt from the north) and gust spread. */
export function createStorm({ km, kmPerSecond, windKt = 6, gustKt = 4, seed = 1 }) {
  return {
    km,
    startKm: km,
    kmPerSecond,
    windKt,
    gustKt,
    seed,
    time: 0,
    closed: false,
    flash: 0,
    bolt: null,
    nextBolt: 2.5,
    random: createRandom(seed * 7919 + 13),
  };
}

/** Seconds until the storm reaches the coast. */
export function stormEta(storm) {
  return storm.kmPerSecond > 0 ? Math.max(0, storm.km / storm.kmPerSecond) : Infinity;
}

/** Advance the storm: it closes in, flickers lightning and reports when it reaches the coast. */
export function stepStorm(storm, dt) {
  storm.time += dt;
  storm.km = Math.max(0, storm.km - storm.kmPerSecond * dt);
  storm.flash = Math.max(0, storm.flash - dt * 3.2);
  storm.nextBolt -= dt;
  if (storm.nextBolt <= 0) {
    const r = storm.random;
    storm.bolt = { x: -5200 + r() * 11000, seed: Math.floor(r() * 100000), life: 0.35 };
    storm.flash = 1;
    storm.nextBolt = 2 + r() * 5 * (0.4 + storm.km / Math.max(1, storm.startKm));
  }
  if (storm.bolt) {
    storm.bolt.life -= dt;
    if (storm.bolt.life <= 0) storm.bolt = null;
  }
  const justClosed = !storm.closed && storm.km <= 0;
  if (justClosed) storm.closed = true;
  return justClosed;
}

/** How strongly the storm is felt at a point, 0 (far) to 1 (inside the rain). */
export function stormGrip(storm, x, z) {
  return clamp(1 - distanceToWall(storm, x, z) / 2600, 0, 1);
}

/**
 * Strike a bolt at a point (the scene draws it there) and light the sky. Used when lightning
 * finds the aircraft.
 */
export function boltAt(storm, x, life = 0.5) {
  storm.flash = 1;
  // A bolt already forking stays in the sky; the flash still lights it.
  if (storm.bolt && storm.bolt.life > life) return;
  storm.bolt = { x, seed: Math.floor(storm.random() * 100000), life };
}
