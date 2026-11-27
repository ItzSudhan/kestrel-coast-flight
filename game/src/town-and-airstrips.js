// What people built on the coast: both airstrips with painted numbers, piano keys and
// centrelines, approach and edge lights, a working PAPI, hangars, windsocks and fuel tanks;
// the harbour town of little coloured houses with lit windows, its pier and boats; the road to
// the field; and the island forests.
import * as THREE from 'three';
import { AIRSTRIPS, TOWN, runwayAxes, runwayThreshold } from './places.js';
import { createRandom } from './random.js';
import { forestDensity, scatter, terrainHeight, terrainSlope } from './terrain-height.js';
import { shareAtmosphere } from './world-sky.js';

function runwayTexture(strip) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 4096;
  const g = canvas.getContext('2d');
  const scale = canvas.height / strip.length;
  g.fillStyle = '#827a74';
  g.fillRect(0, 0, 256, 4096);
  const random = createRandom(strip.length);
  for (let i = 0; i < 2600; i += 1) {
    g.fillStyle = random() > 0.5 ? 'rgba(150,142,134,0.45)' : 'rgba(96,90,88,0.45)';
    g.fillRect(random() * 256, random() * 4096, 3 + random() * 14, 2 + random() * 30);
  }
  g.fillStyle = 'rgba(30,28,30,0.35)';
  for (let y = 600; y < 3500; y += 3) g.fillRect(118 + Math.sin(y * 0.01) * 6, y, 20, 3);
  g.fillStyle = '#f2efe6';
  g.fillRect(10, 0, 6, 4096);
  g.fillRect(240, 0, 6, 4096);
  const dash = 30 * scale;
  for (let y = 300; y < 4096 - 300; y += dash * 2) g.fillRect(124, y, 8, dash);
  const drawEnd = (name, flip) => {
    g.save();
    if (flip) {
      g.translate(256, 4096);
      g.rotate(Math.PI);
    }
    for (let k = 0; k < 8; k += 1) g.fillRect(22 + k * 28 + (k >= 4 ? 12 : 0), 4096 - 30, 14, -150);
    g.font = 'bold 150px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.save();
    g.translate(128, 4096 - 330);
    g.scale(0.82, 1.9);
    g.fillText(name, 0, 0);
    g.restore();
    for (const y of [4096 - 560, 4096 - 700]) {
      g.fillRect(48, y, 24, -70);
      g.fillRect(184, y, 24, -70);
    }
    g.restore();
  };
  drawEnd(strip.ends[0], false);
  drawEnd(strip.ends[1], true);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  return texture;
}

let glowTexture = null;
/** A soft round glow for lights seen from far off. */
export function glowSprite() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

function lightPoints(list, size) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(list.flatMap((l) => [l.x, l.y, l.z]), 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(list.flatMap((l) => [l.color.r, l.color.g, l.color.b]), 3));
  const material = new THREE.PointsMaterial({ size, sizeAttenuation: false, map: glowSprite(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  return new THREE.Points(geometry, material);
}

function buildRunway(strip, group, papis) {
  const { ax, az, rx, rz } = runwayAxes(strip);
  const angle = (-strip.heading * Math.PI) / 180;
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(strip.width + 26, strip.length + 60), shareAtmosphere(new THREE.MeshLambertMaterial({ color: '#8d9a5a', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -20 })));
  pad.rotation.x = -Math.PI / 2;
  pad.rotation.z = angle;
  pad.position.set(strip.x, strip.elev + 0.05, strip.z);
  pad.receiveShadow = true;
  group.add(pad);
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(strip.width, strip.length), shareAtmosphere(new THREE.MeshLambertMaterial({ map: runwayTexture(strip), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -60 })));
  runway.rotation.x = -Math.PI / 2;
  runway.rotation.z = angle;
  runway.position.set(strip.x, strip.elev + 0.25, strip.z);
  runway.receiveShadow = true;
  group.add(runway);

  const lights = [];
  const white = new THREE.Color('#fff1c9');
  const amber = new THREE.Color('#ffb54a');
  const green = new THREE.Color('#5dff8a');
  const red = new THREE.Color('#ff4a3a');
  const half = strip.length / 2;
  for (let s = -half; s <= half; s += 50) {
    for (const side of [-1, 1]) lights.push({ x: strip.x + ax * s + rx * side * (strip.width / 2 + 2), y: strip.elev + 0.8, z: strip.z + az * s + rz * side * (strip.width / 2 + 2), color: white });
  }
  for (const reversed of [false, true]) {
    const t = runwayThreshold(strip, reversed);
    const trx = -t.az;
    const trz = t.ax;
    for (let k = -4; k <= 4; k += 1) {
      lights.push({ x: t.x + trx * k * 4 - t.ax * 1.5, y: strip.elev + 0.8, z: t.z + trz * k * 4 - t.az * 1.5, color: green });
      lights.push({ x: t.x + trx * k * 4 + t.ax * (strip.length - 1.5), y: strip.elev + 0.8, z: t.z + trz * k * 4 + t.az * (strip.length - 1.5), color: red });
    }
    for (let d = 60; d <= 480; d += 60) {
      const ground = Math.max(terrainHeight(t.x - t.ax * d, t.z - t.az * d), 0);
      const y = Math.max(ground + 2, strip.elev + 0.8);
      const width = d % 180 === 0 ? 5 : 3;
      for (let k = -width; k <= width; k += 1) lights.push({ x: t.x - t.ax * d + trx * k * 2.6, y, z: t.z - t.az * d + trz * k * 2.6, color: d % 180 === 0 ? amber : white });
      if (ground < strip.elev - 1) {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.4, y - ground, 0.4), new THREE.MeshLambertMaterial({ color: '#6a5d52' }));
        pole.position.set(t.x - t.ax * d, (y + ground) / 2, t.z - t.az * d);
        group.add(pole);
      }
    }
    papis.push({ strip, threshold: t, x: t.x + t.ax * 150 - trx * (strip.width / 2 + 12), z: t.z + t.az * 150 - trz * (strip.width / 2 + 12), trx, trz });
  }
  group.add(lightPoints(lights, 4.5));

  // Hangar, fuel tank and windsock beside the field.
  const side = 1;
  const hx = strip.x + rx * side * (strip.width / 2 + 60);
  const hz = strip.z + rz * side * (strip.width / 2 + 60);
  const hangar = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 34, 12, 1, false, 0, Math.PI), shareAtmosphere(new THREE.MeshLambertMaterial({ color: '#b9603f', flatShading: true })));
  shell.rotation.z = Math.PI / 2;
  shell.rotation.y = Math.PI / 2;
  shell.castShadow = true;
  hangar.add(shell);
  const door = new THREE.Mesh(new THREE.CircleGeometry(13.6, 12, 0, Math.PI), new THREE.MeshLambertMaterial({ color: '#3e3a3a', side: THREE.DoubleSide }));
  door.position.z = -17.05;
  door.rotation.y = Math.PI;
  hangar.add(door);
  hangar.position.set(hx, strip.elev, hz);
  hangar.rotation.y = angle;
  group.add(hangar);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 6, 14), shareAtmosphere(new THREE.MeshLambertMaterial({ color: '#e7e0cf', flatShading: true })));
  tank.position.set(hx + ax * 40, strip.elev + 3, hz + az * 40);
  group.add(tank);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 6), new THREE.MeshLambertMaterial({ color: '#dcdcdc' }));
  const wx = strip.x - rx * (strip.width / 2 + 30) + ax * (strip.length / 2 - 180);
  const wz = strip.z - rz * (strip.width / 2 + 30) + az * (strip.length / 2 - 180);
  mast.position.set(wx, strip.elev + 4, wz);
  group.add(mast);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 10, 1, true), new THREE.MeshLambertMaterial({ color: '#ff7a2a', side: THREE.DoubleSide }));
  sock.rotation.x = Math.PI / 2;
  sock.position.set(wx, strip.elev + 7.6, wz + 2.5);
  group.add(sock);
}

function prismGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 0.5);
  shape.lineTo(-0.5, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geometry.translate(0, 0, -0.5);
  return geometry;
}

const WALLS = ['#f2e3c6', '#e9a77c', '#8fb7c9', '#f0d27a', '#d98c7a', '#f5f0e6', '#a7c79a', '#c97f5a'];
const ROOFS = ['#8e3b2e', '#4f5d73', '#a5532f', '#3f4f4a', '#7a3b3b'];

function buildTown(group) {
  const random = createRandom(909);
  const spots = [];
  for (let i = 0; i < 900 && spots.length < 150; i += 1) {
    const angle = random() * Math.PI * 2;
    const dist = Math.sqrt(random()) * TOWN.radius;
    const x = TOWN.x + Math.cos(angle) * dist;
    const z = TOWN.z + Math.sin(angle) * dist;
    const h = terrainHeight(x, z);
    if (h < 1.8 || h > 60 || terrainSlope(x, z) > 0.3) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 17)) continue;
    spots.push({ x, z, h });
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const walls = new THREE.InstancedMesh(box, shareAtmosphere(new THREE.MeshLambertMaterial({ flatShading: true })), spots.length);
  const roofs = new THREE.InstancedMesh(prismGeometry(), shareAtmosphere(new THREE.MeshLambertMaterial({ flatShading: true })), spots.length);
  const windowGeometry = new THREE.PlaneGeometry(1, 1);
  const windows = new THREE.InstancedMesh(windowGeometry, new THREE.MeshBasicMaterial({ color: '#ffcf73', fog: true, side: THREE.DoubleSide }), spots.length * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const colour = new THREE.Color();
  spots.forEach((s, i) => {
    const w = 7 + random() * 5;
    const d = 6 + random() * 4;
    const tall = 5 + random() * 4 + (random() > 0.85 ? 3 : 0);
    const facing = Math.atan2(TOWN.x - s.x, TOWN.z - s.z) + (random() - 0.5) * 0.5;
    q.setFromAxisAngle(up, facing);
    m.compose(new THREE.Vector3(s.x, s.h - 0.5, s.z), q, new THREE.Vector3(w, tall + 0.5, d));
    walls.setMatrixAt(i, m);
    walls.setColorAt(i, colour.set(WALLS[Math.floor(random() * WALLS.length)]));
    m.compose(new THREE.Vector3(s.x, s.h + tall, s.z), q, new THREE.Vector3(w + 1, 4 + random() * 2, d + 1));
    roofs.setMatrixAt(i, m);
    roofs.setColorAt(i, colour.set(ROOFS[Math.floor(random() * ROOFS.length)]));
    for (let k = 0; k < 2; k += 1) {
      const lit = random() > 0.35;
      const off = new THREE.Vector3((k - 0.5) * w * 0.45, tall * 0.55, d / 2 + 0.05).applyQuaternion(q);
      m.compose(new THREE.Vector3(s.x + off.x, s.h + off.y, s.z + off.z), q, lit ? new THREE.Vector3(1.4, 1.6, 1) : new THREE.Vector3(0.001, 0.001, 1));
      windows.setMatrixAt(i * 2 + k, m);
    }
  });
  walls.castShadow = true;
  group.add(walls, roofs, windows);

  // Pier and moored boats on the town's sea side.
  const pierMat = shareAtmosphere(new THREE.MeshLambertMaterial({ color: '#7a5b43', flatShading: true }));
  const random2 = createRandom(77);
  let shoreX = TOWN.x;
  let shoreZ = TOWN.z;
  for (let step = 0; step < 60; step += 1) {
    if (terrainHeight(shoreX, shoreZ) < 0.3) break;
    shoreZ += 20;
  }
  const pier = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 160), pierMat);
  pier.position.set(shoreX, 1.1, shoreZ + 70);
  group.add(pier);
  const hullMat = shareAtmosphere(new THREE.MeshLambertMaterial({ color: '#2f5c78', flatShading: true }));
  const cabinMat = shareAtmosphere(new THREE.MeshLambertMaterial({ color: '#f4efe4', flatShading: true }));
  for (let k = 0; k < 7; k += 1) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 10), k % 3 === 0 ? pierMat : hullMat);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 3.2), cabinMat);
    cabin.position.set(0, 1.4, -1);
    boat.add(hull, cabin);
    boat.position.set(shoreX + (k % 2 ? 9 : -9), 0.4, shoreZ + 25 + k * 19);
    boat.rotation.y = (random2() - 0.5) * 0.3;
    group.add(boat);
  }
  return spots;
}

function buildRoad(group, points) {
  const positions = [];
  const half = 3.2;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 12);
    for (let k = 0; k < steps; k += 1) {
      const t0 = k / steps;
      const t1 = (k + 1) / steps;
      const ax = x0 + (x1 - x0) * t0;
      const az = z0 + (z1 - z0) * t0;
      const bx = x0 + (x1 - x0) * t1;
      const bz = z0 + (z1 - z0) * t1;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (-(bz - az) / len) * half;
      const nz = ((bx - ax) / len) * half;
      const ha = Math.max(terrainHeight(ax, az), 0.5) + 0.35;
      const hb = Math.max(terrainHeight(bx, bz), 0.5) + 0.35;
      positions.push(ax + nx, ha, az + nz, ax - nx, ha, az - nz, bx + nx, hb, bz + nz);
      positions.push(ax - nx, ha, az - nz, bx - nx, hb, bz - nz, bx + nx, hb, bz + nz);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const road = new THREE.Mesh(geometry, shareAtmosphere(new THREE.MeshLambertMaterial({ color: '#8a7a68', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })));
  road.receiveShadow = true;
  group.add(road);
}

function buildForests(group) {
  const spacing = 30;
  const list = [];
  for (let x = -5000; x < 7000; x += spacing) {
    for (let z = -4600; z < 4600; z += spacing) {
      const ix = Math.round(x / spacing);
      const iz = Math.round(z / spacing);
      const px = x + (scatter(ix, iz, 1) - 0.5) * spacing * 0.9;
      const pz = z + (scatter(ix, iz, 2) - 0.5) * spacing * 0.9;
      const density = forestDensity(px, pz);
      if (density < 0.5 || scatter(ix, iz, 3) > 0.35 + density * 0.6) continue;
      list.push({ x: px, z: pz, h: terrainHeight(px, pz), s: 0.75 + scatter(ix, iz, 4) * 0.5, tone: scatter(ix, iz, 5) });
    }
  }
  const cone = new THREE.ConeGeometry(4.6, 13, 6);
  cone.translate(0, 7.5, 0);
  const trees = new THREE.InstancedMesh(cone, shareAtmosphere(new THREE.MeshLambertMaterial({ flatShading: true })), list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const colour = new THREE.Color();
  list.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.tone * 6);
    m.compose(new THREE.Vector3(t.x, t.h - 1, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + t.tone * 0.3), t.s));
    trees.setMatrixAt(i, m);
    colour.set(t.tone > 0.66 ? '#3f6b3a' : t.tone > 0.33 ? '#2f5a37' : '#4d7a3f');
    trees.setColorAt(i, colour);
  });
  trees.castShadow = false;
  trees.receiveShadow = true;
  group.add(trees);
  return list.length;
}

/** Everything built on the islands; returns the group and the PAPI units to update each frame. */
export function createSettlements() {
  const group = new THREE.Group();
  const papis = [];
  for (const strip of AIRSTRIPS) buildRunway(strip, group, papis);
  buildTown(group);
  const kestrel = AIRSTRIPS[0];
  buildRoad(group, [[TOWN.x, TOWN.z], [TOWN.x - 120, TOWN.z - 400], [kestrel.x + 200, kestrel.z + 140], [kestrel.x + 200, kestrel.z + 60]]);
  buildRoad(group, [[TOWN.x, TOWN.z], [TOWN.x + 700, TOWN.z - 150], [TOWN.x + 1500, TOWN.z - 500], [TOWN.x + 2200, TOWN.z - 700]]);
  buildForests(group);
  const papiLights = [];
  for (const papi of papis) {
    for (let k = 0; k < 4; k += 1) papiLights.push({ x: papi.x - papi.trx * k * 9, y: papi.strip.elev + 1, z: papi.z - papi.trz * k * 9, color: new THREE.Color('#ffffff') });
  }
  const papiPoints = lightPoints(papiLights, 7);
  group.add(papiPoints);
  return { group, papis, papiPoints };
}

/**
 * Light the PAPI boxes for the viewer's glide angle: four white is high, two red two white is
 * on the 3.5° path, four red is low.
 */
export function updatePapi(settlements, eye) {
  const colours = settlements.papiPoints.geometry.getAttribute('color');
  settlements.papis.forEach((papi, i) => {
    const dist = Math.hypot(eye.x - papi.x, eye.z - papi.z);
    const angle = (Math.atan2(eye.y - papi.strip.elev, dist) * 180) / Math.PI;
    const limits = [2.9, 3.3, 3.7, 4.1];
    for (let k = 0; k < 4; k += 1) {
      const white = angle > limits[k];
      colours.setXYZ(i * 4 + k, white ? 1 : 1, white ? 1 : 0.22, white ? 0.95 : 0.15);
    }
  });
  colours.needsUpdate = true;
}
