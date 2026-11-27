// Gannet Light on its rock: a banded tower, gallery and glazed lantern, the keeper's cottage,
// and the beam: two soft cones sweeping the dusk, with a glare at the lamp you see for miles.
import * as THREE from 'three';
import { LIGHTHOUSE } from './places.js';
import { terrainHeight } from './terrain-height.js';
import { glowSprite } from './town-and-airstrips.js';
import { shareAtmosphere } from './world-sky.js';

function beamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { strength: { value: 1 } },
    vertexShader: 'varying float vAlong; void main() { vAlong = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float strength; varying float vAlong; void main() { float a = (0.22 + 0.78 * pow(vAlong, 1.4)) * 0.95 * strength; gl_FragColor = vec4(vec3(1.0, 0.93, 0.7) * a, a); }',
  });
}

export function createLighthouse() {
  const group = new THREE.Group();
  const base = terrainHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);
  group.position.set(LIGHTHOUSE.x, base - 0.5, LIGHTHOUSE.z);
  const white = shareAtmosphere(new THREE.MeshLambertMaterial({ color: '#f4efe6', flatShading: true }));
  const red = shareAtmosphere(new THREE.MeshLambertMaterial({ color: '#b8352b', flatShading: true }));
  const dark = new THREE.MeshLambertMaterial({ color: '#2b2b30' });
  const bands = 5;
  const height = 30;
  for (let i = 0; i < bands; i += 1) {
    const y0 = (i / bands) * height;
    const r0 = 4.6 - (i / bands) * 1.6;
    const r1 = 4.6 - ((i + 1) / bands) * 1.6;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, height / bands, 14), i % 2 ? red : white);
    band.position.y = y0 + height / bands / 2;
    band.castShadow = true;
    group.add(band);
  }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.7, 16), dark);
  gallery.position.y = height + 0.35;
  group.add(gallery);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 3.4, 12), new THREE.MeshBasicMaterial({ color: '#ffe3a1' }));
  lantern.position.y = height + 2.4;
  group.add(lantern);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.9, 2.6, 12), red);
  cap.position.y = height + 5.3;
  group.add(cap);
  const cottage = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 7), white);
  cottage.position.set(10, 2.5, 5);
  group.add(cottage);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 6.5, 3, 4), red);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.25, 1, 0.8);
  roof.position.set(10, 6.5, 5);
  group.add(roof);

  const beam = new THREE.Group();
  beam.position.y = height + 2.4;
  const material = beamMaterial();
  for (const side of [1, -1]) {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 120, 1700, 20, 1, true), material);
    cone.geometry.translate(0, -850, 0);
    cone.rotation.z = (side * Math.PI) / 2 + side * 0.04;
    beam.add(cone);
  }
  group.add(beam);
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ffdf9a', blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glare.scale.set(36, 36, 1);
  glare.position.y = height + 2.4;
  group.add(glare);
  return { group, beam, glare, material };
}

/** Sweep the beam; the glare swells as the beam passes the viewer. */
export function updateLighthouse(lighthouse, time, eye) {
  const angle = time * 0.55;
  lighthouse.beam.rotation.y = angle;
  const toEye = Math.atan2(eye.z - lighthouse.group.position.z, eye.x - lighthouse.group.position.x);
  const facing = Math.abs(Math.cos(angle + toEye));
  const s = 90 + Math.pow(facing, 30) * 180;
  lighthouse.glare.scale.set(s, s, 1);
}
