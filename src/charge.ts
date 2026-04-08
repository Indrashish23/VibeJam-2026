/** dBFS display clamp (typical quiet room ~ -50 to -40). */
export const DB_DISPLAY_MIN = -60;
export const DB_DISPLAY_MAX = 0;

/** Map mic loudness (dBFS) into 0..1 charge; `minDb` = silence-ish, `maxDb` = very loud. */
export const CHARGE_MIN_DB = -48;
export const CHARGE_MAX_DB = -12;

/** Minimum normalized charge required to fire on LMB release. */
export const MIN_CHARGE_TO_FIRE = 0.22;

export function rmsToDbfs(rms: number, epsilon = 1e-10): number {
  const v = Math.max(rms, epsilon);
  return 20 * Math.log10(v);
}

export function clampDbForDisplay(db: number): number {
  return Math.min(DB_DISPLAY_MAX, Math.max(DB_DISPLAY_MIN, db));
}

export function dbToCharge(db: number, minDb: number, maxDb: number): number {
  if (maxDb <= minDb) return 0;
  if (db <= minDb) return 0;
  if (db >= maxDb) return 1;
  return (db - minDb) / (maxDb - minDb);
}

export function meetsFireThreshold(charge: number, minCharge: number): boolean {
  return charge >= minCharge;
}

export function canFireAfterCooldown(now: number, lastFireTime: number, cooldownMs: number): boolean {
  return now - lastFireTime >= cooldownMs;
}
