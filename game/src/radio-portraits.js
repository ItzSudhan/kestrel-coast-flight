// Small painted portraits for the radio panel, drawn with shapes: Maren Holt at Kestrel Radio
// (headset, teal jacket), Tobin Ardle the Gannet Light keeper (white beard, oilskin, cap) and
// you, the pilot (leather cap, goggles, scarf).
import { SPEAKER_KEEPER, SPEAKER_PILOT } from './game-session.js';

export const SPEAKERS = {
  radio: { name: 'MAREN HOLT', role: 'Kestrel Radio', colour: '#58c4c0' },
  keeper: { name: 'TOBIN ARDLE', role: 'Gannet Light', colour: '#f2c23a' },
  pilot: { name: 'YOU', role: 'KC-9 Kestrel One', colour: '#ff9a52' },
};

function ellipse(g, x, y, rx, ry, colour) {
  g.fillStyle = colour;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

/** Draw a speaker's portrait in a size × size square at (x, y). */
export function drawPortrait(g, x, y, size, who) {
  const s = size / 100;
  g.save();
  g.beginPath();
  g.roundRect(x, y, size, size, size * 0.14);
  g.clip();
  const bg = g.createLinearGradient(x, y, x, y + size);
  bg.addColorStop(0, who === SPEAKER_KEEPER ? '#5b4a3a' : who === SPEAKER_PILOT ? '#4a3a52' : '#2f4b5e');
  bg.addColorStop(1, '#14161d');
  g.fillStyle = bg;
  g.fillRect(x, y, size, size);
  const cx = x + 50 * s;
  if (who === SPEAKER_KEEPER) {
    ellipse(g, cx, y + 106 * s, 46 * s, 34 * s, '#e0b52e');
    ellipse(g, cx, y + 52 * s, 22 * s, 25 * s, '#e2b08e');
    ellipse(g, cx, y + 66 * s, 21 * s, 16 * s, '#f1efe9');
    ellipse(g, cx, y + 60 * s, 11 * s, 4 * s, '#d9d4ca');
    g.fillStyle = '#23324a';
    g.beginPath();
    g.moveTo(cx - 25 * s, y + 38 * s);
    g.quadraticCurveTo(cx, y + 12 * s, cx + 25 * s, y + 38 * s);
    g.lineTo(cx + 32 * s, y + 40 * s);
    g.lineTo(cx - 25 * s, y + 41 * s);
    g.fill();
    ellipse(g, cx - 8 * s, y + 48 * s, 2.6 * s, 2.6 * s, '#1b1b1b');
    ellipse(g, cx + 8 * s, y + 48 * s, 2.6 * s, 2.6 * s, '#1b1b1b');
    ellipse(g, cx, y + 55 * s, 4 * s, 3 * s, '#cf8d73');
  } else if (who === SPEAKER_PILOT) {
    ellipse(g, cx, y + 106 * s, 46 * s, 34 * s, '#6b4a33');
    ellipse(g, cx - 14 * s, y + 80 * s, 16 * s, 8 * s, '#e8dccb');
    ellipse(g, cx, y + 54 * s, 21 * s, 25 * s, '#c98e6a');
    g.fillStyle = '#5a3a26';
    g.beginPath();
    g.arc(cx, y + 50 * s, 24 * s, Math.PI, 0);
    g.lineTo(cx + 24 * s, y + 62 * s);
    g.lineTo(cx + 17 * s, y + 62 * s);
    g.lineTo(cx + 17 * s, y + 46 * s);
    g.lineTo(cx - 17 * s, y + 46 * s);
    g.lineTo(cx - 17 * s, y + 62 * s);
    g.lineTo(cx - 24 * s, y + 62 * s);
    g.fill();
    for (const dx of [-9, 9]) {
      ellipse(g, cx + dx * s, y + 36 * s, 8 * s, 6 * s, '#3a2a1e');
      ellipse(g, cx + dx * s, y + 36 * s, 6 * s, 4.4 * s, '#9fd4e6');
    }
    ellipse(g, cx - 8 * s, y + 52 * s, 2.5 * s, 2.5 * s, '#1b1b1b');
    ellipse(g, cx + 8 * s, y + 52 * s, 2.5 * s, 2.5 * s, '#1b1b1b');
    g.strokeStyle = '#6a3a2a';
    g.lineWidth = 2 * s;
    g.beginPath();
    g.arc(cx, y + 62 * s, 7 * s, 0.2, Math.PI - 0.2);
    g.stroke();
  } else {
    ellipse(g, cx, y + 106 * s, 46 * s, 34 * s, '#2c7c79');
    ellipse(g, cx, y + 44 * s, 27 * s, 26 * s, '#2a1a14');
    ellipse(g, cx, y + 54 * s, 20 * s, 24 * s, '#a8735a');
    ellipse(g, cx - 18 * s, y + 66 * s, 10 * s, 18 * s, '#2a1a14');
    ellipse(g, cx + 18 * s, y + 66 * s, 10 * s, 18 * s, '#2a1a14');
    g.strokeStyle = '#2f3038';
    g.lineWidth = 5 * s;
    g.beginPath();
    g.arc(cx, y + 52 * s, 27 * s, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
    ellipse(g, cx - 26 * s, y + 56 * s, 6 * s, 9 * s, '#3c3d46');
    ellipse(g, cx + 26 * s, y + 56 * s, 6 * s, 9 * s, '#3c3d46');
    g.lineWidth = 2.5 * s;
    g.beginPath();
    g.moveTo(cx - 24 * s, y + 62 * s);
    g.quadraticCurveTo(cx - 20 * s, y + 74 * s, cx - 6 * s, y + 70 * s);
    g.stroke();
    ellipse(g, cx - 8 * s, y + 51 * s, 2.5 * s, 2.5 * s, '#1b1b1b');
    ellipse(g, cx + 8 * s, y + 51 * s, 2.5 * s, 2.5 * s, '#1b1b1b');
    ellipse(g, cx, y + 64 * s, 5 * s, 2 * s, '#7a3e3a');
  }
  g.restore();
  g.strokeStyle = SPEAKERS[who]?.colour ?? '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(x, y, size, size, size * 0.14);
  g.stroke();
}
