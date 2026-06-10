import {
  SIZE,
  WORLD_HEIGHT,
  SEA_LEVEL,
  SNOW_LEVEL,
  STONE_EXPOSE,
  BEACH_BAND,
} from './config.js';
import { setSeed } from './random.js';
import { createTerrain } from './terrain.js';
import { generateTrees } from './features/trees.js';

// Full voxel field for the world: a Uint8Array of block ids, filled from the
// heightmap + trees. Unlike the old exposed-blocks-only pipeline, every cell
// down to y=0 is stored so digging always reveals real blocks.

export const AIR = 0;
export const BLOCK_IDS = {
  grass: 1, grassDark: 2, dirt: 3, stone: 4, stoneDark: 5,
  snow: 6, sand: 7, wood: 8, leaves: 9, leavesLight: 10,
};
export const ID_TO_TYPE = [
  null, 'grass', 'grassDark', 'dirt', 'stone', 'stoneDark',
  'snow', 'sand', 'wood', 'leaves', 'leavesLight',
];

// Deterministic per-coordinate hash for color variants — stable across
// re-meshing (a seeded PRNG stream would reshuffle variants on every edit).
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function blockIdAt(surface, y, x, z) {
  if (y === surface) {
    if (y <= SEA_LEVEL + BEACH_BAND) return BLOCK_IDS.sand;
    if (y >= SNOW_LEVEL) return BLOCK_IDS.snow;
    if (y >= STONE_EXPOSE) {
      return hash3(x, y, z) < 0.3 ? BLOCK_IDS.stoneDark : BLOCK_IDS.stone;
    }
    return hash3(x, y, z) < 0.25 ? BLOCK_IDS.grassDark : BLOCK_IDS.grass;
  }
  if (y === surface - 1) {
    if (surface <= SEA_LEVEL + BEACH_BAND) return BLOCK_IDS.sand;
    if (surface >= STONE_EXPOSE) return BLOCK_IDS.stone;
    return BLOCK_IDS.dirt;
  }
  if (y >= surface - 3) {
    return surface >= STONE_EXPOSE ? BLOCK_IDS.stone : BLOCK_IDS.dirt;
  }
  return hash3(x, y, z) < 0.25 ? BLOCK_IDS.stoneDark : BLOCK_IDS.stone;
}

// Build the voxel field for a seed. Coordinates are grid space:
// x, z in [0, SIZE), y in [0, WORLD_HEIGHT).
export function createVoxels(seed) {
  setSeed(seed);
  const terrain = createTerrain();
  const { heightMap, h } = terrain;

  const data = new Uint8Array(SIZE * WORLD_HEIGHT * SIZE);
  // Highest filled y per column — upper bound for mesh scans. Never shrinks
  // (a stale-high bound only costs a few empty reads).
  const colMax = new Int16Array(SIZE * SIZE);
  const idx = (x, y, z) => (x * SIZE + z) * WORLD_HEIGHT + y;

  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE; z++) {
      const s = Math.min(heightMap[x * SIZE + z], WORLD_HEIGHT - 1);
      for (let y = 0; y <= s; y++) data[idx(x, y, z)] = blockIdAt(s, y, x, z);
      colMax[x * SIZE + z] = s;
    }
  }

  // Trees consume the seeded PRNG after the terrain noise, same order as
  // before, so worlds stay deterministic.
  for (const b of generateTrees(heightMap, h)) {
    if (b.x < 0 || b.x >= SIZE || b.z < 0 || b.z >= SIZE) continue;
    if (b.y < 0 || b.y >= WORLD_HEIGHT) continue;
    const i = idx(b.x, b.y, b.z);
    if (data[i] === AIR) {
      data[i] = BLOCK_IDS[b.type];
      const c = b.x * SIZE + b.z;
      if (b.y > colMax[c]) colMax[c] = b.y;
    }
  }

  function get(x, y, z) {
    if (x < 0 || x >= SIZE || z < 0 || z >= SIZE) return AIR;
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    return data[idx(x, y, z)];
  }

  function set(x, y, z, id) {
    if (x < 0 || x >= SIZE || z < 0 || z >= SIZE) return;
    if (y < 0 || y >= WORLD_HEIGHT) return;
    data[idx(x, y, z)] = id;
    const c = x * SIZE + z;
    if (id !== AIR && y > colMax[c]) colMax[c] = y;
  }

  return { data, get, set, colMax, heightMap, h };
}
