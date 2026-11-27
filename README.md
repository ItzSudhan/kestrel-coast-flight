# kestrel-coast-flight

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/ItzSudhan/kestrel-coast-flight/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/ItzSudhan/kestrel-coast-flight/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Kestrel Coast is a 3D bush-pilot flight game for the browser, built with three.js. You fly a high-wing KC-9 over an island chain at golden hour on the lighthouse keepers' supply and rescue runs, racing a storm front that is rolling in off the sea. There are four sorties: a ring course, a mail run on thin fuel, a search and rescue with a crate drop, and a crosswind landing in the rain. Each one is scored on time, fuel left and how well you land.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. The game is plain static files under `game/` with no build step and no network requests, so any static server works.

![Kestrel Coast: chase view banking toward ring 8 on final for runway 09, the storm front to the north](screenshots/1-cover.jpg)

## How to play

Pick a sortie on the mission board with **1–4** and press **Enter**. Every sortie runs against the **storm front**: the bar at the top shows how far out it is and how long you have before it closes the coast.

- **Fly the numbers.** Lift grows with airspeed. Below about 49 kt clean (about 44 kt with full flaps) the wing stalls: the buzzer sounds, the STALL light comes on, the nose drops and a wing goes. Steep turns need more lift, so they bleed speed and can stall you at low speed.
- **Mind the fuel.** Fuel burn rises steeply with throttle, and the fuel panel shows your endurance at the current power setting. If the engine quits you glide.
- **Mind the airframe.** Hard landings, overspeed, high g, flap or gear overspeed and treetop strikes damage the engine, wings, gear or tail, and each one changes how she flies.
- **Refuel and repair.** Stop on any airstrip and hold **R**. It costs time, and the storm keeps coming.
- **Land it.** Final approach callouts, the PAPI lights and the glide readout help you set up. Your touchdown is graded on sink rate, centreline offset and bounces: **GREASED IT**, **FIRM**, **BOUNCED**, **OFF FIELD** or **BELLY LANDING**. If you crash, the report gives the cause, for example "Stalled at 42 kt, 80 ft".

## Controls

| Key | Action |
| --- | --- |
| W / S (or ↑ / ↓) | Pitch: nose down / nose up (I inverts) |
| A / D (or ← / →) | Roll left / right |
| Q / E | Rudder (steers on the ground) |
| Shift / Ctrl (or + / −) | Throttle up / down |
| F | Flaps: up, 20, 40 |
| G | Gear up / down |
| B | Wheel brakes |
| X | Drop the supply crate (rescue sortie) |
| R (hold) | Refuel and repair while stopped on an airstrip |
| C | Chase view / cockpit view |
| M | Full map |
| P / Esc | Pause (Backspace while paused returns to the mission board) |
| T | Fly the sortie again |
| Hold left mouse | Steer with the mouse |
| N | Mute |

## Missions

1. **Beacon Rings** (ring course): take off from Kestrel Field, fly the eight lit rings around the island past Gannet Light, and land on runway 09 under par.
2. **Mail to Puffin Cay** (mail run): fly the keepers' mail 7 km east to the Puffin Cay strip on 30% fuel and land with at least 8% left.
3. **Flare off West Skerry** (search and rescue): find the skiff under the red flare, drop the supply crate within 60 m of it, and get back to Kestrel Field.
4. **Last Light Landing** (storm landing): the front is on the coast. Land in rain and a gusting crosswind, under 300 fpm, on the centreline, without damage.

## How it is built

The game is plain ES modules under `game/src`, with three.js vendored at `game/vendor/three/`. Each file has one job:

- **Simulation** (also runs in Node): `flight-physics.js`, `landing-grader.js`, `game-session.js`, `missions.js`, `rings-course.js`, `storm-front.js`, `terrain-height.js`, `places.js`, `autopilot.js`
- **World**: `world-terrain.js`, `world-sea.js`, `world-sky.js`, `town-and-airstrips.js`, `lighthouse.js`, `storm-visuals.js`, `aircraft-model.js`, `ring-markers.js`, `effects.js`, `chase-camera.js`, `world-scene.js`
- **Instruments and UI**: `gauges.js`, `hud.js`, `cockpit-panel.js`, `minimap.js`, `radio-portraits.js`, `mission-board.js`, `result-card.js`
- **Other**: `input.js`, `engine-audio.js` (all sound is synthesised with WebAudio), `shots.js` (seeded screenshot scenes) and `main.js`

### Tools

- `node tools/playtest.mjs`: a headless playtest. A seeded autopilot takes off, flies all eight rings and lands, and the script checks the stall speeds, control authority, stall behaviour, crash causes and landing grades.
- `node tools/take-shots.mjs`: renders the four `?shot=` scenes listed in `shots.json` in headless Chrome and fails on any console error. Add `--play` to drive the real game with key presses instead.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1pww8frk&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
