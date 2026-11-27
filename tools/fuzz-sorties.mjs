// Fuzzes the sortie rules headlessly: for every mission and many seeds, a random but sticky
// pilot mashes the stick, throttle, flaps, gear, brakes, refuel and crate keys for up to eight
// simulated minutes. Fails if anything throws, if any state goes NaN, or if a sortie ends
// without a result. Run: node tools/fuzz-sorties.mjs [seeds]
import { STEP } from '../game/src/config.js';
import { approachInfo, createSession, dropCrate, predictCrate, readouts, stepSession, toggleFlaps, toggleGear } from '../game/src/game-session.js';
import { MISSIONS, clientState } from '../game/src/missions.js';
import { fuelPlanLine } from '../game/src/fuel-planner.js';
import { damageReport } from '../game/src/damage-model.js';
import { answerCrisis } from '../game/src/game-session.js';
import { createRandom } from '../game/src/random.js';
import { pilotHint } from '../game/src/pilot-hints.js';

const seeds = Number(process.argv[2] ?? 12);
let failures = 0;
const endings = {};

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

for (const mission of MISSIONS) {
  for (let seed = 1; seed <= seeds; seed += 1) {
    const random = createRandom(seed * 131 + mission.number);
    const session = createSession(mission.id, seed);
    const controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7, brakes: false, refuel: false };
    try {
      for (let step = 0; step < 60 * 480 && session.state === 'flying'; step += 1) {
        if (step % 30 === 0) {
          controls.pitch = (random() - 0.45) * 1.6;
          controls.roll = (random() - 0.5) * 1.6;
          controls.yaw = (random() - 0.5);
          controls.throttle = Math.min(1, Math.max(0, controls.throttle + (random() - 0.45) * 0.4));
          controls.brakes = random() < 0.1;
          controls.refuel = random() < 0.05;
          if (random() < 0.05) toggleFlaps(session);
          if (random() < 0.04) toggleGear(session);
          if (random() < 0.03) dropCrate(session);
        }
        stepSession(session, controls, STEP);
        const a = session.aircraft;
        if (step % 60 === 0) {
          const r = readouts(session);
          approachInfo(session);
          predictCrate(session);
          pilotHint(session, approachInfo(session));
          clientState(session);
          damageReport(a);
          if (!session.fuelPlan || !fuelPlanLine(session.fuelPlan)) throw new Error('no fuel plan');
          if (session.crisis?.state === 'open' && random() < 0.3) answerCrisis(session, random() < 0.5 ? 1 : 2);
          const values = [a.pos.x, a.pos.y, a.pos.z, a.vel.x, a.vel.y, a.vel.z, ...a.q, a.fuel, r.kt, r.altFt, r.headingDeg, session.storm.km];
          if (!values.every(finite)) throw new Error(`non-finite state at step ${step}: ${values.join(',')}`);
        }
      }
      if (session.state !== 'flying' && !session.result) throw new Error(`ended ${session.state} without a result`);
      const key = session.state === 'crashed' ? `crashed: ${session.result.cause.replace(/[0-9,]+/g, '#')}` : session.state;
      endings[key] = (endings[key] ?? 0) + 1;
    } catch (error) {
      failures += 1;
      console.log(`FAIL ${mission.id} seed ${seed}: ${error.message}`);
    }
  }
}
for (const [key, count] of Object.entries(endings).sort((a, b) => b[1] - a[1])) console.log(`  ${count} × ${key}`);
console.log(failures === 0 ? `fuzzed ${MISSIONS.length * seeds} sorties: no errors` : `${failures} sortie(s) failed`);
process.exit(failures === 0 ? 0 : 1);
