import type { AssetRegistry } from '../registries/AssetRegistry'
import type { AssetDefinition } from '../types'

/**
 * Asset seed — wraps the repo's existing `Assets/` GLBs and audio files as registered
 * AssetDefinitions so the asset panel is populated on boot with real content to drag
 * into the viewport. URLs are resolved via `new URL(..., import.meta.url)` so Vite
 * hashes and copies them into `dist/` for production (same pattern the rest of the
 * game uses — see `src/maps.ts` `ARENA_EXPORT_GLB_URL`).
 */

/* Models */
const mArena = new URL('../../../Assets/Maps/arena_export.glb', import.meta.url).href
const mLobbyMonkey = new URL('../../../Assets/Props/LobbyMonkeyModel.glb', import.meta.url).href
const mPortal = new URL('../../../Assets/Props/portal.glb', import.meta.url).href
const mMegaphone = new URL('../../../Assets/Props/MegaPhone.glb', import.meta.url).href
const mOpenedBanana = new URL('../../../Assets/Props/OpenedBanana.glb', import.meta.url).href
const mBananaPickup = new URL('../../../Assets/Props/Banana_Pickup.glb', import.meta.url).href
const mIdle = new URL('../../../Assets/MonkeyModel/Idle.glb', import.meta.url).href
const mRunning = new URL('../../../Assets/MonkeyModel/Running.glb', import.meta.url).href
const mJumping = new URL('../../../Assets/MonkeyModel/Jumping.glb', import.meta.url).href
const mHitReact = new URL('../../../Assets/MonkeyModel/HitReact.glb', import.meta.url).href
const mRecSound = new URL('../../../Assets/MonkeyModel/RecordingSound.glb', import.meta.url).href
const mShootSound = new URL('../../../Assets/MonkeyModel/ShootingSound.glb', import.meta.url).href

/* Music / SFX */
const aBgMain = new URL('../../../Assets/Music/BGMain.mp3', import.meta.url).href
const aGameMusic = new URL('../../../Assets/Music/GameMusic.mp3', import.meta.url).href
const aMatchVictory = new URL('../../../Assets/SFX/match_victory.mp3', import.meta.url).href
const aImpact = new URL('../../../Assets/SFX/ImpactSound.mp3', import.meta.url).href
const aJump = new URL('../../../Assets/SFX/JumpSound.ogg', import.meta.url).href
const aLand = new URL('../../../Assets/SFX/LandingonGround.ogg', import.meta.url).href
const aThrow = new URL('../../../Assets/SFX/ThrowSound.ogg', import.meta.url).href
const aSlip = new URL('../../../Assets/SFX/slip_sound.ogg', import.meta.url).href
const aHitUnder20 = new URL('../../../Assets/SFX/HitEffects/Under 20%.ogg', import.meta.url).href
const aHitOver20 = new URL('../../../Assets/SFX/HitEffects/Over20%.ogg', import.meta.url).href
const aHitOver20v2 = new URL('../../../Assets/SFX/HitEffects/Over20%v2.ogg', import.meta.url).href
const aHitOver50 = new URL('../../../Assets/SFX/HitEffects/Over50%.ogg', import.meta.url).href
const aHitOver70 = new URL('../../../Assets/SFX/HitEffects/Over70%.ogg', import.meta.url).href
const aFs2 = new URL('../../../Assets/SFX/Footsteps/footstep-cat-2.wav', import.meta.url).href
const aFs3 = new URL('../../../Assets/SFX/Footsteps/footstep-cat-3.wav', import.meta.url).href
const aFs4 = new URL('../../../Assets/SFX/Footsteps/footstep-cat-4.wav', import.meta.url).href
const aFs5 = new URL('../../../Assets/SFX/Footsteps/footstep-cat-5.wav', import.meta.url).href
const aFs6 = new URL('../../../Assets/SFX/Footsteps/footstep-cat-6.wav', import.meta.url).href
const aFs7 = new URL('../../../Assets/SFX/Footsteps/footstep-cat-7.wav', import.meta.url).href

export const ASSETS: AssetDefinition[] = [
  { id: 'model.arena_export', label: 'Arena', category: 'model', url: mArena },
  { id: 'model.lobby_monkey', label: 'Lobby Monkey', category: 'model', url: mLobbyMonkey },
  { id: 'model.portal', label: 'Portal', category: 'model', url: mPortal },
  { id: 'model.megaphone', label: 'Megaphone', category: 'model', url: mMegaphone },
  { id: 'model.opened_banana', label: 'Opened Banana', category: 'model', url: mOpenedBanana },
  { id: 'model.banana_pickup', label: 'Banana Pickup', category: 'model', url: mBananaPickup },
  { id: 'model.anim_idle', label: 'Anim: Idle', category: 'model', url: mIdle },
  { id: 'model.anim_running', label: 'Anim: Running', category: 'model', url: mRunning },
  { id: 'model.anim_jumping', label: 'Anim: Jumping', category: 'model', url: mJumping },
  { id: 'model.anim_hit_react', label: 'Anim: HitReact', category: 'model', url: mHitReact },
  { id: 'model.anim_recording', label: 'Anim: Recording', category: 'model', url: mRecSound },
  { id: 'model.anim_shooting', label: 'Anim: Shooting', category: 'model', url: mShootSound },

  { id: 'audio.bg_main', label: 'BGM: Main', category: 'audio', url: aBgMain },
  { id: 'audio.game_music', label: 'BGM: Game', category: 'audio', url: aGameMusic },
  { id: 'audio.match_victory', label: 'SFX: Victory', category: 'audio', url: aMatchVictory },
  { id: 'audio.impact', label: 'SFX: Impact', category: 'audio', url: aImpact },
  { id: 'audio.jump', label: 'SFX: Jump', category: 'audio', url: aJump },
  { id: 'audio.land', label: 'SFX: Land', category: 'audio', url: aLand },
  { id: 'audio.throw', label: 'SFX: Throw', category: 'audio', url: aThrow },
  { id: 'audio.slip', label: 'SFX: Slip', category: 'audio', url: aSlip },
  { id: 'audio.hit_under20', label: 'Hit: <20%', category: 'audio', url: aHitUnder20 },
  { id: 'audio.hit_over20', label: 'Hit: >20%', category: 'audio', url: aHitOver20 },
  { id: 'audio.hit_over20v2', label: 'Hit: >20% v2', category: 'audio', url: aHitOver20v2 },
  { id: 'audio.hit_over50', label: 'Hit: >50%', category: 'audio', url: aHitOver50 },
  { id: 'audio.hit_over70', label: 'Hit: >70%', category: 'audio', url: aHitOver70 },
  { id: 'audio.footstep_2', label: 'Footstep 2', category: 'audio', url: aFs2 },
  { id: 'audio.footstep_3', label: 'Footstep 3', category: 'audio', url: aFs3 },
  { id: 'audio.footstep_4', label: 'Footstep 4', category: 'audio', url: aFs4 },
  { id: 'audio.footstep_5', label: 'Footstep 5', category: 'audio', url: aFs5 },
  { id: 'audio.footstep_6', label: 'Footstep 6', category: 'audio', url: aFs6 },
  { id: 'audio.footstep_7', label: 'Footstep 7', category: 'audio', url: aFs7 },
]

export function registerBuiltinAssets(registry: AssetRegistry): void {
  for (const a of ASSETS) registry.register(a)
}

/** Look up a real asset URL by its registry id — used by vibejam entity type defaults. */
export function getAssetUrl(id: string): string {
  const hit = ASSETS.find((a) => a.id === id)
  return hit?.url ?? ''
}
