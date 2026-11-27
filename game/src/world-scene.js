// Builds the whole 3D coast once (renderer, haze, sky, islands, sea, town and airstrips,
// lighthouse, storm, clouds, the aircraft and its effects) and moves it every frame to match the
// sortie: rings, PAPI, lighthouse sweep, storm distance and lightning, rain, camera.
import * as THREE from 'three';
import { buildHeightGrid, createHeightTexture, createTerrainMesh } from './world-terrain.js';
import { createSea } from './world-sea.js';
import { FOG_WARM, atmosphere, createClouds, createLights, createSkyDome, followShadow, installAtmosphereFog } from './world-sky.js';
import { createSettlements, updatePapi } from './town-and-airstrips.js';
import { createLighthouse, updateLighthouse } from './lighthouse.js';
import { createStormVisuals, updateStormVisuals } from './storm-visuals.js';
import { createAircraftModel, poseAircraftModel } from './aircraft-model.js';
import { VIEW_CHASE, VIEW_COCKPIT, createCameraRig, updateCamera } from './chase-camera.js';
import { createRingMarkers, updateRingMarkers } from './ring-markers.js';
import { createEffects, updateEffects, updateRescueProps } from './effects.js';
import { stormGrip } from './storm-front.js';
import { terrainHeight } from './terrain-height.js';

export function createWorldScene(canvas) {
  installAtmosphereFog();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = FOG_WARM.clone();
  scene.fog = new THREE.Fog(FOG_WARM.clone(), 1600, 17000);
  const camera = new THREE.PerspectiveCamera(62, 1.6, 1.0, 70000);
  const rig = createCameraRig(camera);
  rig.groundHeight = (x, z) => Math.max(0, terrainHeight(x, z));

  const sky = createSkyDome();
  scene.add(sky);
  const lights = createLights(scene);
  scene.add(createClouds(5));
  const grid = buildHeightGrid();
  const terrain = createTerrainMesh(grid);
  scene.add(terrain);
  const sea = createSea(createHeightTexture(grid));
  scene.add(sea);
  const settlements = createSettlements();
  scene.add(settlements.group);
  const lighthouse = createLighthouse();
  scene.add(lighthouse.group);
  const storm = createStormVisuals();
  scene.add(storm.group);
  scene.add(storm.rain);
  const model = createAircraftModel();
  scene.add(model.root);
  const fx = createEffects(scene);
  let rings = null;
  let ringSession = null;

  function setSession(session) {
    if (rings) scene.remove(rings.group);
    rings = session.rings.length ? createRingMarkers(session.rings, session.normals) : null;
    if (rings) scene.add(rings.group);
    ringSession = session;
    rig.primed = false;
  }

  function resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  /** Bring every moving part up to the sortie's state and draw the frame. */
  function frame(session, controls, dt, time, view, snap = false) {
    const a = session.aircraft;
    rig.mode = view;
    poseAircraftModel(model, a, controls, time, dt);
    // From the pilot's seat the wing roots, struts and prop disc stay in view; the cabin shell does not.
    model.root.visible = true;
    model.cabin.visible = view !== VIEW_COCKPIT || Boolean(a.crashed);
    model.gear.visible = model.gear.visible && view !== VIEW_COCKPIT;
    model.root.updateMatrixWorld(true);
    updateCamera(rig, a, dt, snap);
    updateEffects(fx, a, model, dt, time);
    updateRescueProps(fx, session, time);
    if (rings && ringSession === session) updateRingMarkers(rings, session, time);
    updatePapi(settlements, camera.position);
    updateLighthouse(lighthouse, time, camera.position);
    const grip = stormGrip(session.storm, camera.position.x, camera.position.z);
    const rain = Math.max(session.mission.rain ? 0.75 : 0, grip);
    updateStormVisuals(storm, session.storm, time, camera.position, rain, session.lastWind);
    sea.material.uniforms.time.value = time;
    sea.material.uniforms.darken.value = rain * 0.6;
    sky.material.uniforms.flash.value = session.storm.flash;
    sky.position.copy(camera.position);
    atmosphere.stormDark.value = Math.min(1, 0.4 + rain * 0.6);
    const dusk = 1 - rain * 0.45;
    lights.sun.intensity = 3.0 * dusk;
    lights.fill.intensity = 1.0 * (1 - rain * 0.2) + session.storm.flash * 1.6;
    scene.fog.near = 1600 * (1 - rain * 0.7);
    scene.fog.far = 17000 * (1 - rain * 0.55);
    const ahead = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize().multiplyScalar(450);
    const focus = camera.position.clone().add(ahead);
    focus.y = Math.max(0, terrainHeight(focus.x, focus.z));
    followShadow(lights, focus);
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, rig, grid, model, fx, setSession, resize, frame };
}
