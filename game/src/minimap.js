// The round moving map: the islands painted once from the height grid, the storm's edge, the
// ring route, airstrips, lighthouse, town and the flare boat, with the aircraft at the centre.
// M opens it full size.
import { AIRSTRIPS, ISLANDS, LIGHTHOUSE, MAP, TOWN, runwayAxes } from './places.js';
import { STORM_NORMAL, STORM_ORIGIN, stormWallOffset } from './storm-front.js';

/** Paint the islands from the height grid into an offscreen canvas, one pixel per grid cell. */
export function paintMapImage(grid) {
  const canvas = document.createElement('canvas');
  canvas.width = grid.cols;
  canvas.height = grid.rows;
  const g = canvas.getContext('2d');
  const image = g.createImageData(grid.cols, grid.rows);
  for (let i = 0; i < grid.heights.length; i += 1) {
    const h = grid.heights[i];
    let c;
    if (h < -12) c = [24, 60, 84];
    else if (h < 0.4) c = [44, 112, 128];
    else if (h < 3.5) c = [226, 202, 150];
    else if (h < 60) c = [112, 150, 74];
    else if (h < 140) c = [86, 122, 64];
    else c = [140, 128, 96];
    image.data[i * 4] = c[0];
    image.data[i * 4 + 1] = c[1];
    image.data[i * 4 + 2] = c[2];
    image.data[i * 4 + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Draw the map in a circle of radius `r` at (cx, cy) showing `range` metres to its edge, centred
 * on the aircraft (or on the whole chain when `whole`).
 */
export function drawMinimap(g, image, cx, cy, r, range, session, whole = false) {
  const a = session.aircraft;
  const centreX = whole ? (MAP.minX + MAP.maxX) / 2 : a.pos.x;
  const centreZ = whole ? (MAP.minZ + MAP.maxZ) / 2 : a.pos.z;
  const k = r / range;
  const sx = (x) => cx + (x - centreX) * k;
  const sy = (z) => cy + (z - centreZ) * k;
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = '#183c54';
  g.fill();
  g.clip();
  g.imageSmoothingEnabled = true;
  g.drawImage(image, sx(MAP.minX), sy(MAP.minZ), (MAP.maxX - MAP.minX) * k, (MAP.maxZ - MAP.minZ) * k);
  const offset = stormWallOffset(session.storm.km);
  const px = STORM_ORIGIN.x + STORM_NORMAL.x * offset;
  const pz = STORM_ORIGIN.z + STORM_NORMAL.z * offset;
  const tx = -STORM_NORMAL.z;
  const tz = STORM_NORMAL.x;
  const far = 30000;
  g.fillStyle = 'rgba(30,32,50,0.72)';
  g.beginPath();
  g.moveTo(sx(px - tx * far), sy(pz - tz * far));
  g.lineTo(sx(px + tx * far), sy(pz + tz * far));
  g.lineTo(sx(px + tx * far + STORM_NORMAL.x * far), sy(pz + tz * far + STORM_NORMAL.z * far));
  g.lineTo(sx(px - tx * far + STORM_NORMAL.x * far), sy(pz - tz * far + STORM_NORMAL.z * far));
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(190,160,255,0.95)';
  g.setLineDash([5, 4]);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(sx(px - tx * far), sy(pz - tz * far));
  g.lineTo(sx(px + tx * far), sy(pz + tz * far));
  g.stroke();
  g.setLineDash([]);
  for (const strip of AIRSTRIPS) {
    const { ax, az } = runwayAxes(strip);
    g.strokeStyle = '#ffffff';
    g.lineWidth = Math.max(3, strip.width * k * 2.5);
    g.beginPath();
    g.moveTo(sx(strip.x - (ax * strip.length) / 2), sy(strip.z - (az * strip.length) / 2));
    g.lineTo(sx(strip.x + (ax * strip.length) / 2), sy(strip.z + (az * strip.length) / 2));
    g.stroke();
  }
  if (session.rings.length) {
    g.strokeStyle = 'rgba(255,214,140,0.85)';
    g.lineWidth = 1.6;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(sx(a.pos.x), sy(a.pos.z));
    for (let i = session.nextRing; i < session.rings.length; i += 1) g.lineTo(sx(session.rings[i].x), sy(session.rings[i].z));
    g.lineTo(sx(AIRSTRIPS[0].x - 500), sy(AIRSTRIPS[0].z));
    g.stroke();
    g.setLineDash([]);
    session.rings.forEach((ring, i) => {
      const next = i === session.nextRing;
      g.fillStyle = ring.passed ? '#5dff8a' : next ? '#ffb347' : '#6fe7ff';
      g.beginPath();
      g.arc(sx(ring.x), sy(ring.z), next ? 6 : 4, 0, Math.PI * 2);
      g.fill();
      if (next) {
        g.strokeStyle = '#fff';
        g.lineWidth = 1.5;
        g.stroke();
      }
    });
  }
  g.fillStyle = '#ffe9a8';
  g.beginPath();
  g.arc(sx(LIGHTHOUSE.x), sy(LIGHTHOUSE.z), 4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f08a6a';
  g.fillRect(sx(TOWN.x) - 4, sy(TOWN.z) - 4, 8, 8);
  if (session.mission.boat) {
    g.fillStyle = '#ff3a2a';
    g.beginPath();
    g.arc(sx(session.mission.boat.x), sy(session.mission.boat.z), 5, 0, Math.PI * 2);
    g.fill();
  }
  if (whole) {
    g.font = '800 13px "Trebuchet MS", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const labels = [
      [AIRSTRIPS[0].name.toUpperCase(), AIRSTRIPS[0].x, AIRSTRIPS[0].z - 160],
      [AIRSTRIPS[1].name.toUpperCase(), AIRSTRIPS[1].x, AIRSTRIPS[1].z - 620],
      [TOWN.name.toUpperCase(), TOWN.x, TOWN.z + 220],
      [LIGHTHOUSE.name.toUpperCase(), LIGHTHOUSE.x, LIGHTHOUSE.z + 420],
      ...ISLANDS.filter((i) => !i.name.startsWith('Kestrel') && !i.name.startsWith('Puffin') && !i.name.startsWith('Gannet')).map((i) => [i.name.toUpperCase(), i.x, i.z + i.rz + 180]),
      ['STORM FRONT', px + STORM_NORMAL.x * 700, pz + STORM_NORMAL.z * 700],
    ];
    for (const [name, x, z] of labels) {
      g.fillStyle = 'rgba(10,12,20,0.7)';
      const w = g.measureText(name).width + 10;
      g.fillRect(sx(x) - w / 2, sy(z) - 9, w, 18);
      g.fillStyle = name === 'STORM FRONT' ? '#c9b4ff' : '#fff1d6';
      g.fillText(name, sx(x), sy(z));
    }
  }
  g.restore();

  // The aircraft.
  g.save();
  g.translate(sx(a.pos.x), sy(a.pos.z));
  g.rotate(a.heading);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -10);
  g.lineTo(7, 7);
  g.lineTo(0, 3);
  g.lineTo(-7, 7);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();

  g.strokeStyle = 'rgba(255,214,160,0.75)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#ffb347';
  g.font = '700 14px "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('N', cx, cy - r + 11);
}
