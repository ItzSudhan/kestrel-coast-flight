// Shared numbers for Kestrel Coast: the fixed step, unit conversions, the aircraft's airframe
// figures and the world's fixed seed. Nothing here touches the browser, so the Node playtest
// reads the same numbers the game flies by.

/** The simulation's fixed step, in seconds. */
export const STEP = 1 / 60;

/** Metres per second to knots, metres to feet, metres per second to feet per minute. */
export const KT = 1.943844;
export const FT = 3.28084;
export const FPM = 196.8504;

/** Air density at sea level (kg/m³) and gravity (m/s²). */
export const RHO = 1.225;
export const GRAVITY = 9.81;

/**
 * The KC-9 "Kestrel", a high-wing bush plane: mass, wing, lift and drag curve, engine and limits.
 * Stall speed falls out of these: clean about 49 kt, full flaps about 42 kt.
 */
export const AIRFRAME = {
  mass: 1050,
  wingArea: 16.2,
  liftSlope: 5.0,
  liftZero: 0.3,
  stallAoa: 0.26,
  flapLift: 0.48,
  flapStallAoa: 0.24,
  dragZero: 0.03,
  dragInduced: 0.05,
  dragFlaps: 0.035,
  dragGear: 0.012,
  thrustMax: 4100,
  propSpeedLimit: 95,
  gearHeight: 1.55,
  bellyHeight: 0.72,
  rotateSpeed: 23,
  overspeedKt: 150,
  flapLimitKt: 100,
  gearLimitKt: 135,
  fuelIdleBurn: 0.05,
  fuelFullBurn: 0.26,
};

/** Storm front: kilometres to the coast at which it counts as closed in. */
export const STORM_CLOSED_KM = 0;

/** The world's layout seed: the island chain is designed, its noise detail comes from this. */
export const WORLD_SEED = 4127;

/** localStorage key for best stars per mission. */
export const BEST_KEY = 'kestrel-coast-best-v1';
