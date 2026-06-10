import * as THREE from 'three';
import { CHUNK, WORLD_HEIGHT, SEA_LEVEL, WATER_Y } from './config.js';
import { FACE_COLORS } from './materials.js';
import { hash3 } from './blocks.js';

// Builds the render geometry for one chunk: a single vertex-colored
// indexed mesh of all exposed block faces (1 draw call per chunk), plus a
// separate water-surface geometry with a per-vertex depth attribute.
// Positions are emitted in world coordinates, so chunk meshes need no
// transform and frustum-cull on their own bounds.

// Face definitions: corner offsets (CCW from outside) + which color slot
// the face samples (0 top, 1 side, 2 bottom).
const FACES = [
  { d: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], slot: 1 },
  { d: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], slot: 1 },
  { d: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], slot: 0 },
  { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], slot: 2 },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], slot: 1 },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], slot: 1 },
];

// chunk: { cx, cz, data, surf, colMax } — see world.js
// getBlock(x, y, z): world-space voxel lookup for cross-chunk neighbors
export function buildChunkGeometry(chunk, getBlock) {
  const { cx, cz, data, surf, colMax } = chunk;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const idx = (lx, y, lz) => (lx * CHUNK + lz) * WORLD_HEIGHT + y;

  const pos = [], nrm = [], col = [], index = [];

  for (let lx = 0; lx < CHUNK; lx++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      const top = colMax[lx * CHUNK + lz];
      const wx = x0 + lx, wz = z0 + lz;
      for (let y = 0; y <= top; y++) {
        const id = data[idx(lx, y, lz)];
        if (!id) continue;
        // Subtle per-block brightness jitter for surface texture
        const jit = 0.96 + hash3(wx, y, wz) * 0.07;

        for (const f of FACES) {
          const nx = lx + f.d[0], ny = y + f.d[1], nz = lz + f.d[2];
          let nb;
          if (ny < 0) continue;            // never draw the world's underside
          else if (ny >= WORLD_HEIGHT) nb = 0;
          else if (nx >= 0 && nx < CHUNK && nz >= 0 && nz < CHUNK) {
            nb = data[idx(nx, ny, nz)];
          } else {
            nb = getBlock(wx + f.d[0], ny, wz + f.d[2]);
          }
          if (nb) continue;

          const base = pos.length / 3;
          const c = FACE_COLORS[id][f.slot];
          for (const [ox, oy, oz] of f.c) {
            pos.push(wx + ox, y + oy, wz + oz);
            nrm.push(f.d[0], f.d[1], f.d[2]);
            col.push(c.r * jit, c.g * jit, c.b * jit);
          }
          index.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  let solid = null;
  if (pos.length) {
    solid = new THREE.BufferGeometry();
    solid.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    solid.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    solid.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    solid.setIndex(index);
  }

  // Water: one quad per submerged column (by original terrain surface)
  const wpos = [], wdepth = [], windex = [];
  for (let lx = 0; lx < CHUNK; lx++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      const s = surf[lx * CHUNK + lz];
      if (s >= SEA_LEVEL) continue;
      const d = SEA_LEVEL - s;
      const wx = x0 + lx, wz = z0 + lz;
      const i0 = wpos.length / 3;
      wpos.push(
        wx, WATER_Y, wz,
        wx + 1, WATER_Y, wz,
        wx + 1, WATER_Y, wz + 1,
        wx, WATER_Y, wz + 1,
      );
      wdepth.push(d, d, d, d);
      windex.push(i0, i0 + 2, i0 + 1, i0, i0 + 3, i0 + 2);
    }
  }

  let water = null;
  if (wpos.length) {
    water = new THREE.BufferGeometry();
    water.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    water.setAttribute('aDepth', new THREE.Float32BufferAttribute(wdepth, 1));
    water.setIndex(windex);
  }

  return { solid, water };
}
