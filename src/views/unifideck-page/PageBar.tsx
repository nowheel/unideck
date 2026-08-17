/**
 * PageBar — the bottom status strip: current sort, page position, and
 * the button hints for both.
 *
 * Bumper paging and Y-to-sort are invisible affordances; a console UI
 * that hides them has simply not shipped them. The strip is where
 * Steam users already look for button legends, and it costs one row.
 *
 * Rendered with rackdroid's rack-rail texture — the dotted strip the
 * site uses as a section divider — because a flat bar under a grid of
 * cover art reads as unfinished, and the texture is a background
 * gradient rather than another composited layer.
 */
import { CSSProperties, FC } from "react";
import { C, GLASS_FOOTER, MONO, glass } from "./theme";

interface Props {
  sortLabel: string;
  /** 1-based; equals `pages` when there is a single page. */
  page: number;
  pages: number;
  pageLabel: string;
  hintPage: string;
  hintSort: string;
}

const cell: CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

export const PageBar: FC<Props> = ({
  sortLabel,
  page,
  pages,
  pageLabel,
  hintPage,
  hintSort,
}) => (
  <div
    style={{
      // Sticky to the foot of the scroll container: the last row of
      // tiles passes beneath it instead of ending above it.
      position: "sticky",
      bottom: 0,
      zIndex: 3,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: 20,
      padding: "0 24px",
      height: 34,
      color: C.textFaint,
      borderTop: `1px solid ${C.borderStrong}`,
      ...glass(GLASS_FOOTER, 14),
      // rackdroid's `.rail`: a row of recessed rack holes, kept over
      // the blur so the bar still reads as a machined strip.
      backgroundImage:
        "radial-gradient(circle, rgba(0,0,0,0.45) 1.4px, transparent 1.6px)",
      backgroundSize: "22px 22px",
      backgroundPosition: "11px center",
    }}
  >
    <span style={{ ...cell, color: C.amberSoft }}>{sortLabel}</span>
    {pages > 1 && (
      <span style={{ ...cell, color: C.textDim }}>
        {pageLabel} {page}/{pages}
      </span>
    )}
    <span style={{ flex: 1 }} />
    {pages > 1 && <span style={cell}>{hintPage}</span>}
    <span style={cell}>{hintSort}</span>
  </div>
);
