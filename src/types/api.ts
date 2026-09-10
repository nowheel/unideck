/**
 * Backend RPC contract — TypeScript mirror of `core/types/`.
 *
 * Every dataclass exposed via `to_dict()` on the Python side
 * has its TS interface here. Field names use the wire format
 * (snake_case) so JSON parsing is a no-op cast — no runtime
 * adapter, no field rename pass.
 *
 * If a field is added on the backend dataclass, it MUST be
 * added here in the same PR that lands the backend change.
 * The contract is enforced by reviewers, not by tooling
 * (TypeScript can't see Python).
 */
import type { CompatTrack } from "../lib/steam-bridge/compat-packed";

/** One verification test-result row in the compatibility details
 *  modal. ``passed === true`` renders a green checkmark; ``false``
 *  renders a yellow warning.
 *
 *  Carries Valve's own ``loc_token``, localised at render time through
 *  the Steam client (see ``lib/compat-tokens.ts``). ``text`` appears
 *  only on cache entries written before that rework and holds
 *  pre-resolved English. */
export interface CompatTestResult {
  token?: string;
  text?: string;
  passed: boolean;
}

/** One device's rating for a game. */
export interface CompatTrackInfo {
  /** ``0`` unknown, ``1`` unsupported, ``2`` playable, ``3`` verified.
   *  For the ``steamos`` track ``2`` means "SteamOS Compatible" and
   *  ``3`` is never used. */
  category: 0 | 1 | 2 | 3;
  status: string;
  test_results: CompatTestResult[];
}

/** Rich display metadata for the game info panel — sourced from
 *  Steam Store appdetails (preferred), UnifiDB, and Metacritic
 *  (fallback). Returned by ``get_game_metadata_display``. Kept
 *  separate from {@link Game} so install-state and
 *  display-metadata can be cached and refreshed independently. */
export interface GameMetadata {
  /** Real Steam App ID when the shortcut was resolved to a Steam
   *  store entry, ``0`` otherwise. Gates the steam:// nav buttons. */
  steam_app_id: number;
  /** True when ``steam_app_id`` corresponds to a real Steam Store
   *  page (validated against the cached appdetails payload). */
  has_steam_store_page: boolean;
  store: StoreId;
  /** Third-party store landing URL — used when no Steam page exists. */
  store_url: string;
  title: string;
  developer: string;
  publisher: string;
  release_date: string;
  metacritic: number | null;
  description: string;
  /** Which rating track describes the device this is running on —
   *  resolved by the backend from DMI, so the UI never guesses. */
  compat_device: CompatTrack;
  /** Every device's rating, keyed by track. Shipping all of them costs
   *  nothing at one game and leaves room to show cross-device ratings
   *  without another RPC. */
  compat: Record<CompatTrack, CompatTrackInfo>;
  genres: string[];
  homepage_url?: string;
  /** Whether THIS store's copy of the game has native cloud saves.
   *  ``null``/absent = unknown (no enriched entry), and the UI stays quiet
   *  rather than claiming an absence. Known before the game is installed, so
   *  it can inform which storefront's copy to download. */
  cloud_saves?: boolean | null;
}

/**
 * Universal `Game` representation aggregated from any store.
 *
 * ⚠ This interface predates the unified-types refactor and does **not**
 * match the backend dataclass field for field. Two shapes reach it:
 *
 *   - **raw wire rows**, straight off `get_all_unifideck_games`. These
 *     mirror `core/types/domain.py`: `store_game_id`, `installed`,
 *     `exe_path`, `tags`. They carry **no `id`, no `is_installed`, no
 *     `cover_image`** — those three simply do not exist on the backend
 *     dataclass;
 *   - **adapted rows**, produced by `adaptGame` in `hooks/useGameInfo.ts`,
 *     which renames the above into the older frontend names.
 *
 * Reading an adapted-only field on a raw row is silent, not loud: it
 * yields `undefined`, and has already shipped as three separate bugs —
 * an always-empty "Installed" filter, a grid of tiles keyed `undefined`,
 * and playtime lookups that never matched.
 *
 * The fields below are annotated with which shape provides them. When
 * consuming raw rows, prefer the helpers in
 * `views/unifideck-page/catalogue.ts` (`gameId`, `gameKey`,
 * `isInstalled`) over reading these directly.
 */
export interface Game {
  /** ADAPTED ONLY. Absent on raw rows — use `store_game_id`. */
  id?: string;
  /** BOTH. The store-native id; the field the backend actually sends. */
  store_game_id: string;
  /** BOTH. */
  title: string;
  /** BOTH. */
  store: StoreId;
  /** ADAPTED ONLY. Raw rows carry `installed` instead. */
  is_installed?: boolean;
  /** RAW. Backend `Game.installed`; `adaptGame` folds it into
   *  `is_installed`. Read `installed ?? is_installed`. */
  installed?: boolean;
  /** ADAPTED ONLY, and rarely set even then: only the Ubisoft manifest
   *  path populates it. For raw rows the artwork lives in Steam's grid
   *  store — see `views/unifideck-page/cover.ts`. */
  cover_image?: string;
  /** BOTH. */
  install_path?: string;
  /** ADAPTED ONLY. Raw rows carry `exe_path`. */
  executable?: string;
  /** RAW. Backend `Game.exe_path`. */
  exe_path?: string;
  /** BOTH. Shortcut AppID, in the **signed** 32-bit reading. Steam's
   *  own APIs want the unsigned one — convert via `lib/appid.ts`. */
  app_id?: number;
  steam_app_id?: number;
  ownership_type?: OwnershipType;
  /** ADAPTED ONLY. Raw rows carry `tags`. */
  store_tags?: GameTag[];
  /** RAW. Backend `Game.tags`. */
  tags?: string[];
  /** BOTH. Zero until the game is installed. */
  size_bytes?: number;
  deck_rating?: DeckRating;
  /** RAW. Artwork URLs from the store; null for every row in practice. */
  icon_url?: string | null;
  hero_url?: string | null;
  logo_url?: string | null;
  /** RAW. Store-specific extras; usually empty. */
  metadata?: Record<string, unknown>;
}

/** One achievement (definition + this user's unlock status). */
export interface Achievement {
  key: string;
  name: string;
  description: string;
  image_unlocked: string;
  image_locked: string;
  hidden: boolean;
  unlocked: boolean;
  /** Epoch seconds the achievement was unlocked, or null if still locked. */
  unlocked_at: number | null;
  rarity?: number | null;
}

/** A game's achievements + summary (from `get_game_achievements`). */
export interface GameAchievements {
  store: StoreId;
  game_id: string;
  total: number;
  unlocked: number;
  percent: number;
  achievements: Achievement[];
}

/** Last play session's unlock summary (from `get_last_session_achievements`). */
export interface LastSessionAchievements {
  names: string[];
  unlocked: number;
  percent: number;
  date: number;
}

/** A streaming session log (from `get_session_resume_data`). */
export interface PlaySession {
  /** Unix epoch seconds, 1970 UTC. */
  start_time: number;
  playtime_seconds: number;
}

export type StoreId = "steam" | "epic" | "gog" | "ubisoft" | "amazon";
export type GameTag = string;
export type OwnershipType = string;
export type DeckRating = string;
