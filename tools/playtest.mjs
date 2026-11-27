// Headless playtest of Kestrel Coast's rules (no browser): a seeded autopilot takes off from
// Kestrel Field, flies the eight Beacon Rings and lands runway 09, then the checks below confirm
// the flight model and the landing grader behave. Also flies a deliberate stall and a hard
// landing to check the crash causes. Run: node tools/playtest.mjs
import { STEP, KT } from '../game/src/config.js';
import { answerCrisis, createSession, dropCrate, predictCrate, stepSession, toggleFlaps, toggleGear, readouts } from '../game/src/game-session.js';
import { CHOICE_DIVERT, CHOICE_PUSH } from '../game/src/divert-decision.js';
import { MIN_RESERVE, fuelPlanLine, legPlan, planFuel } from '../game/src/fuel-planner.js';
import { GEAR_JAM_HEALTH, damageReport, handling, lightningStrike, worstDamage } from '../game/src/damage-model.js';
import { crashReport } from '../game/src/crash-report.js';
import { createCareer, fitUpgrades, rankOf, recordSortie } from '../game/src/pilot-career.js';
import { runwayWind, windAt } from '../game/src/wind-and-gusts.js';
import { AIRSTRIPS } from '../game/src/places.js';
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
  if (session.crisis?.state === 'open') answerCrisis(session, CHOICE_PUSH);
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
check('the storm crisis came up mid-course', session.crisis?.choice === CHOICE_PUSH, `${session.crisis?.state}`);
check('pushing through the squall brought a lightning strike', session.crisis?.struck && a.damage.engine < 0.9, `engine ${Math.round(a.damage.engine * 100)}%`);
check('landing home after pushing through earns the squall bonus', session.objectives.find((o) => o.id === 'squall')?.done === true);

// 4c. The fuel planner: distance, wind and burn make the plan, and a headwind costs fuel.
const kestrel = AIRSTRIPS[0];
const puffin = AIRSTRIPS[1];
const calm = legPlan(kestrel, puffin, { x: 0, z: 0 });
const intoWind = legPlan(kestrel, puffin, { x: -8, z: 0 });
check('the planner times the 7 km leg to Puffin Cay at cruise', calm.seconds > 150 && calm.seconds < 260, `${calm.seconds.toFixed(0)} s, ${calm.fuel.toFixed(1)}%`);
check('a headwind on the leg costs fuel', intoWind.fuel > calm.fuel * 1.1, `${calm.fuel.toFixed(1)}% calm, ${intoWind.fuel.toFixed(1)}% into 16 kt`);
const planner = createSession('mail', 1);
const plan = planFuel(planner.aircraft, puffin, { x: 0, z: 0 });
check('the mail run plan leaves the reserve with its 44%', plan.status === 'ok' && plan.reserve >= MIN_RESERVE, fuelPlanLine(plan));
check('the plan line reads FUEL TO · RESERVE · BINGO', /^FUEL TO PUFFIN CAY \d+% · RESERVE \d+% · BINGO IN \d+:\d\d$/.test(fuelPlanLine(plan)), fuelPlanLine(plan));
planner.aircraft.fuel = 6;
check('a near-dry tank plans short', planFuel(planner.aircraft, puffin, { x: 0, z: 0 }).status === 'short', fuelPlanLine(planFuel(planner.aircraft, puffin, { x: 0, z: 0 })));

// 4d. The divert decision: on the mail run, divert back to Kestrel and land there.
const divertRun = createSession('mail', 2);
const divertPilot = createSortiePilot(divertRun, (name) => (name === 'gear' ? toggleGear(divertRun) : toggleFlaps(divertRun)));
let divertOptions = null;
for (let step = 0; step < 60 * 600 && divertRun.state === 'flying'; step += 1) {
  if (divertRun.crisis.state === 'open') {
    divertOptions = divertRun.crisis.options;
    answerCrisis(divertRun, CHOICE_DIVERT);
  }
  stepSession(divertRun, divertPilot(), STEP);
}
check('the crisis call offers a divert with a fuel check and a push with its gusts', divertOptions && divertOptions.divert.strip.id === 'kestrel' && divertOptions.push.gustKt > 10, divertOptions ? `divert ${divertOptions.divert.km} km ${divertOptions.divert.plan.status}, push gusts ${divertOptions.push.gustKt} kt` : 'no call');
check('the diverted mail run lands at Kestrel instead', divertRun.state === 'complete' && divertRun.landing?.strip.id === 'kestrel', `${divertRun.state}, ${divertRun.landing?.strip.name}${divertRun.result?.cause ? ': ' + divertRun.result.cause : ''}`);
check('the divert rewrote the landing objective', divertRun.objectives.some((o) => o.id === 'land-kestrel' && o.text.startsWith('Divert')));

// 4e. The damage model: a torn wing rolls her, a jammed gear means a belly landing, lightning costs power.
function bankAfter(wings, side) {
  const s = createSession('storm', 3);
  s.aircraft.damage.wings = wings;
  s.aircraft.wingSide = side;
  for (let i = 0; i < 60 * 3; i += 1) stepSession(s, { pitch: 0, roll: 0, yaw: 0, throttle: 0.6 }, STEP);
  return (s.aircraft.bank * 180) / Math.PI;
}
const soundBank = bankAfter(1, 1);
const tornRight = bankAfter(0.5, 1);
const tornLeft = bankAfter(0.5, -1);
check('a torn wing rolls her toward it, hands off', Math.abs(tornRight - soundBank) > 4 && Math.sign(tornRight - soundBank) === -Math.sign(tornLeft - soundBank), `sound ${soundBank.toFixed(1)}°, right ${tornRight.toFixed(1)}°, left ${tornLeft.toFixed(1)}°`);
const jam = createSession('storm', 3);
jam.aircraft.damage.gear = GEAR_JAM_HEALTH - 0.05;
check('a jammed gear will not come down', toggleGear(jam) === false && !jam.aircraft.gearDown && handling(jam.aircraft).gearJammed);
check('the damage report names the jam', damageReport(jam.aircraft).find((l) => l.part === 'gear').effect === 'JAMMED · BELLY ONLY');
const jamPilot = createSortiePilot(jam, (name) => (name === 'gear' ? toggleGear(jam) : toggleFlaps(jam)));
for (let step = 0; step < 60 * 300 && jam.state === 'flying'; step += 1) stepSession(jam, jamPilot(), STEP);
check('with the gear jammed the landing is on her belly', jam.aircraft.belly && (jam.landing?.grade === 'BELLY LANDING' || jam.state !== 'complete'), `${jam.state}, ${jam.landing?.grade ?? jam.result?.cause}`);
const struck = createSession('storm', 3);
const thrustBefore = handling(struck.aircraft).thrustFactor;
lightningStrike(struck.aircraft);
check('a lightning strike costs engine power', handling(struck.aircraft).thrustFactor < thrustBefore - 0.1 && struck.aircraft.events.some((e) => e.type === 'lightning-strike'), worstDamage(struck.aircraft)?.text);

// 4f. Crosswind on final for the storm landing reads against runway 09.
const stormWind = createSession('storm', 1);
const cross = runwayWind(windAt(stormWind.storm, kestrel.x, 30, kestrel.z), 90);
check('the storm landing has a real crosswind on 09', cross.crossKt > 6, `${cross.crossKt.toFixed(0)} kt from the ${cross.side.toLowerCase()}`);

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
for (let step = 0; step < 60 * 60 && stallTest.state === 'flying'; step += 1) stepSession(stallTest, { pitch: 1, roll: 0.3, yaw: 0, throttle: 0 }, STEP);
const report = stallTest.report ?? crashReport(stallTest, stallTest.recorder);
check('the crash report keeps the last 10 s of path', report.path.length >= 30 && report.path[0].t >= -10.5, `${report.path.length} samples`);
check('the crash report gives a cause, a summary and a lesson', Boolean(report.cause && /KT/.test(report.summary) && report.lesson), `${report.cause} · ${report.summary}`);

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

// 7. The career: the finished ring course banks points and medals; ranks unlock upgrades.
const career = createCareer();
const award = recordSortie(career, session);
check('a finished sortie banks its points and medals', award.points === session.result.total && career.points === award.points && award.medals.includes('storm-runner'), `${award.points} pts, ${award.medals.join(', ')}`);
check('ranks climb with points', rankOf(0).name === 'CADET' && rankOf(2500).name === 'ISLAND CAPTAIN' && rankOf(99999).name === 'STORM WARDEN');
const fitted = fitUpgrades({ fuel: 44 }, [{ id: 'long-tank' }, { id: 'stout-gear' }]);
check('upgrades fit to the aircraft', fitted.fuel === 56 && fitted.armour.gear === 0.5);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
