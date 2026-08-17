/**
 * Cover art resolution for catalogue tiles.
 *
 * `Game.cover_image` is very nearly always empty, which is why the
 * first version of this page rendered a wall of blank tiles. Only the
 * Ubisoft manifest path ever populates it; the synced library cache
 * stores `hero_url` / `icon_url` / `logo_url` as `null` for every row
 * (verified against a 743-game cache: 743 empty).
 *
 * The artwork is real, it just does not live in the plugin's cache.
 * Sync writes it into Steam's own grid store keyed by the *shortcut*
 * AppID, which is how these games get covers in the native library. So
 * the tile has to ask Steam.
 *
 * ── Which Steam API ─────────────────────────────────────────────────
 *
 * Not `SteamClient.Apps.GetAppOverview`: that method does not exist on
 * this client (verified over CDP against the live Steam UI —
 * `typeof` is `"undefined"`), which is why routing through
 * `SteamBridge.getAppOverview` returned `null` for every game and cost
 * a build with no covers at all. `SteamBridge.isReady()` keys off the
 * same missing method, so it is not a usable readiness signal either.
 *
 * The working path is `window.appStore`:
 *
 *   `GetAppOverviewByAppID(appid)` → overview
 *   `GetCustomVerticalCapsuleURLs(overview)` → the shortcut's own art
 *
 * Probing five shortcuts on-device, exactly one candidate ever loaded:
 * the `.jpg` from `GetCustomVerticalCapsuleURLs`, at 1440×2160 or
 * 720×1080. The `.png` sibling, both `/assets/…library_600x900.jpg`
 * forms from `GetCachedVerticalCapsuleURL`, and the CDN URL from
 * `GetVerticalCapsuleURLForApp` all 404 for non-Steam shortcuts.
 *
 * The losers are still returned, last, because they are the paths that
 * *do* work for real Steam entries — the tile walks the list on error
 * rather than trusting any single one.
 */
import type { Game } from "../../types/api";

/** The slice of `window.appStore` this module needs. */
interface AppStore {
  GetAppOverviewByAppID?: (appId: number) => unknown;
  GetCustomVerticalCapsuleURLs?: (overview: unknown) => unknown;
  GetCachedVerticalCapsuleURL?: (overview: unknown) => unknown;
  GetVerticalCapsuleURLForApp?: (overview: unknown) => unknown;
}

function appStore(): AppStore | undefined {
  return (window as unknown as { appStore?: AppStore }).appStore;
}

/**
 * Candidate URLs per appid.
 *
 * Paging re-mounts tiles constantly; without this every page turn
 * would re-enter Steam's app store for art it has already resolved.
 * Empty results are cached too — a game with no artwork should be
 * asked about once, not on every render.
 */
const cache = new Map<number, string[]>();

/** Getters in preference order. See the note on probing above. */
const GETTERS: readonly (keyof AppStore)[] = [
  "GetCustomVerticalCapsuleURLs",
  "GetCachedVerticalCapsuleURL",
  "GetVerticalCapsuleURLForApp",
];

/** These return a string on some paths and an array on others. */
function asUrls(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v !== "");
  }
  return [];
}

/**
 * All artwork URLs worth trying for one appid, best first.
 *
 * Shortcut AppIDs travel through this codebase in both signed and
 * unsigned 32-bit form — `games.map` stores `-1735172948` for the app
 * Steam's own store keys as `2559794348`. Steam is keyed on the
 * unsigned form, so a signed id looked up as-is simply misses, with no
 * error to notice. Both are tried rather than assuming which arrived.
 */
export function coverCandidates(appId: number): string[] {
  const cached = cache.get(appId);
  if (cached !== undefined) return cached;

  const store = appStore();
  const urls: string[] = [];
  let sawOverview = false;

  if (store?.GetAppOverviewByAppID) {
    // Unsigned first — that is the form Steam keys on. De-duplicated
    // because the two coincide for any id below 2^31, and asking Steam
    // the same question twice is pure waste on a 42-tile page.
    const forms = [...new Set([appId >>> 0, appId | 0])];
    for (const form of forms) {
      let overview: unknown;
      try {
        overview = store.GetAppOverviewByAppID.call(store, form);
      } catch {
        continue;
      }
      if (!overview) continue;
      sawOverview = true;
      for (const name of GETTERS) {
        const fn = store[name];
        if (typeof fn !== "function") continue;
        try {
          // Called *with the receiver*. These are prototype methods that
          // reach through `this` (`GetCustomVerticalCapsuleURLs` calls
          // `this.GetCustomImageURLs` internally), so invoking a
          // detached reference throws `Cannot read properties of
          // undefined` — which, swallowed by the catch below, is
          // indistinguishable from "this game has no artwork". That is
          // precisely how this page shipped a build with no covers.
          const raw = (fn as (this: AppStore, o: unknown) => unknown).call(
            store,
            overview,
          );
          for (const url of asUrls(raw)) {
            if (!urls.includes(url)) urls.push(url);
          }
        } catch {
          // A getter Steam has renamed costs its candidates, not the page.
        }
      }
      if (urls.length > 0) break;
    }
  }

  // Only memoise a negative answer once Steam has actually admitted to
  // knowing the app. The page can mount before the shortcut map is
  // populated, and caching "no artwork" during that window would blank
  // every cover for the rest of the session with no way back — the
  // cache would be hiding the very state it should be waiting out.
  if (urls.length > 0 || sawOverview) cache.set(appId, urls);
  return urls;
}

/**
 * Cover candidates for a game: whatever the backend supplied first,
 * then Steam's. Empty when there is nothing to show, which the tile
 * renders as a typographic placeholder rather than a broken image box.
 */
export function resolveCovers(game: Game): string[] {
  const fromBackend = game.cover_image ? [game.cover_image] : [];
  if (game.app_id == null) return fromBackend;
  return [...fromBackend, ...coverCandidates(game.app_id)];
}

/** Drop the memo — used when a sync may have rewritten artwork. */
export function clearCoverCache(): void {
  cache.clear();
}
