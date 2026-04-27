#!/usr/bin/env node
/**
 * Print node tree, mesh names, and named "empty" markers (no mesh / no camera / no skin)
 * from a .glb file. Useful for verifying spawn / collision naming conventions before
 * loading the asset in the engine.
 *
 * Usage: node scripts/inspect-glb.mjs Assets/Maps/lowpoly_islandtest.glb
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const argPath = process.argv[2]
if (!argPath) {
  console.error('usage: node scripts/inspect-glb.mjs <path-to-glb>')
  process.exit(2)
}

const buf = readFileSync(resolve(argPath))
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

const magic = view.getUint32(0, true)
if (magic !== 0x46546c67) {
  console.error('Not a GLB (magic mismatch). Got 0x' + magic.toString(16))
  process.exit(1)
}
const version = view.getUint32(4, true)
const totalLength = view.getUint32(8, true)

const chunkLength = view.getUint32(12, true)
const chunkType = view.getUint32(16, true)
if (chunkType !== 0x4e4f534a) {
  console.error('First chunk is not JSON; got 0x' + chunkType.toString(16))
  process.exit(1)
}

const jsonStart = 20
const jsonEnd = jsonStart + chunkLength
const jsonBuf = buf.subarray(jsonStart, jsonEnd)
const json = JSON.parse(new TextDecoder('utf-8').decode(jsonBuf))

const nodes = json.nodes ?? []
const meshes = json.meshes ?? []

console.log(`GLB version=${version} totalLength=${totalLength} nodes=${nodes.length} meshes=${meshes.length}`)

console.log('\n=== Mesh names ===')
meshes.forEach((m, i) => console.log(`  [${i}] ${m.name ?? '(unnamed)'}`))

const emptyNodeIdxs = []
const meshNodeIdxs = []
nodes.forEach((n, i) => {
  if (n.mesh != null) meshNodeIdxs.push(i)
  else if (n.camera == null && n.skin == null) emptyNodeIdxs.push(i)
})

console.log('\n=== Empty (marker-likely) node names ===')
for (const i of emptyNodeIdxs) {
  console.log(`  [${i}] ${nodes[i].name ?? '(unnamed)'}`)
}

console.log('\n=== Mesh-bearing node names ===')
for (const i of meshNodeIdxs) {
  const n = nodes[i]
  const meshName = meshes[n.mesh]?.name ?? '(unnamed-mesh)'
  console.log(`  node[${i}].name=${n.name ?? '(unnamed)'}  -> mesh "${meshName}"`)
}

const colMatch = (s) =>
  /^(col_|coll_|collision_|collision)/.test((s ?? '').toLowerCase())
const collidersFromNodeNames = nodes.filter((n) => colMatch(n.name)).length
const collidersFromMeshNames = meshes.filter((m) => colMatch(m.name)).length
console.log(`\nLikely collider hits: byNodeName=${collidersFromNodeNames}, byMeshName=${collidersFromMeshNames}`)

const spawnRe = /^(spawn_|player_spawn|p[12]$|spawna$|spawnb$)/
const spawnHits = nodes.filter((n) => spawnRe.test((n.name ?? '').toLowerCase())).length
console.log(`Spawn-marker hits: ${spawnHits}`)
