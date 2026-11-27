// Round flight instruments drawn on a 2D canvas so they look flown, not drawn: a machined bezel
// with screws, a deep face with warm backlighting, coloured arcs, engraved ticks and numerals,
// a shadowed needle and a glass glare. Airspeed, attitude, altimeter, heading, vertical speed
// and engine/fuel, each fed by live flight state.

const CREAM = '#f4ead6';
const AMBER = '#ffb347';
const DEG = Math.PI / 180;

function bezel(g, x, y, r) {
  const ring = g.createLinearGradient(x - r, y - r, x + r, y + r);
  ring.addColorStop(0, '#5d6069');
  ring.addColorStop(0.5, '#25272d');
  ring.addColorStop(1, '#45474f');
  g.fillStyle = ring;
  g.beginPath();
  g.arc(x, y, r * 1.12, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = r * 0.04;
  g.stroke();
  for (let k = 0; k < 4; k += 1) {
    const a = (45 + k * 90) * DEG;
    const sx = x + Math.cos(a) * r * 1.06;
    const sy = y + Math.sin(a) * r * 1.06;
    g.fillStyle = '#8b8e96';
    g.beginPath();
    g.arc(sx, sy, r * 0.045, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#2b2d33';
    g.lineWidth = r * 0.015;
    g.beginPath();
    g.moveTo(sx - r * 0.03, sy);
    g.lineTo(sx + r * 0.03, sy);
    g.stroke();
  }
  const face = g.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
  face.addColorStop(0, '#1d2027');
  face.addColorStop(1, '#090a0d');
  g.fillStyle = face;
  g.beginPath();
  g.arc(x, y, r * 0.98, 0, Math.PI * 2);
  g.fill();
  const glow = g.createRadialGradient(x, y, r * 0.35, x, y, r * 0.98);
  glow.addColorStop(0, 'rgba(255,170,90,0.05)');
  glow.addColorStop(1, 'rgba(255,170,90,0.3)');
  g.fillStyle = glow;
  g.fill();
}

function glass(g, x, y, r) {
  g.save();
  g.beginPath();
  g.arc(x, y, r * 0.98, 0, Math.PI * 2);
  g.clip();
  const glare = g.createLinearGradient(x - r, y - r, x + r * 0.2, y + r * 0.2);
  glare.addColorStop(0, 'rgba(255,255,255,0.16)');
  glare.addColorStop(0.45, 'rgba(255,255,255,0.03)');
  glare.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.fillStyle = glare;
  g.beginPath();
  g.ellipse(x - r * 0.25, y - r * 0.35, r * 0.95, r * 0.55, -0.6, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function needle(g, x, y, r, angle, length = 0.82, colour = CREAM, width = 0.06) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.shadowColor = 'rgba(0,0,0,0.7)';
  g.shadowBlur = r * 0.08;
  g.shadowOffsetX = r * 0.03;
  g.shadowOffsetY = r * 0.04;
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(-r * 0.18, -r * width * 0.7);
  g.lineTo(r * length * 0.86, -r * width * 0.45);
  g.lineTo(r * length, 0);
  g.lineTo(r * length * 0.86, r * width * 0.45);
  g.lineTo(-r * 0.18, r * width * 0.7);
  g.closePath();
  g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = AMBER;
  g.beginPath();
  g.moveTo(r * length * 0.7, -r * width * 0.5);
  g.lineTo(r * length, 0);
  g.lineTo(r * length * 0.7, r * width * 0.5);
  g.fill();
  g.restore();
  g.fillStyle = '#3a3c43';
  g.beginPath();
  g.arc(x, y, r * 0.09, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#9a9ca3';
  g.beginPath();
  g.arc(x - r * 0.02, y - r * 0.02, r * 0.035, 0, Math.PI * 2);
  g.fill();
}

function label(g, x, y, r, text, dy = 0.42, size = 0.15, colour = 'rgba(244,234,214,0.75)') {
  g.fillStyle = colour;
  g.font = `600 ${Math.round(r * size)}px "Trebuchet MS", "Segoe UI", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y + r * dy);
}

/** A dial scale: value range swept between two angles, arcs, ticks and numerals. */
function scale(g, x, y, r, spec) {
  const { min, max, from, to, major, minor, numbers, arcs = [], numberScale = 1 } = spec;
  const angleOf = (v) => (from + ((v - min) / (max - min)) * (to - from)) * DEG;
  for (const arc of arcs) {
    g.strokeStyle = arc.colour;
    g.lineWidth = r * (arc.width ?? 0.075);
    g.beginPath();
    g.arc(x, y, r * (arc.radius ?? 0.86), angleOf(arc.from), angleOf(arc.to));
    g.stroke();
  }
  g.strokeStyle = CREAM;
  for (let v = min; v <= max + 1e-6; v += minor) {
    const a = angleOf(v);
    const isMajor = Math.abs((v - min) % major) < 1e-6 || Math.abs(((v - min) % major) - major) < 1e-6;
    const inner = isMajor ? 0.74 : 0.8;
    g.lineWidth = r * (isMajor ? 0.035 : 0.018);
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * inner, y + Math.sin(a) * r * inner);
    g.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
    g.stroke();
  }
  g.fillStyle = CREAM;
  g.font = `700 ${Math.round(r * 0.19)}px "Trebuchet MS", "Segoe UI", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const v of numbers) {
    const a = angleOf(v);
    g.fillText(String(Math.abs(Math.round(v * numberScale))), x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58);
  }
  return angleOf;
}

export function airspeedGauge(g, x, y, r, kt) {
  bezel(g, x, y, r);
  const angleOf = scale(g, x, y, r, {
    min: 0, max: 160, from: -90, to: 240, major: 20, minor: 10, numbers: [20, 40, 60, 80, 100, 120, 140, 160],
    arcs: [
      { from: 40, to: 100, colour: '#e9e4d8', radius: 0.8, width: 0.05 },
      { from: 48, to: 120, colour: '#3fbf5a' },
      { from: 120, to: 145, colour: '#f2c23a' },
      { from: 145, to: 160, colour: '#e0402f' },
    ],
  });
  label(g, x, y, r, 'KNOTS', 0.36);
  label(g, x, y, r, 'AIRSPEED', -0.3, 0.12);
  needle(g, x, y, r, angleOf(Math.max(0, Math.min(165, kt))));
  glass(g, x, y, r);
}

export function attitudeGauge(g, x, y, r, pitchDeg, bankDeg) {
  bezel(g, x, y, r);
  g.save();
  g.beginPath();
  g.arc(x, y, r * 0.9, 0, Math.PI * 2);
  g.clip();
  g.translate(x, y);
  g.rotate(-bankDeg * DEG);
  const shift = Math.max(-40, Math.min(40, pitchDeg)) * r * 0.028;
  const sky = g.createLinearGradient(0, -r, 0, shift);
  sky.addColorStop(0, '#1f5fa8');
  sky.addColorStop(1, '#5aa2e0');
  g.fillStyle = sky;
  g.fillRect(-r * 1.5, -r * 2, r * 3, r * 2 + shift);
  const earth = g.createLinearGradient(0, shift, 0, r);
  earth.addColorStop(0, '#8a5a2e');
  earth.addColorStop(1, '#4e321a');
  g.fillStyle = earth;
  g.fillRect(-r * 1.5, shift, r * 3, r * 2);
  g.strokeStyle = '#ffffff';
  g.lineWidth = r * 0.03;
  g.beginPath();
  g.moveTo(-r, shift);
  g.lineTo(r, shift);
  g.stroke();
  g.lineWidth = r * 0.018;
  for (const p of [-20, -10, 10, 20]) {
    const py = shift - p * r * 0.028;
    const w = Math.abs(p) === 10 ? 0.22 : 0.34;
    g.beginPath();
    g.moveTo(-r * w, py);
    g.lineTo(r * w, py);
    g.stroke();
  }
  g.restore();
  g.save();
  g.translate(x, y);
  g.strokeStyle = CREAM;
  g.lineWidth = r * 0.025;
  for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const rad = (a - 90) * DEG;
    const len = Math.abs(a) % 30 === 0 ? 0.14 : 0.08;
    g.beginPath();
    g.moveTo(Math.cos(rad) * r * 0.9, Math.sin(rad) * r * 0.9);
    g.lineTo(Math.cos(rad) * r * (0.9 - len), Math.sin(rad) * r * (0.9 - len));
    g.stroke();
  }
  g.rotate(-bankDeg * DEG);
  g.fillStyle = AMBER;
  g.beginPath();
  g.moveTo(0, -r * 0.88);
  g.lineTo(-r * 0.06, -r * 0.76);
  g.lineTo(r * 0.06, -r * 0.76);
  g.fill();
  g.restore();
  g.strokeStyle = AMBER;
  g.lineWidth = r * 0.06;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - r * 0.5, y);
  g.lineTo(x - r * 0.18, y);
  g.lineTo(x - r * 0.08, y + r * 0.1);
  g.moveTo(x + r * 0.5, y);
  g.lineTo(x + r * 0.18, y);
  g.lineTo(x + r * 0.08, y + r * 0.1);
  g.stroke();
  g.lineCap = 'butt';
  g.fillStyle = AMBER;
  g.beginPath();
  g.arc(x, y, r * 0.05, 0, Math.PI * 2);
  g.fill();
  glass(g, x, y, r);
}

export function altimeterGauge(g, x, y, r, altFt) {
  bezel(g, x, y, r);
  scale(g, x, y, r, { min: 0, max: 10, from: -90, to: 270, major: 1, minor: 0.2, numbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
  label(g, x, y, r, 'ALT', -0.3, 0.13);
  const box = r * 0.26;
  g.fillStyle = '#050608';
  g.fillRect(x - box * 1.25, y + r * 0.22, box * 2.5, box * 0.95);
  g.strokeStyle = '#444';
  g.lineWidth = 1;
  g.strokeRect(x - box * 1.25, y + r * 0.22, box * 2.5, box * 0.95);
  g.fillStyle = CREAM;
  g.font = `700 ${Math.round(r * 0.2)}px "Courier New", monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(Math.max(0, Math.round(altFt))).padStart(4, '0'), x, y + r * 0.22 + box * 0.5);
  const hundreds = ((altFt % 1000) / 1000) * 360;
  const thousands = ((altFt % 10000) / 10000) * 360;
  needle(g, x, y, r, (thousands - 90) * DEG, 0.5, CREAM, 0.1);
  needle(g, x, y, r, (hundreds - 90) * DEG, 0.84);
  glass(g, x, y, r);
}

export function headingGauge(g, x, y, r, headingDeg, bugDeg = null) {
  bezel(g, x, y, r);
  g.save();
  g.translate(x, y);
  g.rotate(-headingDeg * DEG);
  g.strokeStyle = CREAM;
  g.fillStyle = CREAM;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 5) {
    const a = (d - 90) * DEG;
    const major = d % 30 === 0;
    g.lineWidth = r * (major ? 0.03 : 0.015);
    g.beginPath();
    g.moveTo(Math.cos(a) * r * (d % 10 === 0 ? 0.76 : 0.82), Math.sin(a) * r * (d % 10 === 0 ? 0.76 : 0.82));
    g.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
    g.stroke();
    if (major) {
      const text = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10);
      g.save();
      g.translate(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
      g.rotate(d * DEG);
      g.fillStyle = d % 90 === 0 ? AMBER : CREAM;
      g.font = `700 ${Math.round(r * (d % 90 === 0 ? 0.22 : 0.16))}px "Trebuchet MS", sans-serif`;
      g.fillText(text, 0, 0);
      g.restore();
    }
  }
  if (bugDeg !== null) {
    const a = (bugDeg - 90) * DEG;
    g.fillStyle = '#ff6a3d';
    g.save();
    g.rotate(a + Math.PI / 2);
    g.fillRect(-r * 0.07, -r * 0.97, r * 0.14, r * 0.1);
    g.restore();
  }
  g.restore();
  g.fillStyle = AMBER;
  g.strokeStyle = AMBER;
  g.lineWidth = r * 0.05;
  g.beginPath();
  g.moveTo(x, y - r * 0.36);
  g.lineTo(x, y + r * 0.3);
  g.moveTo(x - r * 0.26, y - r * 0.05);
  g.lineTo(x + r * 0.26, y - r * 0.05);
  g.moveTo(x - r * 0.12, y + r * 0.26);
  g.lineTo(x + r * 0.12, y + r * 0.26);
  g.stroke();
  g.beginPath();
  g.moveTo(x, y - r * 0.98);
  g.lineTo(x - r * 0.07, y - r * 0.86);
  g.lineTo(x + r * 0.07, y - r * 0.86);
  g.fill();
  glass(g, x, y, r);
}

export function verticalSpeedGauge(g, x, y, r, fpm) {
  bezel(g, x, y, r);
  const angleOf = scale(g, x, y, r, { min: -2000, max: 2000, from: 10, to: 350, major: 500, minor: 100, numbers: [-1500, -1000, -500, 0, 500, 1000, 1500], numberScale: 0.01 });
  label(g, x, y, r, 'VERT SPEED', -0.3, 0.12);
  label(g, x, y, r, '100 FT/MIN', 0.34, 0.11);
  g.fillStyle = 'rgba(244,234,214,0.7)';
  g.font = `700 ${Math.round(r * 0.14)}px sans-serif`;
  g.fillText('UP', x - r * 0.45, y - r * 0.16);
  g.fillText('DN', x - r * 0.45, y + r * 0.18);
  needle(g, x, y, r, angleOf(Math.max(-2050, Math.min(2050, fpm))));
  glass(g, x, y, r);
}

export function engineGauge(g, x, y, r, rpm, fuelPct) {
  bezel(g, x, y, r);
  const angleOf = scale(g, x, y, r, {
    min: 0, max: 30, from: 150, to: 390, major: 5, minor: 1, numbers: [0, 5, 10, 15, 20, 25, 30],
    arcs: [{ from: 21, to: 27, colour: '#3fbf5a' }, { from: 27, to: 30, colour: '#e0402f' }],
  });
  label(g, x, y, r, 'RPM x100', -0.28, 0.12);
  const fy = y + r * 0.42;
  const fr = r * 0.34;
  g.strokeStyle = '#3a3c43';
  g.lineWidth = r * 0.07;
  g.beginPath();
  g.arc(x, fy, fr, Math.PI * 1.15, Math.PI * 1.85);
  g.stroke();
  g.strokeStyle = fuelPct < 15 ? '#e0402f' : '#f2c23a';
  g.beginPath();
  g.arc(x, fy, fr, Math.PI * 1.15, Math.PI * (1.15 + 0.7 * Math.max(0, Math.min(1, fuelPct / 100))));
  g.stroke();
  g.fillStyle = CREAM;
  g.font = `700 ${Math.round(r * 0.13)}px sans-serif`;
  g.textAlign = 'center';
  g.fillText('E', x - fr * 0.95, fy - fr * 0.22);
  g.fillText('F', x + fr * 0.95, fy - fr * 0.22);
  g.fillText(`FUEL ${Math.round(fuelPct)}%`, x, fy + r * 0.12);
  needle(g, x, y, r, angleOf(Math.max(0, Math.min(31, rpm / 100))));
  glass(g, x, y, r);
}

/** All six instruments in a row (or the given slots), from one readout object. */
export function drawSixPack(g, slots, r, data) {
  airspeedGauge(g, slots[0].x, slots[0].y, r, data.kt);
  attitudeGauge(g, slots[1].x, slots[1].y, r, data.pitchDeg, data.bankDeg);
  altimeterGauge(g, slots[2].x, slots[2].y, r, data.altFt);
  headingGauge(g, slots[3].x, slots[3].y, r, data.headingDeg, data.bugDeg);
  verticalSpeedGauge(g, slots[4].x, slots[4].y, r, data.vsFpm);
  engineGauge(g, slots[5].x, slots[5].y, r, data.rpm, data.fuel);
}
