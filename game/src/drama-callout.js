// Callouts for what just happened. A small banner for routine news (RING 3 / 8, GUST 21 KT),
// and a big moment that takes the middle of the sky when it matters: "LIGHTNING STRIKE ·
// ENGINE 72%" with a bolt, "GREASED IT · +500", "GEAR JAMMED", the crisis call. Two lines,
// heavy type, a glowing frame in the moment's colour.
import { FONT, measure, text } from './hud-paint.js';

function bolt(g, x, y, s, colour) {
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(x + 0.15 * s, y - 0.5 * s);
  g.lineTo(x - 0.25 * s, y + 0.06 * s);
  g.lineTo(x + 0.02 * s, y + 0.06 * s);
  g.lineTo(x - 0.15 * s, y + 0.5 * s);
  g.lineTo(x + 0.28 * s, y - 0.12 * s);
  g.lineTo(x + 0.02 * s, y - 0.12 * s);
  g.lineTo(x + 0.2 * s, y - 0.5 * s);
  g.closePath();
  g.fill();
}

function smallBanner(g, W, b, y) {
  g.font = `800 30px ${FONT}`;
  const w = g.measureText(b.text).width + 60;
  g.fillStyle = 'rgba(10,10,16,0.7)';
  g.beginPath();
  g.roundRect(W / 2 - w / 2, y, w, 50, 10);
  g.fill();
  g.strokeStyle = b.colour;
  g.lineWidth = 2;
  g.stroke();
  text(g, b.text, W / 2, y + 26, 30, b.colour, 'center', 800);
}

/**
 * Draw the current banner. `b` holds text, colour, and for a big moment `big` and `sub`.
 * `y` is the top of the band.
 */
export function drawCallout(g, W, b, y = 236) {
  if (!b) return;
  if (!b.big) {
    smallBanner(g, W, b, y);
    return;
  }
  const lightning = b.text.startsWith('LIGHTNING');
  const iconW = lightning ? 64 : 0;
  // Kept between the checklist on the left and the wind column on the right.
  const room = W - 700;
  const headSize = Math.min(52, (52 * (room - iconW)) / Math.max(1, measure(g, b.text, 52, 900)));
  const headW = measure(g, b.text, headSize, 900);
  const subSize = b.sub ? Math.min(b.subSize ?? 19, ((b.subSize ?? 19) * room) / Math.max(1, measure(g, b.sub, b.subSize ?? 19, 900))) : 0;
  const subW = b.sub ? measure(g, b.sub, subSize, 900) : 0;
  const w = Math.max(headW + iconW, subW) + 60;
  const h = b.sub ? 74 + subSize * 1.5 : 74;
  const x = W / 2 - w / 2;
  g.save();
  g.shadowColor = b.colour;
  g.shadowBlur = 26;
  g.fillStyle = 'rgba(14,8,26,0.84)';
  g.beginPath();
  g.roundRect(x, y, w, h, 14);
  g.fill();
  g.restore();
  g.strokeStyle = b.colour;
  g.lineWidth = 3.5;
  g.beginPath();
  g.roundRect(x, y, w, h, 14);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(x + 6, y + 6, w - 12, h - 12, 10);
  g.stroke();
  const hx = W / 2 + iconW / 2;
  if (lightning) bolt(g, hx - headW / 2 - 38, y + 40, 58, '#ffe36a');
  text(g, b.text, hx, y + 40, headSize, '#ffffff', 'center', 900);
  if (b.sub) text(g, b.sub, W / 2, y + 72 + subSize * 0.55, subSize, b.colour, 'center', 900);
}
