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
export const M = {
  grass:       new THREE.MeshLambertMaterial({ color: 0x5aa64a }),
  grassDark:   new THREE.MeshLambertMaterial({ color: 0x4a8b3b }),
  dirt:        new THREE.MeshLambertMaterial({ color: 0x7a5230 }),
  stone:       new THREE.MeshLambertMaterial({ color: 0x8a8d92 }),
  stoneDark:   new THREE.MeshLambertMaterial({ color: 0x6e7176 }),
  snow:        new THREE.MeshLambertMaterial({ color: 0xfafcff }),
  sand:        new THREE.MeshLambertMaterial({ color: 0xe6d29a }),
  wood:        new THREE.MeshLambertMaterial({ color: 0x5a3b22 }),
  leaves:      new THREE.MeshLambertMaterial({ color: 0x3f7a32 }),
  leavesLight: new THREE.MeshLambertMaterial({ color: 0x4f9a44 }),
  cloud: new THREE.MeshLambertMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false,
  }),
  water: new THREE.MeshLambertMaterial({
    color: 0x356fb2, transparent: true, opacity: 0.78,
    depthWrite: false, side: THREE.DoubleSide,
  }),
};

// Block types that use waterGeom (flat plane) instead of blockGeom (cube).
export const PLANAR_TYPES = new Set(['water']);

// Block types that should not cast/receive shadows like solid blocks.
export const TRANSPARENT_TYPES = new Set(['water', 'cloud']);
