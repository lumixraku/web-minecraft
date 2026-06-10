import {
  SEA_LEVEL,
  SNOW_LEVEL,
  STONE_EXPOSE,
  BEACH_BAND,
} from './config.js';

export const AIR = 0;
export const BLOCK_IDS = {
  grass: 1, grassDark: 2, dirt: 3, stone: 4, stoneDark: 5,
  snow: 6, sand: 7, wood: 8, leaves: 9, leavesLight: 10,
};
export const ID_TO_TYPE = [
  null, 'grass', 'grassDark', 'dirt', 'stone', 'stoneDark',
  'snow', 'sand', 'wood', 'leaves', 'leavesLight',
];

// Deterministic per-coordinate hash — used for color variants, tree rolls
// and leaf raggedness so generation is stable across re-meshing and
// independent of chunk visit order.
export function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Pick a block id from the column surface height and the cell's y.
export function blockIdAt(surface, y, x, z) {
  // Thick snow pack above the snow line, so steep slopes read white too
  if (surface >= SNOW_LEVEL && y >= surface - 2 && y <= surface) {
    return BLOCK_IDS.snow;
  }
  if (y === surface) {
    if (y <= SEA_LEVEL + BEACH_BAND) return BLOCK_IDS.sand;
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
