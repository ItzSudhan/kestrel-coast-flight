// The sea: one wide plane whose shader rolls soft swell into the normals, reflects the warm
// sky, scatters sun glints, turns turquoise over the shallows (read from the height texture)
// and draws a lazy line of surf round every shore, all fading into the shared haze.
import * as THREE from 'three';
import { MAP } from './places.js';
import { SUN_DIR, atmosphere } from './world-sky.js';

export function createSea(heightTexture) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    time: { value: 0 },
    heights: { value: null },
    mapMin: { value: new THREE.Vector2(MAP.minX, MAP.minZ) },
    mapSize: { value: new THREE.Vector2(MAP.maxX - MAP.minX, MAP.maxZ - MAP.minZ) },
    sunDir: { value: SUN_DIR.clone() },
    darken: { value: 0 },
  }]);
  uniforms.heights.value = heightTexture;
  uniforms.stormDark = atmosphere.stormDark;
  const material = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `uniform float time; uniform sampler2D heights; uniform vec2 mapMin; uniform vec2 mapSize; uniform vec3 sunDir; uniform float darken;
varying vec3 vWorld;
#include <fog_pars_fragment>
float ground(vec2 p) {
  vec2 uv = (p - mapMin) / mapSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -40.0;
  return texture2D(heights, uv).r * 80.0 - 40.0;
}
void main() {
  vec2 p = vWorld.xz;
  float t = time;
  vec3 n = vec3(0.0, 1.0, 0.0);
  n.x += 0.07 * cos(p.x * 0.019 + p.y * 0.011 + t * 0.8) + 0.045 * cos(p.x * 0.043 - p.y * 0.029 + t * 1.25) + 0.03 * cos(p.x * 0.12 + p.y * 0.083 + t * 2.3) + 0.018 * cos(p.x * 0.31 - p.y * 0.27 + t * 3.1);
  n.z += 0.06 * cos(p.y * 0.017 - p.x * 0.009 + t * 0.7) + 0.04 * cos(p.y * 0.051 + p.x * 0.023 + t * 1.4) + 0.028 * cos(p.y * 0.14 - p.x * 0.07 + t * 2.0) + 0.018 * cos(p.y * 0.29 + p.x * 0.33 + t * 2.9);
  n = normalize(n);
  vec3 view = cameraPosition - vWorld;
  float dist = length(view);
  vec3 v = view / dist;
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(800.0, 9000.0, dist) * 0.7));
  float facing = max(dot(n, v), 0.0);
  float fres = pow(1.0 - facing, 4.0);
  vec3 r = reflect(-v, n);
  vec3 skyLow = vec3(0.92, 0.6, 0.48);
  vec3 skyHigh = vec3(0.3, 0.32, 0.58);
  vec3 sky = mix(skyLow, skyHigh, smoothstep(0.0, 0.45, r.y));
  float depth = -ground(p);
  vec3 deep = vec3(0.03, 0.14, 0.24);
  vec3 shallow = vec3(0.12, 0.55, 0.56);
  vec3 water = mix(shallow, deep, smoothstep(1.0, 24.0, depth));
  vec3 col = mix(water, sky, 0.08 + 0.55 * fres);
  float sunDot = max(dot(r, sunDir), 0.0);
  float sparkle = pow(sunDot, 420.0) * 9.0 + pow(sunDot, 60.0) * 0.55 + pow(sunDot, 9.0) * 0.12;
  col += vec3(1.0, 0.82, 0.55) * sparkle;
  float surfBand = smoothstep(3.5, 0.6, depth) * smoothstep(-0.6, 0.6, depth);
  float surfWave = 0.5 + 0.5 * sin(depth * 2.4 - t * 1.6 + sin(p.x * 0.05) * 1.5);
  col = mix(col, vec3(0.98, 0.95, 0.9), surfBand * smoothstep(0.45, 0.9, surfWave) * 0.75);
  col *= 1.0 - darken * 0.45;
  float alpha = mix(0.62, 0.96, smoothstep(0.5, 12.0, depth));
  alpha = max(alpha, fres);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000, 1, 1), material);
  sea.rotation.x = -Math.PI / 2;
  sea.renderOrder = 1;
  return sea;
}
