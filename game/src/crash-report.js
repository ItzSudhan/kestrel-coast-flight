// The flight recorder and the crash report. Four times a second the recorder keeps the
// aircraft's position, height, speed and bank, holding the last ten seconds. When a sortie ends
// in a crash (or stranded, or shut out by the storm) the report reads that tape: the cause
// line, what the last ten seconds did ("61 → 42 KT · LOST 340 FT · BANK 38°"), the lesson, and
// the path itself for the result card to replay. Pure: runs in Node.
import { FT, KT } from './config.js';

export const REPLAY_SECONDS = 10;
const SAMPLE_SECONDS = 0.25;

export function createFlightRecorder() {
  return { samples: [], nextAt: 0 };
}

/** Keep a sample of the aircraft every quarter second, dropping anything older than ten seconds. */
export function recordFlight(recorder, aircraft, time, force = false) {
  if (!force && time < recorder.nextAt) return;
  recorder.nextAt = time + SAMPLE_SECONDS;
  recorder.samples.push({ t: time, x: aircraft.pos.x, y: aircraft.pos.y, z: aircraft.pos.z, agl: Math.max(0, aircraft.agl), kt: aircraft.ias * KT, bank: (aircraft.bank * 180) / Math.PI, stalled: aircraft.stalled });
  while (recorder.samples.length && recorder.samples[0].t < time - REPLAY_SECONDS) recorder.samples.shift();
}

/** What kind of end the cause line describes, for the lesson. */
export function causeKind(cause = '') {
  const c = cause.toLowerCase();
  if (c.includes('stall')) return 'stall';
  if (c.includes('slammed') || c.includes('gear up')) return 'sink';
  if (c.includes('tree')) return 'trees';
  if (c.includes('sea') || c.includes('ditched')) return 'sea';
  if (c.includes('hillside') || c.includes('rocks')) return 'terrain';
  if (c.includes('wingtip')) return 'bank';
  if (c.includes('nosed')) return 'nose';
  if (c.includes('storm')) return 'storm';
  if (c.includes('belly') || c.includes('dead engine')) return 'stranded';
  return 'other';
}

const LESSONS = {
  stall: 'Lower the nose at the buzzer and add power before you turn.',
  sink: 'Ease the descent to under 300 fpm before the flare.',
  trees: 'Hold 300 ft over the ridges; the trees stand 20 m tall.',
  sea: 'Keep the strip made: the fuel plan says when to turn.',
  terrain: 'Climb before the ridge: the altimeter reads sea level, not ground.',
  bank: 'Roll wings level before the wheels touch.',
  nose: 'Flare: raise the nose a touch as the runway fills the screen.',
  storm: 'Watch the storm clock, and divert when the front cuts the route.',
  stranded: 'Glide for the nearest strip while you still have height.',
  other: 'Fly the numbers: 60–65 kt, gear down, full flaps on final.',
};

/**
 * Read the tape after the sortie ends: the cause, the last ten seconds in numbers, the lesson
 * and the path (oldest first) with its height in feet.
 */
export function crashReport(session, recorder) {
  const samples = recorder.samples;
  const cause = session.result?.cause ?? 'Sortie over';
  const kind = causeKind(cause);
  if (!samples.length) return { cause, kind, summary: '', lesson: LESSONS[kind], path: [] };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const lostFt = Math.round(((first.y - last.y) * FT) / 10) * 10;
  const maxBank = Math.round(Math.max(...samples.map((s) => Math.abs(s.bank))));
  const parts = [`${Math.round(first.kt)} → ${Math.round(last.kt)} KT`, lostFt >= 0 ? `LOST ${lostFt} FT` : `CLIMBED ${-lostFt} FT`];
  if (maxBank > 25) parts.push(`BANK ${maxBank}°`);
  if (samples.some((s) => s.stalled)) parts.push('STALLED');
  return {
    cause,
    kind,
    summary: parts.join(' · '),
    lesson: LESSONS[kind],
    path: samples.map((s) => ({ t: s.t - last.t, x: s.x, z: s.z, ft: s.agl * FT, kt: s.kt, stalled: s.stalled })),
  };
}
