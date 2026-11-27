// The KC-9's airframe, part by part: engine, wings, gear and tail each run from 1 (sound) to 0.
// Damage comes from hard landings, overspeed, high g, treetops and lightning, and each part
// changes how she flies: a torn wing loses lift, drags and rolls her toward the damaged side; a
// hurt engine loses power; a weak tail slows pitch and yaw; gear below a third is jammed and
// she can only land on her belly. Pure: the flight model, HUD and playtest share it.

export const PARTS = ['engine', 'wings', 'gear', 'tail'];
export const PART_NAMES = { engine: 'ENGINE', wings: 'WINGS', gear: 'GEAR', tail: 'TAIL' };

/** Below this the gear will not move or hold: no wheels, a belly landing only. */
export const GEAR_JAM_HEALTH = 0.35;

/** A sound airframe, or one with some parts already hurt. */
export function createDamage(start = {}) {
  return { engine: 1, wings: 1, gear: 1, tail: 1, ...start };
}

/**
 * Take `amount` off a part. `side` (−1 left, +1 right) says which wing took it; upgrades in
 * `aircraft.armour` scale the hit. Emits a 'damage' event when the loss is noticeable.
 */
export function hurt(aircraft, part, amount, side = 0) {
  if (amount <= 0) return;
  const scaled = amount * (aircraft.armour?.[part] ?? 1);
  const before = aircraft.damage[part];
  aircraft.damage[part] = Math.max(0, before - scaled);
  if (part === 'wings' && side !== 0) aircraft.wingSide = side;
  if (before - aircraft.damage[part] > 0.015) aircraft.events.push({ type: 'damage', part, amount: scaled });
  if (part === 'gear' && before >= GEAR_JAM_HEALTH && aircraft.damage.gear < GEAR_JAM_HEALTH) aircraft.events.push({ type: 'gear-jammed' });
}

/** Can the gear be worked and carry her weight? */
export function gearWorks(aircraft) {
  return aircraft.damage.gear >= GEAR_JAM_HEALTH;
}

/**
 * What the damage does to handling right now: lift and drag from the wings, the roll a damaged
 * wing pulls (rad/s, signed toward the damaged side), engine power and rpm, tail authority and
 * brakes. The flight model reads these every step.
 */
export function handling(aircraft) {
  const d = aircraft.damage;
  const side = aircraft.wingSide ?? 1;
  return {
    liftFactor: 0.7 + 0.3 * d.wings,
    wingDrag: (1 - d.wings) * 0.025,
    rollPull: (1 - d.wings) * 0.22 * side,
    rollAuthority: 0.65 + 0.35 * d.wings,
    thrustFactor: (0.4 + 0.6 * d.engine) * (aircraft.tune ?? 1),
    rpmFactor: 0.55 + 0.45 * d.engine,
    tailFactor: 0.5 + 0.5 * d.tail,
    brakeFactor: 0.4 + 0.6 * d.gear,
    gearJammed: d.gear < GEAR_JAM_HEALTH,
    engineDead: d.engine <= 0.05,
  };
}

/**
 * Lightning finds the aircraft: the engine takes the hit (less with the bonded-airframe upgrade)
 * and a 'lightning-strike' event carries what is left of it.
 */
export function lightningStrike(aircraft, amount = 0.28) {
  hurt(aircraft, 'engine', amount);
  hurt(aircraft, 'tail', amount * 0.25);
  aircraft.events.push({ type: 'lightning-strike', engine: Math.round(aircraft.damage.engine * 100) });
}

/** One part's state as the pilot reads it: name, percent and what it is doing to her. */
function partLine(aircraft, part) {
  const v = aircraft.damage[part];
  const pct = Math.round(v * 100);
  const h = handling(aircraft);
  let effect = 'OK';
  if (part === 'engine' && v < 0.98) effect = h.engineDead ? 'DEAD · GLIDE' : `POWER −${Math.round((1 - h.thrustFactor) * 100)}%`;
  if (part === 'wings' && v < 0.98) effect = `ROLLS ${(aircraft.wingSide ?? 1) > 0 ? 'RIGHT' : 'LEFT'}`;
  if (part === 'gear' && v < 0.98) effect = h.gearJammed ? 'JAMMED · BELLY ONLY' : 'BRAKES WEAK';
  if (part === 'tail' && v < 0.98) effect = 'PITCH SLOW';
  const severity = v > 0.75 ? 'ok' : v > 0.4 ? 'hurt' : 'bad';
  return { part, name: PART_NAMES[part], pct, effect, severity };
}

/** Every part's line, for the damage panel and the crash report. */
export function damageReport(aircraft) {
  return PARTS.map((part) => partLine(aircraft, part));
}

/** The one line that matters most right now ("WINGS 62% · ROLLS RIGHT"), or null when sound. */
export function worstDamage(aircraft) {
  const lines = damageReport(aircraft).filter((l) => l.effect !== 'OK');
  if (!lines.length) return null;
  lines.sort((a, b) => a.pct - b.pct);
  const w = lines[0];
  return { ...w, text: `${w.name} ${w.pct}% · ${w.effect}` };
}
