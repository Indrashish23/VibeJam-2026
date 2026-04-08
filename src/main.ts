import './style.css';
import * as THREE from 'three';
import {
  CHARGE_MAX_DB,
  CHARGE_MIN_DB,
  MIN_CHARGE_TO_FIRE,
  canFireAfterCooldown,
  clampDbForDisplay,
  dbToCharge,
  meetsFireThreshold,
} from './charge';
import { createMicPipeline, type MicPipeline } from './micLevel';

const MOVE_SPEED = 7;
const COOLDOWN_MS = 450;
const PROJECTILE_BASE_SPEED = 42;
const PROJECTILE_LIFETIME_MS = 2800;
const FEEDBACK_HIDE_MS = 2200;
const PLANE_HALF = 24;

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const micDbEl = document.querySelector<HTMLSpanElement>('#mic-db')!;
const micMeterEl = document.querySelector<HTMLMeterElement>('#mic-meter')!;
const chargeLabelEl = document.querySelector<HTMLSpanElement>('#charge-label')!;
const fireFeedbackEl = document.querySelector<HTMLParagraphElement>('#fire-feedback')!;
const cooldownEl = document.querySelector<HTMLParagraphElement>('#hud-cooldown')!;
const micBanner = document.querySelector<HTMLParagraphElement>('#mic-banner')!;
const shotCountEl = document.querySelector<HTMLSpanElement>('#shot-count')!;
const clickToPlay = document.querySelector<HTMLDivElement>('#click-to-play')!;

let mic: MicPipeline | null = null;
let micInitFailed = false;

let pointerLocked = false;
let charging = false;
let peakCharge = 0;

let lastFireTime = 0;
let shotCount = 0;
let feedbackHideAt = 0;

function setShotCount(n: number): void {
  shotCount = n;
  shotCountEl.textContent = String(n);
}

function showFireFeedback(message: string): void {
  fireFeedbackEl.textContent = message;
  fireFeedbackEl.hidden = false;
  feedbackHideAt = performance.now() + FEEDBACK_HIDE_MS;
}

async function ensureMicFromGesture(): Promise<void> {
  if (mic || micInitFailed) return;
  const pipeline = await createMicPipeline();
  if (!pipeline) {
    micInitFailed = true;
    micBanner.hidden = false;
    return;
  }
  mic = pipeline;
  await mic.resume();
}

function disposeMic(): void {
  mic?.dispose();
  mic = null;
}

function spawnProjectile(charge: number): void {
  const geom = new THREE.SphereGeometry(0.12 + 0.06 * charge, 10, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff6b2e });
  const mesh = new THREE.Mesh(geom, mat);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  mesh.position.copy(camera.position).addScaledVector(dir, 0.6);
  mesh.position.y += 0.05;
  scene.add(mesh);
  const speed = PROJECTILE_BASE_SPEED * (0.25 + 0.75 * charge);
  projectiles.push({
    mesh,
    velocity: dir.clone().multiplyScalar(speed),
    born: performance.now(),
  });
}

let sfxCtx: AudioContext | null = null;
function playFireSound(): void {
  try {
    if (!sfxCtx) sfxCtx = new AudioContext();
    void sfxCtx.resume();
    const o = sfxCtx.createOscillator();
    const g = sfxCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 520;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(sfxCtx.destination);
    o.start();
    o.stop(sfxCtx.currentTime + 0.06);
  } catch {
    /* ignore */
  }
}

function tryReleaseShot(now: number): void {
  if (!canFireAfterCooldown(now, lastFireTime, COOLDOWN_MS)) {
    cooldownEl.hidden = false;
    return;
  }

  if (!meetsFireThreshold(peakCharge, MIN_CHARGE_TO_FIRE)) {
    showFireFeedback('Louder — hold LMB and shout to charge, then release.');
    return;
  }

  lastFireTime = now;
  cooldownEl.hidden = true;
  spawnProjectile(peakCharge);
  playFireSound();
  setShotCount(shotCount + 1);
}

// —— Three.js scene ——
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0a18);
scene.fog = new THREE.Fog(0x0c0a18, 12, 55);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 120);
camera.position.set(0, 1.55, 6);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const hemi = new THREE.HemisphereLight(0xaab8ff, 0x1a1020, 0.9);
scene.add(hemi);
const dirLight = new THREE.DirectionalLight(0xfff2dd, 0.55);
dirLight.position.set(4, 10, 6);
scene.add(dirLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(48, 48),
  new THREE.MeshStandardMaterial({ color: 0x1e1a2e, roughness: 1, metalness: 0 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

type Projectile = { mesh: THREE.Mesh; velocity: THREE.Vector3; born: number };
const projectiles: Projectile[] = [];

const keys = new Set<string>();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
resize();
window.addEventListener('resize', resize);

canvas.addEventListener('click', () => {
  void ensureMicFromGesture();
  if (!pointerLocked) {
    canvas.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  clickToPlay.classList.toggle('hidden', pointerLocked);
  if (!pointerLocked) {
    charging = false;
    peakCharge = 0;
  }
});

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !pointerLocked) return;
  void ensureMicFromGesture();
  charging = true;
  peakCharge = 0;
});

document.addEventListener('mouseup', (e) => {
  if (e.button !== 0 || !pointerLocked) return;
  if (!charging) return;
  charging = false;
  const now = performance.now();
  tryReleaseShot(now);
  peakCharge = 0;
});

document.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  const s = 0.0022;
  euler.setFromQuaternion(camera.quaternion, 'YXZ');
  euler.y -= e.movementX * s;
  euler.x -= e.movementY * s;
  euler.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, euler.x));
  camera.quaternion.setFromEuler(euler);
});

document.addEventListener('keydown', (e) => {
  keys.add(e.code);
});

document.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

window.addEventListener('beforeunload', () => {
  disposeMic();
});

const clock = new THREE.Clock();

function tick(): void {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  if (now >= feedbackHideAt && !fireFeedbackEl.hidden) {
    fireFeedbackEl.hidden = true;
  }

  let currentCharge = 0;
  if (mic) {
    const { dbfs } = mic.getLevels();
    const dbClamped = clampDbForDisplay(dbfs);
    lastDbDisplay = dbClamped;
    currentCharge = dbToCharge(dbfs, CHARGE_MIN_DB, CHARGE_MAX_DB);
    micDbEl.textContent = `${dbClamped.toFixed(0)} dBFS`;
    const meterVal = ((dbClamped - -60) / 60) * 100;
    micMeterEl.value = Math.max(0, Math.min(100, meterVal));
  } else {
    micDbEl.textContent = micInitFailed ? '—' : '…';
    micMeterEl.value = 0;
  }

  if (charging && mic) {
    peakCharge = Math.max(peakCharge, currentCharge);
    chargeLabelEl.textContent = `${Math.round(peakCharge * 100)}% (peak)`;
  } else if (!charging) {
    chargeLabelEl.textContent = `${Math.round(currentCharge * 100)}%`;
  }

  if (pointerLocked) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 1e-6) forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize().negate();

    let mx = 0;
    let mz = 0;
    if (keys.has('KeyW')) mz += 1;
    if (keys.has('KeyS')) mz -= 1;
    if (keys.has('KeyA')) mx -= 1;
    if (keys.has('KeyD')) mx += 1;

    const move = new THREE.Vector3();
    move.addScaledVector(forward, mz);
    move.addScaledVector(right, mx);
    if (move.lengthSq() > 1e-6) {
      move.normalize().multiplyScalar(MOVE_SPEED * dt);
      camera.position.add(move);
    }
  }

  camera.position.y = 1.55;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -PLANE_HALF, PLANE_HALF);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -PLANE_HALF, PLANE_HALF);

  if (now - lastFireTime >= COOLDOWN_MS) {
    cooldownEl.hidden = true;
  }

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]!;
    p.mesh.position.addScaledVector(p.velocity, dt);
    if (now - p.born > PROJECTILE_LIFETIME_MS) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
      projectiles.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
}

tick();
