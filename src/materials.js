import * as THREE from 'three';

// With the infinite chunked world every chunk is ONE vertex-colored mesh
// (only exposed faces are emitted), so block looks live in this color
// table instead of per-type materials. Each block type gets [top, side,
// bottom] face colors — grass and snow keep the classic bright-top /
// dirt-side Minecraft look.

export const solidMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

const C = (hex) => new THREE.Color(hex);
const DIRT = C(0xa07242);
const GRASS_SIDE = C(0x91764a);

// Indexed by block id (see blocks.js): [top, side, bottom]
export const FACE_COLORS = [
  null,
  [C(0x7cc14b), GRASS_SIDE, DIRT],          // grass
  [C(0x6ab241), GRASS_SIDE, DIRT],          // grassDark
  [DIRT, DIRT, DIRT],                        // dirt
  [C(0xb4b6bb), C(0xb4b6bb), C(0xb4b6bb)],  // stone
  [C(0x9ea0a5), C(0x9ea0a5), C(0x9ea0a5)],  // stoneDark
  [C(0xfdfefe), C(0xe2e7ea), DIRT],         // snow
  [C(0xeedfa3), C(0xeedfa3), C(0xeedfa3)],  // sand
  [C(0x9a6b38), C(0x8b5e2e), C(0x9a6b38)],  // wood
  [C(0x55b338), C(0x55b338), C(0x55b338)],  // leaves
  [C(0x6cc44b), C(0x6cc44b), C(0x6cc44b)],  // leavesLight
];

// Representative color (top face) — used by the HUD hotbar swatches.
export function blockColor(id) {
  return FACE_COLORS[id][0];
}
