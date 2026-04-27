import RAPIER, {
  type Collider,
  type KinematicCharacterController,
  type QueryFilterFlags,
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
/** No query exclusions — some bundlers/runtime left `undefined` filter flags misinterpreted. */
const QUERY_NO_EXCLUDE = 0 as QueryFilterFlags
const MAX_CHARACTER_TRANSLATION_PER_SOLVE = 0.42
/** Avoid huge single-frame impulses (knockback) exploding substep count. */
const MAX_DESIRED_MOVEMENT_PER_FRAME = 7.5

/** Rapier typings differ across releases (`toi` vs older names); runtime exposes time-of-impact. */
function rayColliderIntersectionToi(hit: {
  toi?: number
  timeOfImpact?: number
}): number {
  if (typeof hit.toi === 'number') return hit.toi
  if (typeof hit.timeOfImpact === 'number') return hit.timeOfImpact
  return 0
}

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
  /** Trimesh colliders created without an explicit rigid body (e.g. GLTF terrain). */
  private readonly terrainColliders: Collider[] = []
  /** Fixed rigid bodies for explicit cuboid terrain (default arena). Removed via `removeRigidBody`. */
  private readonly terrainFixedBodies: RigidBody[] = []
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
    for (const body of this.terrainFixedBodies) {
      this.world.removeRigidBody(body)
    }
    this.terrainFixedBodies.length = 0
    for (const collider of this.terrainColliders) {
      this.world.removeCollider(collider, false)
    }
    this.terrainColliders.length = 0
    this.terrainHandles.clear()
  }

  setTerrainMeshes(
    meshes: Mesh[],
    cuboids?: ReadonlyArray<{ center: Vector3; halfExtents: Vector3 }>,
  ): void {
    this.clearTerrain()
    if (cuboids) {
      for (const c of cuboids) {
        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.fixed().setTranslation(c.center.x, c.center.y, c.center.z),
        )
        const collider = this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(
            c.halfExtents.x,
            c.halfExtents.y,
            c.halfExtents.z,
          ).setFriction(1),
          body,
        )
        this.terrainFixedBodies.push(body)
        this.terrainHandles.add(collider.handle)
      }
    }
    for (const mesh of meshes) {
      const tri = meshToTrimesh(mesh)
      if (!tri || tri.indices.length < 3) continue
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.trimesh(tri.vertices, tri.indices).setFriction(1),
      )
      this.terrainColliders.push(collider)
      this.terrainHandles.add(collider.handle)
    }
    if (this.terrainHandles.size === 0) {
      console.warn(
        '[terrain] No mesh/cuboid colliders — adding emergency floor so the player does not fall forever.',
      )
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0))
      const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(400, 0.5, 400).setFriction(1), body)
      this.terrainFixedBodies.push(body)
      this.terrainHandles.add(collider.handle)
    }
    /* Broadphase/narrowphase need at least one step before character queries see terrain. */
    this.world.timestep = 1 / 60
    this.world.step()
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

  /**
   * Snap a kinematic capsule to world feet (round reset / spawn). Runs a physics step so
   * broadphase and character controllers don’t keep stale contact state from the prior pose.
   */
  warpCapsuleToFeet(
    id: string,
    feet: Vector3,
    radius: number,
    totalHeight: number,
  ): void {
    const actor = this.ensureActor(id, radius, totalHeight)
    const cy = feet.y + colliderCenterY(actor.totalHeight)
    actor.body.setTranslation({ x: feet.x, y: cy, z: feet.z }, true)
    this.world.propagateModifiedBodyPositionsToColliders()
    this.world.timestep = 1 / 60
    this.world.step()
  }

  moveCapsuleFromFeet(
    id: string,
    feet: Vector3,
    desiredMovement: Vector3,
    radius: number,
    totalHeight: number,
    deltaSeconds: number,
  ): CharacterMoveResult {
    const actor = this.ensureActor(id, radius, totalHeight)
    const dt = Math.min(1 / 30, Math.max(1 / 360, deltaSeconds))
    this.world.timestep = dt

    const dm = desiredMovement.clone()
    const dmLen = dm.length()
    if (dmLen > MAX_DESIRED_MOVEMENT_PER_FRAME) dm.multiplyScalar(MAX_DESIRED_MOVEMENT_PER_FRAME / dmLen)

    const mag = dm.length()
    const n = Math.max(1, Math.ceil(mag / MAX_CHARACTER_TRANSLATION_PER_SOLVE))
    const slice = dm.multiplyScalar(1 / n)

    const totalMovement = new Vector3(0, 0, 0)
    const workFeet = feet.clone()
    let grounded = false
    let floorY: number | null = null

    for (let i = 0; i < n; i++) {
      const centerY = workFeet.y + colliderCenterY(actor.totalHeight)
      actor.body.setTranslation({ x: workFeet.x, y: centerY, z: workFeet.z }, true)
      this.world.propagateModifiedBodyPositionsToColliders()
      this.world.step()

      actor.controller.computeColliderMovement(
        actor.collider,
        slice,
        QUERY_NO_EXCLUDE,
        undefined,
        (collider) => this.terrainHandles.has(collider.handle),
      )

      const rawMove = actor.controller.computedMovement()
      const stepMove = new Vector3(rawMove.x, rawMove.y, rawMove.z)
      totalMovement.add(stepMove)
      workFeet.add(stepMove)

      const floor = this.raycastDown(workFeet.x, workFeet.y + 0.65, workFeet.z, 1.25)
      grounded = actor.controller.computedGrounded()
      const upwardIntent = desiredMovement.y > 0.02
      if (!upwardIntent && floor && floor.normal.y >= 0.35) {
        const floorGap = workFeet.y - floor.point.y
        if (floorGap <= 0.18 && floorGap >= -0.3) {
          totalMovement.y += floor.point.y - workFeet.y
          workFeet.y = floor.point.y
          grounded = true
        }
      }
      floorY = floor?.point.y ?? floorY
    }

    const finalCenterY = feet.y + colliderCenterY(actor.totalHeight) + totalMovement.y
    actor.body.setTranslation(
      {
        x: feet.x + totalMovement.x,
        y: finalCenterY,
        z: feet.z + totalMovement.z,
      },
      true,
    )

    return {
      movement: totalMovement,
      grounded,
      floorY,
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
      QUERY_NO_EXCLUDE,
      undefined,
      undefined,
      undefined,
      (collider) => this.terrainHandles.has(collider.handle),
    )
    if (!hit) return null
    const toi = rayColliderIntersectionToi(hit)
    return {
      point: new Vector3(x, y - toi, z),
      normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
    }
  }
}
