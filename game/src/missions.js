// The mission board: four sorties of the Kestrel Coast lighthouse relief, each with its own goal,
// the islander it is for and why, opening radio calls, start, fuel load, storm distance, the
// storm mark where the divert call comes, and objectives worth points. Also the scoring: objectives,
// landing, fuel left and time against par make the score and the stars.
import { AIRSTRIPS, FLARE_BOAT, runwayThreshold } from './places.js';
import { RING_COURSE } from './rings-course.js';

const kestrel = AIRSTRIPS[0];
const kestrel09 = runwayThreshold(kestrel, false);
const kestrel27 = runwayThreshold(kestrel, true);

export const MISSIONS = [
  {
    id: 'rings',
    number: 1,
    title: 'Beacon Rings',
    kind: 'Ring course',
    blurb: 'Light the eight beacon rings round the island and land runway 09 before the storm.',
    client: { who: 'keeper', why: 'The herring boats steer home by these beacons tonight.' },
    thanks: 'Every beacon burning. The herring boats will find their way home tonight. Thank you, pilot.',
    worry: 'The beacons are dark and the boats are still out there. Try again, while there is light.',
    strikeReply: 'Gannet Light: I saw that bolt take you! Hold her steady — the boats are counting on you.',
    opening: [
      ['keeper', 'Gannet Light: Fly every beacon for me. The herring boats steer home by them tonight.'],
      ['radio', 'Kestrel Radio: Rings are lit, storm is twelve out. Wheels up when ready.'],
    ],
    crisis: { atKm: 4.8 },
    par: 380,
    storm: { km: 12, kmPerSecond: 0.025, windKt: 5, gustKt: 3 },
    start: { x: kestrel09.x + kestrel09.ax * 40, y: kestrel.elev + 1.55, z: kestrel09.z, heading: 90, speedKt: 0, onGround: true, throttle: 0, flapDetent: 1, gearDown: true, fuel: 78 },
    rings: RING_COURSE,
    finish: 'land-kestrel',
    objectives: [
      { id: 'takeoff', text: 'Take off from Kestrel Field', reward: 50 },
      { id: 'rings', text: 'Fly the beacon rings', reward: 400 },
      { id: 'par', text: 'Beat par', reward: 200 },
      { id: 'land-kestrel', text: 'Land Kestrel Field RWY 09', reward: 300 },
    ],
  },
  {
    id: 'mail',
    number: 2,
    title: 'Mail to Puffin Cay',
    kind: 'Mail run',
    blurb: 'Carry the mail and the clinic’s insulin 7 km east to Puffin Cay on under half a tank.',
    client: { who: 'nurse', why: 'The clinic’s insulin is in the mail sack. No boat can cross tonight.' },
    thanks: 'The insulin’s here and Mrs Kerr is asleep. You’ve made an old woman safe tonight.',
    worry: 'No plane and no insulin. Please, try again before the storm closes us in.',
    strikeReply: 'Puffin Cay: Was that lightning on you? Talk to me, Kestrel One!',
    opening: [
      ['nurse', 'Puffin Cay: The insulin is for old Mrs Kerr. Hurry, but come in one piece.'],
      ['radio', 'Kestrel Radio: Mail’s aboard. Fuel is thin — cruise, don’t race.'],
    ],
    crisis: { atKm: 6.8 },
    par: 240,
    storm: { km: 10, kmPerSecond: 0.03, windKt: 7, gustKt: 4 },
    start: { x: kestrel09.x + kestrel09.ax * 40, y: kestrel.elev + 1.55, z: kestrel09.z, heading: 90, speedKt: 0, onGround: true, throttle: 0, flapDetent: 1, gearDown: true, fuel: 44 },
    finish: 'land-puffin',
    objectives: [
      { id: 'takeoff', text: 'Take off from Kestrel Field', reward: 50 },
      { id: 'reach-puffin', text: 'Reach Puffin Cay', reward: 150 },
      { id: 'land-puffin', text: 'Land Puffin Cay RWY 36', reward: 350 },
      { id: 'fuel-reserve', text: 'Keep 8% fuel in reserve', reward: 200 },
    ],
  },
  {
    id: 'rescue',
    number: 3,
    title: 'Flare off West Skerry',
    kind: 'Search & rescue',
    blurb: 'Finn Ardle’s skiff is adrift under the storm. Find the red flare, drop the crate, get home.',
    client: { who: 'skiff', why: 'Tobin’s grandson is adrift off the Skerry with a dead outboard.' },
    thanks: 'Got the crate — blankets, a lamp and a radio! The lifeboat’s on its way. Tell Grandad I’m fine.',
    worry: 'I can still hear your engine somewhere. Please come back.',
    strikeReply: 'Skiff: That bolt hit you! Are you still flying?',
    opening: [
      ['skiff', 'Skiff: Motor’s dead and I’m drifting. Firing a flare now. Grandad, I’m sorry.'],
      ['keeper', 'Gannet Light: That’s my grandson out there. Look for red smoke, north-west of the Skerry.'],
    ],
    crisis: { atKm: 5 },
    par: 360,
    storm: { km: 10, kmPerSecond: 0.026, windKt: 8, gustKt: 5 },
    start: { x: kestrel27.x + kestrel27.ax * 40, y: kestrel.elev + 1.55, z: kestrel27.z, heading: 270, speedKt: 0, onGround: true, throttle: 0, flapDetent: 1, gearDown: true, fuel: 70 },
    boat: FLARE_BOAT,
    finish: 'land-kestrel',
    objectives: [
      { id: 'find-boat', text: 'Find the flare boat', reward: 150 },
      { id: 'drop-crate', text: 'Drop the crate within 60 m', reward: 400 },
      { id: 'land-kestrel', text: 'Land back at Kestrel Field', reward: 300 },
      { id: 'par', text: 'Beat par', reward: 150 },
    ],
  },
  {
    id: 'storm',
    number: 4,
    title: 'Last Light Landing',
    kind: 'Storm landing',
    blurb: 'The front is on the coast. Rain, a gusting northerly crosswind, and one runway. Put her down.',
    client: { who: 'radio', why: 'Kestrel Field is the last strip open, and the light is going.' },
    thanks: 'Wheels on the wet tarmac and not a scratch. The kettle’s on, Kestrel One. Welcome home.',
    worry: 'Kestrel One, do you read? The launch is going out to you now.',
    strikeReply: 'Kestrel Radio: You took a strike! Fly the aircraft, Kestrel One.',
    opening: [
      ['radio', 'Kestrel Radio: Front’s on us. Wind zero-two-zero at thirteen, gusting. Runway 09.'],
    ],
    par: 150,
    storm: { km: 2.6, kmPerSecond: 0.012, windKt: 13, gustKt: 8 },
    start: { x: -5600, y: 250, z: 1250, heading: 72, speedKt: 88, onGround: false, throttle: 0.5, flapDetent: 0, gearDown: false, fuel: 40 },
    rain: true,
    finish: 'land-kestrel',
    objectives: [
      { id: 'land-kestrel', text: 'Land before the storm hits', reward: 400 },
      { id: 'soft-touch', text: 'Touch down under 300 fpm', reward: 250 },
      { id: 'centreline', text: 'Within 5 m of the centreline', reward: 200 },
      { id: 'no-damage', text: 'Bring her home undamaged', reward: 150 },
    ],
  },
];

export function missionById(id) {
  return MISSIONS.find((mission) => mission.id === id) ?? MISSIONS[0];
}

/** Final score parts and stars for a finished (or failed) sortie. */
export function scoreSortie(session) {
  const objectivePoints = session.objectives.filter((o) => o.done).reduce((sum, o) => sum + o.reward, 0);
  const landingPoints = session.landing ? session.landing.points : 0;
  const fuelPoints = session.state === 'complete' ? Math.round(session.aircraft.fuel * 4) : 0;
  const timePoints = session.state === 'complete' ? Math.max(0, Math.round((session.mission.par - session.time) * 2)) : 0;
  const total = objectivePoints + landingPoints + fuelPoints + timePoints;
  const allDone = session.objectives.every((o) => o.done);
  let stars = 0;
  if (session.state === 'complete') {
    stars = 1;
    if (allDone) stars += 1;
    if (session.landing && session.landing.stars >= 2) stars += 1;
  }
  return { objectivePoints, landingPoints, fuelPoints, timePoints, total, stars };
}

/**
 * How the islander the sortie is for is faring right now, for the checklist: the boats steering
 * by the lit beacons, the insulin's due time, Finn getting colder in the skiff until the crate
 * reaches him, or the last strip's light. Returns { text, urgent }.
 */
export function clientState(session) {
  const m = session.mission;
  if (m.id === 'rings') {
    const lit = session.rings.filter((r) => r.passed).length;
    return { text: lit === session.rings.length ? 'ALL BEACONS LIT · THE FLEET IS SAFE' : `${lit}/${session.rings.length} BEACONS LIT · BOATS STEERING HOME`, urgent: lit < 4 };
  }
  if (m.id === 'mail') {
    const left = m.par - session.time;
    return { text: left > 0 ? `MRS KERR'S INSULIN DUE IN ${clock(left)}` : 'INSULIN OVERDUE · MRS KERR IS WAITING', urgent: left < 60 };
  }
  if (m.id === 'rescue') {
    if (session.crate?.landed && session.crate.missBy <= 60) return { text: 'FINN HAS THE CRATE · WARM AND WAITING', urgent: false };
    const cold = Math.min(100, Math.round(20 + session.time * 0.22));
    return { text: `FINN ADRIFT · COLD ${cold}%`, urgent: cold > 60 };
  }
  return { text: session.storm.closed ? 'THE COAST IS CLOSED · GET DOWN' : `LAST STRIP OPEN · LIGHT FAILING`, urgent: session.storm.km < 1 };
}

/** Clock text m:ss. */
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
