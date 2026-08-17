/**
 * CatalogueGrid — the tile grid for one page of results.
 *
 * Deliberately *not* a virtualised list.
 *
 * A windowed list and Steam's focus navigation are in direct conflict:
 * the D-pad walks the DOM, so a tile that has been unmounted to save
 * memory is a tile the stick cannot reach, and expanding the window in
 * response to focus reaching its edge races the focus manager that is
 * already moving. Paging sidesteps the whole class of bug — the DOM is
 * bounded by construction, every rendered tile is reachable, and the
 * page boundary is an explicit user action rather than a scroll
 * position that has to be inferred.
 *
 * `PAGE_SIZE` is the one number that matters here. It bounds both the
 * mounted tile count and, with lazy covers, the decoded-bitmap
 * high-water mark.
 *
 * The sizes below are set for the real surface, which is smaller than
 * the panel: Gaming Mode renders at `devicePixelRatio` 1.5, so a
 * 1280×800 screen is an **854×534 CSS viewport**. Measured on-device,
 * a 148px minimum yielded only five columns and left tiles looking
 * oversized; 112px gives six or seven, and PAGE_SIZE is then about
 * three screenfuls of scrolling per page.
 */
import { FC, memo } from "react";
import { Focusable } from "@decky/ui";
import { GameTile, type DeckLabel } from "./GameTile";
import { C, MONO } from "./theme";
import {
  gameKey,
  isInstalled,
  playedSecs,
  type PlaytimeIndex,
} from "./catalogue";
import type { Game } from "../../types/api";

/** Tiles rendered at once. See the note on paging above. */
export const PAGE_SIZE = 42;

/** Minimum tile width; the grid fills the row with whatever fits. */
const TILE_MIN = 112;

interface Props {
  /** The current page's slice, already filtered and sorted. */
  games: Game[];
  playtimes: PlaytimeIndex;
  onSelect: (game: Game) => void;
  installedLabel: string;
  /** Resolves a game's Deck-compat label; localised by the page. */
  deckLabelFor: (game: Game) => DeckLabel | null;
  /** Shown when the filters exclude everything. */
  emptyTitle: string;
  emptyHint: string;
}

const CatalogueGridInner: FC<Props> = ({
  games,
  playtimes,
  onSelect,
  installedLabel,
  deckLabelFor,
  emptyTitle,
  emptyHint,
}) => {
  if (games.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "60px 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 13,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: C.textDim,
          }}
        >
          {emptyTitle}
        </div>
        <div style={{ fontSize: 13, color: C.textFaint, maxWidth: "42ch" }}>
          {emptyHint}
        </div>
      </div>
    );
  }

  return (
    <Focusable
      flow-children="grid"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_MIN}px, 1fr))`,
        gap: 10,
        padding: "12px 16px 20px",
        alignItems: "start",
      }}
    >
      {games.map((game) => (
        <GameTile
          // `game.id` does not exist on raw RPC rows — see `gameId`.
          key={gameKey(game)}
          game={game}
          installed={isInstalled(game)}
          played={playedSecs(game, playtimes)}
          onSelect={onSelect}
          installedLabel={installedLabel}
          deckLabel={deckLabelFor(game)}
        />
      ))}
    </Focusable>
  );
};

export const CatalogueGrid = memo(CatalogueGridInner);
