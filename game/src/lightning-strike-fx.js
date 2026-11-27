// The bolt that finds the aircraft: when the squall's lightning strikes, a jagged white channel
// with two forks cracks down from the cloud base onto the left wing for half a second, wrapped
// in a violet glow and ending in a burst of light on the airframe. Built as ribbons turned to
// face the camera every frame, as wide on screen near the wing as under the cloud.
import * as THREE from 'three';
import { createRandom } from './random.js';
import { glowSprite } from './town-and-airstrips.js';

const SEGMENTS = 22;
const BOLT_SECONDS = 0.5;
const HIT_SECONDS = 1.1;

function ribbon(scene, colour, opacity, additive) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 2 * 3), 3));
  const index = [];
  for (let i = 0; i < SEGMENTS; i += 1) {
    const k = i * 2;
    index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  geometry.setIndex(index);
  const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

export function createStrikeBolt(scene) {
  // The main channel and two forks, each a white core inside a violet glow.
  // A dark rim under each keeps the white channel readable against a bright evening sky.
  const strands = [0, 1, 2].map(() => {
    const rim = ribbon(scene, '#2a1850', 0.55, false);
    const glow = ribbon(scene, '#8f9cff', 0.7, true);
    const core = ribbon(scene, '#f8f9ff', 1, false);
    rim.renderOrder = 5;
    glow.renderOrder = 6;
    core.renderOrder = 7;
    return { rim, glow, core, points: [] };
  });
  const hit = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#d8ccff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
  hit.visible = false;
  scene.add(hit);
  return { strands, hit, seed: -1 };
}

/**
 * A zig-zag from `from` to `to`: each kink thrown across `lateral` (a horizontal unit vector
 * across the view) and up or down, less so toward the end when `taper`.
 */
function zigzag(from, to, random, swing, taper, lateral) {
  const points = [];
  let side = 1;
  for (let i = 0; i <= SEGMENTS; i += 1) {
    // Kinks crowd toward the end, where the channel is nearest the eye.
    const t = taper ? (i / SEGMENTS) ** 0.6 : i / SEGMENTS;
    const p = from.clone().lerp(to, t);
    if (i > 0 && i < SEGMENTS) {
      side = -side;
      const amount = swing * (taper ? (1 - t) ** 0.8 : 1 - t * 0.5) * (0.4 + random());
      const across = side * amount * (0.6 + random() * 0.8);
      p.x += lateral.x * across;
      p.z += lateral.z * across;
      p.y += (random() - 0.5) * amount * 0.8;
    }
    points.push(p);
  }
  return points;
}

/** The channel from the cloud base to the wing, and two forks off it, jagged by a seed. */
function channels(a, seed) {
  const fx = Math.sin(a.heading);
  const fz = -Math.cos(a.heading);
  const rx = Math.cos(a.heading);
  const rz = Math.sin(a.heading);
  // From the cloud base ahead and to the left, so the chase camera sees the whole channel come in.
  const top = new THREE.Vector3(a.pos.x - rx * 150 + fx * 380, a.pos.y + 230, a.pos.z - rz * 150 + fz * 380);
  const end = new THREE.Vector3(a.pos.x - rx * 4, a.pos.y + 1.2, a.pos.z - rz * 4);
  const random = createRandom(seed);
  const lateral = { x: rx, z: rz };
  const main = zigzag(top, end, random, 18, true, lateral);
  const forks = [5, 10].map((k) => {
    const from = main[k];
    const to = from.clone().add(new THREE.Vector3(-(70 + random() * 50) * rx + fx * 40, -(90 + random() * 60), -(70 + random() * 50) * rz + fz * 40));
    return zigzag(from, to, random, 9, false, lateral);
  });
  return [main, ...forks];
}

/** Lay a ribbon along the points, `pixels` wide on screen whatever the distance. */
function fill(mesh, points, eye, pixels) {
  const positions = mesh.geometry.getAttribute('position');
  const toEye = new THREE.Vector3();
  const along = new THREE.Vector3();
  const side = new THREE.Vector3();
  points.forEach((p, i) => {
    const next = points[Math.min(points.length - 1, i + 1)];
    const prev = points[Math.max(0, i - 1)];
    along.subVectors(next, prev).normalize();
    toEye.subVectors(eye, p);
    const distance = toEye.length();
    toEye.normalize();
    side.crossVectors(along, toEye).normalize().multiplyScalar(distance * pixels * 0.0009);
    positions.setXYZ(i * 2, p.x - side.x, p.y - side.y, p.z - side.z);
    positions.setXYZ(i * 2 + 1, p.x + side.x, p.y + side.y, p.z + side.z);
  });
  positions.needsUpdate = true;
}

/** Show the bolt for half a second after `session.struckAt`, and the burst on the wing a little longer. */
export function updateStrikeBolt(bolt, session, camera) {
  const age = session.struckAt === undefined ? Infinity : session.time - session.struckAt;
  const showBolt = age >= 0 && age < BOLT_SECONDS && !session.aircraft.crashed;
  for (const strand of bolt.strands) {
    strand.core.visible = showBolt;
    strand.glow.visible = showBolt;
    strand.rim.visible = showBolt;
  }
  bolt.hit.visible = age >= 0 && age < HIT_SECONDS;
  if (!bolt.hit.visible) return;
  const a = session.aircraft;
  const seed = Math.floor(session.struckAt * 1000) + session.seed;
  if (bolt.seed !== seed) {
    bolt.seed = seed;
    channels(a, seed).forEach((points, i) => {
      bolt.strands[i].points = points;
    });
  }
  // The channel stays where it struck; the burst rides the wing.
  const fade = 1 - Math.max(0, age) / HIT_SECONDS;
  bolt.hit.position.set(a.pos.x - Math.cos(a.heading) * 4, a.pos.y + 1.2, a.pos.z - Math.sin(a.heading) * 4);
  bolt.hit.scale.setScalar(7 * (0.6 + fade));
  bolt.hit.material.opacity = fade;
  if (!showBolt) return;
  const flicker = age < 0.12 || (age > 0.2 && age < 0.3) ? 1 : 0.55;
  bolt.strands.forEach((strand, i) => {
    strand.core.material.opacity = flicker * (i ? 0.85 : 1);
    strand.glow.material.opacity = 0.7 * flicker;
    strand.rim.material.opacity = 0.55 * flicker;
    fill(strand.rim, strand.points, camera.position, i ? 7 : 11);
    fill(strand.glow, strand.points, camera.position, i ? 14 : 24);
    fill(strand.core, strand.points, camera.position, i ? 3 : 5.5);
  });
}
