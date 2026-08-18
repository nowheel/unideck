/**
 * GameTile — one game in the catalogue grid.
 *
 * rackdroid's `.mod-card` translated to a gamepad surface: a bordered
 * panel that lifts, brightens its edge and picks up an amber glow when
 * it takes focus, since there is no hover to key off.
 *
 * Two behaviours here exist purely to keep the grid stable on a large
 * library:
 *
 *   - the cover is `loading="lazy"` and `decoding="async"`, so a page
 *     of tiles costs one decoded bitmap per *visible* cover rather than
 *     one per mounted tile. Cover art is 600×900; at four bytes a pixel
 *     a decoded page of 42 is already ~90 MB, and the old page mounted
 *     743 of them at once.
 *   - a failed cover collapses to a typographic fallback instead of
 *     leaving a broken-image box. Artwork coverage is not complete and
 *     never will be, so the missing case is a normal state, not an
 *     error.
 *
 * The component is memoised: paging re-renders the grid, and without
 * this every tile would re-render on each keystroke of the search box.
 */
import { CSSProperties, FC, memo, useMemo, useState } from "react";
import { Focusable } from "@decky/ui";
import { StoreIcon } from "../../components/shared/StoreIcon";
import { C, MONO, badgeStyle, storeColor } from "./theme";
import { formatPlaytime, formatSize } from "./catalogue";
import { resolveCovers } from "./cover";
import type { Game } from "../../types/api";

/** A localised Deck-compatibility label plus the colour to show it in. */
export interface DeckLabel {
  text: string;
  tone: string;
}

interface Props {
  game: Game;
  installed: boolean;
  /** Seconds played, already resolved by the grid. */
  played: number;
  onSelect: (game: Game) => void;
  /** Localised label for the installed badge. */
  installedLabel: string;
  /** Deck-compat label, shown when there are no playtime/size stats. */
  deckLabel: DeckLabel | null;
}

const COVER: CSSProperties = {
  width: "100%",
  aspectRatio: "2 / 3",
  display: "block",
  objectFit: "cover",
  borderRadius: 10,
  background: C.bg1,
};

const GameTileInner: FC<Props> = ({
  game,
  installed,
  played,
  onSelect,
  installedLabel,
  deckLabel,
}) => {
  // Index into `covers`. Steam hands back several candidate URLs and
  // only one of them is real for any given app, so a load error means
  // "try the next", not "give up" — advancing here is what turns the
  // candidate list into a working cover.
  const [attempt, setAttempt] = useState(0);

  // Resolved once per mount: the lookup walks Steam's app store, which
  // is cheap but not free, and the answer cannot change while the tile
  // is on screen.
  const covers = useMemo(() => resolveCovers(game), [game]);
  const cover = covers[attempt];

  const accent = storeColor(game.store);

  /**
   * The meta line, filled with the best fact we actually have.
   *
   * Playtime and size are the interesting ones but they are usually
   * absent: measured on this device, `size_bytes` is 0 for all 743
   * games (it is only written after an install) and the playtime
   * database is empty until a first session ends. That left the row
   * blank on every tile.
   *
   * Deck compatibility is the fact that *is* broadly known — 406 of
   * 743 here — so it fills the space rather than nothing.
   */
  const meta = useMemo(() => {
    const stats = [formatPlaytime(played), formatSize(game.size_bytes)]
      .filter(Boolean)
      .join("  ·  ");
    if (stats) return { text: stats, tone: C.textFaint };
    if (!deckLabel) return null;
    return { text: deckLabel.text, tone: deckLabel.tone };
  }, [played, game.size_bytes, deckLabel]);

  return (
    <Focusable
      onActivate={() => onSelect(game)}
      // Hook for the `:focus` rules in `FOCUS_CSS`. The React focus
      // props these once used never fired on this device, so the
      // highlight lived only in theory.
      data-udk="tile"
      // Steam draws its own focus ring as a hard white rectangle, which
      // fights the rounded amber panel. The tile supplies the entire
      // focus affordance itself, from `FOCUS_CSS`.
      noFocusRing
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 8,
        borderRadius: 14,
        cursor: "pointer",
        background: C.panel,
        border: `1px solid ${C.border}`,
        boxShadow: "none",
        transform: "none",
        transition:
          "transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease",
      }}
    >
      <div style={{ position: "relative" }}>
        {cover ? (
          <img
            // Keyed by URL so React swaps the element rather than
            // reusing one whose `onError` has already fired — without
            // it the next candidate never gets a load attempt.
            key={cover}
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setAttempt((n) => n + 1)}
            style={COVER}
          />
        ) : (
          <div
            style={{
              ...COVER,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 10,
              border: `1px solid ${C.border}`,
              color: C.textFaint,
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: "0.08em",
              textAlign: "center",
              textTransform: "uppercase",
              overflow: "hidden",
            }}
          >
            {game.title}
          </div>
        )}

        {/* Store badge, top-right. Icon plus rule keeps it legible at
            9.5px where the glyph alone would be ambiguous. */}
        <div style={{ position: "absolute", top: 6, insetInlineEnd: 6 }}>
          <span
            style={{
              ...badgeStyle(accent),
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <StoreIcon store={game.store} size={10} color={accent} />
          </span>
        </div>

        {/* Installed marker, bottom-left — amber because "on device" is
            the state the page most often exists to answer. */}
        {installed && (
          <div style={{ position: "absolute", bottom: 6, insetInlineStart: 6 }}>
            <span
              style={{
                ...badgeStyle(C.amber),
                background: C.amber,
                color: C.onAmber,
                border: `1px solid ${C.amber}`,
              }}
            >
              {installedLabel}
            </span>
          </div>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.25,
            color: C.textDim,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            transition: "color 0.18s ease",
          }}
          data-udk-title=""
          title={game.title}
        >
          {game.title}
        </div>
        {/* Reserve the meta row's height even when empty so tiles with
            and without playtime keep the same footprint and the grid
            does not develop ragged rows. */}
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: "0.04em",
            color: meta?.tone ?? C.textFaint,
            marginTop: 3,
            height: 12,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {meta?.text ?? ""}
        </div>
      </div>
    </Focusable>
  );
};

export const GameTile = memo(GameTileInner);
