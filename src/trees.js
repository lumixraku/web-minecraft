import { SEA_LEVEL, BEACH_BAND, STONE_EXPOSE, TREE_CHANCE } from './config.js';
import { BLOCK_IDS, hash3 } from './blocks.js';

// Deterministic per-column trees. Whether a tree stands at (x, z) depends
// only on the coordinate hash, the terrain and the forest field — so any
// chunk can independently decide which neighboring trees spill into it.

// Returns trunk height (4-6) or 0 if no tree grows on this column.
export function treeAt(terrain, x, z, surf) {
  if (surf <= SEA_LEVEL + BEACH_BAND || surf >= STONE_EXPOSE - 2) return 0;
  const r = hash3(x, 7777, z);
  const chance = TREE_CHANCE * 2.2 * terrain.forestAt(x, z);
  if (r >= chance) return 0;
  // Reject steep slopes
  if (Math.abs(terrain.heightAt(x + 1, z) - surf) > 2 ||
      Math.abs(terrain.heightAt(x - 1, z) - surf) > 2 ||
      Math.abs(terrain.heightAt(x, z + 1) - surf) > 2 ||
      Math.abs(terrain.heightAt(x, z - 1) - surf) > 2) return 0;
  return 4 + Math.floor((r / chance) * 3); // 4..6, deterministic
}

// Leaf canopy layout (relative to trunk top).
const LAYERS = [
  { dy: -1, r: 2 },
  { dy: 0, r: 2 },
  { dy: 1, r: 1 },
  { dy: 2, r: 1 },
];

// Emit every block of the tree through `set(x, y, z, id)` — the callback
// is responsible for bounds/overwrite rules (only stamping its own chunk).
export function stampTree(x, surf, z, trunkH, set) {
  for (let k = 1; k <= trunkH; k++) set(x, surf + k, z, BLOCK_IDS.wood);
  const topY = surf + trunkH;
  for (const L of LAYERS) {
    for (let dx = -L.r; dx <= L.r; dx++) {
      for (let dz = -L.r; dz <= L.r; dz++) {
        if (dx === 0 && dz === 0 && L.dy < 1) continue; // trunk passes through
        // Ragged corners, stable via coordinate hash
        if (Math.abs(dx) === L.r && Math.abs(dz) === L.r &&
            hash3(x + dx, topY + L.dy, z + dz) < 0.55) continue;
        const id = hash3(x + dx, topY + L.dy + 311, z + dz) < 0.3
          ? BLOCK_IDS.leavesLight : BLOCK_IDS.leaves;
        set(x + dx, topY + L.dy, z + dz, id);
      }
    }
  }
}
