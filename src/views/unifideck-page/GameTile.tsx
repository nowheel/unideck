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
import { resolveCover } from "./cover";
import type { Game } from "../../types/api";

interface Props {
  game: Game;
  installed: boolean;
  /** Seconds played, already resolved by the grid. */
  played: number;
  onSelect: (game: Game) => void;
  /** Localised label for the installed badge. */
  installedLabel: string;
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
}) => {
  const [focused, setFocused] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);

  // Resolved once per mount: the lookup walks Steam's app store, which
  // is cheap but not free, and the answer cannot change while the tile
  // is on screen.
  const cover = useMemo(() => resolveCover(game), [game]);

  const accent = storeColor(game.store);
  const meta = [formatPlaytime(played), formatSize(game.size_bytes)]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <Focusable
      onActivate={() => onSelect(game)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      // Steam draws its own focus ring as a hard white rectangle, which
      // fights the rounded amber panel. The tile supplies the entire
      // focus affordance itself.
      noFocusRing
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 8,
        borderRadius: 14,
        cursor: "pointer",
        background: focused ? C.panel2 : C.panel,
        border: `1px solid ${focused ? C.amber : C.border}`,
        boxShadow: focused
          ? `0 14px 30px -12px rgba(0,0,0,0.7), 0 0 0 1px ${C.amberGlow}`
          : "none",
        transform: focused ? "translateY(-3px)" : "none",
        transition:
          "transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease",
      }}
    >
      <div style={{ position: "relative" }}>
        {cover && !coverFailed ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setCoverFailed(true)}
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
            color: focused ? C.text : C.textDim,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            transition: "color 0.18s ease",
          }}
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
            color: C.textFaint,
            marginTop: 3,
            height: 12,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {meta}
        </div>
      </div>
    </Focusable>
  );
};

export const GameTile = memo(GameTileInner);
