// Labels pinned to the 3D world: the tag on the next target ("TARGET RING 8/8 · 222 M", the
// flare boat, or the runway on final), an edge arrow when it is off screen, and the runway
// name boards ("RUNWAY 09 · KESTREL FIELD") on a leader line to each threshold in view.
import { AIRSTRIPS, landingEnd, runwayThreshold } from './places.js';
import { AMBER, CYAN, FONT, text } from './hud-paint.js';

/** The next thing the pilot is flying to, for the tape bug and the screen marker. */
export function currentTarget(session) {
  const m = session.mission;
  if (session.rings.length && session.nextRing < session.rings.length) {
    const ring = session.rings[session.nextRing];
    return { x: ring.x, y: ring.y, z: ring.z, label: `TARGET RING ${session.nextRing + 1}/${session.rings.length}`, colour: AMBER, ring: true };
  }
  if (m.boat && !session.crate?.landed) return { x: m.boat.x, y: 4, z: m.boat.z, label: 'FLARE BOAT · FINN', colour: '#ff6a5a' };
  const strip = AIRSTRIPS.find((s) => s.id === session.destination) ?? AIRSTRIPS[0];
  const headingDeg = (session.aircraft.heading * 180) / Math.PI;
  const t = runwayThreshold(strip, landingEnd(strip, headingDeg));
  return { x: t.x, y: strip.elev, z: t.z, label: `RUNWAY ${t.name} · ${strip.name.toUpperCase()}`, colour: CYAN, runway: strip.id };
}

function distanceText(metres) {
  return metres > 1000 ? `${(metres / 1000).toFixed(1)} KM` : `${Math.round(metres)} M`;
}

/** Inside the clear middle of the screen (not under the HUD's panels)? */
function inView(p, W, H) {
  return p.visible && p.x > 40 && p.x < W - 40 && p.y > 110 && p.y < H - 220;
}

function labelBox(g, label, x, y, size, colour) {
  g.font = `800 ${size}px ${FONT}`;
  const w = g.measureText(label).width + size * 1.1;
  const h = size * 1.5;
  g.fillStyle = 'rgba(8,10,16,0.78)';
  g.beginPath();
  g.roundRect(x - w / 2, y - h / 2, w, h, 6);
  g.fill();
  g.strokeStyle = colour;
  g.lineWidth = 1.6;
  g.stroke();
  text(g, label, x, y + 1, size, colour, 'center', 800);
  return w;
}

/** The marker on the next target: corner brackets and its tag, or an arrow at the edge. */
export function drawTargetMarker(g, frame, target) {
  const p = frame.project(target.x, target.y, target.z);
  const a = frame.session.aircraft;
  const dist = Math.hypot(target.x - a.pos.x, target.z - a.pos.z);
  const W = frame.designWidth;
  const H = frame.designHeight;
  const label = `${target.label} · ${distanceText(dist)}`;
  if (inView(p, W, H)) {
    if (target.runway) return; // the runway board below carries it
    const s = 16;
    g.strokeStyle = target.colour;
    g.lineWidth = 2.5;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.beginPath();
      g.moveTo(p.x + dx * s, p.y + dy * (s - 8));
      g.lineTo(p.x + dx * s, p.y + dy * s);
      g.lineTo(p.x + dx * (s - 8), p.y + dy * s);
      g.stroke();
    }
    labelBox(g, label, p.x, p.y - s - 22, 17, target.colour);
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
  g.fillStyle = target.colour;
  g.beginPath();
  g.moveTo(16, 0);
  g.lineTo(-8, -11);
  g.lineTo(-8, 11);
  g.fill();
  g.restore();
  // Keep the label in the clear middle, off the side panels.
  g.font = `800 15px ${FONT}`;
  const half = (g.measureText(label).width + 17) / 2;
  labelBox(g, label, Math.max(330 + half, Math.min(W - 330 - half, ex)), ey + 26, 15, target.colour);
}

/**
 * Name boards for the runways in view: "RUNWAY 09 · KESTREL FIELD" on a leader line to the
 * threshold the aircraft would land on, with the distance when it is the strip being flown to.
 */
export function drawRunwayTags(g, frame, target) {
  const a = frame.session.aircraft;
  const W = frame.designWidth;
  const H = frame.designHeight;
  const headingDeg = (a.heading * 180) / Math.PI;
  for (const strip of AIRSTRIPS) {
    const t = runwayThreshold(strip, landingEnd(strip, headingDeg));
    const dist = Math.hypot(t.x - a.pos.x, t.z - a.pos.z);
    if (dist > 7000 || dist < 60) continue;
    const p = frame.project(t.x, strip.elev + 1, t.z);
    if (!inView(p, W, H)) continue;
    const flying = target.runway === strip.id;
    const label = `RUNWAY ${t.name} · ${strip.name.toUpperCase()}${flying ? ` · ${distanceText(dist)}` : ''}`;
    g.font = `800 18px ${FONT}`;
    const w = g.measureText(label).width + 20;
    // Board down-left of the threshold, else down-right, else above it: never over the aircraft
    // (the chase view keeps her low in the middle) and never off the screen.
    const cockpit = frame.view === 'cockpit';
    const plane = cockpit ? { x0: 0, x1: 0, y0: 0, y1: 0 } : { x0: W / 2 - 160, x1: W / 2 + 160, y0: H * 0.58, y1: H * 0.8 };
    const floor = cockpit ? H - 384 : H - 236;
    const below = p.y + 40 < floor ? p.y + 40 : -999;
    const spots = [
      { x: p.x - 70 - w / 2, y: below },
      { x: p.x + 70 + w / 2, y: below },
      { x: Math.max(240 + w / 2, Math.min(W - 240 - w / 2, p.x)), y: p.y - 44 },
    ];
    const fits = (s) => s.y > 0 && s.x - w / 2 > 230 && s.x + w / 2 < W - 230 && !(s.x + w / 2 > plane.x0 && s.x - w / 2 < plane.x1 && s.y + 14 > plane.y0 && s.y - 14 < plane.y1);
    const spot = spots.find(fits) ?? spots[2];
    const bx = spot.x;
    const by = spot.y;
    g.strokeStyle = CYAN;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(Math.max(bx - w / 2, Math.min(bx + w / 2, p.x)), by + (by > p.y ? -14 : 14));
    g.stroke();
    g.fillStyle = CYAN;
    g.beginPath();
    g.arc(p.x, p.y, 4, 0, Math.PI * 2);
    g.fill();
    labelBox(g, label, bx, by, 18, CYAN);
  }
}
