// The flying HUD, laid out on a 1280 × 800 design grid and scaled to the window: heading tape
// with a big heading, the storm-front bar, big SPD and ALT readouts, the sortie checklist, the
// round map, warning annunciators, the approach callout, six lit gauges, the radio with its
// portraits, fuel and per-part damage, a marker on the next target and the controls strip.
import { drawSixPack } from './gauges.js';
import { drawMinimap } from './minimap.js';
import { clock } from './missions.js';
import { stormEta } from './storm-front.js';
import { SPEAKERS, drawPortrait } from './radio-portraits.js';
import { AIRSTRIPS, runwayThreshold } from './places.js';
import { stallSpeed } from './flight-physics.js';
import { AIRFRAME, KT } from './config.js';
import { predictCrate } from './game-session.js';
import { pilotHint } from './pilot-hints.js';

export const FONT = '"Trebuchet MS", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const PANEL = 'rgba(12,14,22,0.66)';
const EDGE = 'rgba(255,196,130,0.38)';
const AMBER = '#ffb347';
const CREAM = '#f6ecd8';
const GREEN = '#5dff8a';
const RED = '#ff5a45';

export function panel(g, x, y, w, h, accent = AMBER) {
  g.fillStyle = PANEL;
  g.beginPath();
  g.roundRect(x, y, w, h, 10);
  g.fill();
  g.strokeStyle = EDGE;
  g.lineWidth = 1.2;
  g.stroke();
  g.fillStyle = accent;
  g.fillRect(x + 12, y, w - 24, 3);
}

export function text(g, value, x, y, size, colour = CREAM, align = 'left', weight = 700) {
  g.font = `${weight} ${size}px ${FONT}`;
  g.fillStyle = colour;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(value, x, y);
}

function wrap(g, value, maxWidth, size) {
  g.font = `600 ${size}px ${FONT}`;
  const words = value.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function headingTape(g, cx, y, w, heading, bug) {
  panel(g, cx - w / 2, y, w, 50);
  g.save();
  g.beginPath();
  g.rect(cx - w / 2 + 4, y + 4, w - 8, 44);
  g.clip();
  const pxPerDeg = 4.2;
  for (let d = Math.floor(heading - 70); d <= heading + 70; d += 1) {
    if (d % 5 !== 0) continue;
    const x = cx + (d - heading) * pxPerDeg;
    const wrapped = ((d % 360) + 360) % 360;
    g.strokeStyle = CREAM;
    g.lineWidth = wrapped % 10 === 0 ? 2 : 1;
    g.beginPath();
    g.moveTo(x, y + 50);
    g.lineTo(x, y + (wrapped % 10 === 0 ? 36 : 42));
    g.stroke();
    if (wrapped % 30 === 0) {
      const name = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[wrapped] ?? String(wrapped / 10).padStart(2, '0');
      text(g, name, x, y + 20, wrapped % 90 === 0 ? 20 : 16, wrapped % 90 === 0 ? AMBER : CREAM, 'center');
    }
  }
  if (bug !== null) {
    let diff = ((bug - heading + 540) % 360) - 180;
    diff = Math.max(-68, Math.min(68, diff));
    const bx = cx + diff * pxPerDeg;
    g.fillStyle = '#ff7a3d';
    g.beginPath();
    g.moveTo(bx, y + 33);
    g.lineTo(bx - 9, y + 47);
    g.lineTo(bx + 9, y + 47);
    g.fill();
  }
  g.restore();
  g.fillStyle = '#0b0d13';
  g.strokeStyle = AMBER;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(cx - 52, y + 4, 104, 54, 8);
  g.fill();
  g.stroke();
  text(g, `${String(Math.round(heading) % 360).padStart(3, '0')}°`, cx + 2, y + 31, 36, '#ffffff', 'center', 800);
  text(g, 'HDG', cx - 72, y + 30, 13, AMBER, 'center');
}

function stormBar(g, cx, y, storm) {
  const w = 430;
  const eta = stormEta(storm);
  const fraction = Math.max(0, Math.min(1, storm.km / Math.max(storm.startKm, 1)));
  g.fillStyle = 'rgba(20,16,34,0.78)';
  g.beginPath();
  g.roundRect(cx - w / 2, y, w, 30, 15);
  g.fill();
  g.strokeStyle = 'rgba(190,160,255,0.7)';
  g.lineWidth = 1.5;
  g.stroke();
  const fill = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  fill.addColorStop(0, '#ff4a3a');
  fill.addColorStop(0.5, '#b04cff');
  fill.addColorStop(1, '#5a7dff');
  g.fillStyle = fill;
  g.globalAlpha = 0.55;
  g.beginPath();
  g.roundRect(cx - w / 2 + 3, y + 3, (w - 6) * fraction, 24, 12);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = '#ffe36a';
  g.beginPath();
  const bx = cx - w / 2 + 22;
  g.moveTo(bx + 4, y + 4);
  g.lineTo(bx - 5, y + 17);
  g.lineTo(bx + 1, y + 17);
  g.lineTo(bx - 3, y + 27);
  g.lineTo(bx + 8, y + 12);
  g.lineTo(bx + 2, y + 12);
  g.closePath();
  g.fill();
  const label = storm.closed ? 'STORM ON THE COAST' : `STORM FRONT ${storm.km.toFixed(1)} KM · ${clock(eta)}`;
  text(g, label, cx + 10, y + 16, 18, '#ffffff', 'center', 800);
}

function objectivesPanel(g, x, y, session) {
  const w = 316;
  const rows = session.objectives.length;
  const h = 78 + rows * 30;
  panel(g, x, y, w, h);
  const m = session.mission;
  text(g, `SORTIE ${m.number} · ${m.title.toUpperCase()}`, x + 14, y + 20, 17, AMBER);
  const overPar = session.time > m.par;
  text(g, `${m.kind.toUpperCase()}`, x + 14, y + 44, 13, 'rgba(246,236,216,0.75)', 'left', 600);
  text(g, `PAR ${clock(m.par)}`, x + 176, y + 44, 14, 'rgba(246,236,216,0.85)', 'left');
  text(g, `T ${clock(session.time)}`, x + w - 14, y + 44, 16, overPar ? RED : '#ffffff', 'right', 800);
  session.objectives.forEach((o, i) => {
    const ry = y + 76 + i * 30;
    const next = !o.done && session.objectives.slice(0, i).every((p) => p.done || p.id === 'par');
    g.strokeStyle = o.done ? GREEN : next ? AMBER : 'rgba(246,236,216,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(x + 14, ry - 9, 18, 18, 4);
    g.stroke();
    if (o.done) {
      g.strokeStyle = GREEN;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x + 17, ry);
      g.lineTo(x + 22, ry + 5);
      g.lineTo(x + 30, ry - 6);
      g.stroke();
    }
    let label = o.text;
    if (o.id === 'rings') label = `${o.text} ${session.nextRing}/${session.rings.length}`;
    if (o.id === 'par') label = `${o.text} ${clock(m.par)}`;
    g.font = `700 15px ${FONT}`;
    const size = Math.min(15, Math.floor((15 * (w - 110)) / Math.max(1, g.measureText(label).width)));
    text(g, label, x + 42, ry + 1, size, o.done ? 'rgba(246,236,216,0.6)' : next ? '#ffffff' : 'rgba(246,236,216,0.85)', 'left', next ? 700 : 600);
    text(g, `+${o.reward}`, x + w - 14, ry + 1, 14, o.done ? GREEN : AMBER, 'right');
  });
}

function bigReadout(g, x, y, w, labelText, unit, value, sub, colour = '#ffffff', align = 'left') {
  panel(g, x, y, w, 104);
  const left = x + 14;
  const right = x + w - 14;
  text(g, labelText, align === 'left' ? left : right, y + 18, 15, AMBER, align);
  text(g, unit, align === 'left' ? right : left, y + 18, 14, 'rgba(246,236,216,0.7)', align === 'left' ? 'right' : 'left');
  text(g, value, align === 'left' ? left - 2 : right + 2, y + 58, 60, colour, align, 800);
  text(g, sub, align === 'left' ? left : right, y + 92, 14, 'rgba(246,236,216,0.85)', align, 600);
}

function throttleBar(g, x, y, h, throttle) {
  g.fillStyle = 'rgba(12,14,22,0.66)';
  g.beginPath();
  g.roundRect(x, y, 26, h, 6);
  g.fill();
  g.strokeStyle = EDGE;
  g.stroke();
  const fill = g.createLinearGradient(0, y + h, 0, y);
  fill.addColorStop(0, '#3fbf5a');
  fill.addColorStop(0.75, '#f2c23a');
  fill.addColorStop(1, '#ff6a3d');
  g.fillStyle = fill;
  g.fillRect(x + 5, y + h - 5 - (h - 10) * throttle, 16, (h - 10) * throttle);
  text(g, 'THR', x + 13, y - 10, 12, AMBER, 'center');
  text(g, `${Math.round(throttle * 100)}`, x + 13, y + h + 12, 13, CREAM, 'center');
}

function annunciators(g, cx, y, session, read) {
  const a = session.aircraft;
  const low = read.aglFt < 600;
  const lights = [
    { name: 'STALL', on: a.stallWarning, colour: RED, flash: true },
    { name: a.gearDown ? (a.gearPos > 0.98 ? 'GEAR DN' : 'GEAR ···') : 'GEAR UP', on: a.gearDown || low, colour: a.gearDown ? (a.gearPos > 0.98 ? GREEN : AMBER) : RED, flash: !a.gearDown && low && !a.onGround },
    { name: `FLAPS ${[0, 20, 40][a.flapDetent]}`, on: a.flapDetent > 0, colour: AMBER },
    { name: 'FUEL LO', on: a.fuel < 15, colour: a.fuel < 6 ? RED : AMBER, flash: a.fuel < 6 },
    { name: 'OVERSPD', on: read.kt > AIRFRAME.overspeedKt - 5, colour: RED, flash: true },
    { name: a.brakes ? 'BRAKES' : 'ENGINE', on: a.brakes || !a.engineRunning, colour: a.engineRunning ? AMBER : RED, flash: !a.engineRunning },
  ];
  const w = 100;
  const gap = 8;
  const total = lights.length * w + (lights.length - 1) * gap;
  const blink = Math.floor(session.time * 4) % 2 === 0;
  lights.forEach((l, i) => {
    const x = cx - total / 2 + i * (w + gap);
    const lit = l.on && (!l.flash || blink || l.name !== 'STALL' || true);
    g.fillStyle = lit ? l.colour : 'rgba(30,32,40,0.85)';
    g.globalAlpha = lit ? (l.flash && !blink ? 0.65 : 0.95) : 1;
    g.beginPath();
    g.roundRect(x, y, w, 26, 5);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = lit ? '#ffffff' : 'rgba(255,255,255,0.18)';
    g.lineWidth = 1;
    g.stroke();
    text(g, l.name, x + w / 2, y + 14, 14, lit ? '#14110c' : 'rgba(246,236,216,0.35)', 'center', 800);
  });
}

function callout(g, cx, y, approach, aircraft) {
  if (!approach || !approach.final) return;
  const gear = aircraft.gearDown && aircraft.gearPos > 0.98;
  const parts = ['FINAL', `RWY ${approach.threshold.name}`, gear ? 'GEAR DOWN' : 'GEAR UP!', gear ? '3 GREEN' : 'CHECK GEAR'];
  const label = parts.join(' · ');
  g.font = `800 22px ${FONT}`;
  const w = g.measureText(label).width + 44;
  g.fillStyle = gear ? 'rgba(10,40,22,0.8)' : 'rgba(60,12,10,0.85)';
  g.beginPath();
  g.roundRect(cx - w / 2, y, w, 38, 8);
  g.fill();
  g.strokeStyle = gear ? GREEN : RED;
  g.lineWidth = 2;
  g.stroke();
  text(g, label, cx, y + 20, 22, gear ? '#c8ffd8' : '#ffd0c8', 'center', 800);
  const glide = approach.glide;
  const papi = glide > 4.1 ? 'HIGH' : glide < 2.9 ? 'LOW' : 'ON SLOPE';
  text(g, `${(approach.distance / 1852).toFixed(1)} NM · GLIDE ${glide.toFixed(1)}° ${papi}`, cx, y + 52, 14, papi === 'ON SLOPE' ? '#c8ffd8' : AMBER, 'center', 700);
}

function radioPanel(g, x, y, w, h, session) {
  panel(g, x, y, w, h, '#58c4c0');
  text(g, 'RADIO · 122.80', x + 14, y + 18, 14, '#58c4c0');
  text(g, 'KESTREL', x + w - 14, y + 18, 13, 'rgba(246,236,216,0.6)', 'right');
  const last = session.radio[session.radio.length - 1];
  if (!last) return;
  const who = last.who;
  drawPortrait(g, x + 12, y + 34, 68, who);
  const speaker = SPEAKERS[who];
  text(g, speaker.name, x + 90, y + 44, 14, speaker.colour);
  text(g, speaker.role, x + 90, y + 61, 12, 'rgba(246,236,216,0.65)', 'left', 600);
  const body = last.text.replace(/^[^:]+:\s*/, '');
  const lines = wrap(g, `“${body}”`, w - 26, 15).slice(0, 3);
  lines.forEach((line, i) => text(g, line, x + 14, y + 118 + i * 19, 15, '#ffffff', 'left', 600));
  const previous = session.radio[session.radio.length - 2];
  if (previous && lines.length < 3) {
    const prev = wrap(g, previous.text, w - 26, 12)[0];
    text(g, prev, x + 14, y + h - 12, 12, 'rgba(246,236,216,0.45)', 'left', 600);
  }
}

function healthColour(v) {
  return v > 0.75 ? GREEN : v > 0.4 ? '#f2c23a' : RED;
}

function fuelDamagePanel(g, x, y, w, h, session) {
  const a = session.aircraft;
  panel(g, x, y, w, h, '#f2c23a');
  text(g, 'FUEL', x + 14, y + 20, 14, AMBER);
  text(g, `${Math.round(a.fuel)}%`, x + 14, y + 48, 34, a.fuel < 15 ? RED : '#ffffff', 'left', 800);
  const burn = AIRFRAME.fuelIdleBurn + AIRFRAME.fuelFullBurn * a.throttle * a.throttle;
  const endurance = a.engineRunning ? a.fuel / burn : 0;
  text(g, `≈ ${clock(endurance)} at ${Math.round(a.throttle * 100)}% power`, x + w - 14, y + 22, 13, 'rgba(246,236,216,0.8)', 'right', 600);
  const bx = x + 108;
  const bw = w - 122;
  g.fillStyle = 'rgba(255,255,255,0.1)';
  g.fillRect(bx, y + 38, bw, 16);
  const fuelFill = g.createLinearGradient(bx, 0, bx + bw, 0);
  fuelFill.addColorStop(0, '#ff5a45');
  fuelFill.addColorStop(0.25, '#f2c23a');
  fuelFill.addColorStop(1, '#5dff8a');
  g.fillStyle = fuelFill;
  g.fillRect(bx, y + 38, bw * (a.fuel / 100), 16);
  for (let t = 1; t < 4; t += 1) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(bx + (bw * t) / 4, y + 38, 1.5, 16);
  }
  text(g, 'AIRFRAME', x + 14, y + 78, 14, AMBER);
  const parts = [['ENGINE', a.damage.engine], ['WINGS', a.damage.wings], ['GEAR', a.damage.gear], ['TAIL', a.damage.tail]];
  parts.forEach(([name, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const px = x + 14 + col * ((w - 28) / 2 + 4);
    const py = y + 100 + row * 36;
    const pw = (w - 28) / 2 - 4;
    text(g, name, px, py, 13, 'rgba(246,236,216,0.85)', 'left', 700);
    text(g, `${Math.round(v * 100)}%`, px + pw, py, 13, healthColour(v), 'right', 800);
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(px, py + 10, pw, 8);
    g.fillStyle = healthColour(v);
    g.fillRect(px, py + 10, pw * v, 8);
  });
}

function gaugeRow(g, cx, y, session, read) {
  const r = 52;
  const gap = 120;
  const w = gap * 6 + 12;
  const plate = g.createLinearGradient(0, y, 0, y + 150);
  plate.addColorStop(0, 'rgba(46,42,40,0.92)');
  plate.addColorStop(1, 'rgba(20,19,22,0.95)');
  g.fillStyle = plate;
  g.beginPath();
  g.roundRect(cx - w / 2, y, w, 148, 14);
  g.fill();
  g.strokeStyle = 'rgba(255,196,130,0.45)';
  g.lineWidth = 1.5;
  g.stroke();
  const slots = [];
  for (let i = 0; i < 6; i += 1) slots.push({ x: cx - gap * 2.5 + i * gap, y: y + 66 });
  drawSixPack(g, slots, r, { ...read, rpm: session.aircraft.rpm, fuel: session.aircraft.fuel, bugDeg: read.bugDeg });
  const names = ['AIRSPEED', 'ATTITUDE', 'ALTIMETER', 'HEADING', 'VERT SPD', 'ENGINE·FUEL'];
  names.forEach((n, i) => text(g, n, slots[i].x, y + 137, 11, 'rgba(255,196,130,0.85)', 'center', 700));
}

function targetMarker(g, frame, target, labelText, colour) {
  const p = frame.project(target.x, target.y, target.z);
  const dist = Math.hypot(target.x - frame.session.aircraft.pos.x, target.z - frame.session.aircraft.pos.z);
  const distText = dist > 1000 ? `${(dist / 1000).toFixed(1)} KM` : `${Math.round(dist)} M`;
  const W = frame.designWidth;
  const H = frame.designHeight;
  if (p.visible && p.x > 40 && p.x < W - 40 && p.y > 110 && p.y < H - 230) {
    const s = 16;
    g.strokeStyle = colour;
    g.lineWidth = 2.5;
    // On final the runway itself is the target: label it, keep the threshold clear.
    const corners = frame.approach?.final && target.runway ? [] : [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [dx, dy] of corners) {
      g.beginPath();
      g.moveTo(p.x + dx * s, p.y + dy * (s - 8));
      g.lineTo(p.x + dx * s, p.y + dy * s);
      g.lineTo(p.x + dx * (s - 8), p.y + dy * s);
      g.stroke();
    }
    g.fillStyle = 'rgba(10,10,16,0.65)';
    g.font = `800 14px ${FONT}`;
    const label = `${labelText} · ${distText}`;
    const lw = g.measureText(label).width + 14;
    const ly = corners.length ? p.y - s - 26 : p.y - 58;
    g.beginPath();
    g.roundRect(p.x - lw / 2, ly, lw, 20, 5);
    g.fill();
    text(g, label, p.x, ly + 11, 14, colour, 'center', 800);
    return;
  }
  let dx = p.x - W / 2;
  let dy = p.y - H / 2;
  if (!p.visible) {
    dx = -dx;
    dy = -dy;
  }
  const angle = Math.atan2(dy, dx);
  const ex = W / 2 + Math.cos(angle) * 300;
  const ey = H / 2 - 60 + Math.sin(angle) * 180;
  g.save();
  g.translate(ex, ey);
  g.rotate(angle);
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(16, 0);
  g.lineTo(-8, -11);
  g.lineTo(-8, 11);
  g.fill();
  g.restore();
  text(g, `${labelText} · ${distText}`, ex, ey + 22, 14, colour, 'center', 800);
}

function hintLine(g, W, y, hint) {
  if (!hint) return;
  g.font = `800 15px ${FONT}`;
  const w = g.measureText(hint).width + 30;
  g.fillStyle = 'rgba(12,14,22,0.7)';
  g.beginPath();
  g.roundRect(W / 2 - w / 2, y - 12, w, 24, 12);
  g.fill();
  text(g, hint, W / 2, y + 1, 15, AMBER, 'center', 800);
}

/** The rescue drop cue: where the crate would land if let go now, and how far off the boat. */
function dropCue(g, frame) {
  const session = frame.session;
  const boat = session.mission.boat;
  if (!boat || !session.crate || session.crate.dropped) return;
  const a = session.aircraft;
  if (Math.hypot(a.pos.x - boat.x, a.pos.z - boat.z) > 1200) return;
  const p = predictCrate(session);
  if (!p) return;
  const good = p.miss < 45;
  const spot = frame.project(p.x, 1, p.z);
  if (spot.visible) {
    g.strokeStyle = good ? GREEN : '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(spot.x, spot.y, 10, 0, Math.PI * 2);
    g.moveTo(spot.x - 16, spot.y);
    g.lineTo(spot.x + 16, spot.y);
    g.moveTo(spot.x, spot.y - 16);
    g.lineTo(spot.x, spot.y + 16);
    g.stroke();
  }
  const W = frame.designWidth;
  const label = good ? 'DROP NOW · X' : `CRATE WOULD MISS BY ${Math.round(p.miss)} M`;
  g.font = `800 20px ${FONT}`;
  const w = g.measureText(label).width + 40;
  g.fillStyle = good ? 'rgba(10,40,22,0.85)' : 'rgba(12,14,22,0.75)';
  g.beginPath();
  g.roundRect(W / 2 - w / 2, 176, w, 34, 8);
  g.fill();
  g.strokeStyle = good ? GREEN : AMBER;
  g.lineWidth = 2;
  g.stroke();
  text(g, label, W / 2, 194, 20, good ? '#c8ffd8' : '#ffffff', 'center', 800);
}

/** Wind as pilots read it: the direction it blows from, its speed, and the gust on top. */
function windReadout(g, cx, y, wind) {
  const speedKt = Math.hypot(wind.x, wind.z) * KT;
  let from = (Math.atan2(-wind.x, wind.z) * 180) / Math.PI;
  from = (from + 360) % 360;
  const gust = Math.max(0, Math.round(wind.gustKt ?? 0));
  const label = `WIND ${String(Math.round(from / 10) * 10 || 360).padStart(3, '0')}° ${Math.round(speedKt)} KT${gust > 2 ? ` G${Math.round(speedKt + gust)}` : ''}`;
  g.font = `800 14px ${FONT}`;
  const w = g.measureText(label).width + 44;
  g.fillStyle = PANEL;
  g.beginPath();
  g.roundRect(cx - w / 2, y - 12, w, 24, 12);
  g.fill();
  g.save();
  g.translate(cx - w / 2 + 16, y);
  g.rotate(((from + 180) * Math.PI) / 180);
  g.fillStyle = '#9fe8ff';
  g.beginPath();
  g.moveTo(0, -8);
  g.lineTo(5, 5);
  g.lineTo(0, 2);
  g.lineTo(-5, 5);
  g.closePath();
  g.fill();
  g.restore();
  text(g, label, cx + 10, y + 1, 14, '#ffffff', 'center', 800);
}

function controlsStrip(g, W, H) {
  g.fillStyle = 'rgba(8,9,14,0.7)';
  g.fillRect(0, H - 22, W, 22);
  text(g, 'W/S PITCH · A/D ROLL · Q/E RUDDER · SHIFT/CTRL THROTTLE · F FLAPS · G GEAR · B BRAKES · X DROP · R REFUEL · C CAMERA · M MAP · P PAUSE', W / 2, H - 11, 13, 'rgba(246,236,216,0.82)', 'center', 700);
}

function banner(g, W, frame) {
  const b = frame.banner;
  if (!b) return;
  g.font = `800 30px ${FONT}`;
  const w = g.measureText(b.text).width + 60;
  g.fillStyle = 'rgba(10,10,16,0.7)';
  g.beginPath();
  g.roundRect(W / 2 - w / 2, 236, w, 50, 10);
  g.fill();
  g.strokeStyle = b.colour;
  g.lineWidth = 2;
  g.stroke();
  text(g, b.text, W / 2, 262, 30, b.colour, 'center', 800);
}

/** The next thing the pilot is flying to, for the tape bug and the screen marker. */
export function currentTarget(session) {
  const m = session.mission;
  if (session.rings.length && session.nextRing < session.rings.length) {
    const ring = session.rings[session.nextRing];
    return { x: ring.x, y: ring.y, z: ring.z, label: `RING ${session.nextRing + 1}`, colour: AMBER };
  }
  if (m.boat && !session.crate?.landed) return { x: m.boat.x, y: 4, z: m.boat.z, label: 'FLARE BOAT', colour: '#ff6a5a' };
  const strip = AIRSTRIPS.find((s) => s.id === (m.finish === 'land-puffin' ? 'puffin' : 'kestrel'));
  const t = runwayThreshold(strip, m.id === 'rescue' && false);
  return { x: t.x, y: strip.elev, z: t.z, label: `${strip.name.toUpperCase()} ${t.name}`, colour: '#9fe8ff', runway: true };
}

/**
 * Draw the flying HUD. `frame` holds session, read (readouts), approach, view, project(x, y, z)
 * in design pixels, designWidth/Height, mapImage, mapOpen and banner.
 */
export function drawFlightHud(g, frame) {
  const { session, read } = frame;
  const W = frame.designWidth;
  const H = frame.designHeight;
  const a = session.aircraft;
  const cockpit = frame.view === 'cockpit';
  const target = currentTarget(session);
  const bug = (Math.atan2(target.x - a.pos.x, -(target.z - a.pos.z)) * 180) / Math.PI;
  read.bugDeg = (bug + 360) % 360;

  if (!cockpit) {
    const vignette = g.createRadialGradient(W / 2, H * 0.48, H * 0.32, W / 2, H * 0.48, W * 0.62);
    vignette.addColorStop(0, 'rgba(12,8,24,0)');
    vignette.addColorStop(1, 'rgba(12,8,24,0.34)');
    g.fillStyle = vignette;
    g.fillRect(0, 0, W, H);
  }
  targetMarker(g, frame, target, target.label, target.colour);
  headingTape(g, W / 2, 10, 520, read.headingDeg, read.bugDeg);
  stormBar(g, W / 2, 68, session.storm);
  callout(g, W / 2, 106, frame.approach, a);
  objectivesPanel(g, 14, 14, session);
  drawMinimap(g, frame.mapImage, W - 106, 106, 92, 4200, session);
  windReadout(g, W - 106, 222, session.lastWind);

  const stall = stallSpeed(a.flaps, a.damage.wings) * KT;
  const spdColour = a.stallWarning ? RED : read.kt > AIRFRAME.overspeedKt - 5 ? RED : '#ffffff';
  const readY = 300;
  bigReadout(g, 14, readY, 200, 'SPD', 'KT', String(Math.round(read.kt)), `GS ${Math.round(read.gsKt)} · STALL ${Math.round(stall)}`, spdColour);
  throttleBar(g, 226, readY + 8, 88, a.throttle);
  const vs = Math.round(read.vsFpm / 10) * 10;
  bigReadout(g, W - 214, readY, 200, 'ALT', 'FT', String(Math.round(read.altFt)), `${vs >= 0 ? '+' : ''}${vs} FPM · AGL ${Math.round(read.aglFt)}`, read.aglFt < 100 && !a.onGround && a.vel.y < -4 ? RED : '#ffffff', 'right');

  if (!cockpit) {
    annunciators(g, W / 2, H - 206, session, read);
    gaugeRow(g, W / 2, H - 172, session, read);
    radioPanel(g, 14, H - 196, 258, 172, session);
    fuelDamagePanel(g, W - 272, H - 196, 258, 172, session);
  } else {
    annunciators(g, W / 2, H - 360, session, read);
  }
  hintLine(g, W, frame.approach?.final ? 184 : 122, pilotHint(session, frame.approach));
  dropCue(g, frame);
  banner(g, W, frame);
  if (frame.mapOpen) {
    g.fillStyle = 'rgba(5,6,10,0.55)';
    g.fillRect(0, 0, W, H);
    drawMinimap(g, frame.mapImage, W / 2, H / 2, Math.min(W, H) * 0.42, 7200, session, true);
    text(g, 'KESTREL COAST · M TO CLOSE', W / 2, H / 2 + Math.min(W, H) * 0.42 + 20, 16, AMBER, 'center');
  }
  controlsStrip(g, W, H);
}
