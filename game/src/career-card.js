// The career side of the result screen: the pilot's rank with its chevrons and the bar to the
// next one (RANK UP when this sortie crossed it), the medals pinned this sortie, the KC-9's
// upgrades (fitted, newly unlocked, or locked until a rank), and the islander the sortie was
// for, on the radio with their thanks or their worry.
import { MEDALS, RANKS, UPGRADES, careerUpgrades, rankOf } from './pilot-career.js';
import { drawPortrait, speakerOf } from './radio-portraits.js';
import { AMBER, CREAM, GREEN, panel, text, wrap } from './hud-paint.js';

const GOLD = '#ffd54a';

function chevrons(g, x, y, count, size) {
  g.strokeStyle = GOLD;
  g.lineWidth = size * 0.22;
  g.lineCap = 'round';
  for (let k = 0; k < count; k += 1) {
    const cy = y - k * size * 0.42;
    g.beginPath();
    g.moveTo(x - size * 0.5, cy);
    g.lineTo(x, cy - size * 0.32);
    g.lineTo(x + size * 0.5, cy);
    g.stroke();
  }
  g.lineCap = 'butt';
}

/** A medal: two ribbon tails in its colour, a gold disc and a star. */
export function drawMedal(g, x, y, size, colour, dim = false) {
  g.globalAlpha = dim ? 0.3 : 1;
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(x - size * 0.34, y - size * 0.62);
  g.lineTo(x - size * 0.02, y - size * 0.62);
  g.lineTo(x + size * 0.12, y - size * 0.1);
  g.lineTo(x - size * 0.16, y - size * 0.1);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(x + size * 0.02, y - size * 0.62);
  g.lineTo(x + size * 0.34, y - size * 0.62);
  g.lineTo(x + size * 0.16, y - size * 0.1);
  g.lineTo(x - size * 0.06, y - size * 0.1);
  g.fill();
  const disc = g.createRadialGradient(x - size * 0.08, y + size * 0.05, size * 0.05, x, y + size * 0.12, size * 0.34);
  disc.addColorStop(0, '#fff3b0');
  disc.addColorStop(1, '#c8961e');
  g.fillStyle = disc;
  g.beginPath();
  g.arc(x, y + size * 0.12, size * 0.32, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#8a6410';
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = colour;
  g.beginPath();
  for (let p = 0; p < 10; p += 1) {
    const r = p % 2 === 0 ? size * 0.2 : size * 0.09;
    const a = -Math.PI / 2 + (p * Math.PI) / 5;
    g.lineTo(x + Math.cos(a) * r, y + size * 0.12 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
}

/** The career panel: rank, progress, this sortie's medals and the upgrades. */
export function drawCareerPanel(g, x, y, w, h, career, award) {
  panel(g, x, y, w, h, GOLD);
  const rank = rankOf(career.points);
  text(g, 'PILOT CAREER', x + 18, y + 22, 16, AMBER, 'left', 900);
  text(g, `${career.sorties} SORTIES · ${career.points.toLocaleString('en-GB')} PTS`, x + w - 18, y + 22, 14, 'rgba(246,236,216,0.8)', 'right', 800);
  chevrons(g, x + 44, y + 84, rank.index + 1, 34);
  text(g, rank.name, x + 82, y + 64, 32, '#ffffff', 'left', 900);
  if (award?.rankUp) {
    g.fillStyle = GOLD;
    g.beginPath();
    g.roundRect(x + w - 150, y + 48, 132, 32, 16);
    g.fill();
    text(g, 'RANK UP!', x + w - 84, y + 65, 18, '#1a1408', 'center', 900);
  }
  const bx = x + 82;
  const bw = w - 100;
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(bx, y + 90, bw, 10);
  g.fillStyle = GOLD;
  g.fillRect(bx, y + 90, bw * Math.max(0, Math.min(1, rank.progress)), 10);
  const nextLabel = rank.next ? `${rank.toNext.toLocaleString('en-GB')} PTS TO ${rank.next.name}` : 'TOP RANK';
  text(g, nextLabel, bx, y + 113, 13, 'rgba(255,214,120,0.9)', 'left', 800);
  if (award) text(g, `+${award.points.toLocaleString('en-GB')} THIS SORTIE`, x + w - 18, y + 113, 13, GREEN, 'right', 800);

  // Medals pinned this sortie (or the career's, faded, when none were).
  const earned = award?.medals ?? [];
  text(g, earned.length ? 'MEDALS THIS SORTIE' : 'MEDALS', x + 18, y + 140, 13, AMBER, 'left', 900);
  const shown = earned.length ? MEDALS.filter((m) => earned.includes(m.id)) : MEDALS.slice(0, 5);
  const slot = Math.min(118, (w * 0.62) / Math.max(4, shown.length));
  shown.slice(0, 5).forEach((m, i) => {
    const mx = x + 50 + i * slot;
    drawMedal(g, mx, y + 178, 46, m.colour, !earned.includes(m.id) && !(career.medals[m.id] > 0));
    text(g, m.name, mx, y + 218, 11, earned.includes(m.id) ? '#ffffff' : 'rgba(246,236,216,0.5)', 'center', 900);
  });

  // The aircraft's upgrades.
  const ux = x + 50 + Math.min(5, Math.max(4, shown.length)) * slot - 10;
  const fitted = new Set(careerUpgrades(career).map((u) => u.id));
  const fresh = new Set((award?.unlocked ?? []).map((u) => u.id));
  text(g, 'KC-9 UPGRADES', ux, y + 140, 13, AMBER, 'left', 900);
  UPGRADES.forEach((u, i) => {
    const uy = y + 162 + i * 19;
    const on = fitted.has(u.id);
    g.fillStyle = on ? (fresh.has(u.id) ? GOLD : GREEN) : 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.roundRect(ux, uy - 7, 14, 14, 3);
    g.fill();
    text(g, u.name, ux + 22, uy, 12, on ? '#ffffff' : 'rgba(246,236,216,0.5)', 'left', 800);
    const tag = fresh.has(u.id) ? 'NEW' : on ? 'FITTED' : RANKS[u.rank].name;
    text(g, tag, x + w - 18, uy, 11, fresh.has(u.id) ? GOLD : on ? GREEN : 'rgba(246,236,216,0.45)', 'right', 800);
  });
}

/** The islander the sortie was for, on the radio: thanks after a landing, worry after a loss. */
export function drawClientLine(g, x, y, w, session) {
  const who = session.mission.client.who;
  const speaker = speakerOf(who);
  const line = session.state === 'complete' ? session.mission.thanks : session.mission.worry;
  panel(g, x, y, w, 104, speaker.colour);
  drawPortrait(g, x + 12, y + 14, 76, who);
  text(g, speaker.name, x + 102, y + 24, 17, speaker.colour, 'left', 900);
  text(g, speaker.role.toUpperCase(), x + w - 16, y + 24, 12, 'rgba(246,236,216,0.7)', 'right', 800);
  wrap(g, `“${line}”`, w - 120, 17).slice(0, 3).forEach((l, i) => text(g, l, x + 102, y + 50 + i * 22, 17, CREAM, 'left', 700));
}
