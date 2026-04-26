import RAPIER, {
  type Collider,
  type KinematicCharacterController,
  type RigidBody,
} from '@dimforge/rapier3d-compat'
import {
  BufferGeometry,
  Matrix4,
  Mesh,
  Vector3,
  type BufferAttribute,
} from 'three'

type CharacterActor = {
  body: RigidBody
  collider: Collider
  controller: KinematicCharacterController
  radius: number
  totalHeight: number
}

export type CharacterMoveResult = {
  movement: Vector3
  grounded: boolean
  floorY: number | null
}

const _v = new Vector3()
const _m = new Matrix4()

function attrAsPosition(geometry: BufferGeometry): BufferAttribute | null {
  const pos = geometry.getAttribute('position')
  return pos ? (pos as BufferAttribute) : null
}

function colliderCenterY(totalHeight: number): number {
  return totalHeight * 0.5
}

function capsuleHalfHeight(radius: number, totalHeight: number): number {
  return Math.max(0.01, totalHeight * 0.5 - radius)
}

function meshToTrimesh(mesh: Mesh): { vertices: Float32Array; indices: Uint32Array } | null {
  const geometry = mesh.geometry
  const pos = attrAsPosition(geometry)
  if (!pos || pos.count < 3) return null

  mesh.updateMatrixWorld(true)
  _m.copy(mesh.matrixWorld)

  const vertices = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(_m)
    vertices[i * 3 + 0] = _v.x
    vertices[i * 3 + 1] = _v.y
    vertices[i * 3 + 2] = _v.z
  }

  const srcIndex = geometry.getIndex()
  if (srcIndex) {
    const indices = new Uint32Array(srcIndex.count)
    for (let i = 0; i < srcIndex.count; i++) indices[i] = srcIndex.getX(i)
    return { vertices, indices }
  }

  const indices = new Uint32Array(pos.count)
  for (let i = 0; i < pos.count; i++) indices[i] = i
  return { vertices, indices }
}

export class TerrainPhysics {
  private readonly world: RAPIER.World
  private readonly terrainColliders: Collider[] = []
  private readonly terrainHandles = new Set<number>()
  private readonly actors = new Map<string, CharacterActor>()

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  }

  static async create(): Promise<TerrainPhysics> {
    await RAPIER.init()
    return new TerrainPhysics()
  }

  dispose(): void {
    this.clearTerrain()
    for (const actor of this.actors.values()) {
      actor.controller.free()
      this.world.removeRigidBody(actor.body)
    }
    this.actors.clear()
    this.world.free()
  }

  clearTerrain(): void {
    for (const collider of this.terrainColliders) {
      this.world.removeCollider(collider, false)
    }
    this.terrainColliders.length = 0
    this.terrainHandles.clear()
  }

  setTerrainMeshes(meshes: Mesh[]): void {
    this.clearTerrain()
    for (const mesh of meshes) {
      const tri = meshToTrimesh(mesh)
      if (!tri || tri.indices.length < 3) continue
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.trimesh(tri.vertices, tri.indices).setFriction(1),
      )
      this.terrainColliders.push(collider)
      this.terrainHandles.add(collider.handle)
    }
  }

  private ensureActor(id: string, radius: number, totalHeight: number): CharacterActor {
    const r = Math.max(0.05, radius)
    const h = Math.max(r * 2 + 0.02, totalHeight)
    const existing = this.actors.get(id)
    if (existing && Math.abs(existing.radius - r) < 1e-4 && Math.abs(existing.totalHeight - h) < 1e-4) {
      return existing
    }

    if (existing) {
      existing.controller.free()
      this.world.removeRigidBody(existing.body)
      this.actors.delete(id)
    }

    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased())
    const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(capsuleHalfHeight(r, h), r), body)
    const controller = this.world.createCharacterController(0.04)
    controller.setUp({ x: 0, y: 1, z: 0 })
    controller.setSlideEnabled(true)
    controller.enableAutostep(0.45, 0.18, false)
    controller.enableSnapToGround(0.36)
    controller.setMaxSlopeClimbAngle(Math.acos(0.35))
    controller.setMinSlopeSlideAngle(Math.acos(0.5))

    const actor = { body, collider, controller, radius: r, totalHeight: h }
    this.actors.set(id, actor)
    return actor
  }

  moveCapsuleFromFeet(
    id: string,
    feet: Vector3,
    desiredMovement: Vector3,
    radius: number,
    totalHeight: number,
  ): CharacterMoveResult {
    const actor = this.ensureActor(id, radius, totalHeight)
    const centerY = feet.y + colliderCenterY(actor.totalHeight)
    actor.body.setTranslation({ x: feet.x, y: centerY, z: feet.z }, false)

    actor.controller.computeColliderMovement(
      actor.collider,
      desiredMovement,
      undefined,
      undefined,
      (collider) => this.terrainHandles.has(collider.handle),
    )

    const rawMove = actor.controller.computedMovement()
    const movement = new Vector3(rawMove.x, rawMove.y, rawMove.z)
    actor.body.setTranslation(
      {
        x: feet.x + movement.x,
        y: centerY + movement.y,
        z: feet.z + movement.z,
      },
      false,
    )

    const floor = this.raycastDown(
      feet.x + movement.x,
      feet.y + movement.y + 0.65,
      feet.z + movement.z,
      1.25,
    )
    let grounded = actor.controller.computedGrounded()
    if (floor && floor.normal.y >= 0.35) {
      const movedFeetY = feet.y + movement.y
      const floorGap = movedFeetY - floor.point.y
      if (floorGap <= 0.18 && floorGap >= -0.3) {
        movement.y += floor.point.y - movedFeetY
        grounded = true
      }
    }

    return {
      movement,
      grounded,
      floorY: floor?.point.y ?? null,
    }
  }

  raycastDown(x: number, y: number, z: number, maxDistance: number): {
    point: Vector3
    normal: Vector3
  } | null {
    const hit = this.world.castRayAndGetNormal(
      new RAPIER.Ray({ x, y, z }, { x: 0, y: -1, z: 0 }),
      maxDistance,
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => this.terrainHandles.has(collider.handle),
    )
    if (!hit) return null
    return {
      point: new Vector3(x, y - hit.timeOfImpact, z),
      normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
    }
  }
}
