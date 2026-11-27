// The screenshot scenes behind ?shot=cover|cockpit|divert|career|board|rescue (with &seed=N).
// Each one flies a real sortie forward from its start with the seeded sortie pilot, through the
// game's own rules, and stops at a moment worth showing: the cover on final through ring 8 after
// pushing through the squall, as lightning strikes the engine; the cockpit on a rainy crosswind
// final; the divert call on the mail run, the wing torn in the trees; and the Beacon Rings
// landing card with the pilot's career ranking up. main.js steps the last `settle` steps
// through its own event handling, so the callouts on screen are the ones the game raises.
import { STEP } from './config.js';
import { createSortiePilot, flyToward } from './autopilot.js';
import { createAircraft } from './flight-physics.js';
import { answerCrisis, createSession, say, SPEAKER_PILOT, stepSession, toggleFlaps, toggleGear } from './game-session.js';
import { CHOICE_PUSH } from './divert-decision.js';
import { hurt } from './damage-model.js';
import { AIRSTRIPS, runwayThreshold } from './places.js';
import { STORM_BEARING, STORM_NORMAL, STORM_ORIGIN, stormWallOffset } from './storm-front.js';

/** Steps the main loop replays frame by frame before the picture, so trails and camera lag are real. */
export const SETTLE_STEPS = 150;

function pilotFor(session) {
  return createSortiePilot(session, (name) => (name === 'gear' ? toggleGear(session) : toggleFlaps(session)));
}

function flyUntil(session, pilot, done, limitSeconds, onStep) {
  for (let i = 0; i < limitSeconds / STEP && session.state === 'flying'; i += 1) {
    if (done(session)) return;
    if (onStep) onStep(session, i);
    stepSession(session, pilot(), STEP);
  }
}

/**
 * Fork a long-lived bolt down the storm's rain wall where it shows from the aircraft: the point
 * along the wall (in the wall's own frame, as storm-visuals.js places it) that lies `offsetDeg`
 * off the aircraft's heading, left negative.
 */
function boltInView(session, offsetDeg, life) {
  const a = session.aircraft;
  const storm = session.storm;
  const offset = stormWallOffset(storm.km);
  const cx = STORM_ORIGIN.x + STORM_NORMAL.x * offset;
  const cz = STORM_ORIGIN.z + STORM_NORMAL.z * offset;
  const turn = (-STORM_BEARING * Math.PI) / 180;
  const along = { x: Math.cos(turn), z: -Math.sin(turn) };
  const back = { x: Math.sin(turn), z: Math.cos(turn) };
  const want = a.heading + (offsetDeg * Math.PI) / 180;
  let best = 0;
  let bestErr = Infinity;
  for (let s = -12000; s <= 12000; s += 100) {
    const x = cx + along.x * s + back.x * -300;
    const z = cz + along.z * s + back.z * -300;
    const bearing = Math.atan2(x - a.pos.x, -(z - a.pos.z));
    const err = Math.abs(((bearing - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (err < bestErr) {
      bestErr = err;
      best = s;
    }
  }
  storm.bolt = { x: best, seed: 7 + session.seed, life };
  storm.nextBolt = 60;
}

/** The career the result scene starts from: a line pilot a few sorties in, close to the next rank. */
const SHOT_CAREER = { points: 1460, sorties: 6, medals: { greaser: 2, 'fuel-miser': 1 }, log: [] };

/**
 * Stage a scene. Returns { screen, session, view, pilot, settle, best, answer, award, career }:
 * the caller steps `settle` more times with `pilot()` while drawing, then takes the picture.
 */
export function stageShot(name, seed) {
  if (name === 'board') {
    const session = createSession('rings', seed);
    return { screen: 'board', session, view: 'orbit', pilot: null, settle: 0, best: { rings: 3, mail: 2, rescue: 1 }, career: { ...SHOT_CAREER, points: 3570 } };
  }
  if (name === 'career' || name === 'result') {
    // The whole ring course, pushing through the squall, to the landing card; the career banks it.
    const session = createSession('rings', seed);
    const pilot = pilotFor(session);
    flyUntil(session, pilot, () => false, 900, (s) => {
      if (s.crisis?.state === 'open') answerCrisis(s, CHOICE_PUSH);
    });
    return { screen: 'result', session, view: 'orbit', pilot: null, settle: 0, award: true, career: SHOT_CAREER };
  }
  if (name === 'crash') {
    // The storm landing, hauled into a stall on a low, slow final: the crash report and its replay.
    const session = createSession('storm', seed);
    const pilot = pilotFor(session);
    const t = runwayThreshold(AIRSTRIPS[0], false);
    flyUntil(session, pilot, (s) => Math.hypot(s.aircraft.pos.x - t.x, s.aircraft.pos.z - t.z) < 2600, 240);
    flyUntil(session, () => ({ pitch: 1, roll: 0.35, yaw: 0, throttle: 0 }), () => false, 60);
    return { screen: 'result', session, view: 'orbit', pilot: null, settle: 0, award: true, career: SHOT_CAREER };
  }
  if (name === 'rescue') {
    const session = createSession('rescue', seed);
    const boat = session.mission.boat;
    session.aircraft = createAircraft({ x: boat.x - 1500, y: 75, z: boat.z + 260, heading: 80, speedKt: 74, throttle: 0.5, flapDetent: 1, gearDown: true, fuel: 52 });
    const target = { x: boat.x, y: 70, z: boat.z };
    const pilot = () => flyToward(session.aircraft, target, 74);
    flyUntil(session, pilot, (s) => Math.hypot(s.aircraft.pos.x - boat.x, s.aircraft.pos.z - boat.z) < 480 + SETTLE_STEPS * STEP * 38, 60);
    return { screen: 'fly', session, view: 'chase', pilot, settle: SETTLE_STEPS };
  }
  if (name === 'cockpit') {
    const session = createSession('storm', seed);
    const pilot = pilotFor(session);
    const t = runwayThreshold(AIRSTRIPS[0], false);
    const lead = 480 + SETTLE_STEPS * STEP * 32;
    flyUntil(session, pilot, (s) => Math.abs(s.aircraft.pos.z - t.z) < 40 && Math.hypot(s.aircraft.pos.x - t.x, s.aircraft.pos.z - t.z) < lead, 240);
    return { screen: 'fly', session, view: 'cockpit', pilot, settle: SETTLE_STEPS };
  }
  if (name === 'divert') {
    // The mail run: a wing torn on the treetops crossing the island, then the front cuts the route.
    const session = createSession('mail', seed);
    const pilot = pilotFor(session);
    flyUntil(session, pilot, (s) => s.crisis.state === 'open', 400, (s, i) => {
      if (i === 60 * 40) {
        hurt(s.aircraft, 'wings', 0.36, -1);
        hurt(s.aircraft, 'gear', 0.22);
        say(s, SPEAKER_PILOT, 'Clipped the pines on the ridge! Left wing’s torn.');
      }
    });
    boltInView(session, -34, (SETTLE_STEPS + 30) * STEP);
    return { screen: 'fly', session, view: 'chase', pilot, settle: SETTLE_STEPS };
  }
  // The cover: Beacon Rings on final through ring 8, having pushed through the squall.
  const session = createSession('rings', seed);
  const pilot = pilotFor(session);
  const ring8 = session.rings[7];
  const lead = 215 + SETTLE_STEPS * STEP * 42;
  flyUntil(session, pilot, (s) => s.nextRing === 7 && Math.hypot(s.aircraft.pos.x - ring8.x, s.aircraft.pos.z - ring8.z) < lead, 600, (s, i) => {
    if (i === 60 * 150) {
      hurt(s.aircraft, 'wings', 0.16, 1);
      hurt(s.aircraft, 'gear', 0.1);
      say(s, SPEAKER_PILOT, 'Clipped the treetops on the north ridge!');
    }
    if (s.crisis?.state === 'open') {
      answerCrisis(s, CHOICE_PUSH);
      s.crisis.strikeAt = Infinity;
    }
  });
  // The squall's strike comes in the last moments before the picture, as a bolt forks down
  // over the stretch of the front that is in frame.
  session.crisis.strikeAt = session.time + (SETTLE_STEPS - 12) * STEP;
  boltInView(session, -40, (SETTLE_STEPS + 30) * STEP);
  return { screen: 'fly', session, view: 'chase', pilot, settle: SETTLE_STEPS };
}
