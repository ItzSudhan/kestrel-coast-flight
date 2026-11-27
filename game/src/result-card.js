// The end of a sortie: a landing card with its rubber-stamp grade (GREASED IT, FIRM, BOUNCED,
// OFF FIELD), touchdown speed, sink rate, centreline, fuel, time against par, the score sum and
// stars; or a crash report with its cause line ("Stalled at 42 kt, 80 ft") and what was left.
import { FONT, panel, text } from './hud.js';
import { drawStars } from './mission-board.js';
import { clock } from './missions.js';

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

/** Draw the result card for a finished, crashed or storm-failed sortie. */
export function drawResultCard(g, W, H, session) {
  const result = session.result;
  const m = session.mission;
  const w = 520;
  const h = 590;
  const x = W - w - 40;
  const y = (H - h) / 2 - 10;
  const crashed = session.state !== 'complete';
  panel(g, x, y, w, h, crashed ? '#ff5a45' : AMBER);
  text(g, crashed ? (session.state === 'crashed' ? 'SORTIE LOST' : 'SORTIE FAILED') : 'SORTIE COMPLETE', x + 24, y + 30, 18, crashed ? '#ff8a75' : AMBER, 'left', 800);
  text(g, `${m.number} · ${m.title.toUpperCase()}`, x + 24, y + 58, 24, '#ffffff', 'left', 800);
  const inner = w - 48;
  if (!crashed && session.landing) {
    const l = session.landing;
    stamp(g, x + w / 2, y + 128, l.grade, STAMP[l.tone]);
    let ry = y + 200;
    const side = l.centreline === null ? '' : l.centreline > 0.3 ? ' R' : l.centreline < -0.3 ? ' L' : '';
    row(g, x + 24, ry, inner, 'Touchdown', `${l.kt} KT · ${Math.abs(l.vsFpm)} FPM`, l.vsFpm > -200 ? '#9dffb8' : '#ffffff');
    ry += 34;
    row(g, x + 24, ry, inner, 'Centreline', l.centreline === null ? 'off the paving' : `${Math.abs(l.centreline).toFixed(1)} M${side}`);
    ry += 34;
    row(g, x + 24, ry, inner, 'Runway', `${l.runwayName} · ${l.strip.name}${l.bounces ? ` · ${l.bounces} bounce` : ''}`);
    ry += 34;
    row(g, x + 24, ry, inner, 'Fuel left', `${Math.round(session.aircraft.fuel)}%`, session.aircraft.fuel < 10 ? '#ff8a75' : '#ffffff');
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
  } else {
    stamp(g, x + w / 2, y + 130, session.state === 'crashed' ? 'CRASHED' : 'STORM CLOSED', '#ff5a45', -0.08);
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
