// The storm you can see: a dark curtain of rain standing on the sea to the north, its anvil
// deck lit copper on the sun side, lightning that forks down to the water and flashes the sky,
// and rain streaks round the camera once you fly into its grip.
import * as THREE from 'three';
import { createRandom } from './random.js';
import { STORM_BEARING, STORM_NORMAL, STORM_ORIGIN, stormWallOffset } from './storm-front.js';
import { paintCloudTexture } from './world-sky.js';

function rainWallMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, flash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time; uniform float flash; varying vec2 vUv;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  float x = vUv.x * 160.0;
  float shafts = 0.55 + 0.45 * noise(x * 0.35 + time * 0.05) * noise(x * 0.9 - time * 0.08);
  float streak = 0.75 + 0.25 * noise(vUv.x * 2400.0 + vUv.y * 40.0 - time * 6.0);
  float top = 0.62 + 0.25 * noise(x * 0.25);
  float body = smoothstep(top, top - 0.3, vUv.y);
  float edges = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  float a = body * edges * shafts * streak * 0.92;
  vec3 col = mix(vec3(0.16, 0.18, 0.25), vec3(0.3, 0.32, 0.4), vUv.y);
  col += flash * vec3(0.35, 0.4, 0.55) * (0.4 + vUv.y);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`,
  });
}

function boltGeometry(seed, height) {
  const random = createRandom(seed);
  const points = [];
  let x = 0;
  let y = height;
  let z = 0;
  const addFork = (sx, sy, sz, length, steps) => {
    let px = sx;
    let py = sy;
    let pz = sz;
    for (let i = 0; i < steps && py > 0; i += 1) {
      const nx = px + (random() - 0.5) * 120;
      const ny = py - length / steps;
      const nz = pz + (random() - 0.5) * 60;
      points.push(px, py, pz, nx, Math.max(0, ny), nz);
      px = nx;
      py = ny;
      pz = nz;
    }
  };
  addFork(x, y, z, height, 14);
  for (let f = 0; f < 3; f += 1) {
    const i = 1 + Math.floor(random() * 8);
    x = points[i * 6];
    y = points[i * 6 + 1];
    z = points[i * 6 + 2];
    addFork(x, y, z, y * 0.5, 5);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

export function createStormVisuals() {
  const group = new THREE.Group();
  const wallMaterial = rainWallMaterial();
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(22000, 3400, 1, 1), wallMaterial);
  wall.position.y = 1700;
  group.add(wall);
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(26000, 3800, 1, 1), wallMaterial);
  backWall.position.set(0, 1900, -1400);
  group.add(backWall);

  // The anvil deck: towering dark cloud, its tops caught copper by the low sun.
  const random = createRandom(4242);
  const deck = new THREE.Group();
  const textures = [0, 1, 2].map((i) => paintCloudTexture(70 + i, 'rgba(132,118,140,1)', 'rgba(38,42,58,0.98)', 'rgba(255,160,110,0.7)'));
  for (let i = 0; i < 34; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures[i % 3], transparent: true, depthWrite: false, fog: false }));
    const width = 3000 + random() * 3500;
    sprite.scale.set(width, width * 0.55, 1);
    sprite.position.set(-12000 + (i / 33) * 24000 + (random() - 0.5) * 1200, 2700 + random() * 900, -300 - random() * 2400);
    deck.add(sprite);
  }
  group.add(deck);

  const boltMaterial = new THREE.LineBasicMaterial({ color: '#e9f0ff', transparent: true, opacity: 1, fog: false });
  const bolt = new THREE.LineSegments(boltGeometry(1, 2000), boltMaterial);
  bolt.visible = false;
  group.add(bolt);
  const flashLight = new THREE.PointLight('#bcd0ff', 0, 9000, 1.2);
  flashLight.position.set(0, 1600, 300);
  group.add(flashLight);

  // Rain streaks round the camera.
  const drops = 2400;
  const rainPositions = new Float32Array(drops * 6);
  const rainRandom = createRandom(99);
  const offsets = [];
  for (let i = 0; i < drops; i += 1) offsets.push([rainRandom() * 160 - 80, rainRandom() * 120 - 60, rainRandom() * 160 - 80]);
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: '#c3cfe0', transparent: true, opacity: 0.45, fog: false }));
  rain.frustumCulled = false;
  rain.visible = false;
  return { group, wall, wallMaterial, deck, bolt, boltSeed: -1, flashLight, rain, offsets };
}

/**
 * Move the storm to its distance, fork the current bolt, and fill the air with rain where it
 * grips. `rainAmount` 0..1; `eye` the camera position; `wind` the wind vector (rain slants).
 */
export function updateStormVisuals(visuals, storm, time, eye, rainAmount, wind) {
  const offset = stormWallOffset(storm.km);
  visuals.group.position.set(STORM_ORIGIN.x + STORM_NORMAL.x * offset, 0, STORM_ORIGIN.z + STORM_NORMAL.z * offset);
  visuals.group.rotation.y = (-STORM_BEARING * Math.PI) / 180;
  visuals.wallMaterial.uniforms.time.value = time;
  visuals.wallMaterial.uniforms.flash.value = storm.flash;
  visuals.flashLight.intensity = storm.flash * 6;
  if (storm.bolt) {
    if (visuals.boltSeed !== storm.bolt.seed) {
      visuals.bolt.geometry.dispose();
      visuals.bolt.geometry = boltGeometry(storm.bolt.seed, 2000);
      visuals.boltSeed = storm.bolt.seed;
    }
    visuals.bolt.position.set(storm.bolt.x, 0, -300);
    visuals.bolt.visible = true;
    visuals.flashLight.position.set(storm.bolt.x, 1500, 200);
  } else visuals.bolt.visible = false;
  visuals.rain.visible = rainAmount > 0.02;
  if (!visuals.rain.visible) return;
  visuals.rain.material.opacity = 0.18 + rainAmount * 0.4;
  const positions = visuals.rain.geometry.getAttribute('position');
  const fall = 38;
  const slantX = (wind?.x ?? 0) * 0.06;
  const slantZ = (wind?.z ?? 0) * 0.06;
  for (let i = 0; i < visuals.offsets.length; i += 1) {
    const o = visuals.offsets[i];
    const y = ((((o[1] - time * fall) % 120) + 180) % 120) - 60;
    const x = eye.x + ((((o[0] - eye.x) % 160) + 240) % 160) - 80;
    const zz = eye.z + ((((o[2] - eye.z) % 160) + 240) % 160) - 80;
    positions.setXYZ(i * 2, x, eye.y + y, zz);
    positions.setXYZ(i * 2 + 1, x + slantX, eye.y + y - 3.2, zz + slantZ);
  }
  positions.needsUpdate = true;
}
