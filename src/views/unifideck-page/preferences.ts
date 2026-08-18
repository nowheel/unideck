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
