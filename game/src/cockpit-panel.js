// The cockpit view's interior, drawn over the lower screen: window posts and the wing-root
// headliner, a padded glare shield, and a backlit instrument panel with the six-pack, the
// radio stack, fuel and airframe status, the gear lever with its three greens, the flap
// indicator and the throttle quadrant, all live.
import { drawSixPack } from './gauges.js';
import { FONT, text, titleTab } from './hud-paint.js';
import { SPEAKERS, drawPortrait } from './radio-portraits.js';
import { createRandom } from './random.js';
import { AIRSTRIPS, landingEnd, runwayThreshold } from './places.js';
import { runwayWind } from './wind-and-gusts.js';

function screw(g, x, y) {
  g.fillStyle = '#7d8089';
  g.beginPath();
  g.arc(x, y, 3.2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2b2d33';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x - 2, y - 1);
  g.lineTo(x + 2, y + 1);
  g.stroke();
}

function frameAndShield(g, W, H, top) {
  g.fillStyle = '#1b1c21';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(W, 0);
  g.lineTo(W, 40);
  g.quadraticCurveTo(W / 2, 70, 0, 40);
  g.closePath();
  g.fill();
  for (const side of [0, 1]) {
    g.beginPath();
    if (side === 0) {
      g.moveTo(0, 40);
      g.lineTo(70, 46);
      g.lineTo(150, top);
      g.lineTo(0, top + 20);
    } else {
      g.moveTo(W, 40);
      g.lineTo(W - 70, 46);
      g.lineTo(W - 150, top);
      g.lineTo(W, top + 20);
    }
    g.closePath();
    g.fillStyle = '#23252b';
    g.fill();
  }
  const shield = g.createLinearGradient(0, top - 26, 0, top + 20);
  shield.addColorStop(0, '#2a2a2f');
  shield.addColorStop(1, '#101114');
  g.fillStyle = shield;
  g.beginPath();
  g.moveTo(0, top + 22);
  g.quadraticCurveTo(W / 2, top - 46, W, top + 22);
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.closePath();
  g.fill();
  const face = g.createLinearGradient(0, top + 10, 0, H);
  face.addColorStop(0, '#3a3f4a');
  face.addColorStop(1, '#262a32');
  g.fillStyle = face;
  g.beginPath();
  g.moveTo(20, top + 36);
  g.quadraticCurveTo(W / 2, top - 18, W - 20, top + 36);
  g.lineTo(W - 20, H);
  g.lineTo(20, H);
  g.closePath();
  g.fill();
  const spill = g.createRadialGradient(W / 2, top, 20, W / 2, top + 120, W * 0.6);
  spill.addColorStop(0, 'rgba(255,180,100,0.16)');
  spill.addColorStop(1, 'rgba(255,180,100,0)');
  g.fillStyle = spill;
  g.fill();
  for (let x = 60; x < W; x += 180) {
    screw(g, x, top + 40 - Math.sin((x / W) * Math.PI) * 30);
    screw(g, x, H - 34);
  }
}

function gearLever(g, x, y, aircraft) {
  g.fillStyle = '#15161a';
  g.beginPath();
  g.roundRect(x - 34, y - 70, 68, 150, 8);
  g.fill();
  text(g, 'GEAR', x, y - 56, 13, '#ffb347', 'center');
  const down = aircraft.gearDown;
  g.fillStyle = '#9a9ca3';
  g.fillRect(x - 4, y - 30, 8, 70);
  g.fillStyle = '#e9e4d8';
  g.beginPath();
  g.arc(x, down ? y + 38 : y - 26, 13, 0, Math.PI * 2);
  g.fill();
  for (let k = 0; k < 3; k += 1) {
    const lit = aircraft.gearPos > 0.98;
    const moving = aircraft.gearPos > 0.02 && aircraft.gearPos < 0.98;
    g.fillStyle = lit ? '#5dff8a' : moving ? '#ff5a45' : '#2a2c31';
    g.beginPath();
    g.arc(x - 18 + k * 18, y + 66, 6, 0, Math.PI * 2);
    g.fill();
  }
}

function flapIndicator(g, x, y, aircraft) {
  g.fillStyle = '#15161a';
  g.beginPath();
  g.roundRect(x - 40, y - 70, 80, 150, 8);
  g.fill();
  text(g, 'FLAPS', x, y - 56, 13, '#ffb347', 'center');
  ['UP', '20', '40'].forEach((label, i) => text(g, label, x - 18, y - 26 + i * 34, 14, aircraft.flapDetent === i ? '#ffffff' : 'rgba(246,236,216,0.5)', 'center'));
  g.fillStyle = '#e9e4d8';
  g.beginPath();
  g.roundRect(x + 4, y - 34 + aircraft.flaps * 68, 26, 16, 4);
  g.fill();
}

function throttleQuadrant(g, x, y, aircraft) {
  g.fillStyle = '#15161a';
  g.beginPath();
  g.roundRect(x - 40, y - 70, 80, 150, 8);
  g.fill();
  text(g, 'THROTTLE', x, y - 56, 12, '#ffb347', 'center');
  g.fillStyle = '#050608';
  g.fillRect(x - 5, y - 38, 10, 100);
  const ky = y + 56 - aircraft.throttle * 92;
  g.fillStyle = '#1d1d22';
  g.beginPath();
  g.roundRect(x - 26, ky - 12, 52, 24, 8);
  g.fill();
  g.strokeStyle = '#8b8e96';
  g.stroke();
  text(g, `${Math.round(aircraft.throttle * 100)}%`, x, ky, 13, '#ffffff', 'center');
}

function radioStack(g, x, y, w, session) {
  g.fillStyle = '#121317';
  g.beginPath();
  g.roundRect(x, y, w, 150, 8);
  g.fill();
  g.fillStyle = '#081a10';
  g.fillRect(x + 10, y + 10, w - 20, 30);
  g.font = `700 20px "Courier New", monospace`;
  g.fillStyle = '#6dff9a';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('COM 122.80  NAV 109.5', x + 18, y + 26);
  const last = session.radio[session.radio.length - 1];
  if (!last) return;
  drawPortrait(g, x + 10, y + 50, 88, last.who);
  const speaker = SPEAKERS[last.who];
  text(g, speaker.name, x + 108, y + 60, 14, speaker.colour);
  g.font = `600 14px ${FONT}`;
  const words = last.text.replace(/^[^:]+:\s*/, '').split(' ');
  let line = '';
  let row = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > w - 120 && line) {
      text(g, line, x + 108, y + 82 + row * 18, 14, '#ffffff', 'left', 600);
      line = word;
      row += 1;
      if (row > 3) break;
    } else line = test;
  }
  if (row <= 3) text(g, line, x + 108, y + 82 + row * 18, 14, '#ffffff', 'left', 600);
}

function statusBlock(g, x, y, w, aircraft) {
  g.fillStyle = '#121317';
  g.beginPath();
  g.roundRect(x, y, w, 150, 8);
  g.fill();
  text(g, 'FUEL', x + 12, y + 18, 13, '#ffb347');
  text(g, `${Math.round(aircraft.fuel)}%`, x + w - 12, y + 18, 15, aircraft.fuel < 15 ? '#ff5a45' : '#ffffff', 'right', 800);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(x + 12, y + 30, w - 24, 12);
  g.fillStyle = aircraft.fuel < 15 ? '#ff5a45' : '#f2c23a';
  g.fillRect(x + 12, y + 30, (w - 24) * (aircraft.fuel / 100), 12);
  [['ENGINE', aircraft.damage.engine], ['WINGS', aircraft.damage.wings], ['GEAR', aircraft.damage.gear], ['TAIL', aircraft.damage.tail]].forEach(([name, v], i) => {
    const py = y + 62 + i * 22;
    const colour = v > 0.75 ? '#5dff8a' : v > 0.4 ? '#f2c23a' : '#ff5a45';
    text(g, name, x + 12, py, 12, 'rgba(246,236,216,0.8)');
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(x + 76, py - 5, w - 130, 10);
    g.fillStyle = colour;
    g.fillRect(x + 76, py - 5, (w - 130) * v, 10);
    text(g, `${Math.round(v * 100)}`, x + w - 12, py, 12, colour, 'right', 800);
  });
}

/**
 * Rain on the windscreen: beads that sit and streaks the slipstream drags sideways and up,
 * thicker the harder it rains. Seeded so a frame is repeatable; it shifts with time.
 */
function rainOnGlass(g, W, top, amount, time, windSide) {
  if (amount <= 0.02) return;
  const random = createRandom(4242);
  const count = Math.round(140 * amount);
  for (let i = 0; i < count; i += 1) {
    const x0 = 160 + random() * (W - 320);
    const y0 = 50 + random() * (top - 60);
    const speed = 40 + random() * 160;
    const life = (time * speed * 0.01 + random()) % 1;
    const len = 6 + random() * 26;
    const x = x0 + life * 60 * windSide;
    const y = y0 - life * 30;
    g.strokeStyle = `rgba(220,232,255,${0.18 + random() * 0.25})`;
    g.lineWidth = 1 + random() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - len * 0.8 * windSide, y + len * 0.45);
    g.stroke();
    if (random() < 0.4) {
      g.fillStyle = 'rgba(235,242,255,0.35)';
      g.beginPath();
      g.arc(x0 + random() * 30, y0 + random() * 20, 1.5 + random() * 2.5, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/**
 * The flight computer: a green LCD with the fuel planner's figures for the strip being flown
 * to and the crosswind on its runway, as the pilot reads them from the panel.
 */
function flightComputer(g, x, y, w, session) {
  const plan = session.fuelPlan;
  g.fillStyle = '#121317';
  g.beginPath();
  g.roundRect(x, y, w, 100, 8);
  g.fill();
  g.fillStyle = '#071a0e';
  g.fillRect(x + 8, y + 8, w - 16, 84);
  g.font = `700 13px "Courier New", monospace`;
  g.fillStyle = '#6dff9a';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const strip = AIRSTRIPS.find((s) => s.id === session.destination) ?? AIRSTRIPS[0];
  const t = runwayThreshold(strip, landingEnd(strip, (session.aircraft.heading * 180) / Math.PI));
  const wind = runwayWind(session.lastWind, t.heading);
  const bingo = plan && plan.bingoSeconds >= 1 ? `${Math.floor(plan.bingoSeconds / 60)}:${String(Math.floor(plan.bingoSeconds % 60)).padStart(2, '0')}` : 'NOW';
  const lines = plan ? [
    `FUEL PLAN > ${plan.name}`,
    `NEED ${String(Math.max(1, Math.round(plan.fuel))).padStart(3)}%  RES ${String(Math.max(0, Math.round(plan.reserve))).padStart(3)}%`,
    `BINGO ${bingo.padStart(5)}  ${plan.status.toUpperCase()}`,
    `RWY ${t.name} XWIND ${String(Math.round(wind.crossKt)).padStart(2)}${wind.side[0]}`,
  ] : ['FUEL PLAN', '---'];
  lines.forEach((line, i) => g.fillText(line, x + 16, y + 21 + i * 19));
}

/** Draw the cockpit interior and its live instruments. */
export function drawCockpitPanel(g, W, H, session, read, rain = 0) {
  const top = H - 330;
  rainOnGlass(g, W, top, rain, session.time, read.bankDeg > 0 ? -1 : 1);
  frameAndShield(g, W, H, top);
  const r = 60;
  const cx = W / 2 - 120;
  const slots = [
    { x: cx - 140, y: top + 92 }, { x: cx, y: top + 92 }, { x: cx + 140, y: top + 92 },
    { x: cx - 140, y: top + 232 }, { x: cx, y: top + 232 }, { x: cx + 140, y: top + 232 },
  ];
  const ordered = [slots[0], slots[1], slots[2], slots[4], slots[5], slots[3]];
  drawSixPack(g, ordered, r, { ...read, rpm: session.aircraft.rpm, fuel: session.aircraft.fuel });
  titleTab(g, 'INSTRUMENTS · PANEL LIT', 24, top + 18, 17);
  radioStack(g, 24, top + 60, 276, session);
  statusBlock(g, W / 2 + 90, top + 40, 200, session.aircraft);
  gearLever(g, W / 2 + 350, top + 150, session.aircraft);
  flapIndicator(g, W / 2 + 440, top + 150, session.aircraft);
  throttleQuadrant(g, W / 2 + 535, top + 150, session.aircraft);
  flightComputer(g, W / 2 + 90, top + 200, 200, session);
}
