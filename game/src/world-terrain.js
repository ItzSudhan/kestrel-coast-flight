// The islands as a painterly low-poly mesh: one height grid sampled from terrain-height.js,
// faceted triangles coloured by height, slope and a little seeded patchwork (sand, sunlit
// grass, olive heath, warm cliff rock, turquoise shallows), plus a height texture the sea
// shader reads for shallows and surf.
import * as THREE from 'three';
import { AIRSTRIPS, MAP, TOWN } from './places.js';
import { hashCell, lerp, smoothstep } from './random.js';
import { terrainHeight } from './terrain-height.js';
import { shareAtmosphere } from './world-sky.js';

export const GRID_CELL = 40;

/** Sample terrain heights over the whole map on a regular grid. */
export function buildHeightGrid() {
  const cols = Math.round((MAP.maxX - MAP.minX) / GRID_CELL) + 1;
  const rows = Math.round((MAP.maxZ - MAP.minZ) / GRID_CELL) + 1;
  const heights = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) heights[r * cols + c] = terrainHeight(MAP.minX + c * GRID_CELL, MAP.minZ + r * GRID_CELL);
  }
  return { cols, rows, heights };
}

const SAND = new THREE.Color('#e9cc93');
const WET_SAND = new THREE.Color('#c9a874');
const SHALLOW = new THREE.Color('#5fb3a6');
const DEEP = new THREE.Color('#2c6f86');
const GRASS_SUN = new THREE.Color('#b6b24f');
const GRASS = new THREE.Color('#7a9a40');
const GRASS_DARK = new THREE.Color('#567a38');
const HEATH = new THREE.Color('#9a8450');
const ROCK = new THREE.Color('#a8876b');
const ROCK_LIGHT = new THREE.Color('#c9a888');
const PEAT = new THREE.Color('#7b6a4c');

const FIELDS = ['#dcbc5e', '#a8c457', '#c9c75f', '#e6d27e', '#82b04c', '#b48a56', '#93bb55'].map((c) => new THREE.Color(c));

/** Farm fields: a patchwork on low, gentle ground near the town and the airfield. */
function fieldColour(out, x, z, height, steep, cc, rr) {
  if (height < 4 || height > 55 || steep > 0.16) return null;
  const nearTown = Math.hypot(x - TOWN.x, z - TOWN.z) < 2300;
  const nearField = Math.hypot(x - AIRSTRIPS[0].x, (z - AIRSTRIPS[0].z) * 1.6) < 1700;
  const nearCay = Math.hypot(x - AIRSTRIPS[1].x, z - AIRSTRIPS[1].z) < 900;
  if (!nearTown && !nearField && !nearCay) return null;
  const fx = Math.floor((cc + (rr >> 3)) / 3);
  const fz = Math.floor((rr + (cc >> 4)) / 4);
  if (hashCell(fx, fz, 404) < 0.35) return null;
  out.copy(FIELDS[Math.floor(hashCell(fx, fz, 405) * FIELDS.length)]);
  return out;
}

function groundColour(out, height, steep, patch) {
  if (height < -0.5) {
    out.copy(WET_SAND).lerp(SHALLOW, smoothstep(-0.5, -6, height)).lerp(DEEP, smoothstep(-6, -30, height));
    return out;
  }
  if (height < 3.2) return out.copy(SAND).lerp(WET_SAND, patch * 0.4);
  if (steep > 0.55) return out.copy(ROCK).lerp(ROCK_LIGHT, patch);
  out.copy(GRASS).lerp(GRASS_SUN, patch);
  if (patch > 0.75) out.lerp(GRASS_DARK, 0.5);
  if (height > 90) out.lerp(HEATH, smoothstep(90, 170, height));
  if (height > 170) out.lerp(PEAT, 0.35);
  if (steep > 0.35) out.lerp(ROCK, smoothstep(0.35, 0.55, steep));
  return out;
}

/** The faceted island mesh from a height grid (deep-sea cells are left out). */
export function createTerrainMesh(grid) {
  const { cols, rows, heights } = grid;
  const positions = [];
  const colours = [];
  const colour = new THREE.Color();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const at = (cc, rr) => heights[rr * cols + cc];
  const pushTriangle = (p0, p1, p2, cc, rr, salt) => {
    e1.subVectors(p1, p0);
    e2.subVectors(p2, p0);
    n.crossVectors(e2, e1).normalize();
    if (n.y < 0) n.negate();
    const steep = Math.sqrt(Math.max(0, 1 - n.y * n.y)) / Math.max(n.y, 0.05);
    const mean = (p0.y + p1.y + p2.y) / 3;
    const patch = hashCell(cc, rr, 501 + salt) * 0.65 + hashCell(cc >> 2, rr >> 2, 77) * 0.35;
    if (!fieldColour(colour, (p0.x + p1.x + p2.x) / 3, (p0.z + p1.z + p2.z) / 3, mean, steep, cc, rr)) groundColour(colour, mean, steep, patch);
    const light = lerp(0.94, 1.06, hashCell(cc, rr, 9 + salt));
    for (const p of [p0, p1, p2]) {
      positions.push(p.x, p.y, p.z);
      colours.push(colour.r * light, colour.g * light, colour.b * light);
    }
  };
  for (let r = 0; r < rows - 1; r += 1) {
    for (let cc = 0; cc < cols - 1; cc += 1) {
      const h00 = at(cc, r);
      const h10 = at(cc + 1, r);
      const h01 = at(cc, r + 1);
      const h11 = at(cc + 1, r + 1);
      if (Math.max(h00, h10, h01, h11) < -34) continue;
      const x0 = MAP.minX + cc * GRID_CELL;
      const z0 = MAP.minZ + r * GRID_CELL;
      const flip = hashCell(cc, r, 3) > 0.5;
      a.set(x0, h00, z0);
      b.set(x0 + GRID_CELL, h10, z0);
      c.set(x0, h01, z0 + GRID_CELL);
      const d = new THREE.Vector3(x0 + GRID_CELL, h11, z0 + GRID_CELL);
      if (flip) {
        pushTriangle(a, c, b, cc, r, 0);
        pushTriangle(b, c, d, cc, r, 1);
      } else {
        pushTriangle(a, c, d, cc, r, 0);
        pushTriangle(a, d, b, cc, r, 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  const material = shareAtmosphere(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/** The height grid as a byte texture (0 = 40 m deep, 0.5 = sea level, 1 = 40 m up) for the sea's shallows and surf. */
export function createHeightTexture(grid) {
  const bytes = new Uint8Array(grid.cols * grid.rows);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.max(0, Math.min(255, Math.round(((grid.heights[i] + 40) / 80) * 255)));
  const texture = new THREE.DataTexture(bytes, grid.cols, grid.rows, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
