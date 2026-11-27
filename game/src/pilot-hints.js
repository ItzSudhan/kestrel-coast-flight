// What the pilot should do next, read from the aircraft's state: power and rotate on the takeoff
// roll, clean up after takeoff, the stall recovery, gear and full flaps on final, brakes on the
// rollout, refuel when stopped, and fuel discipline. Pure, so the fuzz test can call it too.
import { KT } from './config.js';

export function pilotHint(session, approach) {
  const a = session.aircraft;
  const kt = a.ias * KT;
  if (session.state !== 'flying') return null;
  if (a.onGround) {
    const stopped = kt < 2;
    if (stopped && a.firstTouchdown) return 'HOLD R TO REFUEL AND REPAIR · SHIFT TO TAKE OFF AGAIN';
    if (a.firstTouchdown) return 'HOLD B TO BRAKE · Q/E TO STEER';
    if (a.throttle < 0.6) return 'HOLD SHIFT FOR FULL POWER · Q/E TO STEER';
    if (kt > 40) return 'PULL BACK (S) TO ROTATE AT 55 KT';
    return null;
  }
  if (a.stallWarning) return 'STALL WARNING · NOSE DOWN (W) · POWER UP (SHIFT)';
  if (approach?.final && approach.distance < 3500) {
    if (!a.gearDown) return 'GEAR DOWN (G) FOR LANDING';
    if (a.flapDetent < 2) return 'FULL FLAPS (F) · 60–65 KT OVER THE FENCE';
    return null;
  }
  if (a.gearDown && a.agl > 120 && kt > 85) return 'CLEAN UP: GEAR UP (G) · FLAPS UP (F)';
  if (a.fuel < 15 && a.engineRunning) return 'FUEL LOW · EASE THE THROTTLE · LAND AND HOLD R';
  return null;
}
