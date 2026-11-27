// The HUD's paint box, shared by every overlay: the font, the palette, the rounded panel with
// its accent bar, text, word wrap, a pill label and a titled tab, all on the 1280 × 800 design grid.

export const FONT = '"Trebuchet MS", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
export const PANEL = 'rgba(12,14,22,0.66)';
export const EDGE = 'rgba(255,196,130,0.38)';
export const AMBER = '#ffb347';
export const CREAM = '#f6ecd8';
export const GREEN = '#5dff8a';
export const RED = '#ff5a45';
export const CYAN = '#9fe8ff';
export const VIOLET = '#c9a8ff';

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

/** Width of a string at a size and weight. */
export function measure(g, value, size, weight = 800) {
  g.font = `${weight} ${size}px ${FONT}`;
  return g.measureText(value).width;
}

export function wrap(g, value, maxWidth, size, weight = 600) {
  g.font = `${weight} ${size}px ${FONT}`;
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

/**
 * A rounded label centred on (cx, cy): dark fill, a coloured edge, bold text. Returns its
 * width so callers can line pills up.
 */
export function pill(g, label, cx, cy, size, colour, fill = 'rgba(12,14,22,0.78)', align = 'center') {
  const w = measure(g, label, size) + size * 1.6;
  const h = size * 1.65;
  const x = align === 'left' ? cx : align === 'right' ? cx - w : cx - w / 2;
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(x, cy - h / 2, w, h, h / 2);
  g.fill();
  g.strokeStyle = colour;
  g.lineWidth = 1.6;
  g.stroke();
  text(g, label, x + w / 2, cy + 1, size, colour, 'center', 800);
  return w;
}

/** A titled tab, as on a placard: a bright title on a dark band with a lit lamp beside it. */
export function titleTab(g, title, x, y, size, colour = AMBER, lamp = true) {
  const w = measure(g, title, size, 900) + size * (lamp ? 2.6 : 1.4);
  const h = size * 1.55;
  g.fillStyle = 'rgba(10,10,14,0.88)';
  g.beginPath();
  g.roundRect(x, y, w, h, 6);
  g.fill();
  g.strokeStyle = colour;
  g.lineWidth = 1.5;
  g.stroke();
  let tx = x + size * 0.7;
  if (lamp) {
    const lx = x + size * 0.75;
    const ly = y + h / 2;
    const glow = g.createRadialGradient(lx, ly, 0, lx, ly, size * 0.9);
    glow.addColorStop(0, 'rgba(255,214,120,0.95)');
    glow.addColorStop(0.35, 'rgba(255,170,70,0.55)');
    glow.addColorStop(1, 'rgba(255,170,70,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(lx, ly, size * 0.9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff2c8';
    g.beginPath();
    g.arc(lx, ly, size * 0.24, 0, Math.PI * 2);
    g.fill();
    tx = x + size * 1.55;
  }
  text(g, title, tx, y + h / 2 + 1, size, colour, 'left', 900);
  return w;
}
