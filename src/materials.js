import * as THREE from 'three';

// Shared geometry — referenced by every InstancedMesh of solid blocks.
export const blockGeom = new THREE.BoxGeometry(1, 1, 1);

// Water is drawn as a flat horizontal quad, NOT a transparent cube — so we
// never see "internal" faces of overlapping translucent boxes.
export const waterGeom = new THREE.PlaneGeometry(1, 1);
waterGeom.rotateX(-Math.PI / 2);

// Block material dictionary. Keys are referenced by string from feature
// generators ({ type: 'grass', ... }), so add a new block type by:
//   1) adding its material here
//   2) emitting `{ type: 'newType', ... }` from a feature
// Colors are picked to look like the Minecraft official site — vivid &
// saturated, not muddied by lighting. Lambert is fine because we crank ambient
// up so unlit faces stay readable.
export const M = {
  grass:       new THREE.MeshLambertMaterial({ color: 0x7cc14b }),
  grassDark:   new THREE.MeshLambertMaterial({ color: 0x6ab241 }),
  dirt:        new THREE.MeshLambertMaterial({ color: 0xa07242 }),
  stone:       new THREE.MeshLambertMaterial({ color: 0xb4b6bb }),
  stoneDark:   new THREE.MeshLambertMaterial({ color: 0x9ea0a5 }),
  snow:        new THREE.MeshLambertMaterial({ color: 0xfdfefe }),
  sand:        new THREE.MeshLambertMaterial({ color: 0xeedfa3 }),
  wood:        new THREE.MeshLambertMaterial({ color: 0x8b5e2e }),
  leaves:      new THREE.MeshLambertMaterial({ color: 0x55b338 }),
  leavesLight: new THREE.MeshLambertMaterial({ color: 0x6cc44b }),
  // Clouds use Basic so they're always pure white — no shading or
  // hemisphere-tinting can dull them into the "smoke" look.
  cloud: new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false,
  }),
  water: new THREE.MeshLambertMaterial({
    color: 0x4a8be4, transparent: true, opacity: 0.78,
    depthWrite: false, side: THREE.DoubleSide,
  }),
};

// Block types that use waterGeom (flat plane) instead of blockGeom (cube).
export const PLANAR_TYPES = new Set(['water']);

// Block types that should not cast/receive shadows like solid blocks.
export const TRANSPARENT_TYPES = new Set(['water', 'cloud']);
