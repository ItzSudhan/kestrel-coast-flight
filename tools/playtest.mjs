// Headless playtest of Kestrel Coast's rules (no browser): a seeded autopilot takes off from
// Kestrel Field, flies the eight Beacon Rings and lands runway 09, then the checks below confirm
// the flight model and the landing grader behave. Also flies a deliberate stall and a hard
// landing to check the crash causes. Run: node tools/playtest.mjs
import { STEP, KT } from '../game/src/config.js';
import { createSession, dropCrate, predictCrate, stepSession, toggleFlaps, toggleGear, readouts } from '../game/src/game-session.js';
import { approach, createSortiePilot, flyRing, flyToward, takeoff, homeStrip } from '../game/src/autopilot.js';
import { createAircraft, stallSpeed } from '../game/src/flight-physics.js';
import { gradeLanding, judgeContact } from '../game/src/landing-grader.js';

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures += 1;
}

// 1. Stall speeds come out of the airframe numbers.
const clean = stallSpeed(0) * KT;
const full = stallSpeed(1) * KT;
check('clean stall speed is 45-55 kt', clean > 45 && clean < 55, `${clean.toFixed(1)} kt`);
check('full-flap stall speed is lower', full < clean - 3, `${full.toFixed(1)} kt`);

// 2. Ring course: takeoff, eight rings, landing.
const strip = homeStrip('kestrel');
const session = createSession('rings', 1);
let phase = 'takeoff';
let maxAlt = 0;
let minAgl = Infinity;
let gearUpAt = null;
let flapsUp = false;
for (let step = 0; step < 60 * 900 && session.state === 'flying'; step += 1) {
  const a = session.aircraft;
  let controls;
  if (phase === 'takeoff') {
    controls = takeoff(a, strip, false);
    if (!a.onGround && a.agl > 40) phase = 'rings';
  } else if (phase === 'rings') {
    if (gearUpAt === null && a.agl > 60) {
      toggleGear(session);
      gearUpAt = session.time;
    }
    if (!flapsUp && a.agl > 80) {
      toggleFlaps(session);
      toggleFlaps(session);
      flapsUp = true;
    }
    if (session.nextRing >= session.rings.length) {
      phase = 'land';
      toggleGear(session);
      toggleFlaps(session);
      toggleFlaps(session);
      controls = approach(a, strip, false);
    } else {
      const ring = session.rings[session.nextRing];
      controls = flyRing(a, ring, session.normals[session.nextRing], session.nextRing >= 6 ? 80 : 95);
    }
    if (!a.onGround) minAgl = Math.min(minAgl, a.agl);
  } else {
    controls = approach(a, strip, false);
  }
  maxAlt = Math.max(maxAlt, a.pos.y);
  const events = stepSession(session, controls, STEP);
  for (const e of events) {
    if (['ring', 'liftoff', 'touchdown', 'bounce', 'stall', 'crash', 'landed', 'objective', 'stopped', 'tree-strike', 'damage'].includes(e.type)) {
      const r = readouts(session);
      console.log(`  t=${session.time.toFixed(1)}s ${e.type}${e.index ? ' ' + e.index : ''}${e.id ? ' ' + e.id : ''}${e.cause ? ' ' + e.cause : ''}${e.part ? ' ' + e.part : ''} kt=${r.kt.toFixed(0)} alt=${r.altFt.toFixed(0)}ft vs=${r.vsFpm.toFixed(0)}`);
    }
  }
}
const a = session.aircraft;
check('took off', session.objectives.find((o) => o.id === 'takeoff').done);
check('flew all 8 rings', session.nextRing === 8, `${session.nextRing}/8`);
check('sortie complete (landed and stopped)', session.state === 'complete', `${session.state}${session.result?.cause ? ': ' + session.result.cause : ''}`);
check('landing graded', Boolean(session.landing), session.landing ? `${session.landing.grade}, ${session.landing.vsFpm} fpm, ${session.landing.kt} kt, ${session.landing.centreline?.toFixed(1)} m` : '');
check('landing not bounced or off field', session.landing && ['GREASED IT', 'FIRM'].includes(session.landing.grade));
check('fuel was burned', a.fuel < 78 && a.fuel > 0, `${a.fuel.toFixed(1)}% left`);
check('course time is a few minutes', session.time > 150 && session.time < 600, `${session.time.toFixed(0)} s`);
check('stayed clear of the ground', minAgl > 20, `min ${minAgl.toFixed(0)} m AGL`);
check('storm closed in but not on the coast', session.storm.km < 12 && session.storm.km > 0, `${session.storm.km.toFixed(1)} km`);
check('scored and starred', session.result && session.result.total > 0 && session.result.stars >= 2, session.result ? `${session.result.total} pts, ${session.result.stars} stars` : '');

// 3. A deliberate stall: pull and cut power until the wing lets go.
const stallTest = createSession('storm', 2);
let stalled = false;
let stallKt = 0;
for (let step = 0; step < 60 * 40 && stallTest.state === 'flying'; step += 1) {
  const events = stepSession(stallTest, { pitch: 1, roll: 0, yaw: 0, throttle: 0 }, STEP);
  if (events.some((e) => e.type === 'stall')) {
    stalled = true;
    stallKt = stallTest.aircraft.ias * KT;
    break;
  }
}
check('holding full back stick with no power stalls', stalled, `${stallKt.toFixed(0)} kt`);

// 3b. A novice takeoff: full power, then hauling full back stick from 50 kt for six seconds.
const novice = createSession('rings', 5);
let hauled = 0;
for (let step = 0; step < 60 * 30 && novice.state === 'flying' && hauled < 6; step += 1) {
  const kt = novice.aircraft.ias * KT;
  const pulling = kt > 50 || hauled > 0;
  if (pulling) hauled += STEP;
  stepSession(novice, { pitch: pulling ? 1 : 0, roll: 0, yaw: 0, throttle: 1 }, STEP);
}
check('a full-aft-stick takeoff climbs away without crashing', novice.state === 'flying' && !novice.aircraft.onGround && novice.aircraft.agl > 10, `${novice.state}, ${novice.aircraft.agl.toFixed(0)} m AGL`);

// 4. Controls answer at every speed: roll rate at 55 kt and at 110 kt.
function rollRateAt(kt) {
  const s = createSession('storm', 3);
  s.aircraft.vel = { x: Math.sin(0.87) * kt / KT, y: 0, z: -Math.cos(0.87) * kt / KT };
  for (let i = 0; i < 30; i += 1) stepSession(s, { pitch: 0, roll: 1, yaw: 0, throttle: 0.6 }, STEP);
  return Math.abs(s.aircraft.rates.roll);
}
const slowRoll = rollRateAt(55);
const fastRoll = rollRateAt(110);
check('roll answers at 55 kt', slowRoll > 0.6, `${slowRoll.toFixed(2)} rad/s`);
check('roll answers at 110 kt', fastRoll > slowRoll, `${fastRoll.toFixed(2)} rad/s`);

// 4b. The mail run is winnable at a cruise setting: Puffin Cay reached and landed with the reserve.
const mailRun = createSession('mail', 1);
const mailPilot = createSortiePilot(mailRun, (name) => (name === 'gear' ? toggleGear(mailRun) : toggleFlaps(mailRun)));
for (let step = 0; step < 60 * 600 && mailRun.state === 'flying'; step += 1) stepSession(mailRun, mailPilot(), STEP);
check('the mail run lands at Puffin Cay', mailRun.state === 'complete' && mailRun.landing?.strip.id === 'puffin', `${mailRun.state}, ${mailRun.landing?.grade}`);
check('the mail run keeps the 8% fuel reserve at cruise power', mailRun.aircraft.fuel >= 8, `${mailRun.aircraft.fuel.toFixed(1)}% left`);

// 5. Search and rescue: run in low over the flare boat and drop the crate with a lead.
const rescue = createSession('rescue', 4);
const boat = rescue.mission.boat;
rescue.aircraft = createAircraft({ x: boat.x - 900, y: 60, z: boat.z, heading: 90, speedKt: 72, throttle: 0.5, flapDetent: 1, gearDown: true, fuel: 60 });
let dropped = false;
let lastMiss = Infinity;
for (let step = 0; step < 60 * 60 && !rescue.crate.landed; step += 1) {
  const a = rescue.aircraft;
  const predicted = predictCrate(rescue);
  if (!dropped && predicted && predicted.miss < 50 && predicted.miss > lastMiss) dropped = dropCrate(rescue);
  if (predicted) lastMiss = predicted.miss;
  const aim = boat.x - a.pos.x > 200 ? { x: boat.x, y: 60, z: boat.z } : { x: a.pos.x + a.vel.x * 10, y: 60, z: a.pos.z + a.vel.z * 10 };
  stepSession(rescue, flyToward(a, aim, 72), STEP);
}
check('the flare boat was found', rescue.objectives.find((o) => o.id === 'find-boat').done);
check('the crate landed by the boat', rescue.objectives.find((o) => o.id === 'drop-crate').done, `missed by ${rescue.crate.missBy} m`);

// 6. The grader and the crash causes.
const soft = judgeContact({ vsFpm: -120, kt: 58, bankDeg: 1, pitchDeg: 4, surface: 'runway', slope: 0, gearDown: true, gearHealth: 1, stall: null });
const hard = judgeContact({ vsFpm: -1300, kt: 70, bankDeg: 2, pitchDeg: 0, surface: 'runway', slope: 0, gearDown: true, gearHealth: 1, stall: null });
const stallCrash = judgeContact({ vsFpm: -1500, kt: 40, bankDeg: 20, pitchDeg: -20, surface: 'grass', slope: 0.1, gearDown: true, gearHealth: 1, stall: { kt: 42, ft: 80 } });
const wet = judgeContact({ vsFpm: -200, kt: 60, bankDeg: 0, pitchDeg: 2, surface: 'water', slope: 0, gearDown: true, gearHealth: 1, stall: null });
check('soft runway contact is a touchdown', soft.kind === 'touchdown');
check('1300 fpm is a crash', hard.kind === 'crash', hard.cause);
check('a stall crash names speed and height', stallCrash.cause === 'Stalled at 42 kt, 80 ft', stallCrash.cause);
check('water is a ditching', wet.kind === 'crash' && wet.cause.startsWith('Ditched'), wet.cause);
check('greased grade', gradeLanding({ vsFpm: -120, centreline: 1.5, onRunway: true, bounces: 0 }).grade === 'GREASED IT');
check('bounced grade', gradeLanding({ vsFpm: -500, centreline: 1.5, onRunway: true, bounces: 1 }).grade === 'BOUNCED');
check('off-field grade', gradeLanding({ vsFpm: -100, centreline: null, onRunway: false, bounces: 0 }).grade === 'OFF FIELD');

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
