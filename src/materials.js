import * as THREE from 'three';

// Shared cube geometry with the index reordered into 3 material groups —
// [sides, top, bottom] — so block types can have a distinct top face
// (grass-topped dirt, snow-capped dirt) like real Minecraft, at 3 draw
// groups instead of BoxGeometry's default 6.
export const blockGeom = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  // BoxGeometry index layout: +x, -x, +y, -y, +z, -z — 6 indices per face
  const idx = g.getIndex().array;
  const pick = (f) => Array.from(idx.slice(f * 6, f * 6 + 6));
  const reordered = [
    ...pick(0), ...pick(1), ...pick(4), ...pick(5),  // sides
    ...pick(2),                                       // top
    ...pick(3),                                       // bottom
  ];
  g.setIndex(reordered);
  g.clearGroups();
  g.addGroup(0, 24, 0);   // sides
  g.addGroup(24, 6, 1);   // top
  g.addGroup(30, 6, 2);   // bottom
  return g;
})();

const lam = (hex) => new THREE.MeshLambertMaterial({ color: hex });

const dirt = lam(0xa07242);
const grassSide = lam(0x91764a);  // dirt with a green-tinged fringe
const snowSide = lam(0xe2e7ea);   // slightly shaded so terraces keep definition

// Block material dictionary, keyed by type name (see voxels.js ID_TO_TYPE).
// An array means [sides, top, bottom] on the grouped cube; a single material
// colors the whole block. Colors are picked to look like the Minecraft
// official site — vivid & saturated.
export const M = {
  grass:       [grassSide, lam(0x7cc14b), dirt],
  grassDark:   [grassSide, lam(0x6ab241), dirt],
  dirt:        dirt,
  stone:       lam(0xb4b6bb),
  stoneDark:   lam(0x9ea0a5),
  snow:        [snowSide, lam(0xfdfefe), dirt],
  sand:        lam(0xeedfa3),
  wood:        lam(0x8b5e2e),
  leaves:      lam(0x55b338),
  leavesLight: lam(0x6cc44b),
};

// Representative color per type (top face for multi-face blocks) — used by
// the HUD hotbar swatches.
export function blockColor(type) {
  const m = M[type];
  return Array.isArray(m) ? m[1].color : m.color;
}
