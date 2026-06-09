import {
  SIZE,
  SEA_LEVEL,
  SNOW_LEVEL,
  STONE_EXPOSE,
  BEACH_BAND,
  MAX_DEPTH,
} from './config.js';
import { random } from './random.js';

// Pick a block type given the column surface height and the block's y.
export function blockTypeAt(surface, y) {
  if (y === surface) {
    if (y <= SEA_LEVEL + BEACH_BAND) return 'sand';
    if (y >= SNOW_LEVEL) return 'snow';
    if (y >= STONE_EXPOSE) return random() < 0.3 ? 'stoneDark' : 'stone';
    return random() < 0.25 ? 'grassDark' : 'grass';
  }
  if (y === surface - 1) {
    if (surface <= SEA_LEVEL + BEACH_BAND) return 'sand';
    if (surface >= STONE_EXPOSE) return 'stone';
    return 'dirt';
  }
  if (y >= surface - 3) {
    if (surface >= STONE_EXPOSE) return 'stone';
    return 'dirt';
  }
  return random() < 0.25 ? 'stoneDark' : 'stone';
}

// Walks the heightmap and produces every exposed solid block. A "side" block
// is only emitted if a neighbor column is lower (or off-world) so we don't
// generate buried blocks no one will ever see.
//   heightMap : Int16Array indexed `x * SIZE + z`
//   h(x, z)   : bounds-safe getter (-1 outside world)
// Returns: Array<{ x, y, z, type }>
export function collectSolidBlocks(heightMap, h) {
  const blocks = [];
  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE; z++) {
      const s = heightMap[x * SIZE + z];

      // Top of column — always rendered.
      blocks.push({ x, y: s, z, type: blockTypeAt(s, s) });

      const n = Math.min(h(x + 1, z), h(x - 1, z), h(x, z + 1), h(x, z - 1));
      // If any neighbor is off-world, expose this column's sides to MAX_DEPTH.
      const neighborMin = n < 0 ? s - MAX_DEPTH : n;
      const bottom = Math.max(0, Math.max(neighborMin, s - MAX_DEPTH));
      for (let y = s - 1; y > bottom; y--) {
        blocks.push({ x, y, z, type: blockTypeAt(s, y) });
      }
    }
  }
  return blocks;
}
