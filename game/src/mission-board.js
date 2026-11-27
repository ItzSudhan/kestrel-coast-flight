// The mission board, the game's title screen: KESTREL COAST over the parked KC-9, the storm's
// distance, and the four sorties as cards with their goal, par, fuel load, storm distance,
// objectives and best stars. 1-4 or the arrows pick, Enter flies.
import { FONT, panel, text } from './hud.js';
import { MISSIONS, clock } from './missions.js';
import { createAircraft } from './flight-physics.js';
import { quatFromAttitude } from './flight-math.js';

const AMBER = '#ffb347';
const CARD_COLOURS = ['#ffb347', '#6fd3ff', '#ff6a5a', '#b48cff'];

/** Behind the board the KC-9 cruises off the west coast in the low sun, banking for home. */
export const BOARD_POSE = { x: -3700, y: 150, z: 1650, heading: 335, speedKt: 92, bank: -0.28, pitch: 0.06, gearDown: false, throttle: 0.62, flapDetent: 0, fuel: 78 };

/** Put the board's display aircraft in its cruise pose with the prop turning. */
export function poseForBoard(session) {
  session.aircraft = createAircraft(BOARD_POSE);
  session.aircraft.rpm = 2350;
}

/** Let the board's aircraft ride the air: a slow bob and a little roll. */
export function driftOnBoard(session, time) {
  const a = session.aircraft;
  a.pos.y = BOARD_POSE.y + Math.sin(time * 0.9) * 0.35;
  a.q = quatFromAttitude((BOARD_POSE.heading * Math.PI) / 180 + Math.sin(time * 0.31) * 0.02, BOARD_POSE.pitch + Math.sin(time * 0.9 + 1) * 0.015, BOARD_POSE.bank + Math.sin(time * 0.53) * 0.05);
}

function icon(g, kind, x, y, s, colour) {
  g.strokeStyle = colour;
  g.fillStyle = colour;
  g.lineWidth = 4;
  if (kind === 0) {
    g.beginPath();
    g.ellipse(x, y, s * 0.42, s * 0.5, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.ellipse(x + s * 0.08, y, s * 0.24, s * 0.3, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (kind === 1) {
    g.strokeRect(x - s * 0.45, y - s * 0.3, s * 0.9, s * 0.6);
    g.beginPath();
    g.moveTo(x - s * 0.45, y - s * 0.3);
    g.lineTo(x, y + s * 0.05);
    g.lineTo(x + s * 0.45, y - s * 0.3);
    g.stroke();
  } else if (kind === 2) {
    g.lineWidth = 9;
    g.beginPath();
    g.arc(x, y, s * 0.36, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#ffffff';
    for (let k = 0; k < 4; k += 1) {
      g.beginPath();
      g.arc(x, y, s * 0.36, k * Math.PI / 2 - 0.3, k * Math.PI / 2 + 0.3);
      g.stroke();
    }
  } else {
    g.beginPath();
    g.arc(x - s * 0.18, y - s * 0.05, s * 0.22, Math.PI * 0.9, Math.PI * 1.9);
    g.arc(x + s * 0.12, y - s * 0.12, s * 0.26, Math.PI * 1.1, Math.PI * 2.05);
    g.lineTo(x + s * 0.4, y + s * 0.12);
    g.lineTo(x - s * 0.42, y + s * 0.12);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffe36a';
    g.beginPath();
    g.moveTo(x + s * 0.02, y + s * 0.12);
    g.lineTo(x - s * 0.12, y + s * 0.38);
    g.lineTo(x, y + s * 0.34);
    g.lineTo(x - s * 0.08, y + s * 0.56);
    g.lineTo(x + s * 0.14, y + s * 0.26);
    g.lineTo(x + s * 0.03, y + s * 0.28);
    g.lineTo(x + s * 0.1, y + s * 0.12);
    g.fill();
  }
}

function stars(g, x, y, count, size, align = 'left') {
  const total = size * 3 + size * 0.4 * 2;
  const start = align === 'center' ? x - total / 2 : x;
  for (let k = 0; k < 3; k += 1) {
    const cx = start + size / 2 + k * size * 1.4;
    g.fillStyle = k < count ? '#ffd54a' : 'rgba(255,255,255,0.18)';
    g.beginPath();
    for (let p = 0; p < 10; p += 1) {
      const r = p % 2 === 0 ? size / 2 : size / 4.4;
      const a = -Math.PI / 2 + (p * Math.PI) / 5;
      g.lineTo(cx + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  }
}
export { stars as drawStars };

/** Draw the board. `best` maps mission id to best stars; `selected` is the highlighted index. */
export function drawMissionBoard(g, W, H, selected, best, stormKm, time) {
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(10,10,20,0.55)');
  shade.addColorStop(0.35, 'rgba(10,10,20,0)');
  shade.addColorStop(0.55, 'rgba(10,10,20,0)');
  shade.addColorStop(1, 'rgba(10,10,20,0.75)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  text(g, 'KESTREL COAST', 40, 66, 74, '#fff4e0', 'left', 900);
  text(g, 'LIGHTHOUSE RELIEF · A BUSH-PILOT SORTIE GAME', 44, 116, 20, AMBER, 'left', 800);
  g.fillStyle = 'rgba(20,16,34,0.78)';
  g.beginPath();
  g.roundRect(44, 136, 470, 34, 17);
  g.fill();
  g.strokeStyle = 'rgba(190,160,255,0.7)';
  g.stroke();
  text(g, `⚡ STORM FRONT ${stormKm.toFixed(1)} KM OFF THE NORTH COAST · CLOSING`, 62, 154, 16, '#ffffff', 'left', 800);
  text(g, 'The keepers of Gannet Light need supplies before the storm shuts the coast.', 44, 192, 17, 'rgba(255,244,224,0.9)', 'left', 600);

  const cardW = 292;
  const cardH = 262;
  const gap = 14;
  const total = MISSIONS.length * cardW + (MISSIONS.length - 1) * gap;
  const left = (W - total) / 2;
  const top = H - cardH - 52;
  MISSIONS.forEach((m, i) => {
    const x = left + i * (cardW + gap);
    const on = i === selected;
    const colour = CARD_COLOURS[i];
    const lift = on ? 10 + Math.sin(time * 3) * 2 : 0;
    const y = top - lift;
    panel(g, x, y, cardW, cardH, colour);
    if (on) {
      g.strokeStyle = colour;
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(x - 2, y - 2, cardW + 4, cardH + 4, 12);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.arc(x + 46, y + 50, 30, 0, Math.PI * 2);
    g.fill();
    icon(g, i, x + 46, y + 50, 48, colour);
    text(g, `${m.number}`, x + cardW - 22, y + 30, 30, colour, 'right', 900);
    text(g, m.kind.toUpperCase(), x + 88, y + 34, 13, colour, 'left', 800);
    text(g, m.title, x + 88, y + 58, 21, '#ffffff', 'left', 800);
    g.font = `600 14px ${FONT}`;
    const words = m.blurb.split(' ');
    let line = '';
    let row = 0;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (g.measureText(test).width > cardW - 30) {
        text(g, line, x + 16, y + 100 + row * 19, 14, 'rgba(255,244,224,0.88)', 'left', 600);
        line = word;
        row += 1;
      } else line = test;
    }
    text(g, line, x + 16, y + 100 + row * 19, 14, 'rgba(255,244,224,0.88)', 'left', 600);
    const statY = y + 178;
    const stat = (label, value, sx) => {
      text(g, label, sx, statY, 11, 'rgba(255,196,130,0.85)', 'left', 800);
      text(g, value, sx, statY + 20, 18, '#ffffff', 'left', 800);
    };
    stat('PAR', clock(m.par), x + 16);
    stat('FUEL', `${m.start.fuel}%`, x + 92);
    stat('STORM', `${m.storm.km} KM`, x + 166);
    stat('GOALS', `${m.objectives.length}`, x + 240);
    stars(g, x + 16, y + cardH - 26, best[m.id] ?? 0, 20);
    text(g, on ? 'ENTER ▸ FLY' : `PRESS ${m.number}`, x + cardW - 16, y + cardH - 26, 15, on ? colour : 'rgba(255,244,224,0.55)', 'right', 800);
  });
  g.fillStyle = 'rgba(8,9,14,0.7)';
  g.fillRect(0, H - 22, W, 22);
  text(g, '1-4 / ◀ ▶ PICK A SORTIE · ENTER FLY · W/S PITCH · A/D ROLL · Q/E RUDDER · SHIFT/CTRL THROTTLE · F FLAPS · G GEAR · C CAMERA · M MAP', W / 2, H - 11, 13, 'rgba(246,236,216,0.82)', 'center', 700);
}
