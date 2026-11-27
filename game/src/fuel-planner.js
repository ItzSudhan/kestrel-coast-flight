// The fuel plan a bush pilot keeps in their head, worked out every moment: how much fuel it takes
// to reach a strip from here at cruise power (distance plus a circuit, against the headwind
// along the track), what that leaves in the tanks as reserve, and the bingo time: how long you
// can keep burning at the present throttle before you must turn for that strip to land with
// the minimum reserve. "FUEL TO KESTREL 14% · RESERVE 9% · BINGO IN 3:10". Pure: runs in Node.
import { AIRFRAME, KT } from './config.js';

/** The plan assumes a cruise at this throttle and true airspeed. */
export const PLAN_THROTTLE = 0.55;
export const PLAN_TAS_KT = 92;
/** Land with at least this much (percent of tank) left. */
export const MIN_RESERVE = 8;
/** Metres added to every leg for joining the circuit and flying the approach. */
export const CIRCUIT_M = 1500;

/** Fuel burn in percent of tank per second at a throttle setting. */
export function burnRate(throttle) {
  return AIRFRAME.fuelIdleBurn + AIRFRAME.fuelFullBurn * throttle * throttle;
}

/**
 * One leg from a point to a strip at cruise: its length, the headwind along the track (kt, a
 * tailwind is negative), the ground speed, the time and the fuel it burns.
 */
export function legPlan(from, strip, wind) {
  const dx = strip.x - from.x;
  const dz = strip.z - from.z;
  const straight = Math.hypot(dx, dz);
  const distance = straight + CIRCUIT_M;
  const ux = straight > 1 ? dx / straight : 0;
  const uz = straight > 1 ? dz / straight : 0;
  const headKt = -(wind.x * ux + wind.z * uz) * KT;
  const gsKt = Math.max(35, PLAN_TAS_KT - headKt);
  const seconds = distance / (gsKt / KT);
  return { distance, headKt, gsKt, seconds, fuel: seconds * burnRate(PLAN_THROTTLE) };
}

/**
 * The plan to a strip from where the aircraft is now. `status` is 'ok' (lands with the
 * minimum reserve), 'tight' (lands with less) or 'short' (runs dry first).
 */
export function planFuel(aircraft, strip, wind) {
  const leg = legPlan(aircraft.pos, strip, wind);
  const reserve = aircraft.fuel - leg.fuel;
  const burnNow = aircraft.engineRunning ? burnRate(aircraft.throttle) : 0;
  const spare = reserve - MIN_RESERVE;
  const bingoSeconds = spare > 0 && burnNow > 0 ? spare / burnNow : 0;
  const status = reserve >= MIN_RESERVE ? 'ok' : reserve >= 0 ? 'tight' : 'short';
  return { strip, name: strip.short ?? strip.name.toUpperCase(), ...leg, reserve, bingoSeconds, status };
}

function minutes(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The plan as the HUD prints it. */
export function fuelPlanLine(plan) {
  const head = `FUEL TO ${plan.name} ${Math.max(1, Math.round(plan.fuel))}%`;
  if (plan.status === 'short') return `${head} · ${Math.round(plan.reserve)}% SHORT · LAND NOW`;
  const bingo = plan.bingoSeconds >= 1 ? `BINGO IN ${minutes(plan.bingoSeconds)}` : 'BINGO · TURN NOW';
  return `${head} · RESERVE ${Math.max(0, Math.round(plan.reserve))}% · ${bingo}`;
}
