// The KC-9 "Kestrel" built from primitives: a lofted fuselage in cream with a rust-orange cheat
// line and navy belly, a strut-braced high wing with working ailerons and flaps, a tail with
// elevator and rudder that move with the stick, a spinning two-blade prop and its disc, spatted
// wheels that retract, cabin glass, nav lights and the tail letters. Nose points to local -Z.
import * as THREE from 'three';
import { glowSprite } from './town-and-airstrips.js';

const CREAM = new THREE.Color('#f1e8d6');
const RUST = new THREE.Color('#d0602c');
const NAVY = new THREE.Color('#203553');
const COWL = new THREE.Color('#2a2d36');

/** Fuselage sections: z, half-width, half-height, centre height. */
const SECTIONS = [
  [-4.25, 0.3, 0.3, 0.02],
  [-4.0, 0.52, 0.52, 0.02],
  [-3.2, 0.62, 0.64, 0.06],
  [-2.1, 0.67, 0.78, 0.2],
  [-0.6, 0.68, 0.84, 0.25],
  [0.8, 0.6, 0.72, 0.22],
  [2.4, 0.4, 0.48, 0.28],
  [4.5, 0.12, 0.2, 0.48],
];

function loftFuselage() {
  const segs = 14;
  const rings = SECTIONS.map(([z, hw, hh, yc]) => {
    const ring = [];
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const px = Math.sign(c) * Math.pow(Math.abs(c), 0.7) * hw;
      const py = Math.sign(s) * Math.pow(Math.abs(s), 0.8) * hh;
      ring.push(new THREE.Vector3(px, yc + py, z));
    }
    return { ring, yc, hh, z };
  });
  const positions = [];
  const colours = [];
  const tri = (a, b, c, colour) => {
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      colours.push(colour.r, colour.g, colour.b);
    }
  };
  const bandColour = (i, cz) => {
    const angle = ((i + 0.5) / segs) * Math.PI * 2;
    const s = Math.sin(angle);
    if (cz < -3.05) return COWL;
    if (s < -0.55) return NAVY;
    if (Math.abs(s) < 0.24) return RUST;
    return CREAM;
  };
  for (let k = 0; k < rings.length - 1; k += 1) {
    const r0 = rings[k].ring;
    const r1 = rings[k + 1].ring;
    for (let i = 0; i < segs; i += 1) {
      const j = (i + 1) % segs;
      const colour = bandColour(i, (r0[i].z + r1[i].z) / 2);
      tri(r0[i], r1[i], r1[j], colour);
      tri(r0[i], r1[j], r0[j], colour);
    }
  }
  const tail = rings[rings.length - 1];
  const tip = new THREE.Vector3(0, tail.yc, tail.z + 0.15);
  for (let i = 0; i < segs; i += 1) tri(tail.ring[i], tip, tail.ring[(i + 1) % segs], CREAM);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function tailLetters() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#203553';
  g.font = 'bold 84px sans-serif';
  g.textBaseline = 'middle';
  g.fillText('KC-9  KESTREL', 12, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function part(geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** A control surface hinged along its leading edge (local x axis). */
function hinged(width, depth, thickness, material, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const geometry = new THREE.BoxGeometry(width, thickness, depth);
  geometry.translate(0, 0, depth / 2);
  pivot.add(part(geometry, material, 0, 0, 0));
  return pivot;
}

export function createAircraftModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, metalness: 0.05 });
  const cream = new THREE.MeshStandardMaterial({ color: CREAM, flatShading: true, roughness: 0.5 });
  const rust = new THREE.MeshStandardMaterial({ color: RUST, flatShading: true, roughness: 0.5 });
  const navy = new THREE.MeshStandardMaterial({ color: NAVY, flatShading: true, roughness: 0.55 });
  const metal = new THREE.MeshStandardMaterial({ color: '#8d9098', roughness: 0.35, metalness: 0.6 });
  const tyre = new THREE.MeshStandardMaterial({ color: '#1d1d20', roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: '#4a6c8c', roughness: 0.08, metalness: 0.3, emissive: '#7a5238', emissiveIntensity: 0.45 });

  // The cabin shell: hidden from the pilot's seat, where the panel overlay stands in for it.
  const cabin = new THREE.Group();
  body.add(cabin);
  const fuselage = new THREE.Mesh(loftFuselage(), paint);
  fuselage.castShadow = true;
  cabin.add(fuselage);
  const windshield = part(new THREE.BoxGeometry(1.16, 0.05, 1.05), glass, 0, 0.83, -2.25);
  windshield.rotation.x = -0.62;
  cabin.add(windshield);
  for (const side of [-1, 1]) {
    const pane = part(new THREE.BoxGeometry(0.05, 0.52, 1.0), glass, side * 0.68, 0.55, -1.45);
    const rear = part(new THREE.BoxGeometry(0.05, 0.46, 0.8), glass, side * 0.66, 0.53, -0.2);
    cabin.add(pane, rear);
    const letters = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), new THREE.MeshBasicMaterial({ map: tailLetters(), transparent: true, depthWrite: false }));
    letters.position.set(side * 0.5, 0.35, 1.9);
    letters.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    cabin.add(letters);
  }

  // High wing with tips, ailerons, flaps and struts.
  const wing = new THREE.Group();
  wing.position.set(0, 1.08, -0.85);
  body.add(wing);
  const ailerons = [];
  const flaps = [];
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    half.rotation.z = side * 0.035;
    wing.add(half);
    const panel = new THREE.BoxGeometry(5.6, 0.2, 1.2);
    half.add(part(panel, cream, side * 3.1, 0, -0.18));
    const nose = new THREE.CylinderGeometry(0.1, 0.1, 5.6, 8);
    nose.rotateZ(Math.PI / 2);
    half.add(part(nose, cream, side * 3.1, 0, -0.78));
    half.add(part(new THREE.BoxGeometry(0.5, 0.22, 1.42), rust, side * 6.0, 0, -0.28));
    half.add(part(new THREE.BoxGeometry(5.6, 0.03, 0.18), rust, side * 3.1, 0.115, -0.55));
    const aileron = hinged(2.3, 0.38, 0.09, navy, side * 4.55, 0, 0.42);
    const flap = hinged(2.55, 0.4, 0.1, cream, side * 1.75, -0.02, 0.42);
    half.add(aileron, flap);
    ailerons.push({ pivot: aileron, side });
    flaps.push(flap);
    for (const dz of [-0.55, 0.15]) {
      const from = new THREE.Vector3(side * 0.62, -0.42, -0.6 + dz * 0.5);
      const to = new THREE.Vector3(side * 2.9, 1.0, -0.85 + dz);
      const length = from.distanceTo(to);
      const strut = part(new THREE.CylinderGeometry(0.045, 0.06, length, 6), metal, 0, 0, 0);
      strut.position.copy(from).add(to).multiplyScalar(0.5);
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      body.add(strut);
    }
  }

  // Tail.
  const tail = new THREE.Group();
  tail.position.set(0, 0.48, 4.05);
  body.add(tail);
  tail.add(part(new THREE.BoxGeometry(3.9, 0.1, 0.85), cream, 0, 0, 0));
  tail.add(part(new THREE.BoxGeometry(0.4, 0.11, 0.9), rust, 1.75, 0, 0));
  tail.add(part(new THREE.BoxGeometry(0.4, 0.11, 0.9), rust, -1.75, 0, 0));
  const elevator = hinged(3.7, 0.42, 0.07, navy, 0, 0, 0.42);
  tail.add(elevator);
  const finShape = new THREE.Shape();
  finShape.moveTo(-1.0, 0);
  finShape.lineTo(0.45, 0);
  finShape.lineTo(0.45, 1.75);
  finShape.lineTo(-0.05, 1.8);
  finShape.lineTo(-1.0, 0);
  const finGeometry = new THREE.ExtrudeGeometry(finShape, { depth: 0.1, bevelEnabled: false });
  finGeometry.rotateY(-Math.PI / 2);
  finGeometry.translate(0.05, 0.02, 0);
  const fin = part(finGeometry, rust, 0, 0, 0);
  tail.add(fin);
  const rudderPivot = new THREE.Group();
  rudderPivot.position.set(0, 0.06, 0.45);
  const rudderGeometry = new THREE.BoxGeometry(0.08, 1.7, 0.42);
  rudderGeometry.translate(0, 0.85, 0.21);
  rudderPivot.add(part(rudderGeometry, navy, 0, 0, 0));
  tail.add(rudderPivot);

  // Engine: spinner, prop blades, prop disc, exhaust.
  const prop = new THREE.Group();
  prop.position.set(0, 0.02, -4.3);
  body.add(prop);
  const spinner = new THREE.ConeGeometry(0.3, 0.6, 12);
  spinner.rotateX(-Math.PI / 2);
  prop.add(part(spinner, rust, 0, 0, -0.25));
  const blades = new THREE.Group();
  prop.add(blades);
  for (const side of [-1, 1]) {
    const blade = part(new THREE.BoxGeometry(0.16, 0.95, 0.04), new THREE.MeshStandardMaterial({ color: '#232326', roughness: 0.6 }), 0, side * 0.55, -0.12);
    blade.rotation.y = side * 0.35;
    blades.add(blade);
    blades.add(part(new THREE.BoxGeometry(0.17, 0.12, 0.05), rust, 0, side * 1.0, -0.12));
  }
  const discCanvas = document.createElement('canvas');
  discCanvas.width = 128;
  discCanvas.height = 128;
  const dg = discCanvas.getContext('2d');
  const grad = dg.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40,40,44,0.0)');
  grad.addColorStop(0.55, 'rgba(40,40,44,0.28)');
  grad.addColorStop(0.86, 'rgba(60,58,60,0.32)');
  grad.addColorStop(0.9, 'rgba(230,110,50,0.5)');
  grad.addColorStop(0.97, 'rgba(230,110,50,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  dg.fillStyle = grad;
  dg.fillRect(0, 0, 128, 128);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.08, 32), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(discCanvas), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = -0.12;
  prop.add(disc);
  const exhaust = part(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6), metal, 0.42, -0.48, -3.0);
  exhaust.rotation.x = Math.PI / 2;
  body.add(exhaust);

  // Landing gear (retractable): spatted mains and the nose wheel.
  const gear = new THREE.Group();
  body.add(gear);
  const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.2, 14);
  wheel.rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    const from = new THREE.Vector3(side * 0.5, -0.65, -0.55);
    const to = new THREE.Vector3(side * 1.3, -1.2, -0.5);
    const leg = part(new THREE.CylinderGeometry(0.05, 0.06, from.distanceTo(to), 6), metal, 0, 0, 0);
    leg.position.copy(from).add(to).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    gear.add(leg);
    gear.add(part(wheel, tyre, side * 1.3, -1.22, -0.5));
    const spat = part(new THREE.SphereGeometry(0.42, 10, 6), cream, side * 1.3, -1.12, -0.5);
    spat.scale.set(0.38, 0.62, 1.25);
    gear.add(spat);
  }
  const noseLeg = part(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), metal, 0, -0.85, -3.35);
  gear.add(noseLeg);
  gear.add(part(new THREE.CylinderGeometry(0.27, 0.27, 0.16, 12).rotateZ(Math.PI / 2), tyre, 0, -1.28, -3.35));

  // Nav lights.
  const navLights = [];
  for (const [x, y, z, c] of [[-6.25, 1.0, -0.95, '#ff3b30'], [6.25, 1.0, -0.95, '#3bff6a'], [0, 2.35, 4.6, '#ffffff']]) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.position.set(x, y, z);
    glow.scale.set(1.3, 1.3, 1);
    body.add(glow);
    body.add(part(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: c }), x, y, z));
    navLights.push(glow);
  }
  const strobe = navLights[2];

  return { root, body, cabin, prop, blades, disc, ailerons, flaps, elevator, rudder: rudderPivot, gear, strobe, wingTips: [new THREE.Vector3(-6.2, 1.0, -0.5), new THREE.Vector3(6.2, 1.0, -0.5)] };
}

/** Pose the model from the aircraft state and the pilot's inputs. */
export function poseAircraftModel(model, aircraft, controls, time, dt) {
  model.root.position.set(aircraft.pos.x, aircraft.pos.y, aircraft.pos.z);
  model.root.quaternion.set(aircraft.q[0], aircraft.q[1], aircraft.q[2], aircraft.q[3]);
  if (aircraft.crashed) {
    // The wreck: nosed in, a wing dug into the ground, prop stopped, gear torn off.
    model.root.quaternion.setFromEuler(new THREE.Euler(-0.32, -aircraft.heading, 0.55, 'YXZ'));
    model.root.position.y -= 0.9;
    model.disc.visible = false;
    model.blades.visible = true;
    model.gear.visible = false;
    return;
  }
  const spin = (aircraft.rpm / 60) * Math.PI * 2;
  model.blades.rotation.z += spin * dt;
  const fast = aircraft.rpm > 900;
  model.blades.visible = !fast || Math.floor(time * 30) % 3 === 0;
  model.disc.visible = aircraft.rpm > 500;
  model.disc.material.opacity = Math.min(1, aircraft.rpm / 2200);
  const roll = controls.roll ?? 0;
  for (const a of model.ailerons) a.pivot.rotation.x = roll * 0.38 * a.side;
  for (const f of model.flaps) f.rotation.x = aircraft.flaps * 0.62;
  model.elevator.rotation.x = -(controls.pitch ?? 0) * 0.4;
  model.rudder.rotation.y = -(controls.yaw ?? 0) * 0.45;
  model.gear.visible = aircraft.gearPos > 0.03;
  model.gear.scale.y = 0.25 + aircraft.gearPos * 0.75;
  model.gear.position.y = (1 - aircraft.gearPos) * 0.55;
  model.strobe.scale.setScalar(Math.floor(time * 1.1 * 10) % 10 === 0 ? 3.4 : 1.2);
}
