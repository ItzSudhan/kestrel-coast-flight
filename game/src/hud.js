// The flying HUD, laid out on a 1280 × 800 design grid and scaled to the window: the HEADING
// tape, the storm-front bar, the fuel plan line, the approach callout, big AIRSPEED and
// ALTITUDE boxes, the sortie checklist with who it is for, the round map, wind and crosswind
// with a windsock, the camera tag, the lit INSTRUMENTS plate with its warning lights, the radio
// with the cast's portraits, fuel and per-part damage with what each hurt part is doing, labels
// on the world (world-labels.js), the crisis card (divert-panel.js) and the callouts
// (drama-callout.js).
import { drawSixPack } from './gauges.js';
import { drawMinimap } from './minimap.js';
import { clientState, clock } from './missions.js';
import { stormEta } from './storm-front.js';
import { drawPortrait, speakerOf } from './radio-portraits.js';
import { AIRSTRIPS, landingEnd, runwayThreshold } from './places.js';
import { stallSpeed } from './flight-physics.js';
import { AIRFRAME, KT } from './config.js';
import { predictCrate } from './game-session.js';
import { pilotHint } from './pilot-hints.js';
import { fuelPlanLine } from './fuel-planner.js';
import { damageReport } from './damage-model.js';
import { runwayWind, windFromDeg, windsockPose } from './wind-and-gusts.js';
import { currentTarget, drawRunwayTags, drawTargetMarker } from './world-labels.js';
import { drawDivertPanel } from './divert-panel.js';
import { drawCallout } from './drama-callout.js';
import { AMBER, CREAM, CYAN, EDGE, FONT, GREEN, PANEL, RED, VIOLET, measure, panel, pill, text, titleTab, wrap } from './hud-paint.js';

export { FONT, panel, text } from './hud-paint.js';

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
  const bw = 248;
  g.fillStyle = '#0b0d13';
  g.strokeStyle = AMBER;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(cx - bw / 2, y + 4, bw, 54, 8);
  g.fill();
  g.stroke();
  text(g, 'HEADING', cx - bw / 2 + 14, y + 32, 21, AMBER, 'left', 900);
  text(g, `${String(Math.round(heading) % 360).padStart(3, '0')}°`, cx + bw / 2 - 12, y + 32, 38, '#ffffff', 'right', 800);
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

/** A fuel pump, for the fuel plan line. */
function pumpIcon(g, x, y, colour) {
  g.fillStyle = colour;
  g.fillRect(x - 6, y - 8, 10, 16);
  g.fillStyle = '#0b0d13';
  g.fillRect(x - 4, y - 6, 6, 5);
  g.strokeStyle = colour;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x + 4, y - 4);
  g.lineTo(x + 8, y - 2);
  g.lineTo(x + 8, y + 6);
  g.stroke();
}

/** The fuel planner's line: fuel to the strip, the reserve it leaves, and the bingo time. */
function fuelPlanPill(g, cx, cy, session) {
  const plan = session.fuelPlan;
  if (!plan) return;
  const colour = plan.status === 'ok' ? '#ffd76a' : plan.status === 'tight' ? AMBER : RED;
  const label = `    ${fuelPlanLine(plan)}`;
  const w = pill(g, label, cx, cy, 17, colour, plan.status === 'short' ? 'rgba(60,12,10,0.88)' : 'rgba(26,20,8,0.84)');
  pumpIcon(g, cx - w / 2 + 22, cy, colour);
}

function objectivesPanel(g, x, y, session) {
  const w = 316;
  const rows = session.objectives.length;
  const h = 120 + rows * 30;
  panel(g, x, y, w, h);
  const m = session.mission;
  text(g, `SORTIE ${m.number} · ${m.title.toUpperCase()}`, x + 14, y + 20, 17, AMBER);
  const overPar = session.time > m.par;
  text(g, `${m.kind.toUpperCase()}`, x + 14, y + 44, 13, 'rgba(246,236,216,0.75)', 'left', 600);
  text(g, `PAR ${clock(m.par)}`, x + 176, y + 44, 14, 'rgba(246,236,216,0.85)', 'left');
  text(g, `T ${clock(session.time)}`, x + w - 14, y + 44, 16, overPar ? RED : '#ffffff', 'right', 800);
  const client = speakerOf(m.client.who);
  text(g, `FOR ${client.name} · ${client.role.toUpperCase()}`, x + 14, y + 67, 13, client.colour, 'left', 800);
  const state = clientState(session);
  const blink = state.urgent && Math.floor(session.time * 2) % 2 === 0;
  text(g, state.text, x + 14, y + 87, Math.min(13, (13 * (w - 28)) / measure(g, state.text, 13, 800)), state.urgent ? (blink ? '#ff8a75' : RED) : '#ffffff', 'left', 800);
  session.objectives.forEach((o, i) => {
    const ry = y + 118 + i * 30;
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
    const size = Math.min(15, Math.floor((15 * (w - 110)) / Math.max(1, measure(g, label, 15, 700))));
    const tint = o.id === 'squall' && !o.done ? VIOLET : o.done ? 'rgba(246,236,216,0.6)' : next ? '#ffffff' : 'rgba(246,236,216,0.85)';
    text(g, label, x + 42, ry + 1, size, tint, 'left', next ? 700 : 600);
    text(g, `+${o.reward}`, x + w - 14, ry + 1, 14, o.done ? GREEN : AMBER, 'right');
  });
}

function bigReadout(g, x, y, w, labelText, unit, value, sub, colour = '#ffffff', align = 'left') {
  panel(g, x, y, w, 104);
  const left = x + 14;
  const right = x + w - 14;
  text(g, labelText, align === 'left' ? left : right, y + 19, 21, AMBER, align, 900);
  text(g, unit, align === 'left' ? right : left, y + 19, 15, 'rgba(246,236,216,0.75)', align === 'left' ? 'right' : 'left', 800);
  text(g, value, align === 'left' ? left - 2 : right + 2, y + 60, 60, colour, align, 800);
  text(g, sub, align === 'left' ? left : right, y + 93, 14, 'rgba(246,236,216,0.85)', align, 600);
}

function throttleBar(g, x, y, h, throttle) {
  g.fillStyle = PANEL;
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

/** The warning lights, `w` wide each, in a row starting at x. */
function annunciators(g, x, y, w, session, read) {
  const a = session.aircraft;
  const low = read.aglFt < 600;
  const lights = [
    { name: 'STALL', on: a.stallWarning, colour: RED, flash: true },
    { name: a.gearDown ? (a.gearPos > 0.98 ? 'GEAR DN' : 'GEAR ···') : 'GEAR UP', on: a.gearDown || low, colour: a.gearDown ? (a.gearPos > 0.98 ? GREEN : AMBER) : RED, flash: !a.gearDown && low && !a.onGround },
    { name: `FLAPS ${[0, 20, 40][a.flapDetent]}`, on: a.flapDetent > 0, colour: AMBER },
    { name: 'FUEL LO', on: a.fuel < 15, colour: a.fuel < 6 ? RED : AMBER, flash: a.fuel < 6 },
    { name: a.damage.engine < 0.9 ? 'ENG HOT' : 'OVERSPD', on: a.damage.engine < 0.9 || read.kt > AIRFRAME.overspeedKt - 5, colour: RED, flash: true },
    { name: a.brakes ? 'BRAKES' : 'ENGINE', on: a.brakes || !a.engineRunning, colour: a.engineRunning ? AMBER : RED, flash: !a.engineRunning },
  ];
  const gap = 7;
  const blink = Math.floor(session.time * 4) % 2 === 0;
  lights.forEach((l, i) => {
    const lx = x + i * (w + gap);
    g.fillStyle = l.on ? l.colour : 'rgba(30,32,40,0.85)';
    g.globalAlpha = l.on ? (l.flash && !blink ? 0.7 : 0.97) : 1;
    if (l.on) {
      g.save();
      g.shadowColor = l.colour;
      g.shadowBlur = 12;
    }
    g.beginPath();
    g.roundRect(lx, y, w, 26, 5);
    g.fill();
    if (l.on) g.restore();
    g.globalAlpha = 1;
    g.strokeStyle = l.on ? '#ffffff' : 'rgba(255,255,255,0.18)';
    g.lineWidth = 1;
    g.stroke();
    text(g, l.name, lx + w / 2, y + 14, 14, l.on ? '#14110c' : 'rgba(246,236,216,0.35)', 'center', 800);
  });
  return lights.length * (w + gap) - gap;
}

function callout(g, cx, y, approach, aircraft) {
  if (!approach || !approach.final) return;
  const gear = aircraft.gearDown && aircraft.gearPos > 0.98;
  const parts = ['FINAL', `RWY ${approach.threshold.name}`, gear ? 'GEAR DOWN' : 'GEAR UP!', gear ? '3 GREEN' : 'CHECK GEAR'];
  const label = parts.join(' · ');
  g.font = `800 21px ${FONT}`;
  const w = g.measureText(label).width + 44;
  g.fillStyle = gear ? 'rgba(10,40,22,0.8)' : 'rgba(60,12,10,0.85)';
  g.beginPath();
  g.roundRect(cx - w / 2, y, w, 36, 8);
  g.fill();
  g.strokeStyle = gear ? GREEN : RED;
  g.lineWidth = 2;
  g.stroke();
  text(g, label, cx, y + 19, 21, gear ? '#c8ffd8' : '#ffd0c8', 'center', 800);
  const glide = approach.glide;
  const papi = glide > 4.1 ? 'HIGH' : glide < 2.9 ? 'LOW' : 'ON SLOPE';
  text(g, `${(approach.distance / 1852).toFixed(1)} NM · GLIDE ${glide.toFixed(1)}° ${papi}`, cx, y + 49, 14, papi === 'ON SLOPE' ? '#c8ffd8' : AMBER, 'center', 700);
}

function radioPanel(g, x, y, w, h, session) {
  panel(g, x, y, w, h, '#58c4c0');
  text(g, 'RADIO · 122.80', x + 14, y + 18, 14, '#58c4c0');
  text(g, 'KESTREL', x + w - 14, y + 18, 13, 'rgba(246,236,216,0.6)', 'right');
  const last = session.radio[session.radio.length - 1];
  if (!last) return;
  const who = last.who;
  drawPortrait(g, x + 12, y + 34, 68, who);
  const speaker = speakerOf(who);
  text(g, speaker.name, x + 90, y + 46, 16, speaker.colour, 'left', 900);
  text(g, speaker.role, x + 90, y + 66, Math.min(12, (12 * (w - 160)) / measure(g, speaker.role, 12, 600)), 'rgba(246,236,216,0.7)', 'left', 600);
  // The other end of the conversation, listening.
  const other = who === 'pilot' ? (session.mission.client.who === 'pilot' ? 'radio' : session.mission.client.who) : 'pilot';
  g.globalAlpha = 0.8;
  drawPortrait(g, x + w - 50, y + 54, 38, other);
  g.globalAlpha = 1;
  text(g, other === 'pilot' ? 'YOU' : speakerOf(other).name.split(' ')[0], x + w - 31, y + 100, 10, 'rgba(246,236,216,0.6)', 'center', 700);
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

/** Fuel left with its bar, then each part's health and what the damage is doing to her. */
function fuelDamagePanel(g, x, y, w, h, session) {
  const a = session.aircraft;
  panel(g, x, y, w, h, '#f2c23a');
  text(g, 'FUEL', x + 14, y + 18, 15, AMBER, 'left', 900);
  text(g, `${Math.round(a.fuel)}%`, x + 14, y + 45, 32, a.fuel < 15 ? RED : '#ffffff', 'left', 800);
  const bx = x + 96;
  const bw = w - 110;
  text(g, `BURN ${a.engineRunning ? (AIRFRAME.fuelIdleBurn + AIRFRAME.fuelFullBurn * a.throttle * a.throttle).toFixed(2) : '0.00'}%/S`, x + w - 14, y + 18, 12, 'rgba(246,236,216,0.8)', 'right', 700);
  g.fillStyle = 'rgba(255,255,255,0.1)';
  g.fillRect(bx, y + 36, bw, 16);
  const fuelFill = g.createLinearGradient(bx, 0, bx + bw, 0);
  fuelFill.addColorStop(0, '#ff5a45');
  fuelFill.addColorStop(0.25, '#f2c23a');
  fuelFill.addColorStop(1, '#5dff8a');
  g.fillStyle = fuelFill;
  g.fillRect(bx, y + 36, bw * (a.fuel / 100), 16);
  for (let t = 1; t < 4; t += 1) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(bx + (bw * t) / 4, y + 36, 1.5, 16);
  }
  text(g, 'DAMAGE', x + 14, y + 74, 15, AMBER, 'left', 900);
  const report = damageReport(a);
  report.forEach((line, i) => {
    const py = y + 96 + i * 19;
    const v = line.pct / 100;
    const hurt = line.effect !== 'OK';
    text(g, line.name, x + 14, py, 12, 'rgba(246,236,216,0.85)', 'left', 800);
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(x + 72, py - 4, 54, 8);
    g.fillStyle = healthColour(v);
    g.fillRect(x + 72, py - 4, 54 * v, 8);
    text(g, `${line.pct}%`, x + 160, py, 13, healthColour(v), 'right', 800);
    text(g, hurt ? line.effect : 'OK', x + w - 12, py, hurt ? 12 : 11, hurt ? healthColour(v) : 'rgba(246,236,216,0.45)', 'right', 800);
  });
}

/** The lit instrument plate: an INSTRUMENTS title, the warning lights, and the six gauges glowing on their backlights. */
function instrumentPlate(g, cx, y, session, read) {
  const r = 52;
  const gap = 120;
  const w = gap * 6 + 12;
  const h = 186;
  const x = cx - w / 2;
  const plate = g.createLinearGradient(0, y, 0, y + h);
  plate.addColorStop(0, 'rgba(52,46,42,0.94)');
  plate.addColorStop(1, 'rgba(20,19,22,0.96)');
  g.fillStyle = plate;
  g.beginPath();
  g.roundRect(x, y, w, h, 14);
  g.fill();
  g.strokeStyle = 'rgba(255,196,130,0.55)';
  g.lineWidth = 1.5;
  g.stroke();
  const tabW = titleTab(g, 'INSTRUMENTS', x + 8, y + 6, 18);
  annunciators(g, x + 8 + tabW + 10, y + 7, (w - tabW - 34 - 35) / 6, session, read);
  const slots = [];
  for (let i = 0; i < 6; i += 1) slots.push({ x: cx - gap * 2.5 + i * gap, y: y + 98 });
  // Backlight spilling warm light onto the plate round each lit dial.
  for (const s of slots) {
    const glow = g.createRadialGradient(s.x, s.y, r * 0.9, s.x, s.y, r * 1.42);
    glow.addColorStop(0, 'rgba(255,170,80,0.42)');
    glow.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(s.x, s.y, r * 1.42, 0, Math.PI * 2);
    g.fill();
  }
  drawSixPack(g, slots, r, { ...read, rpm: session.aircraft.rpm, fuel: session.aircraft.fuel, bugDeg: read.bugDeg });
  const names = ['AIRSPEED', 'ATTITUDE', 'ALTIMETER', 'HEADING', 'VERT SPD', 'ENGINE·FUEL'];
  names.forEach((n, i) => text(g, n, slots[i].x, y + 172, 11, 'rgba(255,196,130,0.9)', 'center', 800));
}

function hintLine(g, W, y, hint) {
  if (!hint) return;
  pill(g, hint, W / 2, y, 15, AMBER, 'rgba(12,14,22,0.72)');
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
  pill(g, good ? 'DROP NOW · X' : `CRATE WOULD MISS BY ${Math.round(p.miss)} M`, W / 2, 222, 20, good ? GREEN : AMBER, good ? 'rgba(10,40,22,0.85)' : 'rgba(12,14,22,0.75)');
}

/** A little windsock: a mast and a striped cone streaming downwind, fuller the stronger it blows. */
function windsockIcon(g, x, y, wind) {
  const pose = windsockPose(wind);
  const from = windFromDeg(wind);
  // On screen, north is up: the sock streams toward where the wind goes.
  const angle = ((from + 180 - 90) * Math.PI) / 180;
  g.strokeStyle = '#dcdcdc';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, y + 9);
  g.lineTo(x, y - 9);
  g.stroke();
  g.save();
  g.translate(x, y - 8);
  g.rotate(angle);
  const len = 20 * (0.5 + 0.5 * pose.fill);
  for (let k = 0; k < 4; k += 1) {
    g.fillStyle = k % 2 === 0 ? '#ff7a2a' : '#ffffff';
    const x0 = (len * k) / 4;
    const x1 = (len * (k + 1)) / 4;
    const r0 = 5 - k;
    const r1 = 4 - k;
    g.beginPath();
    g.moveTo(x0, -r0);
    g.lineTo(x1, -r1 * pose.fill);
    g.lineTo(x1, r1 * pose.fill);
    g.lineTo(x0, r0);
    g.fill();
  }
  g.restore();
}

/** Wind as pilots read it, and its crosswind against the runway being flown to; right-aligned at `right`. */
function windPanel(g, right, y, session) {
  const wind = session.lastWind;
  const speedKt = Math.hypot(wind.x, wind.z) * KT;
  const from = windFromDeg(wind);
  const gust = Math.max(0, Math.round(wind.gustKt ?? 0));
  const label = `WIND ${String(Math.round(from / 10) * 10 || 360).padStart(3, '0')}° ${Math.round(speedKt)} KT${gust > 2 ? ` G${Math.round(speedKt + gust)}` : ''}`;
  const ww = pill(g, label, right, y, 15, '#ffffff', PANEL, 'right');
  g.save();
  g.translate(right - ww - 14, y);
  g.rotate(((from + 180) * Math.PI) / 180);
  g.fillStyle = CYAN;
  g.beginPath();
  g.moveTo(0, -8);
  g.lineTo(5, 5);
  g.lineTo(0, 2);
  g.lineTo(-5, 5);
  g.closePath();
  g.fill();
  g.restore();
  const strip = AIRSTRIPS.find((s) => s.id === session.destination) ?? AIRSTRIPS[0];
  const t = runwayThreshold(strip, landingEnd(strip, (session.aircraft.heading * 180) / Math.PI));
  const rw = runwayWind(wind, t.heading);
  const xw = `XWIND ${Math.round(rw.crossKt)} KT ${rw.side} · ${t.name}`;
  const xwW = pill(g, xw, right, y + 30, 14, rw.crossKt > 10 ? AMBER : CYAN, PANEL, 'right');
  windsockIcon(g, right - xwW - 16, y + 31, wind);
}

/** The camera mode tag: which view this is and the key that swaps it, with a red "live" dot. */
function camTag(g, right, y, view) {
  const label = view === 'cockpit' ? 'COCKPIT CAM · C' : 'CHASE CAM · C';
  const w = pill(g, label, right, y, 15, '#ffffff', 'rgba(140,30,30,0.85)', 'right');
  g.fillStyle = '#ff4a3a';
  g.beginPath();
  g.arc(right - w - 10, y, 5.5, 0, Math.PI * 2);
  g.fill();
}

function controlsStrip(g, W, H) {
  g.fillStyle = 'rgba(8,9,14,0.7)';
  g.fillRect(0, H - 22, W, 22);
  text(g, 'W/S PITCH · A/D ROLL · Q/E RUDDER · SHIFT/CTRL THROTTLE · F FLAPS · G GEAR · B BRAKES · X DROP · R REFUEL · C CAMERA · M MAP · 1/2 STORM CALL · H HELP', W / 2, H - 11, 13, 'rgba(246,236,216,0.82)', 'center', 700);
}

/** The H card: how to fly the KC-9, over the paused-looking frame. */
export function drawFlyingNotes(g, W, H) {
  const w = 800;
  const h = 470;
  const x = (W - w) / 2;
  const y = (H - h) / 2 - 20;
  g.fillStyle = 'rgba(5,6,10,0.55)';
  g.fillRect(0, 0, W, H);
  panel(g, x, y, w, h);
  text(g, 'HOW TO FLY THE KC-9', x + 28, y + 34, 22, AMBER, 'left', 900);
  const notes = [
    ['TAKE OFF', 'Shift to full power, steer the centreline with Q/E, ease back on S at 55 kt.'],
    ['TURN', 'Bank with A/D; she holds her climb or descent. Steep turns need speed.'],
    ['STALL', 'Below ~49 kt clean (~44 kt full flaps) the wing quits. Nose down (W), power up.'],
    ['LAND', 'Gear down (G), full flaps (F), 60–65 kt, ride the PAPI: two red, two white.'],
    ['FUEL PLAN', 'The plan line gives fuel to the strip, the reserve left and the bingo time.'],
    ['DAMAGE', 'A torn wing rolls her; a hurt engine loses power; jammed gear means a belly landing.'],
    ['STORM CALL', 'When the front cuts the route: 1 divert to the other strip, 2 push through for +500.'],
    ['REFUEL', 'Hold R stopped on a strip to refuel and repair. The storm keeps coming.'],
  ];
  notes.forEach(([head, body], i) => {
    const ry = y + 78 + i * 44;
    text(g, head, x + 28, ry, 15, '#ffffff', 'left', 900);
    text(g, body, x + 170, ry, 15, 'rgba(246,236,216,0.9)', 'left', 600);
  });
  text(g, 'H TO CLOSE', x + w / 2, y + h - 22, 14, AMBER, 'center', 800);
}

export { currentTarget };

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
  if (session.crisis?.state !== 'open') drawRunwayTags(g, frame, target);
  drawTargetMarker(g, frame, target);
  headingTape(g, W / 2, 10, 560, read.headingDeg, read.bugDeg);
  stormBar(g, W / 2, 68, session.storm);
  fuelPlanPill(g, W / 2, 118, session);
  if (session.crisis?.state !== 'open') callout(g, W / 2, 138, frame.approach, a);
  objectivesPanel(g, 14, 14, session);
  drawMinimap(g, frame.mapImage, W - 106, 106, 92, 4200, session);
  windPanel(g, W - 14, 220, session);
  camTag(g, W - 14, 280, frame.view);

  const stall = stallSpeed(a.flaps, a.damage.wings) * KT;
  const spdColour = a.stallWarning ? RED : read.kt > AIRFRAME.overspeedKt - 5 ? RED : '#ffffff';
  const readY = 300;
  bigReadout(g, 14, readY, 200, 'AIRSPEED', 'KT', String(Math.round(read.kt)), `GS ${Math.round(read.gsKt)} · STALL ${Math.round(stall)}`, spdColour);
  throttleBar(g, 226, readY + 8, 88, a.throttle);
  const vs = Math.round(read.vsFpm / 10) * 10;
  bigReadout(g, W - 214, readY, 200, 'ALTITUDE', 'FT', String(Math.round(read.altFt)), `${vs >= 0 ? '+' : ''}${vs} FPM · AGL ${Math.round(read.aglFt)}`, read.aglFt < 100 && !a.onGround && a.vel.y < -4 ? RED : '#ffffff', 'right');

  if (!cockpit) {
    instrumentPlate(g, W / 2, H - 212, session, read);
    radioPanel(g, 14, H - 196, 258, 172, session);
    fuelDamagePanel(g, W - 272, H - 196, 258, 172, session);
  } else {
    annunciators(g, W / 2 - 321, H - 362, 100, session, read);
  }
  const crisisOpen = session.crisis?.state === 'open';
  if (!frame.banner && !crisisOpen) hintLine(g, W, frame.approach?.final ? 214 : 160, pilotHint(session, frame.approach));
  dropCue(g, frame);
  drawDivertPanel(g, W, H, session);
  if (!crisisOpen) drawCallout(g, W, frame.banner, frame.banner?.big ? 206 : 236);
  if (frame.mapOpen) {
    g.fillStyle = 'rgba(5,6,10,0.55)';
    g.fillRect(0, 0, W, H);
    drawMinimap(g, frame.mapImage, W / 2, H / 2, Math.min(W, H) * 0.42, 7200, session, true);
    text(g, 'KESTREL COAST · M TO CLOSE', W / 2, H / 2 + Math.min(W, H) * 0.42 + 20, 16, AMBER, 'center');
  }
  controlsStrip(g, W, H);
}
