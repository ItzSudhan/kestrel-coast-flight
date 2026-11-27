// One sortie from start to stamp: the aircraft, the storm and its wind, the mission's objectives
// and rings, the fuel plan, the divert-or-push crisis, the supply crate, refuelling on a strip,
// radio chatter, the flight recorder and the end (landed, crashed or shut out by the storm).
// Pure and stepped at a fixed rate, so the game, the screenshot scenes and the Node playtest
// all fly the same sortie.
import { planFuel } from './fuel-planner.js';
import { gearWorks } from './damage-model.js';
import { gustPeak, runwayWind, turbulenceAt, windAt } from './wind-and-gusts.js';
import { chooseCrisis, createCrisis, stepCrisis } from './divert-decision.js';
import { crashReport, createFlightRecorder, recordFlight } from './crash-report.js';
import { fitUpgrades } from './pilot-career.js';
import { cycleFlaps, createAircraft, stepAircraft } from './flight-physics.js';
import { gradeLanding } from './landing-grader.js';
import { missionById, scoreSortie } from './missions.js';
import { RING_RADIUS, ringCrossing, ringNormals } from './rings-course.js';
import { createStorm, stepStorm } from './storm-front.js';
import { groundAt } from './terrain-height.js';
import { AIRSTRIPS, landingEnd, runwayLocal, runwayThreshold } from './places.js';
import { FT, KT } from './config.js';
import { createRandom } from './random.js';

export const SPEAKER_RADIO = 'radio';
export const SPEAKER_KEEPER = 'keeper';
export const SPEAKER_PILOT = 'pilot';
export const SPEAKER_NURSE = 'nurse';
export const SPEAKER_SKIFF = 'skiff';

/**
 * A new sortie of the named mission. `options.upgrades` are the career's unlocked upgrades,
 * fitted to the aircraft at the start.
 */
export function createSession(missionId, seed = 1, options = {}) {
  const mission = missionById(missionId);
  const aircraft = createAircraft(fitUpgrades(mission.start, options.upgrades ?? []));
  const rings = mission.rings ? mission.rings.map((ring) => ({ ...ring, passed: false })) : [];
  const session = {
    mission,
    seed,
    aircraft,
    destination: mission.finish === 'land-puffin' ? 'puffin' : 'kestrel',
    finish: mission.finish,
    squall: false,
    crisis: createCrisis(mission),
    recorder: createFlightRecorder(),
    gustMemory: {},
    fuelPlan: null,
    report: null,
    storm: createStorm({ ...mission.storm, seed }),
    random: createRandom(seed * 31 + 7),
    time: 0,
    state: 'flying',
    rings,
    normals: ringNormals(rings, mission.start, runwayThreshold(AIRSTRIPS[0], false)),
    nextRing: 0,
    objectives: mission.objectives.map((o) => ({ ...o, done: false })),
    crate: mission.boat ? { dropped: false, pos: null, vel: null, landed: false, missBy: null } : null,
    boatFound: false,
    radio: [],
    landing: null,
    result: null,
    refuelling: false,
    events: [],
    kick: { x: 0, y: 0, z: 0 },
    lastWind: { x: 0, y: 0, z: 0, gustKt: 0 },
  };
  for (const [who, line] of mission.opening) say(session, who, line);
  session.fuelPlan = planFuel(aircraft, destinationStrip(session), session.lastWind);
  return session;
}

/** The strip the sortie is flying to now (it changes on a divert). */
export function destinationStrip(session) {
  return AIRSTRIPS.find((s) => s.id === session.destination) ?? AIRSTRIPS[0];
}

/** The pilot's answer to the crisis call: 1 divert, 2 push through. */
export function answerCrisis(session, choice) {
  return chooseCrisis(session, choice, (who, line) => say(session, who, line));
}

/** Add a radio line from a speaker. */
export function say(session, who, text) {
  session.radio.push({ who, text, time: session.time });
  if (session.radio.length > 6) session.radio.shift();
}

/** What Kestrel Radio says as each beacon ring lights. */
function ringCall(lit, km) {
  const calls = [
    'First beacon lit. Follow them round the east cape.',
    `Two lit. Front is ${km.toFixed(0)} km out and closing.`,
    'Three. Keep her high over the north ridge.',
    `Four lit, halfway. Storm ${km.toFixed(0)} km.`,
    'Five. Out over the western sea now.',
    `Ring 6 lit. Storm ${km.toFixed(0)} km out.`,
    'Seven lit. Last ring sits on short final for 09. Gear down, three green.',
  ];
  return `Kestrel Radio: ${calls[lit - 1] ?? `Ring ${lit} lit.`}`;
}

function complete(session, id) {
  const objective = session.objectives.find((o) => o.id === id);
  if (objective && !objective.done) {
    objective.done = true;
    session.events.push({ type: 'objective', id });
    return true;
  }
  return false;
}

/** Flip the flaps a detent or the gear up and down. */
export function toggleFlaps(session) {
  cycleFlaps(session.aircraft);
}

/** Work the gear lever; a jammed gear (damage-model.js) will not move. Returns false when jammed. */
export function toggleGear(session) {
  const a = session.aircraft;
  if (a.onGround && a.gearDown) return true;
  if (!gearWorks(a)) {
    if (!session.jamWarned) say(session, SPEAKER_PILOT, 'Gear’s jammed! It’ll have to be the belly.');
    session.jamWarned = true;
    return false;
  }
  a.gearDown = !a.gearDown;
  return true;
}

/** Release the supply crate (rescue sortie). */
export function dropCrate(session) {
  const crate = session.crate;
  const a = session.aircraft;
  if (!crate || crate.dropped || a.onGround || session.state !== 'flying') return false;
  crate.dropped = true;
  crate.pos = { x: a.pos.x, y: a.pos.y - 1.5, z: a.pos.z };
  crate.vel = { ...a.vel };
  say(session, SPEAKER_PILOT, 'Crate away!');
  return true;
}

/** Where the aircraft stands against the nearest runway approach, for callouts and the PAPI. */
export function approachInfo(session) {
  const a = session.aircraft;
  const headingDeg = (a.heading * 180) / Math.PI;
  let best = null;
  for (const strip of AIRSTRIPS) {
    const reversed = landingEnd(strip, headingDeg);
    const threshold = runwayThreshold(strip, reversed);
    const local = runwayLocal(strip, a.pos.x, a.pos.z);
    const sign = reversed ? -1 : 1;
    const along = local.along * sign + strip.length / 2;
    const across = local.across * sign;
    const distance = -along;
    const diff = Math.abs((((headingDeg - threshold.heading) % 360) + 540) % 360 - 180);
    if (distance < -strip.length || distance > 6000 || Math.abs(across) > 450 || diff > 35) continue;
    const height = a.pos.y - strip.elev;
    const glide = distance > 0 ? (Math.atan2(height, distance + 150) * 180) / Math.PI : 0;
    if (!best || distance < best.distance) best = { strip, threshold, distance, across, height, glide, final: distance > 0 && distance < 4500 };
  }
  return best;
}

function nearStrip(a) {
  for (const strip of AIRSTRIPS) {
    const local = runwayLocal(strip, a.pos.x, a.pos.z);
    if (Math.abs(local.along) < strip.length / 2 + 30 && Math.abs(local.across) < strip.width / 2 + 25) return strip;
  }
  return null;
}

/** One step of a falling crate: gravity, and air drag on its forward travel. */
function fallStep(pos, vel, dt) {
  vel.y -= 9.81 * dt;
  vel.x *= 1 - dt * 0.12;
  vel.z *= 1 - dt * 0.12;
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
  pos.z += vel.z * dt;
}

/**
 * Where a crate let go right now would land, and how far that is from the boat: the rescue
 * sortie's drop cue. Null when there is no crate to drop.
 */
export function predictCrate(session) {
  const crate = session.crate;
  const a = session.aircraft;
  if (!crate || crate.dropped || a.onGround) return null;
  const pos = { x: a.pos.x, y: a.pos.y - 1.5, z: a.pos.z };
  const vel = { ...a.vel };
  for (let i = 0; i < 400 && pos.y > 0.4; i += 1) fallStep(pos, vel, 0.05);
  const boat = session.mission.boat;
  return { x: pos.x, z: pos.z, miss: Math.hypot(pos.x - boat.x, pos.z - boat.z) };
}

function stepCrate(session, dt) {
  const crate = session.crate;
  if (!crate || !crate.dropped || crate.landed) return;
  fallStep(crate.pos, crate.vel, dt);
  const ground = groundAt(crate.pos.x, crate.pos.z);
  if (crate.pos.y <= ground.height + 0.4) {
    crate.landed = true;
    crate.pos.y = ground.height + 0.4;
    const boat = session.mission.boat;
    crate.missBy = Math.round(Math.hypot(crate.pos.x - boat.x, crate.pos.z - boat.z));
    if (crate.missBy <= 60) {
      complete(session, 'drop-crate');
      say(session, SPEAKER_KEEPER, `Gannet Light: Crate's in the water ${crate.missBy} m off — they've got it! Bless you.`);
    } else say(session, SPEAKER_KEEPER, `Gannet Light: Missed by ${crate.missBy} m. They can't reach it.`);
    session.events.push({ type: 'crate-landed', missBy: crate.missBy });
  }
}

function finishLanding(session, strip) {
  const a = session.aircraft;
  const touch = a.firstTouchdown;
  const stripOk = touch && touch.runway === strip;
  const graded = gradeLanding({
    vsFpm: touch ? touch.vsFpm : -999,
    kt: touch ? touch.kt : 0,
    centreline: touch ? touch.centreline : null,
    onRunway: Boolean(stripOk),
    bounces: a.bounces,
    belly: a.belly,
  });
  const headingDeg = touch ? touch.headingDeg : (a.heading * 180) / Math.PI;
  const runwayName = strip.ends[landingEnd(strip, headingDeg) ? 1 : 0];
  const threshold = runwayThreshold(strip, runwayName === strip.ends[1]);
  const crossKt = touch?.wind ? Math.round(runwayWind(touch.wind, threshold.heading).crossKt) : 0;
  session.landing = { ...graded, vsFpm: touch ? touch.vsFpm : 0, kt: touch ? touch.kt : 0, centreline: touch ? touch.centreline : null, strip, runwayName, bounces: a.bounces, crossKt };
  session.events.push({ type: 'landed', grade: graded.grade });
  const mission = session.mission;
  complete(session, `land-${strip.id}`);
  const finished = session.objectives.find((o) => o.id === session.finish)?.done;
  if (!finished) {
    say(session, SPEAKER_RADIO, `Kestrel Radio: That's ${strip.name}. Hold R to refuel, then press on.`);
    return;
  }
  if (mission.rings && session.nextRing < session.rings.length) {
    say(session, SPEAKER_RADIO, `Kestrel Radio: Down safe, but ${session.rings.length - session.nextRing} rings still dark.`);
  }
  if (session.time <= mission.par) complete(session, 'par');
  if (a.fuel >= 8) complete(session, 'fuel-reserve');
  if (touch && touch.vsFpm > -300) complete(session, 'soft-touch');
  if (touch && touch.centreline !== null && Math.abs(touch.centreline) < 5) complete(session, 'centreline');
  if (Object.values(a.damage).every((v) => v > 0.8)) complete(session, 'no-damage');
  if (session.squall && strip.id === session.destination) complete(session, 'squall');
  session.state = 'complete';
  session.result = { ...scoreSortie(session), cause: null };
  say(session, SPEAKER_RADIO, `Kestrel Radio: ${graded.grade === 'GREASED IT' ? 'Greased it! ' : ''}Welcome home. ${session.result.stars} stars.`);
}

/**
 * Advance the sortie one step. `controls`: pitch, roll, yaw, throttle, brakes, refuel.
 * Returns the events of this step (objective, ring, landed, crash, storm-closed, and the
 * aircraft's own: liftoff, touchdown, bounce, stall, damage, tree-strike, engine-out).
 */
export function stepSession(session, controls, dt) {
  session.events = [];
  if (session.state !== 'flying') {
    stepStorm(session.storm, dt);
    return session.events;
  }
  session.time += dt;
  const a = session.aircraft;
  const storm = session.storm;
  if (stepStorm(storm, dt)) {
    session.events.push({ type: 'storm-closed' });
    if (!a.onGround) say(session, SPEAKER_RADIO, 'Kestrel Radio: The front is on the coast. Get down, anywhere!');
  }
  const wind = windAt(storm, a.pos.x, a.pos.y, a.pos.z, session.squall);
  session.lastWind = wind;
  if (!a.onGround) {
    const gust = gustPeak(session.gustMemory, wind, session.time);
    if (gust) session.events.push(gust);
  }
  stepCrisis(session, (who, line) => say(session, who, line));
  const r = session.random;
  session.kick = { x: r() * 2 - 1, y: (r() * 2 - 1) * 0.7, z: r() * 2 - 1 };
  const from = { ...a.pos };
  const strip = a.onGround ? nearStrip(a) : null;
  const stopped = a.onGround && a.ias < 1 && Math.hypot(a.vel.x, a.vel.z) < 0.5;
  session.refuelling = Boolean(controls.refuel && stopped && strip);
  if (session.refuelling) {
    a.fuel = Math.min(100, a.fuel + dt * 6);
    for (const part of Object.keys(a.damage)) a.damage[part] = Math.min(1, a.damage[part] + dt * 0.1);
  }
  stepAircraft(
    a,
    { ...controls, throttle: session.refuelling ? 0 : controls.throttle },
    { wind: a.onGround ? { x: wind.x * 0.3, y: 0, z: wind.z * 0.3 } : wind, turbulence: a.onGround ? 0 : turbulenceAt(storm, a.pos.x, a.pos.z, a.agl, session.squall), kick: session.kick, groundAt },
    dt,
  );
  for (const event of a.events) session.events.push(event);
  a.events.length = 0;
  recordFlight(session.recorder, a, session.time);
  if (!session.fuelPlan || Math.floor(session.time * 2) !== Math.floor((session.time - dt) * 2)) session.fuelPlan = planFuel(a, destinationStrip(session), wind);

  // Rings.
  if (session.nextRing < session.rings.length && !a.crashed) {
    const ring = session.rings[session.nextRing];
    const miss = ringCrossing(ring, session.normals[session.nextRing], from, a.pos);
    if (miss !== null && miss > RING_RADIUS * 1.05 && miss < RING_RADIUS * 6) {
      session.events.push({ type: 'ring-miss', index: session.nextRing + 1, miss: Math.round(miss - RING_RADIUS) });
    }
    if (miss !== null && miss <= RING_RADIUS * 1.05) {
      ring.passed = true;
      ring.passedAt = session.time;
      session.nextRing += 1;
      session.events.push({ type: 'ring', index: session.nextRing, miss });
      if (session.nextRing === session.rings.length) {
        complete(session, 'rings');
        say(session, SPEAKER_RADIO, 'Kestrel Radio: All eight lit! Runway 09, cleared to land.');
      } else say(session, SPEAKER_RADIO, ringCall(session.nextRing, storm.km));
    }
  }

  // Mission goals reached in the air.
  for (const event of session.events) {
    if (event.type === 'liftoff' && complete(session, 'takeoff')) say(session, SPEAKER_PILOT, 'Kestrel One, wheels up.');
    if (event.type === 'stall') say(session, SPEAKER_RADIO, 'Kestrel Radio: You’re stalling — nose down, power up!');
    if (event.type === 'engine-out') say(session, SPEAKER_PILOT, event.reason === 'fuel' ? 'Engine’s quit — tanks are dry!' : 'Engine’s gone. Gliding.');
    if (event.type === 'tree-strike') say(session, SPEAKER_PILOT, 'Clipped the treetops!');
    if (event.type === 'lightning-strike') say(session, SPEAKER_PILOT, `We're hit! Lightning — engine's down to ${event.engine} percent.`);
    if (event.type === 'gear-jammed') say(session, SPEAKER_PILOT, 'Gear’s taken a beating — it won’t lock. Belly landing.');
  }
  if (session.destination === 'puffin' && Math.hypot(a.pos.x - 5300, a.pos.z + 450) < 1800 && complete(session, 'reach-puffin')) {
    say(session, SPEAKER_NURSE, 'Puffin Cay: I can hear your engine! Runway 36, wind light. Mind the sheep.');
  }
  if (session.mission.boat && !session.boatFound) {
    const boat = session.mission.boat;
    if (Math.hypot(a.pos.x - boat.x, a.pos.z - boat.z) < 700 && a.pos.y < 450) {
      session.boatFound = true;
      complete(session, 'find-boat');
      say(session, SPEAKER_KEEPER, 'Gannet Light: That’s them under the flare! Low and slow, then drop.');
    }
  }
  stepCrate(session, dt);

  if (a.crashed) {
    session.state = 'crashed';
    session.result = { ...scoreSortie(session), cause: a.crashed.cause };
    recordFlight(session.recorder, a, session.time, true);
    session.report = crashReport(session, session.recorder);
    session.events.push({ type: 'sortie-over' });
    return session.events;
  }
  for (const event of session.events) {
    if (event.type === 'stopped' && a.firstTouchdown) {
      const here = nearStrip(a);
      if (here) finishLanding(session, here);
      else if (a.belly || !a.engineRunning) {
        session.state = 'failed';
        session.result = { ...scoreSortie(session), cause: a.belly ? 'Belly-landed off the field' : 'Down off the field with a dead engine', stamp: 'STRANDED' };
        say(session, SPEAKER_RADIO, 'Kestrel Radio: We see you down out there. Stay with her, the launch is coming.');
        session.events.push({ type: 'sortie-over' });
      } else if (!session.offFieldWarned) {
        session.offFieldWarned = true;
        say(session, SPEAKER_RADIO, 'Kestrel Radio: You’re down off the field. Taxi back or take off again.');
      }
    }
  }
  // Twenty seconds after the front reaches the coast, anyone not safe on an airstrip has lost the sortie.
  const sheltered = a.onGround && nearStrip(a);
  if (session.state === 'flying' && storm.closed && !sheltered) {
    session.closedFor = (session.closedFor ?? 0) + dt;
    if (session.closedFor > 20) {
      session.state = 'failed';
      session.result = { ...scoreSortie(session), cause: 'The storm closed the coast', stamp: 'STORM CLOSED' };
      session.events.push({ type: 'sortie-over' });
    }
  }
  if (session.state === 'failed' && !session.report) session.report = crashReport(session, session.recorder);
  return session.events;
}

/** The figures the HUD shows, all in pilots' units. */
export function readouts(session) {
  const a = session.aircraft;
  return {
    kt: a.ias * KT,
    gsKt: Math.hypot(a.vel.x, a.vel.z) * KT,
    altFt: a.pos.y * FT,
    aglFt: Math.max(0, a.agl) * FT,
    vsFpm: a.vel.y * 196.8504,
    headingDeg: (a.heading * 180) / Math.PI,
    pitchDeg: (a.pitch * 180) / Math.PI,
    bankDeg: (a.bank * 180) / Math.PI,
    windKt: Math.hypot(session.lastWind.x, session.lastWind.z) * KT,
  };
}
