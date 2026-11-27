// The pilot's career across sorties: points banked from every finished sortie raise the rank
// (CADET to STORM WARDEN), medals are pinned for feats (a greased landing, a crate on the boat,
// pushing through the squall), and each rank unlocks an upgrade fitted to the KC-9 for every
// sortie after: a long-range tank, stout gear, a bonded airframe, a tuned engine. Pure: the
// caller saves and loads the career (main.js keeps it in localStorage).
import { GRADE_GREASED } from './landing-grader.js';
import { CHOICE_DIVERT, CHOICE_PUSH } from './divert-decision.js';

export const RANKS = [
  { name: 'CADET', at: 0 },
  { name: 'LINE PILOT', at: 900 },
  { name: 'ISLAND CAPTAIN', at: 2400 },
  { name: 'COAST ACE', at: 4600 },
  { name: 'STORM WARDEN', at: 7500 },
];

export const MEDALS = [
  { id: 'greaser', name: 'GREASER', text: 'Greased a landing', colour: '#5dff8a' },
  { id: 'ring-master', name: 'RING MASTER', text: 'All eight rings, under par', colour: '#ffb347' },
  { id: 'lifeline', name: 'LIFELINE', text: 'Crate within 30 m of the skiff', colour: '#ff6a5a' },
  { id: 'fuel-miser', name: 'FUEL MISER', text: 'Mail landed with 15% left', colour: '#6fd3ff' },
  { id: 'storm-runner', name: 'STORM RUNNER', text: 'Pushed through the squall and landed', colour: '#b48cff' },
  { id: 'safe-call', name: 'SAFE CALL', text: 'Diverted and landed safe', colour: '#9fe8ff' },
  { id: 'iron-bird', name: 'IRON BIRD', text: 'Landed with a part under half', colour: '#e0e0e0' },
  { id: 'crosswind', name: 'SIDESTEP', text: 'On the centreline in 10 kt crosswind', colour: '#ffe36a' },
];

/** One upgrade per rank above CADET, fitted from the next sortie on. */
export const UPGRADES = [
  { id: 'long-tank', name: 'LONG-RANGE TANK', text: '+12% fuel at start', rank: 1 },
  { id: 'stout-gear', name: 'STOUT GEAR', text: 'Gear takes half the damage', rank: 2 },
  { id: 'bonded-frame', name: 'BONDED AIRFRAME', text: 'Lightning and engine harm halved', rank: 3 },
  { id: 'tuned-engine', name: 'TUNED ENGINE', text: '+8% thrust', rank: 4 },
];

export function createCareer(saved = null) {
  const base = { points: 0, sorties: 0, medals: {}, log: [] };
  if (!saved || typeof saved !== 'object') return base;
  return { ...base, ...saved, medals: { ...(saved.medals ?? {}) }, log: Array.isArray(saved.log) ? saved.log.slice(-8) : [] };
}

/** The rank for a points total, the next one and how far along to it (0..1). */
export function rankOf(points) {
  let index = 0;
  for (let i = 0; i < RANKS.length; i += 1) if (points >= RANKS[i].at) index = i;
  const next = RANKS[index + 1] ?? null;
  const progress = next ? (points - RANKS[index].at) / (next.at - RANKS[index].at) : 1;
  return { index, name: RANKS[index].name, next, progress, toNext: next ? next.at - points : 0 };
}

/** The upgrades the career has unlocked. */
export function careerUpgrades(career) {
  const rank = rankOf(career.points).index;
  return UPGRADES.filter((u) => u.rank <= rank);
}

/** Fit the unlocked upgrades to a mission's start: fuel, armour and engine tune. */
export function fitUpgrades(start, upgrades) {
  const ids = new Set(upgrades.map((u) => u.id));
  const fitted = { ...start };
  if (ids.has('long-tank')) fitted.fuel = Math.min(100, (start.fuel ?? 100) + 12);
  const armour = {};
  if (ids.has('stout-gear')) armour.gear = 0.5;
  if (ids.has('bonded-frame')) armour.engine = 0.5;
  if (Object.keys(armour).length) fitted.armour = armour;
  if (ids.has('tuned-engine')) fitted.tune = 1.08;
  return fitted;
}

/** Which medals a finished sortie earns. */
export function medalsFor(session) {
  if (session.state !== 'complete' || !session.landing) return [];
  const earned = [];
  const l = session.landing;
  const a = session.aircraft;
  if (l.grade === GRADE_GREASED) earned.push('greaser');
  if (session.rings.length && session.nextRing === session.rings.length && session.time <= session.mission.par) earned.push('ring-master');
  if (session.crate?.missBy !== null && session.crate?.missBy !== undefined && session.crate.missBy <= 30) earned.push('lifeline');
  if (session.mission.id === 'mail' && a.fuel >= 15) earned.push('fuel-miser');
  if (session.crisis?.choice === CHOICE_PUSH) earned.push('storm-runner');
  if (session.crisis?.choice === CHOICE_DIVERT) earned.push('safe-call');
  if (Object.values(a.damage).some((v) => v < 0.5)) earned.push('iron-bird');
  if ((l.crossKt ?? 0) >= 10 && l.centreline !== null && Math.abs(l.centreline) < 5) earned.push('crosswind');
  return earned;
}

/**
 * Bank a finished sortie into the career. Returns what changed: points, the medals pinned,
 * the rank before and after, and any upgrade the new rank unlocks.
 */
export function recordSortie(career, session) {
  const before = rankOf(career.points);
  const points = session.state === 'complete' && session.result ? session.result.total : 0;
  const medals = medalsFor(session);
  career.points += points;
  career.sorties += 1;
  for (const id of medals) career.medals[id] = (career.medals[id] ?? 0) + 1;
  career.log = [...career.log, { mission: session.mission.id, points, grade: session.landing?.grade ?? null }].slice(-8);
  const after = rankOf(career.points);
  const unlocked = UPGRADES.filter((u) => u.rank > before.index && u.rank <= after.index);
  return { points, medals, before, after, rankUp: after.index > before.index, unlocked };
}
