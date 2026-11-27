// The cameras: a chase view that trails the KC-9 with soft lag, leans a little into the bank
// but keeps the horizon steady so it never fights the pilot; the cockpit seat looking over the
// panel; and a slow orbit for the mission board, results and the wreck.
import * as THREE from 'three';

export const VIEW_CHASE = 'chase';
export const VIEW_COCKPIT = 'cockpit';
export const VIEW_ORBIT = 'orbit';

export function createCameraRig(camera) {
  return { camera, mode: VIEW_CHASE, pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), primed: false, orbitAngle: 0, orbitCentre: new THREE.Vector3(), orbitRadius: 30, orbitHeight: 8, shake: 0, shakeTime: 0 };
}

/** Jolt the camera: touchdowns, bounces, crashes and the stall buffet (0..1). */
export function shakeCamera(rig, amount) {
  rig.shake = Math.max(rig.shake, Math.min(1, amount));
}

/** A smooth, repeatable wobble for the current shake. */
function shakeOffset(rig, dt) {
  rig.shakeTime += dt;
  rig.shake *= Math.exp(-dt * 4);
  const t = rig.shakeTime * 31;
  const s = rig.shake;
  return { x: (Math.sin(t) + Math.sin(t * 1.7 + 1)) * 0.5 * s, y: (Math.sin(t * 1.3 + 2) + Math.sin(t * 2.3)) * 0.5 * s };
}

const forward = new THREE.Vector3();
const upVec = new THREE.Vector3();
const desired = new THREE.Vector3();
const lookAt = new THREE.Vector3();

/** Move the camera for this frame; `snap` places it at once (screenshots, view changes). */
export function updateCamera(rig, aircraft, dt, snap = false) {
  const camera = rig.camera;
  const q = new THREE.Quaternion(aircraft.q[0], aircraft.q[1], aircraft.q[2], aircraft.q[3]);
  forward.set(0, 0, -1).applyQuaternion(q);
  upVec.set(0, 1, 0).applyQuaternion(q);
  const p = new THREE.Vector3(aircraft.pos.x, aircraft.pos.y, aircraft.pos.z);
  const jolt = shakeOffset(rig, dt);
  if (rig.mode === VIEW_COCKPIT) {
    camera.position.copy(new THREE.Vector3(-0.3, 0.84, -1.35).applyQuaternion(q).add(p));
    camera.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.07 + jolt.y * 0.02, jolt.x * 0.015, 0)));
    camera.fov = 72;
    camera.updateProjectionMatrix();
    rig.primed = false;
    return;
  }
  if (rig.mode === VIEW_ORBIT) {
    rig.orbitAngle += dt * 0.12;
    camera.position.set(rig.orbitCentre.x + Math.sin(rig.orbitAngle) * rig.orbitRadius, rig.orbitCentre.y + rig.orbitHeight, rig.orbitCentre.z + Math.cos(rig.orbitAngle) * rig.orbitRadius);
    camera.up.set(0, 1, 0);
    camera.lookAt(rig.orbitShift ? rig.orbitCentre.clone().add(rig.orbitShift) : rig.orbitCentre);
    camera.fov = 50;
    camera.updateProjectionMatrix();
    rig.primed = false;
    return;
  }
  const speed = Math.hypot(aircraft.vel.x, aircraft.vel.y, aircraft.vel.z);
  const heading = new THREE.Vector3(forward.x, 0, forward.z).normalize();
  if (speed > 8) {
    const travel = new THREE.Vector3(aircraft.vel.x, aircraft.vel.y * 0.5, aircraft.vel.z).normalize();
    heading.lerp(new THREE.Vector3(travel.x, 0, travel.z).normalize(), 0.4).normalize();
  }
  const climb = Math.max(-0.35, Math.min(0.35, forward.y));
  desired.copy(p).addScaledVector(heading, -12.8).addScaledVector(new THREE.Vector3(0, 1, 0), 4.8 - climb * 8);
  lookAt.copy(p).addScaledVector(heading, 26).addScaledVector(new THREE.Vector3(0, 1, 0), 2.2 + climb * 20);
  const ground = rig.groundHeight ? rig.groundHeight(desired.x, desired.z) : 0;
  desired.y = Math.max(desired.y, ground + 2.5);
  const k = snap || !rig.primed ? 1 : 1 - Math.exp(-dt * 4.5);
  rig.pos.lerp(desired, k);
  rig.look.lerp(lookAt, snap || !rig.primed ? 1 : 1 - Math.exp(-dt * 9));
  const lean = new THREE.Vector3(0, 1, 0).lerp(upVec, 0.22).normalize();
  rig.up.lerp(lean, snap || !rig.primed ? 1 : 1 - Math.exp(-dt * 3));
  rig.primed = true;
  camera.position.copy(rig.pos).add(new THREE.Vector3(jolt.x * 0.35, jolt.y * 0.35, 0));
  camera.up.copy(rig.up);
  camera.lookAt(rig.look);
  camera.fov = 62 + Math.min(8, Math.max(0, (speed - 45) * 0.25));
  camera.updateProjectionMatrix();
}
