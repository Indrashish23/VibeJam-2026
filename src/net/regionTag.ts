/**
 * Coarse player region used to shard the quick-match queue. We deliberately keep
 * the buckets continent-sized: small enough that everyone in a bucket is likely
 * to get a sub-100ms relay path, large enough that even small player counts
 * usually find a match without falling through to the global pool.
 *
 * The detection is best-effort (timezone-derived) and persisted in localStorage
 * so the same client always lands in the same bucket across reloads.
 */
export type CoarseRegion =
  | 'americas'
  | 'europe'
  | 'asia'
  | 'oceania'
  | 'africa'
  | 'global'

const REGION_VALUES: ReadonlyArray<CoarseRegion> = [
  'americas',
  'europe',
  'asia',
  'oceania',
  'africa',
  'global',
]

const STORAGE_KEY = 'vj.region.v1'

/** Map IANA timezone area prefixes to a coarse bucket. */
const TZ_PREFIX_TO_REGION: Readonly<Record<string, CoarseRegion>> = {
  America: 'americas',
  US: 'americas',
  Canada: 'americas',
  Brazil: 'americas',
  Mexico: 'americas',
  Chile: 'americas',
  Argentina: 'americas',

  Europe: 'europe',
  Atlantic: 'europe',
  Arctic: 'europe',

  Africa: 'africa',

  Asia: 'asia',
  Indian: 'asia',

  Australia: 'oceania',
  Pacific: 'oceania',
  Antarctica: 'oceania',
}

function isCoarseRegion(value: string): value is CoarseRegion {
  return (REGION_VALUES as ReadonlyArray<string>).includes(value)
}

function safeStorageGet(key: string): string | null {
  try {
    return window.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    window.localStorage?.setItem(key, value)
  } catch {
    /* ignore — private mode / quota errors */
  }
}

function detectFromTimezone(): CoarseRegion {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz) return 'global'
    const prefix = tz.split('/')[0] ?? ''
    return TZ_PREFIX_TO_REGION[prefix] ?? 'global'
  } catch {
    return 'global'
  }
}

/**
 * Stable coarse region for this client. Detected lazily and cached in
 * localStorage so we don't re-derive on every queue join.
 */
export function getCoarseRegion(): CoarseRegion {
  const stored = safeStorageGet(STORAGE_KEY)
  if (stored && isCoarseRegion(stored)) return stored
  const detected = detectFromTimezone()
  safeStorageSet(STORAGE_KEY, detected)
  return detected
}

/** Manual override (debug / QA). */
export function setCoarseRegion(region: CoarseRegion): void {
  safeStorageSet(STORAGE_KEY, region)
}
