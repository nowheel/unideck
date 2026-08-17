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
 * AppID — `~/.steam/steam/userdata/<uid>/config/grid/<appid>p.jpg` and
 * friends — which is how these games get covers in the native library.
 * So the tile has to ask Steam, not the backend.
 *
 * `AppOverview` exposes three URL getters. We want the 600×900 portrait
 * (`GetLibraryImageURL`), falling back to the capsule and then the
 * header, because a wide header in a 2:3 slot is still better than an
 * empty tile.
 *
 * Every getter is called defensively: these are Steam-internal methods
 * that come and go between client versions, and a missing one must cost
 * a cover, not the page.
 */
import { SteamBridge } from "../../lib/steam-bridge";
import type { Game } from "../../types/api";

/**
 * The bridge is a class rather than a singleton, and holds no state of
 * its own — every method reads through to `window.SteamClient` at call
 * time. One instance for the page is therefore equivalent to the one
 * `index.tsx` builds at boot, and avoids threading it through four
 * layers of props to reach a tile.
 */
const bridge = new SteamBridge();

/**
 * Resolved covers, keyed by the appid we looked up.
 *
 * Paging re-mounts tiles constantly, and without this every page turn
 * would re-enter Steam's app store for covers it has already resolved.
 * `null` is cached too — a game with no artwork should be asked about
 * once, not on every render.
 */
const cache = new Map<number, string | null>();

/** Names tried in order of preference. */
const GETTERS = [
  "GetLibraryImageURL",
  "GetCapsuleImageURL",
  "GetHeaderImageURL",
] as const;

/** Call one of Steam's URL getters, tolerating its absence. */
function tryGetter(overview: unknown, name: string): string | null {
  const fn = (overview as Record<string, unknown>)?.[name];
  if (typeof fn !== "function") return null;
  try {
    const url = (fn as () => unknown).call(overview);
    return typeof url === "string" && url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the artwork URL for one appid.
 *
 * Shortcut AppIDs travel through this codebase in both signed and
 * unsigned 32-bit form — `games.map` stores `-1735172948` for the same
 * app Steam's own log calls `2559794348`. Steam's app store is keyed on
 * the unsigned form, so a signed id looked up as-is simply misses.
 * Both are tried rather than assuming which form arrived.
 */
export function resolveCoverForAppId(appId: number): string | null {
  const cached = cache.get(appId);
  if (cached !== undefined) return cached;

  const candidates =
    appId < 0 ? [appId >>> 0, appId] : [appId, appId | 0];

  let found: string | null = null;
  for (const candidate of candidates) {
    const overview = bridge.getAppOverview(candidate);
    if (!overview) continue;
    for (const getter of GETTERS) {
      found = tryGetter(overview, getter);
      if (found) break;
    }
    if (found) break;
  }

  cache.set(appId, found);
  return found;
}

/**
 * Cover for a game: whatever the backend supplied, else Steam's.
 *
 * Returns `null` when there is nothing to show, which the tile renders
 * as a typographic placeholder rather than a broken image box.
 */
export function resolveCover(game: Game): string | null {
  if (game.cover_image) return game.cover_image;
  if (game.app_id == null) return null;
  return resolveCoverForAppId(game.app_id);
}

/** Drop the memo — used when a sync may have rewritten artwork. */
export function clearCoverCache(): void {
  cache.clear();
}
