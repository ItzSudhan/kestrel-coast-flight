// Kestrel Coast: boot and the one loop. Input is read every frame, the sortie advances in fixed
// 1/60 s steps, events become banners, sounds and wreckage, the 3D coast is drawn, and the HUD
// (mission board, flight HUD or cockpit panel, result card) is painted over it.
//
// ?shot=cover|cockpit|board|result (&seed=N) stages that scene from a real seeded sortie
// instead of running the game, paints it and sets window.__shotReady for a screenshot.
import * as THREE from 'three';
import { answerCrisis, approachInfo, createSession, dropCrate, readouts, stepSession, toggleFlaps, toggleGear } from './game-session.js';
import { CHOICE_DIVERT, CHOICE_PUSH } from './divert-decision.js';
import { careerUpgrades, createCareer, recordSortie } from './pilot-career.js';
import { createWorldScene } from './world-scene.js';
import { shakeCamera } from './chase-camera.js';
import { drawCockpitPanel } from './cockpit-panel.js';
import { drawFlightHud, drawFlyingNotes, text } from './hud.js';
import { drawMissionBoard, driftOnBoard, poseForBoard } from './mission-board.js';
import { drawResultCard } from './result-card.js';
import { createEngineAudio } from './engine-audio.js';
import { createInput } from './input.js';
import { clearWreck, showReplayPath, startWreck, touchdownDust } from './effects.js';
import { paintMapImage } from './minimap.js';
import { MISSIONS } from './missions.js';
import { stageShot } from './shots.js';
import { stormGrip } from './storm-front.js';
import { BEST_KEY, CAREER_KEY, STEP } from './config.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 100000);

const canvas = document.getElementById('world');
const hudCanvas = document.getElementById('hud');
const status = document.getElementById('status');
const g = hudCanvas.getContext('2d');
const world = createWorldScene(canvas);
const mapImage = paintMapImage(world.grid);
const audio = createEngineAudio();

const game = {
  screen: 'board',
  selected: 0,
  session: createSession('rings', seed),
  view: 'chase',
  mapOpen: false,
  banner: null,
  time: 0,
  endTimer: 0,
  best: readBest(),
  career: readCareer(),
  controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0, brakes: false, refuel: false },
};

function readBest() {
  try {
    return JSON.parse(window.localStorage.getItem(BEST_KEY) ?? '{}') || {};
  } catch {
    return {};
  }
}

function saveBest() {
  try {
    window.localStorage.setItem(BEST_KEY, JSON.stringify(game.best));
    window.localStorage.setItem(CAREER_KEY, JSON.stringify(game.career));
  } catch {
    // Storage may be off; best stars and the career then last this visit only.
  }
}

function readCareer() {
  try {
    return createCareer(JSON.parse(window.localStorage.getItem(CAREER_KEY) ?? 'null'));
  } catch {
    return createCareer();
  }
}

/** A sortie of mission `index`, with the career's upgrades fitted. */
function newSession(index, sessionSeed) {
  return createSession(MISSIONS[index].id, sessionSeed, { upgrades: careerUpgrades(game.career) });
}

function announce(message) {
  status.textContent = message;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  world.resize(w, h);
  hudCanvas.width = Math.round(w * dpr);
  hudCanvas.height = Math.round(h * dpr);
}
window.addEventListener('resize', resize);
resize();

function showBoardSession(index) {
  game.selected = index;
  game.session = newSession(index, seed);
  showReplayPath(world.fx, null);
  poseForBoard(game.session);
  world.setSession(game.session);
  placeOrbit(game.session.aircraft, BOARD_ORBIT.angle, BOARD_ORBIT.radius, BOARD_ORBIT.height, BOARD_ORBIT.shift);
}

const BOARD_ORBIT = { angle: -1.05, radius: 15, height: 1.6, shift: new THREE.Vector3(0, -2.4, 0) };
/** After landing the camera looks back west into the sunset over the aircraft, with the card to the right. */
const RESULT_ORBIT = { angle: 1.95, radius: 16, height: 3.0, shift: new THREE.Vector3(-1.3, 0.9, -4.4) };

function placeOrbit(aircraft, angle, radius, height, shift) {
  const rig = world.rig;
  rig.orbitCentre.set(aircraft.pos.x, aircraft.pos.y, aircraft.pos.z);
  rig.orbitAngle = angle;
  rig.orbitRadius = radius;
  rig.orbitHeight = height;
  rig.orbitShift = shift;
}

function startSortie(index) {
  game.session = newSession(index, seed + index);
  world.setSession(game.session);
  clearWreck(world.fx);
  game.screen = 'fly';
  game.endTimer = 0;
  game.banner = { text: MISSIONS[index].title.toUpperCase(), colour: '#ffb347', until: game.time + 2.5 };
  game.input.setThrottle(game.session.aircraft.throttle);
  announce(`Sortie ${MISSIONS[index].number}: ${MISSIONS[index].title}. ${MISSIONS[index].blurb}`);
}

function showBanner(textValue, colour, seconds = 2) {
  game.banner = { text: textValue, colour, until: game.time + seconds };
}

/** A big moment: a huge two-line callout that holds the screen for a few seconds. */
function showMoment(headline, sub, colour, seconds = 3.5, subSize = 19) {
  game.banner = { text: headline, sub, subSize, colour, big: true, until: game.time + seconds };
}

function handleEvents(events) {
  const a = game.session.aircraft;
  for (const e of events) {
    if (e.type === 'ring') {
      showBanner(`RING ${e.index} / ${game.session.rings.length}`, '#ffb347');
      audio.ring();
    } else if (e.type === 'ring-miss') {
      showBanner(`RING ${e.index} MISSED BY ${e.miss} M — COME ROUND AGAIN`, '#ff8a4a', 2.6);
    } else if (e.type === 'objective') {
      const o = game.session.objectives.find((x) => x.id === e.id);
      if (o) showBanner(`✓ ${o.text.toUpperCase()}  +${o.reward}`, '#5dff8a', 2.4);
      audio.objective();
    } else if (e.type === 'stall') showBanner('STALL — NOSE DOWN, POWER UP', '#ff5a45', 1.5);
    else if (e.type === 'touchdown') {
      shakeCamera(world.rig, Math.min(1, 0.15 + -e.vsFpm / 700));
      showBanner(`TOUCHDOWN ${Math.round(e.vsFpm)} FPM · HOLD B TO BRAKE`, e.vsFpm > -230 ? '#5dff8a' : '#ffc94a', 3);
      touchdownDust(world.fx, a.pos);
      audio.chirp();
    } else if (e.type === 'bounce') {
      shakeCamera(world.rig, 0.8);
      showBanner('BOUNCED!', '#ffc94a');
      audio.chirp();
    } else if (e.type === 'tree-strike') showBanner(`TREE STRIKE · WINGS ${Math.round(a.damage.wings * 100)}%`, '#ff8a4a');
    else if (e.type === 'engine-out') showBanner('ENGINE OUT — GLIDE', '#ff5a45', 3);
    else if (e.type === 'crash') {
      shakeCamera(world.rig, 1);
      startWreck(world.fx, a);
      audio.crash();
      showBanner(e.cause.toUpperCase(), '#ff5a45', 4);
      announce(`Crashed: ${e.cause}`);
    } else if (e.type === 'storm-closed') showBanner('THE STORM IS ON THE COAST', '#b48cff', 3);
    else if (e.type === 'lightning-strike') {
      shakeCamera(world.rig, 1);
      audio.thunder();
      showMoment('LIGHTNING STRIKE', `ENGINE ${e.engine}% · POWER −${Math.round(0.6 * (100 - e.engine))}%`, '#d6bcff', 4, 30);
      announce(`Lightning strike. Engine ${e.engine} percent.`);
    } else if (e.type === 'crisis') {
      showMoment('STORM CLOSING · YOUR CALL', '1 DIVERT · 2 PUSH THROUGH', '#ffcf5a', 3);
      announce('The storm has cut the route. Press 1 to divert or 2 to push through.');
    } else if (e.type === 'crisis-choice') {
      const divert = e.choice === 1;
      showBanner(divert ? `DIVERTING · ${game.session.crisis.options.divert.strip.name.toUpperCase()}` : `PUSHING THROUGH · +${game.session.crisis.options.push.bonus}`, divert ? '#9fe8ff' : '#c9a8ff', 2.6);
    } else if (e.type === 'gust' && e.kt >= 18) showBanner(`GUST ${e.kt} KT`, '#9fe8ff', 1.4);
    else if (e.type === 'gear-jammed') showMoment('GEAR JAMMED', 'NO WHEELS · BELLY LANDING ONLY', '#ff8a4a', 3.5);
    else if (e.type === 'landed') {
      announce(`Landed: ${e.grade}`);
      const l = game.session.landing;
      if (l && l.stars >= 2) showMoment(`${e.grade} · +${l.points}`, `${l.kt} KT · ${Math.abs(l.vsFpm)} FPM · ${l.centreline === null ? 'OFF THE PAVING' : `${Math.abs(l.centreline).toFixed(1)} M OFF CENTRE`}`, l.stars >= 3 ? '#5dff8a' : '#ffc94a', 3);
    }
  }
  if (game.session.storm.flash > 0.99) audio.thunder();
  if (a.stallWarning) shakeCamera(world.rig, 0.18);
  const lastCall = game.session.radio[game.session.radio.length - 1];
  if (lastCall && lastCall !== game.heardCall) {
    game.heardCall = lastCall;
    audio.squelch();
  }
}

function handleActions(actions) {
  for (const action of actions) {
    audio.start();
    if (action === 'audio') audio.toggleMute();
    if (game.screen === 'board') {
      if (action.startsWith('pick')) showBoardSession(Number(action.slice(4)) - 1);
      if (action === 'left' || action === 'right') showBoardSession((game.selected + (action === 'left' ? MISSIONS.length - 1 : 1)) % MISSIONS.length);
      if (action === 'confirm') startSortie(game.selected);
      continue;
    }
    if (game.screen === 'result') {
      if (action === 'confirm' || action === 'back') {
        game.screen = 'board';
        showBoardSession(game.selected);
      }
      if (action === 'retry') startSortie(game.selected);
      continue;
    }
    if (action === 'pause' || action === 'back') {
      game.screen = game.screen === 'paused' ? 'fly' : 'paused';
      continue;
    }
    if (action === 'help') {
      game.screen = game.screen === 'help' ? 'fly' : 'help';
      continue;
    }
    if (game.screen !== 'fly') {
      if (action === 'confirm') game.screen = 'fly';
      if (action === 'retry') startSortie(game.selected);
      if (action === 'board') {
        game.screen = 'board';
        clearWreck(world.fx);
        showBoardSession(game.selected);
      }
      continue;
    }
    if ((action === 'pick1' || action === 'pick2') && game.session.crisis?.state === 'open') {
      answerCrisis(game.session, action === 'pick1' ? CHOICE_DIVERT : CHOICE_PUSH);
      audio.objective();
    } else if (action === 'flaps') {
      toggleFlaps(game.session);
      audio.clunk();
    } else if (action === 'gear') {
      if (!toggleGear(game.session)) showBanner('GEAR JAMMED · BELLY ONLY', '#ff8a4a', 2);
      audio.clunk();
    } else if (action === 'camera') game.view = game.view === 'chase' ? 'cockpit' : 'chase';
    else if (action === 'map') game.mapOpen = !game.mapOpen;
    else if (action === 'drop' && dropCrate(game.session)) showBanner('CRATE AWAY', '#ffb347');
    else if (action === 'retry') startSortie(game.selected);
  }
}

function project(x, y, z, W, H) {
  const v = new THREE.Vector3(x, y, z);
  const inFront = v.clone().sub(world.camera.position).dot(world.camera.getWorldDirection(new THREE.Vector3())) > 0;
  v.project(world.camera);
  return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, visible: inFront };
}

function drawOverlay() {
  const dpr = hudCanvas.width / Math.max(1, window.innerWidth);
  const s = Math.min(window.innerWidth / 1280, window.innerHeight / 800);
  const W = window.innerWidth / s;
  const H = window.innerHeight / s;
  g.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
  g.clearRect(0, 0, W, H);
  const session = game.session;
  if (game.banner && game.time > game.banner.until) game.banner = null;
  if (game.screen === 'board') {
    drawMissionBoard(g, W, H, game.selected, game.best, session.storm.km, game.time, game.career);
    return;
  }
  if (game.screen === 'result') {
    drawResultCard(g, W, H, session, game.career, game.time);
    return;
  }
  const read = readouts(session);
  if (game.view === 'cockpit') {
    const a = session.aircraft;
    const rain = Math.max(session.mission.rain ? 0.75 : 0, stormGrip(session.storm, a.pos.x, a.pos.z));
    drawCockpitPanel(g, W, H, session, read, rain);
  }
  drawFlightHud(g, {
    session,
    read,
    view: game.view,
    approach: approachInfo(session),
    project: (x, y, z) => project(x, y, z, W, H),
    designWidth: W,
    designHeight: H,
    mapImage,
    mapOpen: game.mapOpen,
    banner: game.banner,
  });
  if (game.screen === 'paused') {
    g.fillStyle = 'rgba(5,6,10,0.6)';
    g.fillRect(0, 0, W, H);
    text(g, 'PAUSED', W / 2, H / 2 - 20, 56, '#fff4e0', 'center', 900);
    text(g, 'P / ESC FLY ON · T RESTART THE SORTIE · BACKSPACE MISSION BOARD · H HOW TO FLY', W / 2, H / 2 + 30, 16, '#ffb347', 'center', 800);
  }
  if (game.screen === 'help') drawFlyingNotes(g, W, H);
}

function runGame() {
  game.input = createInput(window);
  showBoardSession(0);
  let accumulator = 0;
  let last = performance.now();
  // On a slow machine or a very dense screen, drop to one render pixel per CSS pixel.
  let slowFrames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    game.time += dt;
    slowFrames = dt > 0.03 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
    if (slowFrames > 90 && world.renderer.getPixelRatio() > 1) {
      world.renderer.setPixelRatio(1);
      resize();
      slowFrames = 0;
    }
    handleActions(game.input.takeActions());
    const session = game.session;
    let view = game.view;
    if (game.screen === 'fly') {
      game.controls = game.input.read(dt, session.aircraft.throttle);
      accumulator += dt;
      while (accumulator >= STEP) {
        handleEvents(stepSession(session, game.controls, STEP));
        accumulator -= STEP;
      }
      if (session.state !== 'flying') {
        game.endTimer += dt;
        if (game.endTimer > (session.state === 'crashed' ? 3 : 1.6)) {
          game.screen = 'result';
          if (session.state === 'complete') {
            const id = session.mission.id;
            session.result.newBest = session.result.stars > (game.best[id] ?? 0);
            game.best[id] = Math.max(game.best[id] ?? 0, session.result.stars);
          }
          session.award = recordSortie(game.career, session);
          saveBest();
          showReplayPath(world.fx, session.state === 'complete' ? null : session.report?.path);
          if (session.state === 'crashed') placeOrbit(session.aircraft, -0.8, 26, 7, new THREE.Vector3(6, 1, 6));
          else placeOrbit(session.aircraft, RESULT_ORBIT.angle, RESULT_ORBIT.radius, RESULT_ORBIT.height, RESULT_ORBIT.shift);
        }
      }
    } else {
      accumulator = 0;
      if (game.screen === 'paused') view = game.view;
    }
    if (game.screen === 'board' || game.screen === 'result') {
      view = 'orbit';
      stepSession(session, { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, 0);
      if (game.screen === 'board') driftOnBoard(session, game.time);
    }
    if (session.state !== 'flying' && game.screen === 'fly') view = 'orbit';
    if (view === 'orbit' && game.screen === 'fly') placeOrbit(session.aircraft, world.rig.orbitAngle, 45, 16, new THREE.Vector3());
    audio.update(session.aircraft, session.mission.rain ? 0.8 : 0, game.screen === 'fly');
    world.frame(session, game.screen === 'fly' ? game.controls : {}, dt, game.time, view);
    drawOverlay();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === 'fly') game.screen = 'paused';
  });
  // Ctrl is the throttle-down key, and Ctrl+W would close the tab mid-sortie: ask first.
  window.addEventListener('beforeunload', (event) => {
    if (game.screen === 'fly' || game.screen === 'paused' || game.screen === 'help') {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  announce('Kestrel Coast. Pick a sortie with 1 to 4, Enter to fly.');
  requestAnimationFrame(frame);
}

function runShot(name) {
  const scene = stageShot(name, seed);
  game.session = scene.session;
  game.screen = scene.screen;
  game.view = scene.view;
  if (scene.best) game.best = scene.best;
  if (scene.career) game.career = createCareer(scene.career);
  world.setSession(scene.session);
  let time = 40 + seed;
  let controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
  if (scene.screen === 'board') {
    poseForBoard(scene.session);
    placeOrbit(scene.session.aircraft, BOARD_ORBIT.angle, BOARD_ORBIT.radius, BOARD_ORBIT.height, BOARD_ORBIT.shift);
  }
  if (scene.screen === 'result' && scene.session.state === 'complete') placeOrbit(scene.session.aircraft, RESULT_ORBIT.angle, RESULT_ORBIT.radius, RESULT_ORBIT.height, RESULT_ORBIT.shift);
  if (scene.screen === 'result' && scene.session.state !== 'complete') {
    if (scene.session.state === 'crashed') startWreck(world.fx, scene.session.aircraft);
    showReplayPath(world.fx, scene.session.report?.path);
    placeOrbit(scene.session.aircraft, -0.8, 60, 22, new THREE.Vector3(6, 1, 6));
  }
  // The settle steps run through the game's own event handling, so a strike or a landing in
  // them raises the same callouts and camera shake as in play.
  game.time = time;
  for (let i = 0; i < scene.settle; i += 1) {
    controls = scene.pilot();
    if (scene.answer && scene.session.crisis?.state === 'open' && i >= scene.answer.atStep) answerCrisis(scene.session, scene.answer.choice);
    handleEvents(stepSession(scene.session, controls, STEP));
    time += STEP;
    game.time = time;
    world.frame(scene.session, controls, STEP, time, scene.view, i === 0);
  }
  if (scene.award) scene.session.award = recordSortie(game.career = createCareer(scene.career), scene.session);
  game.time = time;
  game.controls = controls;
  let painted = 0;
  function paint() {
    world.frame(scene.session, controls, 0.0001, time, scene.view);
    drawOverlay();
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) runShot(shot);
else runGame();
