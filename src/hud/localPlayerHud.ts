/** Bottom-right launch % + portrait HUD helpers (colors, smoke, shake). */

export const PORTRAIT_IDLE_URL = new URL('../../Assets/UI/HUD/Portraits/Idle.png', import.meta.url).href
export const PORTRAIT_STUNNED_URL = new URL('../../Assets/UI/HUD/Portraits/Stunned.png', import.meta.url).href
export const PORTRAIT_SCREAM_URL = new URL('../../Assets/UI/HUD/Portraits/Scream.png', import.meta.url).href
export const PORTRAIT_HURT_URL = new URL('../../Assets/UI/HUD/Portraits/Hurt.png', import.meta.url).href

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Smooth white → yellow → orange → red for launch percent (same units as gameplay 0–999 cap). */
export function launchPercentTextColor(percent: number): string {
  const x = Math.max(0, Math.min(100, percent))
  let r: number
  let g: number
  let b: number
  if (x <= 33) {
    const t = x / 33
    r = lerp(255, 253, t)
    g = lerp(255, 224, t)
    b = lerp(255, 71, t)
  } else if (x <= 66) {
    const t = (x - 33) / 33
    r = lerp(253, 251, t)
    g = lerp(224, 146, t)
    b = lerp(71, 60, t)
  } else {
    const t = (x - 66) / 34
    r = lerp(251, 220, t)
    g = lerp(146, 38, t)
    b = lerp(60, 38, t)
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}

export function smokeIntensity01(percent: number): number {
  if (percent < 60) return 0
  if (percent < 80) return 0.12 + ((percent - 60) / 20) * 0.38
  return Math.min(1, 0.52 + ((percent - 80) / 220) * 0.48)
}

type SmokeParticle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  r: number
  gx: number
}

export class HudSmokeLayer {
  private readonly canvas: HTMLCanvasElement
  private particles: SmokeParticle[] = []
  private dpr = 1
  private spawnAcc = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1)
    const w = Math.max(80, rect.width)
    const h = Math.max(48, rect.height)
    this.canvas.width = Math.floor(w * this.dpr)
    this.canvas.height = Math.floor(h * this.dpr)
  }

  tick(deltaSec: number, intensity01: number): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    if (this.canvas.width < 8 || this.canvas.height < 8) return

    const w = this.canvas.width
    const h = this.canvas.height

    ctx.clearRect(0, 0, w, h)

    if (intensity01 < 1e-3) {
      this.particles.length = 0
      this.spawnAcc = 0
      return
    }

    const spawnRate = intensity01 < 0.48 ? intensity01 * 36 : intensity01 * 110
    this.spawnAcc += spawnRate * deltaSec
    const spread = intensity01 < 0.48 ? 0.55 : 1
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1
      this.particles.push({
        x: Math.random() * w,
        y: h + Math.random() * 18 * this.dpr,
        vx: (Math.random() - 0.5) * 36 * spread * this.dpr,
        vy: (-22 - Math.random() * 55 * intensity01) * this.dpr,
        life: 0,
        maxLife: 0.55 + Math.random() * 0.85 + intensity01 * 0.45,
        r: (2.2 + Math.random() * 5.5) * this.dpr * (0.75 + intensity01 * 0.55),
        gx: Math.random() * Math.PI * 2,
      })
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!
      p.life += deltaSec
      p.gx += deltaSec * 6.5
      p.vx += Math.sin(p.gx) * 14 * deltaSec * this.dpr
      p.x += p.vx * deltaSec
      p.y += p.vy * deltaSec
      if (p.life >= p.maxLife || p.y < -p.r * 4) {
        this.particles.splice(i, 1)
        continue
      }
      const t = 1 - p.life / p.maxLife
      const a = t * (0.1 + intensity01 * 0.5)
      const rad = p.r * (0.95 + Math.sin(p.life * 11) * 0.06)
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 1.4)
      g.addColorStop(0, `rgba(220,220,225,${a})`)
      g.addColorStop(0.5, `rgba(150,150,155,${a * 0.55})`)
      g.addColorStop(1, 'rgba(80,80,88,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

export function triggerHudDamageShake(
  pctEl: HTMLElement | null,
  portraitEl: HTMLElement | null,
  launchPercent: number,
): void {
  const amt = Math.min(22, 5 + (Math.min(999, Math.max(0, launchPercent)) / 100) * 8)
  pctEl?.style.setProperty('--hud-hit-shake', `${amt}px`)
  portraitEl?.style.setProperty('--hud-hit-shake', `${amt}px`)
  const apply = (el: HTMLElement | null) => {
    if (!el) return
    el.classList.remove('hud-hit-shake')
    void el.offsetWidth
    el.classList.add('hud-hit-shake')
  }
  apply(pctEl)
  apply(portraitEl)
}
