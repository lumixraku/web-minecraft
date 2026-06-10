import * as THREE from 'three';
import {
  CHUNK,
  WORLD_HEIGHT,
  RENDER_DIST,
  SEA_LEVEL,
  SNOW_LEVEL,
  BEACH_BAND,
} from './config.js';
import { AIR, blockIdAt } from './blocks.js';
import { createTerrain } from './terrain.js';
import { treeAt, stampTree } from './trees.js';
import { buildChunkGeometry } from './mesher.js';
import { solidMaterial } from './materials.js';
import { createWaterMaterial } from './water.js';

// Infinite chunked world. Voxel data generates on demand in a ring one
// chunk wider than the meshes (so exposure checks at chunk borders always
// see real neighbors, including trees that spill across). update() runs
// every frame: it generates a few chunks per frame toward the player's
// surroundings, meshes what's ready, and drops far meshes. Voxel data is
// kept (so edits survive leaving and returning) unless the cache grows
// huge, in which case far, untouched chunks are evicted.

const DATA_BUDGET = 3;   // chunk fills per frame (after initial pregen)
const MESH_BUDGET = 2;   // chunk meshes per frame
const DATA_CACHE_MAX = 2500;

export function createWorld(seed, scene, savedEdits = null) {
  const terrain = createTerrain(seed);
  const water = createWaterMaterial();
  const group = new THREE.Group();
  scene.add(group);

  let renderDist = RENDER_DIST;
  const chunks = new Map(); // "cx,cz" → chunk record
  const key = (cx, cz) => cx + ',' + cz;
  const idx = (lx, y, lz) => (lx * CHUNK + lz) * WORLD_HEIGHT + y;

  // Authoritative edit overlay, independent of the chunk cache: chunkKey →
  // Map("x,y,z" → id). Edits reapply whenever a chunk's data regenerates,
  // and exportEdits() flattens them for the save file.
  const edits = new Map();
  function recordEdit(x, y, z, id) {
    const ck = key(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
    let m = edits.get(ck);
    if (!m) edits.set(ck, (m = new Map()));
    m.set(x + ',' + y + ',' + z, id);
  }
  if (savedEdits) {
    for (const [cell, id] of Object.entries(savedEdits)) {
      const [x, y, z] = cell.split(',').map(Number);
      recordEdit(x, y, z, id);
    }
  }
  let editsVersion = 0; // bumped on every set() — autosave dirty check

  function exportEdits() {
    const out = {};
    for (const m of edits.values()) {
      for (const [cell, id] of m) out[cell] = id;
    }
    return out;
  }

  // ---- data generation -------------------------------------------------

  function genChunkData(cx, cz) {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const data = new Uint8Array(CHUNK * CHUNK * WORLD_HEIGHT);
    const surf = new Int16Array(CHUNK * CHUNK);
    const colMax = new Int16Array(CHUNK * CHUNK);

    for (let lx = 0; lx < CHUNK; lx++) {
      for (let lz = 0; lz < CHUNK; lz++) {
        const s = terrain.heightAt(x0 + lx, z0 + lz);
        surf[lx * CHUNK + lz] = s;
        colMax[lx * CHUNK + lz] = s;
        for (let y = 0; y <= s; y++) {
          data[idx(lx, y, lz)] = blockIdAt(s, y, x0 + lx, z0 + lz);
        }
      }
    }

    const chunk = { cx, cz, data, surf, colMax, solidMesh: null, waterMesh: null, edited: false };

    // Trees whose canopy (radius 2) can reach this chunk
    const stamp = (x, y, z, id) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK) return;
      if (y < 0 || y >= WORLD_HEIGHT) return;
      const i = idx(lx, y, lz);
      if (data[i] !== AIR) return;
      data[i] = id;
      if (y > colMax[lx * CHUNK + lz]) colMax[lx * CHUNK + lz] = y;
    };
    for (let tx = x0 - 2; tx < x0 + CHUNK + 2; tx++) {
      for (let tz = z0 - 2; tz < z0 + CHUNK + 2; tz++) {
        const s = (tx >= x0 && tx < x0 + CHUNK && tz >= z0 && tz < z0 + CHUNK)
          ? surf[(tx - x0) * CHUNK + (tz - z0)]
          : terrain.heightAt(tx, tz);
        const trunkH = treeAt(terrain, tx, tz, s);
        if (trunkH) stampTree(tx, s, tz, trunkH, stamp);
      }
    }

    // Re-apply saved/recorded edits on top of the generated data
    const m = edits.get(key(cx, cz));
    if (m) {
      for (const [cell, id] of m) {
        const [x, y, z] = cell.split(',').map(Number);
        const lx = x - x0, lz = z - z0;
        data[idx(lx, y, lz)] = id;
        if (id !== AIR && y > colMax[lx * CHUNK + lz]) colMax[lx * CHUNK + lz] = y;
      }
    }

    chunks.set(key(cx, cz), chunk);
    return chunk;
  }

  // ---- voxel access -----------------------------------------------------

  function get(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = chunks.get(key(cx, cz));
    if (!c) return AIR;
    return c.data[idx(x - cx * CHUNK, y, z - cz * CHUNK)];
  }

  function set(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = chunks.get(key(cx, cz));
    if (!c) return;
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    c.data[idx(lx, y, lz)] = id;
    c.edited = true;
    if (id !== AIR && y > c.colMax[lx * CHUNK + lz]) c.colMax[lx * CHUNK + lz] = y;
    recordEdit(x, y, z, id);
    editsVersion++;
  }

  // Original terrain surface (ignores edits) — water & swim checks.
  function surfaceAt(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = chunks.get(key(cx, cz));
    if (c) return c.surf[(x - cx * CHUNK) * CHUNK + (z - cz * CHUNK)];
    return terrain.heightAt(x, z);
  }

  // ---- meshing ----------------------------------------------------------

  function unmeshChunk(c) {
    if (c.solidMesh) {
      group.remove(c.solidMesh);
      c.solidMesh.geometry.dispose();
      c.solidMesh = null;
    }
    if (c.waterMesh) {
      group.remove(c.waterMesh);
      c.waterMesh.geometry.dispose();
      c.waterMesh = null;
    }
  }

  function meshChunk(c) {
    unmeshChunk(c);
    const { solid, water: waterGeo } = buildChunkGeometry(c, get);
    if (solid) {
      const m = new THREE.Mesh(solid, solidMaterial);
      m.castShadow = true;
      m.receiveShadow = true;
      c.solidMesh = m;
      group.add(m);
    }
    if (waterGeo) {
      const m = new THREE.Mesh(waterGeo, water.material);
      m.renderOrder = 1;
      c.waterMesh = m;
      group.add(m);
    }
  }

  // Re-mesh after an edit at (x, z) — includes border neighbors.
  function remeshAt(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    const cxs = new Set([cx]);
    const czs = new Set([cz]);
    if (lx === 0) cxs.add(cx - 1);
    if (lx === CHUNK - 1) cxs.add(cx + 1);
    if (lz === 0) czs.add(cz - 1);
    if (lz === CHUNK - 1) czs.add(cz + 1);
    for (const i of cxs) {
      for (const j of czs) {
        const c = chunks.get(key(i, j));
        if (c && c.solidMesh) meshChunk(c);
      }
    }
  }

  // ---- streaming --------------------------------------------------------

  function neighborsHaveData(cx, cz) {
    return chunks.has(key(cx + 1, cz)) && chunks.has(key(cx - 1, cz)) &&
           chunks.has(key(cx, cz + 1)) && chunks.has(key(cx, cz - 1));
  }

  // Generate/mesh toward the player. budget=Infinity → synchronous pregen.
  function update(px, pz, dataBudget = DATA_BUDGET, meshBudget = MESH_BUDGET) {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);

    // 1) Fill missing voxel data, nearest first, radius renderDist + 1
    const missing = [];
    for (let dx = -renderDist - 1; dx <= renderDist + 1; dx++) {
      for (let dz = -renderDist - 1; dz <= renderDist + 1; dz++) {
        if (!chunks.has(key(pcx + dx, pcz + dz))) {
          missing.push([dx * dx + dz * dz, pcx + dx, pcz + dz]);
        }
      }
    }
    missing.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < missing.length && i < dataBudget; i++) {
      genChunkData(missing[i][1], missing[i][2]);
    }

    // 2) Mesh chunks that have data + all neighbors' data, radius renderDist
    const meshable = [];
    for (let dx = -renderDist; dx <= renderDist; dx++) {
      for (let dz = -renderDist; dz <= renderDist; dz++) {
        const cx = pcx + dx, cz = pcz + dz;
        const c = chunks.get(key(cx, cz));
        if (c && !c.solidMesh && !c.waterMesh && neighborsHaveData(cx, cz)) {
          meshable.push([dx * dx + dz * dz, c]);
        }
      }
    }
    meshable.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < meshable.length && i < meshBudget; i++) {
      meshChunk(meshable[i][1]);
    }

    // 3) Drop meshes (keep data) outside the ring
    for (const c of chunks.values()) {
      if (!c.solidMesh && !c.waterMesh) continue;
      const d = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz));
      if (d > renderDist + 1) unmeshChunk(c);
    }

    // 4) Evict far data if the cache balloons (edits live in the overlay,
    //    so even edited chunks regenerate faithfully)
    if (chunks.size > DATA_CACHE_MAX) {
      for (const [k, c] of chunks) {
        if (c.solidMesh || c.waterMesh) continue;
        const d = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz));
        if (d > renderDist * 3) chunks.delete(k);
      }
    }
  }

  function pregenerate(px, pz) {
    update(px, pz, Infinity, Infinity);
  }

  // Nearest pleasant land column to the origin: dry, below the snow line.
  function findSpawn() {
    for (let r = 0; r < 400; r += 2) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = Math.round(Math.cos(ang) * r);
        const z = Math.round(Math.sin(ang) * r);
        const s = terrain.heightAt(x, z);
        if (s > SEA_LEVEL + BEACH_BAND && s < SNOW_LEVEL - 4) {
          return new THREE.Vector3(x + 0.5, s + 1, z + 0.5);
        }
      }
    }
    return new THREE.Vector3(0.5, WORLD_HEIGHT - 20, 0.5);
  }

  function dispose() {
    for (const c of chunks.values()) unmeshChunk(c);
    chunks.clear();
    scene.remove(group);
    water.material.dispose();
  }

  return {
    seed,
    get, set, surfaceAt, remeshAt,
    update, pregenerate, findSpawn, dispose,
    water, terrain, group,
    exportEdits,
    get editsVersion() { return editsVersion; },
    get renderDist() { return renderDist; },
    setRenderDist(n) { renderDist = Math.max(2, Math.min(12, n | 0)); },
    get chunkCount() { return chunks.size; },
  };
}
