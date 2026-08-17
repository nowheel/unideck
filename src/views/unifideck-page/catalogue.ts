/**
 * Catalogue selection — the page's pure core.
 *
 * Everything that decides *which* games are shown and *in what order*
 * lives here, as functions over plain data. The React layer above only
 * holds the current filter state and renders what it is handed.
 *
 * The split exists because the old page did all of this inline in a
 * `useMemo` inside the view, which made two things impossible: testing
 * the rules, and seeing that the rules ran on every keystroke over the
 * full library. Both are addressed by moving them out.
 */
import { getCompatByShortcutAppId } from "../../lib/library-facets";
import {
  getCachedCompatByTitle,
  meetsGreatOnDeckCriteria,
} from "../../lib/protondb-cache";
import type { GameCompatInfo } from "../../lib/protondb-cache";
import type { Game, StoreId } from "../../types/api";
import type { PlaytimeEntry } from "../../types/playtime";

/** Status axis of the filter rail. */
export type StatusFilter =
  | "all"
  | "installed"
  | "not-installed"
  | "great-on-deck";

/** Ordering axis, cycled with the Y button. */
export type SortKey = "title" | "recent" | "playtime" | "size" | "store";

/** Every sort in cycle order. */
export const SORT_KEYS: readonly SortKey[] = [
  "title",
  "recent",
  "playtime",
  "size",
  "store",
] as const;

/** Store axis. `"all"` is the unfiltered pseudo-store. */
export type StoreFilter = StoreId | "all";

/** The three axes plus the search box, as held by the page. */
export interface CatalogueQuery {
  store: StoreFilter;
  status: StatusFilter;
  sort: SortKey;
  /** Raw search text; matched case-insensitively as a substring. */
  search: string;
}

/**
 * Playtime totals keyed by `"<store>:<game_id>"`.
 *
 * Built once per fetch so the sort is a map lookup rather than a scan
 * of the playtime array per comparison — with 700+ games an O(n²)
 * comparator is the difference between an instant sort and a stall.
 */
export type PlaytimeIndex = Map<string, PlaytimeEntry>;

/**
 * A game's store-native id.
 *
 * The backend `Game` dataclass has no `id` field at all — it carries
 * `store_game_id`. The frontend `Game` interface predates the
 * unified-types refactor and still declares `id`, which only exists on
 * rows that have been through `adaptGame` (see `hooks/useGameInfo.ts`,
 * where the same `store_game_id ?? id` rule is applied and the same
 * trap is documented). This page reads raw RPC rows, so `game.id` is
 * `undefined` for every one of them.
 *
 * Reading it unguarded is not harmless: it silently produced 42 React
 * children keyed `undefined`, and every playtime lookup missing.
 */
export function gameId(game: Game): string {
  return game.store_game_id ?? game.id ?? "";
}

/**
 * Stable React key.
 *
 * Store-qualified because two storefronts can and do use the same
 * native id for different titles.
 */
export function gameKey(game: Game): string {
  return `${game.store}:${gameId(game)}`;
}

/** Key under which a game's playtime is indexed. */
export function playtimeKey(store: string, id: string): string {
  return `${store}:${id}`;
}

/** Index playtime rows for O(1) lookup during sort/render. */
export function indexPlaytimes(entries: PlaytimeEntry[]): PlaytimeIndex {
  const index: PlaytimeIndex = new Map();
  for (const entry of entries) {
    if (!entry.game_id) continue;
    index.set(playtimeKey(entry.store, entry.game_id), entry);
  }
  return index;
}

/**
 * The playtime row for a game, if we have one.
 *
 * The backend keys these rows on the store-native id (it joins `games`
 * x `game_stats` on it), which is exactly what {@link gameId} resolves.
 */
function entryFor(game: Game, index: PlaytimeIndex): PlaytimeEntry | undefined {
  return index.get(playtimeKey(game.store, gameId(game)));
}

/**
 * Seconds played for a game, preferring the store's cross-device total.
 *
 * `store_total_secs` is the storefront's own figure (GOG/Epic) and is a
 * superset of what we tracked locally, but it is `null` until the first
 * sync — so the local total is the fallback, not the other way round.
 */
export function playedSecs(game: Game, index: PlaytimeIndex): number {
  const entry = entryFor(game, index);
  if (!entry) return 0;
  return entry.store_total_secs ?? entry.total_seconds ?? 0;
}

/** Epoch millis of the last session, or 0 when never played. */
export function lastPlayedMs(game: Game, index: PlaytimeIndex): number {
  const entry = entryFor(game, index);
  if (!entry?.last_played) return 0;
  const parsed = Date.parse(entry.last_played);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Whether a game is installed.
 *
 * Rows straight off `get_all_unifideck_games` carry the wire field
 * `installed`; only rows that have been through `adaptGame` carry
 * `is_installed`. Reading one without the other silently shows an
 * empty "Installed" filter, which is exactly what a previous version
 * of this page did.
 */
export function isInstalled(game: Game): boolean {
  return Boolean(game.installed ?? game.is_installed);
}

/**
 * A game's Deck-compatibility record, or `null` when unknown.
 *
 * Prefers the shortcut-keyed facet record, which is authoritative;
 * falls back to the title-keyed compat cache for titles that sync has
 * not yet mapped to a shortcut AppID.
 */
export function compatFor(game: Game): GameCompatInfo | null {
  if (game.app_id != null) {
    const compat = getCompatByShortcutAppId(game.app_id);
    if (compat) return compat;
  }
  return game.title ? getCachedCompatByTitle(game.title) : null;
}

/** Whether a game clears the Great-on-Deck bar. */
export function isGreatOnDeck(game: Game): boolean {
  return meetsGreatOnDeckCriteria(compatFor(game));
}

/**
 * The sorts worth offering, given the data actually present.
 *
 * Playtime and recency are dropped when nothing has been played:
 * sorting 743 identical zeros is a no-op that silently yields
 * alphabetical order, so leaving them in the cycle offers two settings
 * that appear to do nothing. Measured on this device the playtime
 * database is empty until a first session ends — so both reappear on
 * their own the moment they start meaning something.
 */
export function availableSorts(playtimes: PlaytimeIndex): SortKey[] {
  const hasPlaytime = playtimes.size > 0;
  return SORT_KEYS.filter(
    (key) => hasPlaytime || (key !== "playtime" && key !== "recent"),
  );
}

/** Does this game pass the status axis? */
function matchesStatus(game: Game, status: StatusFilter): boolean {
  switch (status) {
    case "installed":
      return isInstalled(game);
    case "not-installed":
      return !isInstalled(game);
    case "great-on-deck":
      return isGreatOnDeck(game);
    default:
      return true;
  }
}

/**
 * Comparator per sort key.
 *
 * Every non-alphabetical sort falls back to title for ties, so the
 * order is total: without it, the 600-odd games with zero playtime
 * would shuffle between renders and the grid would appear to reorder
 * itself at random.
 */
function comparator(
  sort: SortKey,
  index: PlaytimeIndex,
): (a: Game, b: Game) => number {
  const byTitle = (a: Game, b: Game): number =>
    a.title.localeCompare(b.title);

  switch (sort) {
    case "recent":
      return (a, b) =>
        lastPlayedMs(b, index) - lastPlayedMs(a, index) || byTitle(a, b);
    case "playtime":
      return (a, b) =>
        playedSecs(b, index) - playedSecs(a, index) || byTitle(a, b);
    case "size":
      return (a, b) =>
        (b.size_bytes ?? 0) - (a.size_bytes ?? 0) || byTitle(a, b);
    case "store":
      return (a, b) => a.store.localeCompare(b.store) || byTitle(a, b);
    default:
      return byTitle;
  }
}

/**
 * Apply all four axes and return the games to render.
 *
 * Filters run before the sort so the comparator only ever sees the
 * surviving subset — on a 743-game library with a store selected that
 * is typically a tenth of the work.
 *
 * The input array is never mutated: `sort` runs on a copy, because
 * `data` is the fetch result held in state and React reuses it across
 * renders.
 */
export function selectCatalogue(
  games: readonly Game[],
  query: CatalogueQuery,
  playtimes: PlaytimeIndex,
): Game[] {
  const needle = query.search.trim().toLowerCase();
  const result: Game[] = [];

  for (const game of games) {
    if (query.store !== "all" && game.store !== query.store) continue;
    if (!matchesStatus(game, query.status)) continue;
    if (needle && !game.title.toLowerCase().includes(needle)) continue;
    result.push(game);
  }

  return result.sort(comparator(query.sort, playtimes));
}

/**
 * How many games each store contributes, before the status/search
 * axes are applied.
 *
 * Counting against the unfiltered library is deliberate: the store
 * chips show a stable inventory of what is connected, so switching to
 * "Installed" does not make five of the six chips read zero and look
 * broken.
 */
export function countByStore(games: readonly Game[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const game of games) {
    counts.set(game.store, (counts.get(game.store) ?? 0) + 1);
  }
  return counts;
}

/** Human playtime, at the granularity the number deserves. */
export function formatPlaytime(secs: number): string {
  if (secs <= 0) return "";
  const hours = secs / 3600;
  if (hours < 1) return `${Math.max(1, Math.round(secs / 60))}m`;
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
}

/** Compact size for the tile meta line. Empty when unknown. */
export function formatSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}
