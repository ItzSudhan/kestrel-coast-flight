// The KC-9's flight model: thrust from throttle, lift that grows with the square of airspeed
// and angle of attack until the wing stalls, drag from lift, flaps and gear, gravity, wind and
// ground effect. Rates answer the stick at every speed (authority shrinks but never vanishes),
// the nose weathervanes into the airflow, and the wheels roll, steer, brake and bounce.
// Damage to engine, wings, gear and tail changes how she flies. Pure: runs in Node.
import { judgeContact } from './landing-grader.js';
import { attitudeOf, dot, length, normalized, quatAxisAngle, quatFromAttitude, quatMultiply, quatNormalize, scaled, vec } from './flight-math.js';
import { AIRFRAME, FPM, FT, GRAVITY, KT, RHO } from './config.js';
import { TREE_HEIGHT } from './terrain-height.js';
import { clamp, lerp } from './random.js';

const FLAP_DETENTS = [0, 0.5, 1];

/** A fresh aircraft at a start point: position, heading (degrees), speed (kt), on the ground or not. */
export function createAircraft(start) {
  const heading = (start.heading * Math.PI) / 180;
  const speed = (start.speedKt ?? 0) / KT;
  const forward = { x: Math.sin(heading), y: 0, z: -Math.cos(heading) };
  return {
    pos: vec(start.x, start.y, start.z),
    vel: scaled(forward, speed),
    q: quatFromAttitude(heading, start.pitch ?? 0, start.bank ?? 0),
    rates: { pitch: 0, roll: 0, yaw: 0 },
    throttle: start.throttle ?? 0.65,
    rpm: 700,
    flapDetent: start.flapDetent ?? 0,
    flaps: FLAP_DETENTS[start.flapDetent ?? 0],
    gearDown: start.gearDown ?? true,
    gearPos: (start.gearDown ?? true) ? 1 : 0,
    fuel: start.fuel ?? 100,
    damage: { engine: 1, wings: 1, gear: 1, tail: 1, ...(start.damage ?? {}) },
    onGround: Boolean(start.onGround),
    brakes: false,
    stalled: false,
    stallWarning: false,
    lastStall: null,
    aoa: 0,
    beta: 0,
    gLoad: 1,
    ias: speed,
    heading,
    pitch: start.pitch ?? 0,
    bank: start.bank ?? 0,
    agl: 0,
    vs: 0,
    engineRunning: true,
    crashed: null,
    bounces: 0,
    firstTouchdown: null,
    belly: false,
    treeCooldown: 0,
    time: 0,
    events: [],
  };
}

/** Clean, or with flaps, the speed (m/s) at which the wing stalls in level flight. */
export function stallSpeed(flaps, wings = 1) {
  const clMax = liftCoefficient(lerp(AIRFRAME.stallAoa, AIRFRAME.flapStallAoa, flaps), flaps);
  return Math.sqrt((2 * AIRFRAME.mass * GRAVITY) / (RHO * AIRFRAME.wingArea * clMax * (0.7 + 0.3 * wings)));
}

/** Lift coefficient for an angle of attack: straight line to the stall, then a falling shelf. */
export function liftCoefficient(aoa, flaps) {
  const stall = lerp(AIRFRAME.stallAoa, AIRFRAME.flapStallAoa, flaps);
  const base = AIRFRAME.liftZero + AIRFRAME.flapLift * flaps;
  if (aoa > stall) return Math.max(0.55, base + AIRFRAME.liftSlope * stall - (aoa - stall) * 4.5);
  if (aoa < -0.26) return base - AIRFRAME.liftSlope * 0.26 + (aoa + 0.26) * 2;
  return base + AIRFRAME.liftSlope * aoa;
}

/** Cycle the flaps one detent (0, half, full). */
export function cycleFlaps(aircraft) {
  aircraft.flapDetent = (aircraft.flapDetent + 1) % FLAP_DETENTS.length;
}

export function flapTarget(aircraft) {
  return FLAP_DETENTS[aircraft.flapDetent];
}

function emit(aircraft, type, detail = {}) {
  aircraft.events.push({ type, ...detail });
}

function hurt(aircraft, part, amount) {
  if (amount <= 0) return;
  const before = aircraft.damage[part];
  aircraft.damage[part] = Math.max(0, before - amount);
  if (before - aircraft.damage[part] > 0.015) emit(aircraft, 'damage', { part, amount });
}

function crash(aircraft, cause) {
  aircraft.crashed = { cause, kt: Math.round(aircraft.ias * KT), ft: Math.round(Math.max(0, aircraft.agl) * FT), at: { ...aircraft.pos } };
  emit(aircraft, 'crash', { cause });
  aircraft.vel = vec(0, 0, 0);
  aircraft.rates = { pitch: 0, roll: 0, yaw: 0 };
}

function updateSystems(aircraft, controls, dt) {
  const kt = aircraft.ias * KT;
  let target = flapTarget(aircraft);
  if (kt > AIRFRAME.flapLimitKt) target = Math.min(target, Math.max(0, 1 - (kt - AIRFRAME.flapLimitKt) / 25));
  aircraft.flaps += clamp(target - aircraft.flaps, -dt * 0.5, dt * 0.5);
  const gearGoal = aircraft.gearDown ? 1 : 0;
  aircraft.gearPos += clamp(gearGoal - aircraft.gearPos, -dt * 0.45, dt * 0.45);
  if (aircraft.gearPos > 0.2 && kt > AIRFRAME.gearLimitKt) hurt(aircraft, 'gear', dt * 0.05);
  if (kt > AIRFRAME.overspeedKt) {
    hurt(aircraft, 'wings', dt * 0.04);
    hurt(aircraft, 'tail', dt * 0.03);
  }
  if (aircraft.gLoad > 4.6) hurt(aircraft, 'wings', dt * 0.08 * (aircraft.gLoad - 4.6));

  aircraft.throttle = clamp(controls.throttle ?? aircraft.throttle, 0, 1);
  const wasRunning = aircraft.engineRunning;
  aircraft.engineRunning = aircraft.fuel > 0 && aircraft.damage.engine > 0.05;
  if (wasRunning && !aircraft.engineRunning) emit(aircraft, 'engine-out', { reason: aircraft.fuel <= 0 ? 'fuel' : 'damage' });
  if (aircraft.engineRunning) {
    const burn = AIRFRAME.fuelIdleBurn + AIRFRAME.fuelFullBurn * aircraft.throttle * aircraft.throttle;
    aircraft.fuel = Math.max(0, aircraft.fuel - burn * dt * (controls.fuelScale ?? 1));
  }
  const rpmGoal = aircraft.engineRunning ? 750 + 1950 * aircraft.throttle * (0.55 + 0.45 * aircraft.damage.engine) + aircraft.ias * 6 : aircraft.ias * 14;
  aircraft.rpm += (rpmGoal - aircraft.rpm) * Math.min(1, dt * 2.5);
  aircraft.brakes = Boolean(controls.brakes);
}

function thrustNewtons(aircraft) {
  if (!aircraft.engineRunning) return 0;
  const health = 0.4 + 0.6 * aircraft.damage.engine;
  return aircraft.throttle * AIRFRAME.thrustMax * health * Math.max(0.22, 1 - aircraft.ias / AIRFRAME.propSpeedLimit);
}

/**
 * Advance the aircraft by dt seconds. `controls` holds pitch, roll, yaw in -1..1 (pitch +1 pulls
 * the nose up, roll +1 banks right, yaw +1 yaws right), throttle 0..1 and brakes. `env` gives
 * wind (m/s vector), turbulence (m/s² of random kick) and groundAt(x, z).
 */
export function stepAircraft(aircraft, controls, env, dt) {
  if (aircraft.crashed) return;
  aircraft.time += dt;
  updateSystems(aircraft, controls, dt);

  const att = attitudeOf(aircraft.q);
  const { forward: f, up: u, right: r } = att;
  const wind = env.wind ?? vec();
  const air = { x: aircraft.vel.x - wind.x, y: aircraft.vel.y - wind.y, z: aircraft.vel.z - wind.z };
  const speed = length(air);
  const airDir = normalized(air);
  const vf = dot(air, f);
  const vu = dot(air, u);
  const vr = dot(air, r);
  const aoa = speed > 2 ? Math.atan2(-vu, Math.max(vf, 0.5)) : 0;
  const beta = speed > 2 ? Math.atan2(vr, Math.max(vf, 0.5)) : 0;
  aircraft.aoa = aoa;
  aircraft.beta = beta;
  aircraft.ias = speed;

  const ground = env.groundAt(aircraft.pos.x, aircraft.pos.z);
  const gearHeight = lerp(AIRFRAME.bellyHeight, AIRFRAME.gearHeight, aircraft.gearPos);
  aircraft.agl = aircraft.pos.y - gearHeight - ground.height;

  // Aerodynamic forces.
  const dynamic = 0.5 * RHO * speed * speed;
  const flaps = aircraft.flaps;
  const wings = aircraft.damage.wings;
  const stallAoa = lerp(AIRFRAME.stallAoa, AIRFRAME.flapStallAoa, flaps);
  const groundEffect = aircraft.agl < 9 ? 1 + 0.12 * (1 - Math.max(0, aircraft.agl) / 9) : 1;
  const cl = liftCoefficient(aoa, flaps);
  const lift = dynamic * AIRFRAME.wingArea * cl * (0.7 + 0.3 * wings) * groundEffect;
  const cd = AIRFRAME.dragZero + (AIRFRAME.dragInduced * cl * cl) / groundEffect + AIRFRAME.dragFlaps * flaps + AIRFRAME.dragGear * aircraft.gearPos + (1 - wings) * 0.025;
  const drag = dynamic * AIRFRAME.wingArea * cd;
  const upDot = dot(u, airDir);
  const liftDir = speed > 2 ? normalized({ x: u.x - airDir.x * upDot, y: u.y - airDir.y * upDot, z: u.z - airDir.z * upDot }) : u;
  const side = -vr * speed * 0.5 * RHO * AIRFRAME.wingArea * 0.55;
  const thrust = thrustNewtons(aircraft);
  const m = AIRFRAME.mass;
  const aero = {
    x: (liftDir.x * lift - airDir.x * drag + r.x * side + f.x * thrust) / m,
    y: (liftDir.y * lift - airDir.y * drag + r.y * side + f.y * thrust) / m,
    z: (liftDir.z * lift - airDir.z * drag + r.z * side + f.z * thrust) / m,
  };
  aircraft.gLoad = dot(aero, u) / GRAVITY;
  const kick = env.turbulence ?? 0;
  const acc = {
    x: aero.x + (env.kick?.x ?? 0) * kick,
    y: aero.y - GRAVITY + (env.kick?.y ?? 0) * kick,
    z: aero.z + (env.kick?.z ?? 0) * kick,
  };

  // Stall and its warning.
  const wasStalled = aircraft.stalled;
  aircraft.stalled = !aircraft.onGround && speed > 4 && aoa > stallAoa + (wasStalled ? -0.03 : 0);
  aircraft.stallWarning = !aircraft.onGround && (aoa > stallAoa - 0.045 || speed < stallSpeed(flaps, wings) * 1.06);
  if (aircraft.stalled && !wasStalled) {
    aircraft.lastStall = { kt: Math.round(speed * KT), ft: Math.round(Math.max(0, aircraft.agl) * FT), time: aircraft.time };
    emit(aircraft, 'stall');
  }
  if (aircraft.lastStall && !aircraft.stalled && aircraft.time - aircraft.lastStall.time > 4) aircraft.lastStall = null;

  if (aircraft.onGround) stepOnGround(aircraft, controls, acc, ground, gearHeight, att, dt);
  else stepInAir(aircraft, controls, acc, att, speed, stallAoa, dt);
  if (aircraft.crashed) return;

  aircraft.pos.x += aircraft.vel.x * dt;
  aircraft.pos.y += aircraft.vel.y * dt;
  aircraft.pos.z += aircraft.vel.z * dt;
  if (!aircraft.onGround) checkContact(aircraft, env, gearHeight);

  const after = attitudeOf(aircraft.q);
  aircraft.heading = after.heading;
  aircraft.pitch = after.pitch;
  aircraft.bank = after.bank;
  aircraft.vs = aircraft.vel.y;
  aircraft.treeCooldown = Math.max(0, aircraft.treeCooldown - dt);
}

function stepInAir(aircraft, controls, acc, att, speed, stallAoa, dt) {
  aircraft.vel.x += acc.x * dt;
  aircraft.vel.y += acc.y * dt;
  aircraft.vel.z += acc.z * dt;

  const authority = clamp(0.38 + 0.62 * (speed / 36) ** 2, 0.38, 1.25);
  const stability = clamp(speed / 30, 0.12, 1.45);
  const tail = 0.5 + 0.5 * aircraft.damage.tail;
  const wings = aircraft.damage.wings;
  const flight = Math.asin(clamp(aircraft.vel.y / Math.max(1, length(aircraft.vel)), -1, 1));
  const bankFactor = Math.max(Math.cos(att.bank), 0.5);
  const dynamic = 0.5 * RHO * speed * speed * AIRFRAME.wingArea * (0.7 + 0.3 * wings);
  const needCl = dynamic > 1 ? (AIRFRAME.mass * GRAVITY * Math.cos(flight)) / bankFactor / dynamic : 2;
  const base = AIRFRAME.liftZero + AIRFRAME.flapLift * aircraft.flaps;
  const trimAoa = clamp((needCl - base) / AIRFRAME.liftSlope, -0.12, stallAoa - 0.025);
  const pull = controls.pitch ?? 0;
  const aoaGoal = trimAoa + pull * (pull > 0 ? 0.3 : 0.24);

  let pitchRate = (aoaGoal - aircraft.aoa) * 2.8 * stability * tail + pull * 0.22 * authority * tail;
  let rollRate = (controls.roll ?? 0) * 2.1 * authority * (0.65 + 0.35 * wings);
  let yawRate = aircraft.beta * 2.4 * stability + (controls.yaw ?? 0) * 0.65 * authority * tail;
  if (Math.abs(controls.roll ?? 0) < 0.05) rollRate -= att.bank * 0.22 * stability;
  rollRate += (1 - wings) * 0.22;
  if (aircraft.stalled) {
    pitchRate -= 0.55;
    rollRate += Math.sin(aircraft.time * 1.7) * 0.6 + 0.35;
  }
  if (speed < 10) pitchRate -= 0.35 * (1 - speed / 10);

  const ease = Math.min(1, dt * 7);
  aircraft.rates.pitch += (pitchRate - aircraft.rates.pitch) * ease;
  aircraft.rates.roll += (rollRate - aircraft.rates.roll) * ease;
  aircraft.rates.yaw += (yawRate - aircraft.rates.yaw) * ease;
  let q = aircraft.q;
  q = quatMultiply(q, quatAxisAngle(1, 0, 0, aircraft.rates.pitch * dt));
  q = quatMultiply(q, quatAxisAngle(0, 0, 1, -aircraft.rates.roll * dt));
  q = quatMultiply(q, quatAxisAngle(0, 1, 0, -aircraft.rates.yaw * dt));
  aircraft.q = quatNormalize(q);
}

function stepOnGround(aircraft, controls, acc, ground, gearHeight, att, dt) {
  const v = aircraft.vel;
  const heading = att.heading;
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  let along = v.x * fx + v.z * fz;
  let lateral = v.x * fz * -1 + v.z * fx;
  along += (acc.x * fx + acc.z * fz) * dt;
  lateral *= Math.exp(-dt * 9);
  const surface = ground.surface;
  const rolling = surface === 'runway' ? 0.3 : surface === 'sand' ? 2.4 : 1.1;
  const braking = aircraft.brakes ? (surface === 'runway' ? 4.2 : 2.4) * (0.4 + 0.6 * aircraft.damage.gear) : 0;
  const friction = (rolling + braking) * dt;
  along = Math.abs(along) <= friction ? 0 : along - Math.sign(along) * friction;
  const gs = Math.abs(along);
  if (surface !== 'runway' && gs > 22) hurt(aircraft, 'gear', dt * 0.06);
  if (aircraft.belly) {
    along *= Math.exp(-dt * 0.9);
    hurt(aircraft, 'engine', dt * 0.05);
  }

  const steer = clamp((controls.yaw ?? 0) + (controls.roll ?? 0) * 0.6, -1, 1);
  const steerRate = steer * 0.55 * clamp(gs / 5, 0, 1) * (1 - clamp(gs / 70, 0, 0.7));
  const newHeading = heading + steerRate * dt;
  const kt = aircraft.ias * KT;
  let pitch = att.pitch;
  const pull = controls.pitch ?? 0;
  if (aircraft.ias > AIRFRAME.rotateSpeed * 0.85 && pull > 0.1) pitch += pull * 0.35 * dt;
  else pitch += (0.035 - pitch) * Math.min(1, dt * 3);
  pitch = clamp(pitch, -0.02, 0.22);
  aircraft.q = quatFromAttitude(newHeading, pitch, att.bank * Math.exp(-dt * 6));

  const nx = Math.sin(newHeading);
  const nz = -Math.cos(newHeading);
  v.x = nx * along + nz * -1 * lateral;
  v.z = nz * along + nx * lateral;
  const climb = acc.y;
  if (climb > 0.3 && kt > 30) {
    aircraft.onGround = false;
    v.y = climb * dt;
    aircraft.firstTouchdown = null;
    aircraft.bounces = 0;
    emit(aircraft, 'liftoff');
  } else {
    v.y = 0;
    aircraft.pos.y = ground.height + gearHeight;
  }
  if (surface === 'water') crash(aircraft, `Rolled into the sea at ${Math.round(kt)} kt`);
  else if ((surface === 'rock' || surface === 'forest') && gs > 6) crash(aircraft, surface === 'rock' ? `Ran onto the rocks at ${Math.round(kt)} kt` : `Rolled into the trees at ${Math.round(kt)} kt`);
  if (gs < 0.3 && !aircraft.stoppedSent) {
    aircraft.stoppedSent = true;
    emit(aircraft, 'stopped', { surface, runway: ground.runway });
  } else if (gs > 1.5) aircraft.stoppedSent = false;
}

function checkContact(aircraft, env, gearHeight) {
  const ground = env.groundAt(aircraft.pos.x, aircraft.pos.z);
  const bottom = aircraft.pos.y - gearHeight;
  if (ground.surface === 'forest' && bottom - ground.height < TREE_HEIGHT && bottom > ground.height && aircraft.treeCooldown === 0) {
    aircraft.treeCooldown = 0.8;
    hurt(aircraft, 'wings', 0.3);
    hurt(aircraft, 'gear', 0.15);
    aircraft.vel = scaled(aircraft.vel, 0.82);
    emit(aircraft, 'tree-strike');
    if (aircraft.damage.wings <= 0.05) {
      crash(aircraft, `Tore a wing off in the treetops at ${Math.round(aircraft.ias * KT)} kt`);
      return;
    }
  }
  if (bottom > ground.height) return;
  const att = attitudeOf(aircraft.q);
  const contact = {
    vsFpm: aircraft.vel.y * FPM,
    kt: aircraft.ias * KT,
    bankDeg: (att.bank * 180) / Math.PI,
    pitchDeg: (att.pitch * 180) / Math.PI,
    surface: ground.surface,
    slope: ground.slope,
    gearDown: aircraft.gearPos > 0.85,
    gearHealth: aircraft.damage.gear,
    stall: aircraft.stalled || aircraft.lastStall ? aircraft.lastStall : null,
  };
  const verdict = judgeContact(contact);
  aircraft.agl = 0;
  if (verdict.kind === 'crash') {
    aircraft.pos.y = ground.height + gearHeight;
    crash(aircraft, verdict.cause);
    return;
  }
  if (!aircraft.firstTouchdown) {
    aircraft.firstTouchdown = {
      vsFpm: Math.round(contact.vsFpm),
      kt: Math.round(contact.kt),
      bankDeg: contact.bankDeg,
      onRunway: ground.surface === 'runway',
      centreline: ground.runway ? ground.runway.across : null,
      runway: ground.runway ? ground.runway.strip : null,
      headingDeg: (att.heading * 180) / Math.PI,
      at: { x: aircraft.pos.x, z: aircraft.pos.z },
      time: aircraft.time,
    };
  }
  hurt(aircraft, 'gear', verdict.gearDamage);
  aircraft.pos.y = ground.height + gearHeight;
  if (verdict.kind === 'bounce') {
    aircraft.bounces += 1;
    aircraft.vel.y = -aircraft.vel.y * 0.32;
    emit(aircraft, 'bounce', { vsFpm: contact.vsFpm });
    return;
  }
  if (verdict.kind === 'belly') {
    aircraft.belly = true;
    hurt(aircraft, 'engine', 0.35);
    emit(aircraft, 'belly');
  }
  aircraft.vel.y = 0;
  aircraft.onGround = true;
  aircraft.stoppedSent = false;
  emit(aircraft, 'touchdown', { vsFpm: contact.vsFpm, kt: contact.kt, surface: ground.surface });
  aircraft.q = quatFromAttitude(att.heading, Math.max(att.pitch, -0.01), att.bank * 0.3);
  aircraft.rates = { pitch: 0, roll: 0, yaw: 0 };
}
