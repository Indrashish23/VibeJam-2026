import { describe, it, expect } from 'vitest';
import {
  rmsToDbfs,
  dbToCharge,
  meetsFireThreshold,
  canFireAfterCooldown,
  clampDbForDisplay,
  DB_DISPLAY_MIN,
  DB_DISPLAY_MAX,
} from './charge';

describe('rmsToDbfs', () => {
  it('maps full scale toward 0 dBFS', () => {
    expect(rmsToDbfs(1)).toBeCloseTo(0, 5);
  });

  it('is finite for tiny RMS', () => {
    expect(Number.isFinite(rmsToDbfs(0))).toBe(true);
  });
});

describe('dbToCharge', () => {
  it('is 0 at or below minDb', () => {
    expect(dbToCharge(-50, -40, -10)).toBe(0);
    expect(dbToCharge(-40, -40, -10)).toBe(0);
  });

  it('is 1 at or above maxDb', () => {
    expect(dbToCharge(-5, -40, -10)).toBe(1);
    expect(dbToCharge(-10, -40, -10)).toBe(1);
  });

  it('interpolates between min and max', () => {
    expect(dbToCharge(-25, -40, -10)).toBeCloseTo(0.5, 5);
  });
});

describe('meetsFireThreshold', () => {
  it('respects min charge', () => {
    expect(meetsFireThreshold(0.3, 0.22)).toBe(true);
    expect(meetsFireThreshold(0.2, 0.22)).toBe(false);
  });
});

describe('canFireAfterCooldown', () => {
  it('blocks inside cooldown', () => {
    expect(canFireAfterCooldown(400, 100, 500)).toBe(false);
  });

  it('allows at boundary', () => {
    expect(canFireAfterCooldown(600, 100, 500)).toBe(true);
  });
});

describe('clampDbForDisplay', () => {
  it('clamps to display range', () => {
    expect(clampDbForDisplay(-100)).toBe(DB_DISPLAY_MIN);
    expect(clampDbForDisplay(5)).toBe(DB_DISPLAY_MAX);
    expect(clampDbForDisplay(-30)).toBe(-30);
  });
});
