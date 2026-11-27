// Things that show what the aircraft is doing: wing-tip vapour trails in hard turns, engine
// smoke when it is hurt, a dust puff on touchdown, and the wreck: tumbling debris, fire and a
// column of smoke. Also the rescue sortie's flare boat, its red smoke and the dropped crate.
import * as THREE from 'three';
import { createRandom } from './random.js';
import { glowSprite } from './town-and-airstrips.js';

const TRAIL_POINTS = 70;

function smokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createEffects(scene) {
  const trails = [0, 1].map(() => {
    const positions = new Float32Array(TRAIL_POINTS * 3);
    const colours = new Float32Array(TRAIL_POINTS * 4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 4));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    line.frustumCulled = false;
    scene.add(line);
    return { line, points: [], strength: 0 };
  });
  const smoke = smokeTexture();
  const puffs = [];
  for (let i = 0; i < 90; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color: '#555', transparent: true, depthWrite: false, opacity: 0 }));
    sprite.visible = false;
    scene.add(sprite);
    puffs.push({ sprite, life: 0, max: 1, vel: new THREE.Vector3(), grow: 1 });
  }
  const debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.25, 0.8), new THREE.MeshStandardMaterial({ color: '#d9cdb5', flatShading: true }), 26);
  debrisMesh.visible = false;
  scene.add(debrisMesh);
  const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ff7a2a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  fire.visible = false;
  scene.add(fire);

  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1, 7), new THREE.MeshLambertMaterial({ color: '#c9b48a', flatShading: true }));
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ff3a2a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
  flare.scale.set(30, 30, 1);
  flare.position.y = 3;
  boat.add(hull, flare);
  boat.visible = false;
  scene.add(boat);
  const crate = new THREE.Group();
  crate.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshLambertMaterial({ color: '#9a6a3c' })));
  const chute = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ff8a2a', side: THREE.DoubleSide }));
  chute.position.y = 5;
  crate.add(chute);
  crate.visible = false;
  scene.add(crate);

  // The crash replay's path: the last ten seconds, drawn as a glowing line in the world.
  const trackGeometry = new THREE.BufferGeometry();
  trackGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
  trackGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
  const track = new THREE.Line(trackGeometry, new THREE.LineBasicMaterial({ vertexColors: true, fog: false }));
  track.frustumCulled = false;
  track.visible = false;
  scene.add(track);
  const ghost = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ffffff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
  ghost.scale.set(14, 14, 1);
  ghost.visible = false;
  scene.add(ghost);

  return { trails, puffs, nextPuff: 0, debrisMesh, debris: [], fire, boat, crate, flare, track, ghost, trackPath: null, random: createRandom(5), puffTimer: 0, wreckAt: null };
}

/**
 * Show the crash report's path (crash-report.js) in the world: cyan, red where the wing was
 * stalled, with a light that flies it again in a loop. Null hides it.
 */
export function showReplayPath(fx, path) {
  fx.trackPath = path && path.length > 1 ? path : null;
  fx.track.visible = Boolean(fx.trackPath);
  fx.ghost.visible = Boolean(fx.trackPath);
  if (!fx.trackPath) return;
  const positions = fx.track.geometry.getAttribute('position');
  const colours = fx.track.geometry.getAttribute('color');
  const count = Math.min(64, fx.trackPath.length);
  for (let i = 0; i < count; i += 1) {
    const p = fx.trackPath[i];
    positions.setXYZ(i, p.x, p.y, p.z);
    if (p.stalled) colours.setXYZ(i, 1, 0.3, 0.25);
    else colours.setXYZ(i, 0.55, 0.95, 1);
  }
  positions.needsUpdate = true;
  colours.needsUpdate = true;
  fx.track.geometry.setDrawRange(0, count);
}

/** Fly the replay light along the path, once every six seconds. */
export function updateReplayPath(fx, time) {
  if (!fx.trackPath) return;
  const path = fx.trackPath;
  const u = ((time % 6) / 6) * (path.length - 1);
  const i = Math.floor(u);
  const f = u - i;
  const a = path[i];
  const b = path[Math.min(path.length - 1, i + 1)];
  fx.ghost.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
}

function emitPuff(fx, position, colour, size, life, vel) {
  const puff = fx.puffs[fx.nextPuff];
  fx.nextPuff = (fx.nextPuff + 1) % fx.puffs.length;
  puff.sprite.position.copy(position);
  puff.sprite.material.color.set(colour);
  puff.sprite.visible = true;
  puff.life = life;
  puff.max = life;
  puff.size = size;
  puff.vel.copy(vel);
}

/** A dust puff where the wheels touch. */
export function touchdownDust(fx, pos) {
  for (let i = 0; i < 6; i += 1) {
    const r = fx.random;
    emitPuff(fx, new THREE.Vector3(pos.x + (r() - 0.5) * 3, pos.y - 1.4, pos.z + (r() - 0.5) * 3), '#d8c6a6', 4, 1.6, new THREE.Vector3((r() - 0.5) * 3, 1.2, (r() - 0.5) * 3));
  }
}

/** Throw the wreck: debris, fire and smoke at the crash site. */
export function startWreck(fx, aircraft) {
  const r = fx.random;
  fx.wreckAt = new THREE.Vector3(aircraft.pos.x, aircraft.pos.y, aircraft.pos.z);
  fx.debris = [];
  for (let i = 0; i < 26; i += 1) {
    fx.debris.push({ p: fx.wreckAt.clone(), v: new THREE.Vector3((r() - 0.5) * 30, 6 + r() * 16, (r() - 0.5) * 30), rot: new THREE.Euler(r() * 6, r() * 6, r() * 6), spin: (r() - 0.5) * 12, s: 0.4 + r() * 1.4, ground: aircraft.pos.y - 1.5 });
  }
  fx.debrisMesh.visible = true;
  fx.fire.visible = true;
  fx.fire.position.copy(fx.wreckAt);
}

export function clearWreck(fx) {
  fx.wreckAt = null;
  fx.debrisMesh.visible = false;
  fx.fire.visible = false;
  showReplayPath(fx, null);
}

/** Advance trails, puffs and debris; `model` is the aircraft model for wing-tip positions. */
export function updateEffects(fx, aircraft, model, dt, time) {
  // Vortices show in hard turns, and faintly at high angle of attack in the damp pre-storm air.
  const hard = aircraft.crashed || aircraft.onGround ? 0 : Math.max(0, Math.min(1, (aircraft.gLoad - 1.4) / 1.2 + Math.max(0, aircraft.aoa - 0.07) * 3 + aircraft.flaps * 0.12));
  fx.trails.forEach((trail, side) => {
    trail.strength += (hard - trail.strength) * Math.min(1, dt * 4);
    const tip = model.wingTips[side].clone().applyMatrix4(model.root.matrixWorld);
    trail.points.unshift(tip);
    if (trail.points.length > TRAIL_POINTS) trail.points.pop();
    const positions = trail.line.geometry.getAttribute('position');
    const colours = trail.line.geometry.getAttribute('color');
    for (let i = 0; i < TRAIL_POINTS; i += 1) {
      const p = trail.points[Math.min(i, trail.points.length - 1)];
      positions.setXYZ(i, p.x, p.y, p.z);
      colours.setXYZW(i, 1, 1, 1, trail.strength * 0.8 * (1 - i / TRAIL_POINTS));
    }
    positions.needsUpdate = true;
    colours.needsUpdate = true;
  });
  fx.puffTimer -= dt;
  // A hurt engine trails smoke: grey and thin at first, thick and black when it is failing.
  if (!aircraft.crashed && aircraft.damage.engine < 0.8 && fx.puffTimer <= 0) {
    const e = aircraft.damage.engine;
    fx.puffTimer = e < 0.6 ? 0.08 : 0.14;
    const p = new THREE.Vector3(0.4, -0.4, -3).applyMatrix4(model.root.matrixWorld);
    emitPuff(fx, p, e < 0.3 ? '#2b2b2e' : e < 0.6 ? '#777' : '#9a9aa0', e < 0.6 ? 2.5 : 1.8, 2.2, new THREE.Vector3(0, 1, 0));
  }
  if (fx.wreckAt && fx.puffTimer <= 0) {
    fx.puffTimer = 0.07;
    const r = fx.random;
    emitPuff(fx, fx.wreckAt.clone().add(new THREE.Vector3((r() - 0.5) * 4, 1, (r() - 0.5) * 4)), r() > 0.3 ? '#2a2a2e' : '#5a5050', 7, 4, new THREE.Vector3((r() - 0.5) * 2, 7 + r() * 4, (r() - 0.5) * 2));
  }
  for (const puff of fx.puffs) {
    if (!puff.sprite.visible) continue;
    puff.life -= dt;
    if (puff.life <= 0) {
      puff.sprite.visible = false;
      continue;
    }
    const t = 1 - puff.life / puff.max;
    puff.sprite.position.addScaledVector(puff.vel, dt);
    const s = puff.size * (1 + t * 3);
    puff.sprite.scale.set(s, s, 1);
    puff.sprite.material.opacity = (1 - t) * 0.7;
  }
  if (fx.wreckAt) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    fx.debris.forEach((d, i) => {
      if (d.p.y > d.ground) {
        d.v.y -= 9.81 * dt;
        d.p.addScaledVector(d.v, dt);
        d.rot.x += d.spin * dt;
        d.rot.z += d.spin * 0.7 * dt;
      } else d.p.y = d.ground;
      q.setFromEuler(d.rot);
      m.compose(d.p, q, new THREE.Vector3(d.s, d.s, d.s));
      fx.debrisMesh.setMatrixAt(i, m);
    });
    fx.debrisMesh.instanceMatrix.needsUpdate = true;
    const flicker = 14 + Math.sin(time * 23) * 3 + Math.sin(time * 41) * 2;
    fx.fire.scale.set(flicker, flicker, 1);
  }
}

/** Place the flare boat and the crate for the rescue sortie. */
export function updateRescueProps(fx, session, time) {
  const boat = session.mission.boat;
  fx.boat.visible = Boolean(boat);
  if (boat) {
    fx.boat.position.set(boat.x, 0.3 + Math.sin(time * 1.3) * 0.25, boat.z);
    fx.boat.rotation.z = Math.sin(time * 0.9) * 0.08;
    fx.flare.scale.setScalar(26 + Math.sin(time * 17) * 4);
    if (Math.floor(time * 10) % 3 === 0) emitPuff(fx, new THREE.Vector3(boat.x, 4, boat.z), '#e2564a', 5, 6, new THREE.Vector3(2.5, 6, 1));
  }
  const crate = session.crate;
  fx.crate.visible = Boolean(crate && crate.dropped);
  if (crate && crate.dropped) {
    fx.crate.position.set(crate.pos.x, crate.pos.y, crate.pos.z);
    fx.crate.children[1].visible = !crate.landed;
  }
}
