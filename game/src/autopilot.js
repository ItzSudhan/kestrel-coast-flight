// A simple seeded autopilot that flies the KC-9 with the same controls a player has: take off
// down the centreline, turn and climb toward a point, fly the rings, then fly a stabilised
// approach, flare and brake to a stop. The screenshot scenes and the Node playtest use it.
import { KT } from './config.js';
import { AIRSTRIPS, runwayLocal, runwayThreshold } from './places.js';
import { clamp } from './random.js';
import { wrapAngle } from './flight-math.js';

function bearingTo(a, x, z) {
  return Math.atan2(x - a.pos.x, -(z - a.pos.z));
}

/** Controls that bank toward a bearing, hold a climb angle and a speed. */
export function holdCourse(a, bearing, gammaGoal, speedKt, throttleCap = 1) {
  const err = wrapAngle(bearing - a.heading);
  const bankGoal = clamp(err * 1.7, -0.62, 0.62);
  const roll = clamp((bankGoal - a.bank) * 2.6 - a.rates.roll * 0.35, -1, 1);
  const speed = Math.max(1, Math.hypot(a.vel.x, a.vel.y, a.vel.z));
  const gamma = Math.asin(clamp(a.vel.y / speed, -1, 1));
  const pitch = clamp((gammaGoal - gamma) * 5 - a.rates.pitch * 0.4, -1, 1);
  const throttle = clamp(0.5 + (speedKt - a.ias * KT) * 0.06 + gammaGoal * 2.2, 0.05, throttleCap);
  return { pitch: a.stallWarning ? Math.min(pitch, -0.25) : pitch, roll, yaw: 0, throttle, brakes: false };
}

/** Fly toward a 3D point at a speed. */
export function flyToward(a, target, speedKt = 92) {
  const dist = Math.hypot(target.x - a.pos.x, target.z - a.pos.z);
  const gammaGoal = clamp(Math.atan2(target.y - a.pos.y, Math.max(dist, 200)) * 1.1, -0.14, 0.12);
  return holdCourse(a, bearingTo(a, target.x, target.z), gammaGoal, speedKt);
}

/**
 * Fly through a ring along its facing: aim at a lead point behind the ring on its axis while far
 * off, and at the ring itself once lined up.
 */
export function flyRing(a, ring, normal, speedKt = 92) {
  const dx = ring.x - a.pos.x;
  const dz = ring.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  const lead = clamp(dist * 0.45, 0, 380);
  const aim = { x: ring.x - normal.x * lead, y: ring.y, z: ring.z - normal.z * lead };
  return flyToward(a, dist < 160 ? ring : aim, speedKt);
}

/** Takeoff roll: full power, steer the centreline, rotate at 54 kt, climb out at 75 kt. */
export function takeoff(a, strip, reversed) {
  const local = runwayLocal(strip, a.pos.x, a.pos.z);
  const across = local.across * (reversed ? -1 : 1);
  const threshold = runwayThreshold(strip, reversed);
  const runwayHeading = (threshold.heading * Math.PI) / 180;
  const err = wrapAngle(runwayHeading - a.heading);
  const yaw = clamp(err * 3 - across * 0.04, -1, 1);
  const kt = a.ias * KT;
  return { pitch: kt > 54 ? 0.35 : 0, roll: 0, yaw, throttle: 1, brakes: false };
}

/**
 * Fly a stabilised approach to a runway end: line up on the extended centreline, ride a 3.5°
 * glide path to a point 150 m past the threshold at 64 kt with full flaps, flare, idle, brake.
 */
export function approach(a, strip, reversed) {
  const t = runwayThreshold(strip, reversed);
  const local = runwayLocal(strip, a.pos.x, a.pos.z);
  const sign = reversed ? -1 : 1;
  const distance = -(local.along * sign + strip.length / 2);
  const across = local.across * sign;
  const runwayHeading = (t.heading * Math.PI) / 180;
  const kt = a.ias * KT;
  if (a.onGround) {
    const err = wrapAngle(runwayHeading - a.heading);
    return { pitch: 0, roll: 0, yaw: clamp(err * 3 - across * 0.05, -1, 1), throttle: 0, brakes: kt < 55 };
  }
  const drift = a.vel.x * -t.az + a.vel.z * t.ax;
  let bearing;
  if (Math.abs(across) > 140 && distance > 700) {
    const intercept = Math.max(distance - Math.max(Math.abs(across) * 1.6, 500), 450);
    bearing = bearingTo(a, t.x - t.ax * intercept, t.z - t.az * intercept);
  } else {
    const track = Math.atan2(a.vel.x, -a.vel.z);
    const crab = Math.hypot(a.vel.x, a.vel.z) > 10 ? wrapAngle(a.heading - track) : 0;
    bearing = runwayHeading - clamp(across * 0.012 + drift * 0.05, -0.35, 0.35) + clamp(crab, -0.4, 0.4);
  }
  const height = a.pos.y - strip.elev - 1.55;
  const pathHeight = Math.max(0, (distance + 150) * Math.tan((3.5 * Math.PI) / 180));
  let gammaGoal = clamp(-0.061 + (pathHeight - height) * 0.004, -0.13, 0.03);
  let speedGoal = distance > 2500 ? 80 : 61;
  const flare = height < 5.5;
  if (flare) {
    gammaGoal = -(0.55 + height * 0.3) / Math.max(a.ias, 20);
    speedGoal = 54;
  }
  const c = holdCourse(a, bearing, gammaGoal, speedGoal, 0.85);
  if (flare) {
    c.throttle = height < 1.2 ? 0 : 0.2;
    c.roll = clamp(c.roll * 0.6 - a.bank * 2.5, -1, 1);
  }
  return c;
}

/**
 * A pilot for a whole sortie (the rings, the mail run or a straight landing): it works the gear
 * and flaps by hand like a player and returns each step's controls. `act(name)` is called for
 * toggles. On the mail run it cruises at a fuel-saving throttle to a fix south of Puffin Cay.
 */
export function createSortiePilot(session, act) {
  const home = AIRSTRIPS[0];
  const mail = session.mission.finish === 'land-puffin';
  const strip = mail ? AIRSTRIPS[1] : home;
  let phase = session.aircraft.onGround ? 'takeoff' : session.rings.length ? 'rings' : 'land';
  let cleaned = !session.aircraft.onGround;
  let configured = false;
  let finalSet = false;
  return function controlsFor() {
    const a = session.aircraft;
    if (phase === 'takeoff') {
      if (!a.onGround && a.agl > 40) phase = mail ? 'cruise' : 'rings';
      return takeoff(a, home, false);
    }
    if (phase === 'cruise') {
      if (!cleaned && a.agl > 70) {
        cleaned = true;
        if (a.gearDown) act('gear');
        while (a.flapDetent !== 0) act('flaps');
      }
      const t = runwayThreshold(strip, false);
      const fix = { x: t.x - t.ax * 1600, y: 170, z: t.z - t.az * 1600 };
      if (Math.hypot(a.pos.x - fix.x, a.pos.z - fix.z) < 450) phase = 'land';
      const c = flyToward(a, a.pos.x < 2600 ? { ...fix, y: 190 } : fix, 92);
      c.throttle = Math.min(c.throttle, a.pos.x < 2600 ? 0.55 : 0.4);
      return c;
    }
    if (!cleaned && a.agl > 70) {
      cleaned = true;
      if (a.gearDown) act('gear');
      while (a.flapDetent !== 0) act('flaps');
    }
    if (phase === 'rings' && session.nextRing >= session.rings.length) phase = 'land';
    if (phase === 'rings') {
      const i = session.nextRing;
      if (i >= session.rings.length - 1 && !finalSet) {
        finalSet = true;
        if (!a.gearDown) act('gear');
        while (a.flapDetent !== 1) act('flaps');
      }
      return flyRing(a, session.rings[i], session.normals[i], i >= 6 ? 80 : 95);
    }
    const t = runwayThreshold(strip, false);
    const distance = Math.hypot(a.pos.x - t.x, a.pos.z - t.z);
    if (!configured && distance < 3400) {
      configured = true;
      if (!a.gearDown) act('gear');
      while (a.flapDetent !== 2) act('flaps');
    }
    return approach(a, strip, false);
  };
}

/** The airstrip a mission lands on, with the end to use for a given approach heading. */
export function homeStrip(id = 'kestrel') {
  return AIRSTRIPS.find((s) => s.id === id) ?? AIRSTRIPS[0];
}
