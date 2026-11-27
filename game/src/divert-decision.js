// The crisis call: partway through a sortie the storm front cuts across the route, and Kestrel
// Radio asks the pilot to choose. 1 DIVERT to the other strip (the fuel planner says whether
// the tanks reach it) and fly on in steadier air, or 2 PUSH THROUGH to the planned strip in the
// squall for a +500 bonus, with heavier gusts and the chance of a lightning strike. No answer
// in 20 seconds counts as pressing on. Pure: the session steps it.
import { AIRSTRIPS } from './places.js';
import { planFuel } from './fuel-planner.js';
import { SQUALL_GUST_KT } from './wind-and-gusts.js';
import { lightningStrike } from './damage-model.js';
import { boltAt, stormGrip } from './storm-front.js';

export const CHOICE_DIVERT = 1;
export const CHOICE_PUSH = 2;
/** Seconds the pilot has to answer. */
export const DECISION_SECONDS = 20;
/** Points for landing at the planned strip after pushing through. */
export const PUSH_BONUS = 500;

/** The crisis waiting in a mission (or null when the mission has none). */
export function createCrisis(mission) {
  return mission.crisis ? { atKm: mission.crisis.atKm, state: 'waiting', options: null, openedAt: 0, choice: null, strikeAt: null, struck: false } : null;
}

function stripById(id) {
  return AIRSTRIPS.find((s) => s.id === id) ?? AIRSTRIPS[0];
}

/** The peak gust (kt) the squall would bring at a strip, for the option's warning. */
export function squallGustKt(storm, strip) {
  const grip = stormGrip(storm, strip.x, strip.z);
  const closeness = 1 - storm.km / Math.max(storm.startKm, 1);
  const mean = storm.windKt + closeness * 5 + grip * 10 + 2;
  return Math.round(mean + storm.gustKt + grip * 6 + SQUALL_GUST_KT);
}

/** Lay out the two choices from where the aircraft is now. */
export function crisisOptions(session) {
  const a = session.aircraft;
  const planned = stripById(session.destination);
  const other = AIRSTRIPS.find((s) => s.id !== planned.id);
  const divertPlan = planFuel(a, other, session.lastWind);
  const pushPlan = planFuel(a, planned, session.lastWind);
  return {
    divert: { strip: other, plan: divertPlan, fuelOk: divertPlan.status === 'ok', km: (divertPlan.distance / 1000).toFixed(1) },
    push: { strip: planned, plan: pushPlan, fuelOk: pushPlan.status === 'ok', km: (pushPlan.distance / 1000).toFixed(1), gustKt: squallGustKt(session.storm, planned), bonus: PUSH_BONUS },
  };
}

/** Is it time to put the call to the pilot? Airborne, the front at its mark, still well short of the strip. */
export function crisisDue(session) {
  const crisis = session.crisis;
  const a = session.aircraft;
  if (!crisis || crisis.state !== 'waiting' || a.onGround || a.agl < 30) return false;
  if (session.storm.km > crisis.atKm) return false;
  const strip = stripById(session.destination);
  return Math.hypot(strip.x - a.pos.x, strip.z - a.pos.z) > 1800;
}

/** Open the call: the options, a radio line and a 'crisis' event. */
export function openCrisis(session, say) {
  const crisis = session.crisis;
  crisis.options = crisisOptions(session);
  crisis.state = 'open';
  crisis.openedAt = session.time;
  const d = crisis.options.divert;
  say('radio', `Kestrel Radio: Kestrel One, the front's cut across your route. ${d.strip.name} is clear${d.fuelOk ? ' and you have the fuel' : ', but your fuel is tight'}. Your call.`);
  session.events.push({ type: 'crisis' });
}

/**
 * The pilot's answer. Divert re-plans the sortie to the other strip; push through raises the
 * squall (heavier gusts, turbulence and a likely strike) and adds the bonus objective.
 */
export function chooseCrisis(session, choice, say) {
  const crisis = session.crisis;
  if (!crisis || crisis.state !== 'open') return false;
  crisis.choice = choice;
  crisis.state = 'decided';
  if (choice === CHOICE_DIVERT) {
    const alt = crisis.options.divert.strip;
    const oldFinish = session.finish;
    session.destination = alt.id;
    session.finish = `land-${alt.id}`;
    const objective = session.objectives.find((o) => o.id === oldFinish);
    if (objective) Object.assign(objective, { id: session.finish, text: `Divert: land ${alt.name}`, reward: Math.max(150, objective.reward - 100) });
    say('pilot', `Diverting to ${alt.name}. Not today, storm.`);
    say('radio', `Kestrel Radio: Copy, divert ${alt.name}. Fly safe, Kestrel One.`);
  } else {
    session.squall = true;
    session.objectives.push({ id: 'squall', text: 'Push through the squall', reward: PUSH_BONUS, done: false });
    crisis.strikeAt = session.time + 8 + session.random() * 14;
    say('pilot', 'Pushing through. Hold the kettle for me, Maren.');
    say('radio', `Kestrel Radio: Gusts to ${crisis.options.push.gustKt} in there. Keep your speed up.`);
  }
  session.events.push({ type: 'crisis-choice', choice });
  return true;
}

/** Step the crisis: open it when due, answer for a silent pilot, and let the squall strike. */
export function stepCrisis(session, say) {
  const crisis = session.crisis;
  if (!crisis) return;
  if (crisisDue(session)) openCrisis(session, say);
  if (crisis.state === 'open' && session.time - crisis.openedAt > DECISION_SECONDS) {
    say('radio', 'Kestrel Radio: No answer — I take it you’re pressing on.');
    chooseCrisis(session, CHOICE_PUSH, say);
  }
  const a = session.aircraft;
  if (session.squall && !crisis.struck && crisis.strikeAt !== null && session.time >= crisis.strikeAt && !a.onGround && !a.crashed) {
    crisis.struck = true;
    session.struckAt = session.time;
    lightningStrike(a);
    boltAt(session.storm, a.pos.x, 0.6);
  }
}

/** Seconds left to answer an open call. */
export function crisisTimeLeft(session) {
  const crisis = session.crisis;
  return crisis && crisis.state === 'open' ? Math.max(0, DECISION_SECONDS - (session.time - crisis.openedAt)) : 0;
}
