// The air the KC-9 flies through: the wind the storm pushes ahead of it, gusts on top of it (and
// stronger ones in a squall the pilot chose to push through), turbulence near the rain wall, the
// head and cross components a pilot reads against a runway, gust peaks worth a callout, and how
// far the windsocks stand out. Pure: runs in Node beside the flight model.
import { STORM_NORMAL, stormGrip } from './storm-front.js';
import { clamp, fractalNoise } from './random.js';
import { KT } from './config.js';

/** Extra gust spread (kt) and turbulence when the pilot has chosen to push through the squall. */
export const SQUALL_GUST_KT = 6;
export const SQUALL_TURBULENCE = 0.8;

/** A gust this far (kt) over the mean wind earns a callout. */
const GUST_CALLOUT_KT = 7;

/**
 * Wind (m/s vector) at a point and time: the wind off the storm plus gusts. `squall` adds the
 * heavier gusts of flying on into the front. `gustKt` is the gust on top of the mean.
 */
export function windAt(storm, x, y, z, squall = false) {
  const grip = stormGrip(storm, x, z);
  const closeness = 1 - storm.km / Math.max(storm.startKm, 1);
  const baseKt = storm.windKt + closeness * 5 + grip * 10 + (squall ? 2 : 0);
  const gust = (fractalNoise(storm.time * 0.35, x * 0.0004 + z * 0.0003, storm.seed, 3) - 0.5) * 2;
  const spread = storm.gustKt + grip * 6 + (squall ? SQUALL_GUST_KT : 0);
  const speed = Math.max(0, baseKt + gust * spread) / KT;
  const veer = (fractalNoise(storm.time * 0.11, 3.7, storm.seed + 5, 2) - 0.5) * (squall ? 0.9 : 0.6);
  const c = Math.cos(veer);
  const s = Math.sin(veer);
  const dx = -STORM_NORMAL.x;
  const dz = -STORM_NORMAL.z;
  return { x: (dx * c - dz * s) * speed, y: 0, z: (dx * s + dz * c) * speed, gustKt: gust * spread, meanKt: baseKt };
}

/** Random-kick strength (m/s²) of turbulence at a point and height above ground. */
export function turbulenceAt(storm, x, z, agl, squall = false) {
  const grip = stormGrip(storm, x, z);
  const low = agl < 120 ? 0.6 : 0.3;
  return (0.25 + grip * 2.4 + (storm.closed ? 2 : 0) + (squall ? SQUALL_TURBULENCE * (0.4 + grip) : 0)) * low;
}

/** The direction (degrees) the wind blows from, as pilots and windsocks give it. */
export function windFromDeg(wind) {
  return (((Math.atan2(-wind.x, wind.z) * 180) / Math.PI) + 360) % 360;
}

/**
 * The wind against a runway heading: headwind (+) or tailwind (−) and the crosswind, with the
 * side it comes from. What the pilot crabs into on short final.
 */
export function runwayWind(wind, runwayHeadingDeg) {
  const speedKt = Math.hypot(wind.x, wind.z) * KT;
  const from = windFromDeg(wind);
  const angle = ((from - runwayHeadingDeg + 540) % 360) - 180;
  const rad = (angle * Math.PI) / 180;
  const crossKt = Math.abs(Math.sin(rad) * speedKt);
  return { speedKt, fromDeg: from, headKt: Math.cos(rad) * speedKt, crossKt, side: angle < 0 ? 'LEFT' : 'RIGHT', gustKt: Math.max(0, wind.gustKt ?? 0) };
}

/** The crab angle (degrees) that holds a runway's centreline in that crosswind at `kt`. */
export function crabAngle(crossKt, kt) {
  return (Math.asin(clamp(crossKt / Math.max(kt, 30), -1, 1)) * 180) / Math.PI;
}

/**
 * Watch the gusts: returns a 'gust' event when one peaks past the callout level, at most one
 * every few seconds. `memory` keeps the last peak between steps.
 */
export function gustPeak(memory, wind, time) {
  const over = wind.gustKt ?? 0;
  if (over > GUST_CALLOUT_KT && time - (memory.lastGustAt ?? -99) > 6) {
    memory.lastGustAt = time;
    return { type: 'gust', kt: Math.round((wind.meanKt ?? 0) + over) };
  }
  return null;
}

/**
 * How a windsock hangs in this wind: the yaw it points along (radians, toward where the wind
 * blows) and how full it stands, 0 limp to 1 straight out (about 15 kt).
 */
export function windsockPose(wind) {
  const speedKt = Math.hypot(wind.x, wind.z) * KT;
  return { yaw: Math.atan2(wind.x, wind.z), fill: clamp(speedKt / 15, 0.12, 1) };
}
