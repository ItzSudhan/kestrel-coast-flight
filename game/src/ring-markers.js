// The beacon rings as you see them: the next ring blazes amber and pulses, the one after glows
// soft cyan, lit rings fade to a faint green, and each carries its number on a halo.
import * as THREE from 'three';
import { RING_RADIUS } from './rings-course.js';
import { glowSprite } from './town-and-airstrips.js';

function numberTexture(n) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(20,14,8,0.55)';
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffe2a8';
  g.font = 'bold 72px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createRingMarkers(rings, normals) {
  const group = new THREE.Group();
  const markers = rings.map((ring, i) => {
    const holder = new THREE.Group();
    holder.position.set(ring.x, ring.y, ring.z);
    holder.lookAt(ring.x + normals[i].x, ring.y, ring.z + normals[i].z);
    const core = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, 1.3, 10, 64), new THREE.MeshBasicMaterial({ color: '#ffb347', fog: false, transparent: true }));
    const halo = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, 4.2, 10, 64), new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ffb35c', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.35, fog: false }));
    glow.scale.set(RING_RADIUS * 3.4, RING_RADIUS * 3.4, 1);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: numberTexture(i + 1), transparent: true, depthWrite: false, fog: false }));
    label.scale.set(12, 12, 1);
    label.position.set(0, RING_RADIUS + 10, 0);
    holder.add(core, halo, glow, label);
    group.add(holder);
    return { holder, core, halo, glow, label };
  });
  return { group, markers };
}

/** Colour each ring by its state: next, upcoming, later or lit. */
export function updateRingMarkers(view, session, time) {
  view.markers.forEach((m, i) => {
    const ring = session.rings[i];
    const passed = ring.passed;
    const next = i === session.nextRing;
    const soon = i === session.nextRing + 1;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    // A ring you thread bursts outward and fades.
    const since = passed ? session.time - (ring.passedAt ?? -10) : -1;
    if (passed && since >= 0 && since < 0.9) {
      const t = since / 0.9;
      m.holder.visible = true;
      m.holder.scale.setScalar(1 + t * 1.6);
      m.core.material.color.set('#9dffbf');
      m.core.material.opacity = 1 - t;
      m.halo.material.opacity = 0.5 * (1 - t);
      m.glow.material.opacity = 0;
      m.label.visible = false;
      return;
    }
    m.holder.visible = !passed;
    m.core.material.color.set(passed ? '#7dffa8' : next ? '#ffc04d' : soon ? '#6fe7ff' : '#8fb9c9');
    m.core.material.opacity = passed ? 0.35 : next ? 1 : soon ? 0.85 : 0.5;
    m.halo.material.color.set(passed ? '#3cff7a' : next ? '#ff8a2a' : '#3fc8ff');
    m.halo.material.opacity = passed ? 0.08 : next ? 0.3 + pulse * 0.25 : soon ? 0.18 : 0.06;
    m.glow.material.opacity = next ? 0.35 + pulse * 0.15 : soon ? 0.14 : 0;
    m.glow.material.color.set(next ? '#ffb35c' : '#5fd8ff');
    m.label.visible = !passed && i <= session.nextRing + 2;
    m.holder.scale.setScalar(next ? 1 + pulse * 0.03 : 1);
  });
}
