// The end of a sortie: a landing card with its rubber-stamp grade (GREASED IT, FIRM, BOUNCED,
// OFF FIELD), touchdown speed, sink rate, centreline, fuel, time against par, the score sum and
// stars; or a crash report with its cause line ("Stalled at 42 kt, 80 ft") and what was left.
import { FONT, panel, text } from './hud.js';
import { drawStars } from './mission-board.js';
import { clock } from './missions.js';
import { runwayLocal } from './places.js';

const AMBER = '#ffb347';
const STAMP = { good: '#4fe07a', fair: '#ffc94a', poor: '#ff6a4a' };

function stamp(g, x, y, label, colour, angle = -0.12) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.font = `900 54px ${FONT}`;
  const w = g.measureText(label).width + 50;
  g.strokeStyle = colour;
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(-w / 2, -40, w, 80, 10);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(-w / 2 + 8, -32, w - 16, 64, 6);
  g.stroke();
  g.fillStyle = colour;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 0, 3);
  g.restore();
}

function row(g, x, y, w, label, value, colour = '#ffffff') {
  text(g, label, x, y, 16, 'rgba(255,244,224,0.75)', 'left', 700);
  text(g, value, x + w, y, 19, colour, 'right', 800);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(x, y + 15, w, 1);
}

/**
 * A top-down strip of the runway with the touchdown (×), the rollout to the stop (line), the
 * centreline and the aiming band, so the grade reads as what happened.
 */
function touchdownDiagram(g, x, y, w, h, session) {
  const l = session.landing;
  const strip = l.strip;
  const touch = session.aircraft.firstTouchdown;
  if (!touch) return;
  const reversed = l.runwayName === strip.ends[1];
  const sign = reversed ? -1 : 1;
  const local = runwayLocal(strip, touch.at.x, touch.at.z);
  const stop = runwayLocal(strip, session.aircraft.pos.x, session.aircraft.pos.z);
  const toX = (along) => x + 34 + ((along * sign + strip.length / 2) / strip.length) * (w - 68);
  const toY = (across) => y + h / 2 + across * sign * (h / 2 / (strip.width / 2 + 6));
  g.fillStyle = '#2b2a2c';
  g.fillRect(x + 34, y + 4, w - 68, h - 8);
  g.fillStyle = 'rgba(93,255,138,0.16)';
  g.fillRect(x + 34 + (120 / strip.length) * (w - 68), y + 4, ((300 - 120) / strip.length) * (w - 68), h - 8);
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.setLineDash([8, 7]);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x + 40, y + h / 2);
  g.lineTo(x + w - 40, y + h / 2);
  g.stroke();
  g.setLineDash([]);
  text(g, l.runwayName, x + 16, y + h / 2, 14, '#ffffff', 'center', 800);
  text(g, strip.ends[reversed ? 0 : 1], x + w - 16, y + h / 2, 14, 'rgba(255,255,255,0.6)', 'center', 800);
  const tx = toX(local.along);
  const ty = toY(local.across);
  g.strokeStyle = '#ffb347';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(tx, ty);
  g.lineTo(toX(stop.along), toY(stop.across));
  g.stroke();
  g.strokeStyle = '#ff6a4a';
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(tx - 7, ty - 7);
  g.lineTo(tx + 7, ty + 7);
  g.moveTo(tx + 7, ty - 7);
  g.lineTo(tx - 7, ty + 7);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(toX(stop.along), toY(stop.across), 4.5, 0, Math.PI * 2);
  g.fill();
  const past = Math.round(local.along * sign + strip.length / 2);
  text(g, `TOUCHDOWN ${past} M PAST THE THRESHOLD · STOPPED IN ${Math.round(Math.abs(stop.along - local.along))} M`, x + w / 2, y + h + 12, 12, 'rgba(255,196,130,0.9)', 'center', 800);
}

/** Draw the result card for a finished, crashed or storm-failed sortie. */
export function drawResultCard(g, W, H, session) {
  const result = session.result;
  const m = session.mission;
  const w = 520;
  const h = 650;
  const x = W - w - 40;
  const y = (H - h) / 2 - 10;
  const crashed = session.state !== 'complete';
  panel(g, x, y, w, h, crashed ? '#ff5a45' : AMBER);
  text(g, crashed ? (session.state === 'crashed' ? 'SORTIE LOST' : 'SORTIE FAILED') : 'SORTIE COMPLETE', x + 24, y + 30, 18, crashed ? '#ff8a75' : AMBER, 'left', 800);
  text(g, `${m.number} · ${m.title.toUpperCase()}`, x + 24, y + 58, 24, '#ffffff', 'left', 800);
  const inner = w - 48;
  if (!crashed && session.landing) {
    const l = session.landing;
    stamp(g, x + w / 2, y + 124, l.grade, STAMP[l.tone]);
    touchdownDiagram(g, x + 24, y + 180, inner, 40, session);
    let ry = y + 262;
    const side = l.centreline === null ? '' : l.centreline > 0.3 ? ' R' : l.centreline < -0.3 ? ' L' : '';
    row(g, x + 24, ry, inner, 'Touchdown', `${l.kt} KT · ${Math.abs(l.vsFpm)} FPM`, l.vsFpm > -200 ? '#9dffb8' : '#ffffff');
    ry += 34;
    row(g, x + 24, ry, inner, 'Centreline', l.centreline === null ? 'off the paving' : `${Math.abs(l.centreline).toFixed(1)} M${side}`);
    ry += 34;
    row(g, x + 24, ry, inner, 'Runway', `${l.runwayName} · ${l.strip.name}${l.bounces ? ` · ${l.bounces} bounce` : ''}`);
    ry += 34;
    const fuel = session.aircraft.fuel;
    row(g, x + 24, ry, inner, 'Fuel left', `${Math.round(fuel)}%${fuel >= 8 && m.objectives.some((o) => o.id === 'fuel-reserve') ? ' · RESERVE KEPT' : ''}`, fuel < 8 ? '#ff8a75' : fuel < 15 ? '#ffc94a' : '#ffffff');
    ry += 34;
    row(g, x + 24, ry, inner, 'Time', `${clock(session.time)}  /  PAR ${clock(m.par)}`, session.time <= m.par ? '#9dffb8' : '#ff8a75');
    ry += 34;
    const done = session.objectives.filter((o) => o.done).length;
    row(g, x + 24, ry, inner, 'Objectives', `${done} / ${session.objectives.length}`);
    ry += 46;
    text(g, `GOALS ${result.objectivePoints} + LANDING ${result.landingPoints} + FUEL ${result.fuelPoints} + TIME ${result.timePoints}`, x + 24, ry, 14, 'rgba(255,196,130,0.9)', 'left', 800);
    ry += 44;
    text(g, 'SCORE', x + 24, ry, 18, AMBER, 'left', 800);
    text(g, String(result.total), x + 24, ry + 38, 50, '#ffffff', 'left', 900);
    drawStars(g, x + w - 24 - 150, ry + 26, result.stars, 44);
    if (result.newBest) {
      g.fillStyle = '#ffd54a';
      g.beginPath();
      g.roundRect(x + w - 24 - 112, ry - 14, 112, 22, 11);
      g.fill();
      text(g, 'NEW BEST', x + w - 24 - 56, ry - 2, 13, '#1a1408', 'center', 900);
    }
  } else {
    stamp(g, x + w / 2, y + 130, session.state === 'crashed' ? 'CRASHED' : result.stamp ?? 'SORTIE FAILED', '#ff5a45', -0.08);
    text(g, 'CAUSE', x + 24, y + 210, 15, AMBER, 'left', 800);
    g.font = `800 28px ${FONT}`;
    text(g, result.cause ?? 'Unknown', x + 24, y + 246, 28, '#ffffff', 'left', 800);
    const a = session.aircraft;
    let ry = y + 300;
    if (a.crashed) {
      row(g, x + 24, ry, inner, 'At impact', `${a.crashed.kt} KT · ${a.crashed.ft} FT AGL`);
      ry += 34;
    }
    row(g, x + 24, ry, inner, 'Time flown', clock(session.time));
    ry += 34;
    row(g, x + 24, ry, inner, 'Fuel left', `${Math.round(a.fuel)}%`);
    ry += 34;
    row(g, x + 24, ry, inner, 'Objectives', `${session.objectives.filter((o) => o.done).length} / ${session.objectives.length}`);
    ry += 34;
    row(g, x + 24, ry, inner, 'Storm', `${session.storm.km.toFixed(1)} KM`);
    ry += 50;
    text(g, crashed && result.cause?.startsWith('Stalled') ? 'Tip: keep the speed up in turns; lower the nose at the buzzer.' : 'Tip: flaps out, gear down, 60-65 kt over the numbers.', x + 24, ry, 15, 'rgba(255,244,224,0.85)', 'left', 600);
  }
  text(g, 'ENTER · MISSION BOARD     T · FLY AGAIN', x + w / 2, y + h - 22, 15, 'rgba(255,244,224,0.7)', 'center', 800);
}
