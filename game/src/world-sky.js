// Golden-hour sky and air: the sun low in the west-south-west, a warm-to-violet sky dome that
// darkens to slate where the storm stands in the north, fair-weather cumulus lit gold from the
// side, and a directional fog shared by every material so land, sea and sky sit in one haze.
import * as THREE from 'three';
import { createRandom } from './random.js';
import { STORM_NORMAL } from './storm-front.js';

/** Unit vector toward the sun (bearing 250°, 9° up). */
export const SUN_DIR = new THREE.Vector3(Math.sin((250 * Math.PI) / 180), Math.sin((9 * Math.PI) / 180), -Math.cos((250 * Math.PI) / 180)).normalize();

export const FOG_WARM = new THREE.Color('#e6a580');
const GLSL_SUN = `vec3(${SUN_DIR.x.toFixed(4)}, ${SUN_DIR.y.toFixed(4)}, ${SUN_DIR.z.toFixed(4)})`;
const GLSL_STORM = `vec2(${STORM_NORMAL.x.toFixed(4)}, ${STORM_NORMAL.z.toFixed(4)})`;

/** Haze colour seen along a direction: warm, gold toward the sun, slate toward the storm. */
const HAZE_GLSL = `
uniform float stormDark;
vec3 hazeColor(vec3 dir, vec3 warm) {
  float sunAmt = pow(max(dot(dir, ${GLSL_SUN}), 0.0), 5.0);
  float north = smoothstep(0.2, 0.95, dot(dir.xz, ${GLSL_STORM}) / max(length(dir.xz), 0.001));
  vec3 c = mix(warm, vec3(0.28, 0.31, 0.39), north * (0.55 + 0.3 * stormDark));
  return mix(c, vec3(1.0, 0.79, 0.52), sunAmt * 0.65);
}`;

let installed = false;
export const atmosphere = { stormDark: { value: 0.5 } };

/**
 * Swap three's fog chunks for a directional haze (call once, before any material compiles):
 * every fogged material then fades to the colour of the sky behind it.
 */
export function installAtmosphereFog() {
  if (installed) return;
  installed = true;
  const chunks = THREE.ShaderChunk;
  chunks.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth;\n varying vec3 vFogDir;\n#endif';
  chunks.fog_vertex = '#ifdef USE_FOG\n vFogDepth = -mvPosition.z;\n vFogDir = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;\n#endif';
  chunks.fog_pars_fragment = `#ifdef USE_FOG
 uniform vec3 fogColor;
 varying float vFogDepth;
 varying vec3 vFogDir;
 uniform float fogNear;
 uniform float fogFar;
 ${HAZE_GLSL}
#endif`;
  chunks.fog_fragment = `#ifdef USE_FOG
 float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
 fogFactor = fogFactor * (0.55 + 0.45 * fogFactor);
 gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor(normalize(vFogDir), fogColor), fogFactor);
#endif`;
}

/** Give a material the storm-darkness uniform the haze reads. */
export function shareAtmosphere(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.stormDark = atmosphere.stormDark;
  };
  return material;
}

/** The sky dome: gradient, sun disc and glow, the storm's dark side and lightning flash. */
export function createSkyDome() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { warm: { value: FOG_WARM.clone() }, flash: { value: 0 }, stormDark: atmosphere.stormDark },
    vertexShader: `varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 warm; uniform float flash;
varying vec3 vDir;
${HAZE_GLSL}
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  vec3 horizon = hazeColor(dir, warm);
  vec3 zenith = vec3(0.1, 0.15, 0.36);
  vec3 mid = vec3(0.46, 0.38, 0.62);
  float up = clamp(h, 0.0, 1.0);
  vec3 col = mix(horizon, vec3(0.98, 0.6, 0.5), smoothstep(0.0, 0.06, up) * 0.6);
  col = mix(col, mid, smoothstep(0.05, 0.3, up));
  col = mix(col, zenith, smoothstep(0.25, 0.8, up));
  float sunAmt = max(dot(dir, ${GLSL_SUN}), 0.0);
  col = mix(col, vec3(1.0, 0.72, 0.42), pow(sunAmt, 8.0) * 0.7 * (1.0 - smoothstep(0.0, 0.5, up)));
  col += vec3(1.0, 0.86, 0.6) * pow(sunAmt, 90.0) * 0.8;
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, sunAmt) * 3.0;
  float az = atan(dir.x, -dir.z);
  float north = smoothstep(0.25, 0.9, dot(dir.xz, ${GLSL_STORM}) / max(length(dir.xz), 0.001));
  float ragged = 0.2 + 0.16 * noise(vec2(az * 6.0, 1.0)) + 0.1 * noise(vec2(az * 17.0, 4.0));
  float stormMask = north * (1.0 - smoothstep(ragged - 0.05, ragged + 0.07, h));
  vec3 stormCol = mix(vec3(0.2, 0.22, 0.29), vec3(0.36, 0.33, 0.38), smoothstep(0.0, ragged, h));
  col = mix(col, stormCol + flash * vec3(0.5, 0.55, 0.7), stormMask * (0.75 + 0.2 * stormDark));
  float band = smoothstep(ragged + 0.02, ragged + 0.07, h) * (1.0 - smoothstep(ragged + 0.07, ragged + 0.2, h)) * north;
  col = mix(col, vec3(0.98, 0.7, 0.55), band * 0.35);
  if (h < 0.0) col = mix(horizon, horizon * 0.85, smoothstep(0.0, -0.2, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(30000, 48, 24), material);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}

/**
 * A painted cumulus on a canvas: overlapping round lobes on a flat base, lit `top` above and
 * shaded `base` below, soft at the edges.
 */
export function paintCloudTexture(seed, top, base, rim) {
  const random = createRandom(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const lobes = [];
  for (let i = 0; i < 46; i += 1) {
    const t = random();
    const dome = Math.sin(t * Math.PI);
    const r = 9 + dome * 16 + random() * 10;
    const x = 22 + t * 212;
    const y = 102 - r * 0.5 - random() * dome * 46;
    lobes.push({ x, y, r });
  }
  lobes.sort((p, q) => q.y - p.y);
  for (const pass of [0, 1]) {
    for (const lobe of lobes) {
      const grad = g.createRadialGradient(lobe.x - lobe.r * 0.35, lobe.y - lobe.r * 0.45, lobe.r * 0.05, lobe.x, lobe.y, lobe.r);
      if (pass === 0) {
        grad.addColorStop(0, rim);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        grad.addColorStop(0, top);
        grad.addColorStop(0.55, base);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      }
      g.globalAlpha = pass === 0 ? 0.5 : 0.62;
      g.fillStyle = grad;
      g.beginPath();
      g.arc(lobe.x, lobe.y, lobe.r * (pass === 0 ? 1.3 : 1), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-out';
  const fade = g.createLinearGradient(0, 96, 0, 120);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fade;
  g.fillRect(0, 96, 256, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Fair-weather cumulus over the south and east: painted billboards lit gold from the sun's side. */
export function createClouds(seed = 5) {
  const random = createRandom(seed);
  const group = new THREE.Group();
  const textures = [0, 1, 2, 3].map((i) => paintCloudTexture(seed * 10 + i, 'rgba(255,246,236,0.98)', 'rgba(236,176,170,0.9)', 'rgba(255,214,160,0.55)'));
  for (let i = 0; i < 46; i += 1) {
    const angle = (95 + random() * 210) * (Math.PI / 180);
    const dist = 4500 + random() * 15000;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures[i % 4], transparent: true, depthWrite: false, fog: true }));
    const width = 900 + random() * 1500;
    sprite.scale.set(width, width * 0.5, 1);
    sprite.position.set(Math.sin(angle) * dist, 1100 + random() * 900, 500 - Math.cos(angle) * dist);
    group.add(sprite);
  }
  return group;
}

/** The sun's light, the sky and ground fill, matched to the dome. */
export function createLights(scene) {
  const sun = new THREE.DirectionalLight('#ffb878', 3.0);
  sun.position.copy(SUN_DIR).multiplyScalar(600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -45;
  cam.right = 45;
  cam.top = 45;
  cam.bottom = -45;
  cam.near = 10;
  cam.far = 1400;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.4;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.HemisphereLight('#94a4e0', '#b27a4c', 1.0);
  scene.add(fill);
  return { sun, fill };
}

/** Keep the sun's shadow box centred on what the camera looks at. */
export function followShadow(lights, focus) {
  lights.sun.target.position.copy(focus);
  lights.sun.position.copy(focus).addScaledVector(SUN_DIR, 600);
}
