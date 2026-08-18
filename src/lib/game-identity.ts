/**
 * A game's identity, resolved the same way everywhere.
 *
 * The backend `Game` dataclass has no `id` field — it carries
 * `store_game_id`. The frontend `Game` interface predates that refactor
 * and still declares `id`, which exists only on rows that have been
 * through `adaptGame` (`hooks/useGameInfo.ts`).
 *
 * Reading `game.id` on a raw RPC row yields `undefined` silently, and
 * has already shipped as three separate bugs: an always-empty
 * "Installed" filter, a grid of tiles keyed `undefined`, and playtime
 * lookups that never matched. This module exists so the rule lives in
 * one place instead of being rediscovered at each call site.
 */
import type { Game } from "../types/api";

/** Fields any identity lookup needs. */
type Identifiable = Pick<Game, "id" | "store_game_id">;

/**
 * The store-native id, whichever shape the row arrived in.
 *
 * `store_game_id` leads: it is the field the backend actually sends,
 * and `adaptGame` derives `id` from it rather than the other way round.
 */
export function gameId(game: Identifiable): string {
  return game.store_game_id ?? game.id ?? "";
}

/**
 * A stable, store-qualified key — safe as a React key or a map key.
 *
 * Store-qualified because two storefronts can and do use the same
 * native id for different titles.
 */
export function gameKey(game: Identifiable & Pick<Game, "store">): string {
  return `${game.store}:${gameId(game)}`;
}
