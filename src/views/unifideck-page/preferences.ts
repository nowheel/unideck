/**
 * Filter state that survives leaving the page.
 *
 * Decky mounts the route component fresh on every navigation, so
 * without this the catalogue reopens on "All games / All stores /
 * Title" every single time. On a library split across three stores
 * that means re-picking the same chip on every visit.
 *
 * `localStorage` rather than the plugin's config: this is a UI
 * preference of no interest to the backend, and the config file is
 * schema-validated — adding keys there is how the plugin ended up
 * booting in degraded mode. Verified available in `SharedJSContext`,
 * where plugin code runs.
 *
 * Every read is defensive. A stored value that no longer corresponds
 * to anything real — a store that has been disconnected, a sort that
 * was removed — must degrade to the default rather than leaving the
 * page filtered to nothing with no obvious way back.
 */
import { SORT_KEYS, type SortKey, type StatusFilter, type StoreFilter } from "./catalogue";

const KEY = "unifideck:catalogue-filters:v1";

/** The slice of page state worth remembering. */
export interface StoredFilters {
  store: StoreFilter;
  status: StatusFilter;
  sort: SortKey;
}

export const DEFAULT_FILTERS: StoredFilters = {
  store: "all",
  status: "all",
  sort: "title",
};

const STATUSES: readonly StatusFilter[] = [
  "all",
  "installed",
  "not-installed",
  "great-on-deck",
];

/**
 * Read the remembered filters.
 *
 * `validStores` is the set present in the current library; a remembered
 * store missing from it falls back to "all", so disconnecting a store
 * cannot leave the page filtered to nothing.
 *
 * **Omit it when the library has not loaded yet.** Passing an empty
 * array does not mean "no stores are valid" — it means "ask me later",
 * and treating the two the same discarded every remembered store on
 * mount, which is exactly how this shipped broken the first time. The
 * page re-validates once the games arrive.
 */
export function loadFilters(
  validStores?: readonly string[],
): StoredFilters {
  let raw: string | null = null;
  try {
    raw = window.localStorage?.getItem(KEY) ?? null;
  } catch {
    return DEFAULT_FILTERS;
  }
  if (!raw) return DEFAULT_FILTERS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_FILTERS;
  }
  if (typeof parsed !== "object" || parsed === null) return DEFAULT_FILTERS;

  const v = parsed as Partial<StoredFilters>;
  const storeOk =
    v.store === "all" ||
    (v.store != null &&
      (validStores === undefined || validStores.includes(v.store)));

  return {
    store: storeOk ? (v.store as StoreFilter) : DEFAULT_FILTERS.store,
    status:
      v.status && STATUSES.includes(v.status)
        ? v.status
        : DEFAULT_FILTERS.status,
    sort:
      v.sort && SORT_KEYS.includes(v.sort) ? v.sort : DEFAULT_FILTERS.sort,
  };
}

/** Remember the current filters. Failure here is never worth a crash. */
export function saveFilters(filters: StoredFilters): void {
  try {
    window.localStorage?.setItem(KEY, JSON.stringify(filters));
  } catch {
    // Private mode, quota, a storage-less realm — all survivable.
  }
}

/**
 * Last known games-per-store, so the page can notice a library that shrank.
 *
 * Separate key from the filters: the two have different lifetimes and a
 * malformed value in one must not cost the other. This one is also written
 * far more often, and a filter reset because a count failed to parse would be
 * the kind of bug that looks like the page "forgetting" at random.
 */
const COUNTS_KEY = "unifideck:store-counts:v1";

/** The counts last seen by this device. `{}` when nothing was stored yet. */
export function loadStoreCounts(): Record<string, number> {
  let raw: string | null = null;
  try {
    raw = window.localStorage?.getItem(COUNTS_KEY) ?? null;
  } catch {
    return {};
  }
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    // Values are filtered rather than trusted: `detectShrink` tolerates a
    // non-number, but everything downstream reads these as counts and a
    // string that survives to a subtraction becomes NaN in a banner.
    const out: Record<string, number> = {};
    for (const [store, n] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) out[store] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Record the counts as the new baseline.
 *
 * Call this only once the user has *seen* the state — recording on every
 * render would move the baseline down to the shrunken library and the warning
 * would disappear on the next visit, which is the failure this whole thing
 * exists to prevent.
 */
export function saveStoreCounts(counts: ReadonlyMap<string, number>): void {
  try {
    window.localStorage?.setItem(
      COUNTS_KEY,
      JSON.stringify(Object.fromEntries(counts)),
    );
  } catch {
    // Same as above: never worth a crash.
  }
}
