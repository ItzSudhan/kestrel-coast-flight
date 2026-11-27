// The screenshot scenes behind ?shot=cover|cockpit|board|result (with &seed=N). Each one flies
// a real sortie forward from its start with the seeded sortie pilot, through the game's own
// rules, and stops at a moment worth showing: the cover banking toward ring 8 on final for 09,
// the cockpit on a stormy final, the mission board, and the landing card after a full course.
import { STEP } from './config.js';
import { createSortiePilot, flyToward } from './autopilot.js';
import { createAircraft } from './flight-physics.js';
import { createSession, say, SPEAKER_PILOT, stepSession, toggleFlaps, toggleGear } from './game-session.js';
import { AIRSTRIPS, runwayThreshold } from './places.js';

/** Steps the main loop replays frame by frame before the picture, so trails and camera lag are real. */
export const SETTLE_STEPS = 150;

function pilotFor(session) {
  return createSortiePilot(session, (name) => (name === 'gear' ? toggleGear(session) : toggleFlaps(session)));
}

function flyUntil(session, pilot, done, limitSeconds, onStep) {
  for (let i = 0; i < limitSeconds / STEP && session.state === 'flying'; i += 1) {
    if (done(session)) return;
    stepSession(session, pilot(), STEP);
    if (onStep) onStep(session, i);
  }
}

/**
 * Stage a scene. Returns { screen, session, view, pilot, settle, best }: the caller steps
 * `settle` more times with `pilot()` while drawing, then takes the picture.
 */
export function stageShot(name, seed) {
  if (name === 'board') {
    const session = createSession('rings', seed);
    return { screen: 'board', session, view: 'orbit', pilot: null, settle: 0, best: { rings: 3, mail: 2, rescue: 1 } };
  }
  if (name === 'result') {
    const session = createSession('rings', seed);
    flyUntil(session, pilotFor(session), () => false, 900);
    return { screen: 'result', session, view: 'orbit', pilot: null, settle: 0 };
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
  const session = createSession('rings', seed);
  const pilot = pilotFor(session);
  const ring8 = session.rings[7];
  const lead = 215 + SETTLE_STEPS * STEP * 42;
  flyUntil(session, pilot, (s) => s.nextRing === 7 && Math.hypot(s.aircraft.pos.x - ring8.x, s.aircraft.pos.z - ring8.z) < lead, 600, (s, i) => {
    if (i === 60 * 150) {
      s.aircraft.damage.wings = 0.84;
      s.aircraft.damage.gear = 0.9;
      say(s, SPEAKER_PILOT, 'Clipped the treetops on the north ridge!');
    }
  });
  // A bolt forks down over the stretch of the front that is in frame as the picture is taken.
  session.storm.bolt = { x: 3750, seed: 7 + seed, life: (SETTLE_STEPS + 30) * STEP };
  session.storm.nextBolt = 60;
  return { screen: 'fly', session, view: 'chase', pilot, settle: SETTLE_STEPS };
}
