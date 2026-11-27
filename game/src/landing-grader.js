// What happens when the wheels (or anything else) meet the ground: a crash with its cause line,
// a bounce, a belly slide or a touchdown; and, once the aircraft has stopped, the landing's grade
// stamp (GREASED IT, FIRM, BOUNCED, OFF FIELD, BELLY) with its points and stars.

export const GRADE_GREASED = 'GREASED IT';
export const GRADE_FIRM = 'FIRM';
export const GRADE_BOUNCED = 'BOUNCED';
export const GRADE_OFF_FIELD = 'OFF FIELD';
export const GRADE_BELLY = 'BELLY LANDING';

const CRASH_SINK_FPM = -950;
const BOUNCE_SINK_FPM = -450;
const FIRM_SINK_FPM = -230;

/**
 * Judge first contact. `contact` holds vsFpm, kt, bankDeg, pitchDeg, surface, slope, gearDown,
 * gearHealth and stall (the last stall's {kt, ft} if the aircraft was stalled coming down).
 * Returns { kind: 'crash', cause } or { kind: 'bounce' | 'touchdown' | 'belly', gearDamage }.
 */
export function judgeContact(contact) {
  const { vsFpm, kt, bankDeg, pitchDeg, surface, slope, gearDown, gearHealth, stall } = contact;
  const sink = Math.round(-vsFpm);
  if (stall && vsFpm < BOUNCE_SINK_FPM) return { kind: 'crash', cause: `Stalled at ${stall.kt} kt, ${stall.ft} ft` };
  if (surface === 'water') return { kind: 'crash', cause: `Ditched in the sea at ${Math.round(kt)} kt` };
  if (surface === 'forest') return { kind: 'crash', cause: `Flew into the trees at ${Math.round(kt)} kt` };
  if (surface === 'rock' || slope > 0.32) return { kind: 'crash', cause: `Hit the hillside at ${Math.round(kt)} kt` };
  if (vsFpm < CRASH_SINK_FPM) return { kind: 'crash', cause: `Slammed in at ${sink} fpm` };
  if (Math.abs(bankDeg) > 16) return { kind: 'crash', cause: `Wingtip struck at ${Math.round(Math.abs(bankDeg))}° bank` };
  if (pitchDeg < -7) return { kind: 'crash', cause: `Nosed in at ${Math.round(-pitchDeg)}° nose-down` };
  if (!gearDown || gearHealth < 0.2) {
    if (vsFpm < -520) return { kind: 'crash', cause: `Gear up, hit at ${sink} fpm` };
    return { kind: 'belly', gearDamage: 1 };
  }
  if (vsFpm < BOUNCE_SINK_FPM) return { kind: 'bounce', gearDamage: 0.22 + ((BOUNCE_SINK_FPM - vsFpm) / 500) * 0.3 };
  if (vsFpm < FIRM_SINK_FPM) return { kind: 'touchdown', gearDamage: 0.04 };
  return { kind: 'touchdown', gearDamage: 0 };
}

/**
 * Grade a finished landing from its first touchdown and what followed. `landing` holds
 * vsFpm, kt, centreline (metres off), onRunway, runwayName, bounces, belly and rollout (metres).
 * Returns the stamp, its colour key, the points it earns and 0..3 stars.
 */
export function gradeLanding(landing) {
  const offset = Math.abs(landing.centreline ?? 99);
  let grade;
  let points;
  if (landing.belly) {
    grade = GRADE_BELLY;
    points = 40;
  } else if (!landing.onRunway) {
    grade = GRADE_OFF_FIELD;
    points = 80;
  } else if (landing.bounces > 0) {
    grade = GRADE_BOUNCED;
    points = 150;
  } else if (landing.vsFpm > -200 && offset < 6) {
    grade = GRADE_GREASED;
    points = 420;
  } else {
    grade = GRADE_FIRM;
    points = 260;
  }
  if (landing.onRunway) points += Math.round(Math.max(0, 8 - offset) * 10);
  const stars = grade === GRADE_GREASED ? 3 : grade === GRADE_FIRM ? 2 : grade === GRADE_BOUNCED ? 1 : 0;
  const tone = stars >= 3 ? 'good' : stars === 2 ? 'fair' : 'poor';
  return { grade, points, stars, tone, offset };
}
