/**
 * FilterRail — the page header: identity, search, and the two filter
 * axes as chip rows.
 *
 * This replaces a native `<select>` and a native `<input>`. Both are
 * unreachable in Gaming Mode: Steam's focus navigation only walks
 * elements it owns, so the old store dropdown and search box could be
 * clicked with a mouse in Desktop Mode and by nothing at all on the
 * device the plugin is for.
 *
 * The replacements are a row of `Focusable` chips (rackdroid's
 * `.mod-chip`) and `@decky/ui`'s `TextField`, which brings up the
 * on-screen keyboard. `TextField` keeps Steam's own chrome rather than
 * the rackdroid palette — it is the one place where being operable
 * beats being on-theme.
 *
 * Chips report on `onActivate` only, never on focus. The previous
 * filter bar switched tabs from `onFocus`, so merely passing over a
 * segment with the stick re-filtered and re-rendered the whole grid.
 */
import { FC, ReactNode } from "react";
import { Focusable, TextField } from "@decky/ui";
import { StoreIcon } from "../../components/shared/StoreIcon";
import {
  C,
  GLASS_HEADER,
  MONO,
  chipStyle,
  glass,
  kickerRule,
  kickerText,
  storeColor,
} from "./theme";
import type { StatusFilter, StoreFilter } from "./catalogue";
import type { StoreId } from "../../types/api";

/** One chip. Owns its focus state so it can render the focus style. */
const Chip: FC<{
  active: boolean;
  onActivate: () => void;
  children: ReactNode;
}> = ({ active, onActivate, children }) => (
    <Focusable
      noFocusRing
      onActivate={onActivate}
      data-udk="chip"
      style={{
        ...chipStyle(active),
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </Focusable>
  );

/** A count rendered inside a chip, dimmed against the label. */
const Count: FC<{ value: number; active: boolean }> = ({ value, active }) => (
  <span style={{ opacity: active ? 0.7 : 0.55, fontSize: 11 }}>{value}</span>
);

export interface StoreOption {
  id: StoreFilter;
  label: string;
  count: number;
}

export interface StatusOption {
  id: StatusFilter;
  label: string;
}

interface Props {
  /** Total games in the library, before any filter. */
  total: number;
  /** Games surviving the current filters. */
  shown: number;
  stores: StoreOption[];
  statuses: StatusOption[];
  store: StoreFilter;
  status: StatusFilter;
  /** Live search text (the page debounces before filtering). */
  searchText: string;
  onStore: (s: StoreFilter) => void;
  onStatus: (s: StatusFilter) => void;
  onSearch: (text: string) => void;
  searchLabel: string;
  /** Label for the "N of M" line, already interpolated. */
  countLabel: string;
  /** Trigger a library sync; omitted when the context has none. */
  onSync?: () => void;
  syncLabel: string;
  isSyncing: boolean;
  /**
   * Slide the rail out of the way. The page decides when — see the
   * note in `UnifideckPage` about why focus, not just scroll, gates it.
   */
  hidden: boolean;
  /** Reports whether focus currently sits inside the rail. */
  onFocusWithin: (inside: boolean) => void;
}

export const FilterRail: FC<Props> = ({
  stores,
  statuses,
  store,
  status,
  searchText,
  onStore,
  onStatus,
  onSearch,
  searchLabel,
  countLabel,
  onSync,
  syncLabel,
  isSyncing,
  hidden,
  onFocusWithin,
}) => {
  return (
    <div
      style={{
        // Sticky inside the scroll container, so the grid slides under
        // the glass rather than stopping at its edge.
        position: "sticky",
        top: 0,
        zIndex: 3,
        transform: hidden ? "translateY(-100%)" : "none",
        transition: "transform 0.22s ease",
        ...glass(GLASS_HEADER),
        // rackdroid's `.cta-panel` warms its top-left corner with an
        // amber wash; over a blur it reads as light caught in the pane.
        backgroundImage:
          "radial-gradient(ellipse 620px 200px at 12% 0%, rgba(249,177,48,0.10), transparent 70%)",
        borderBottom: `1px solid ${C.border}`,
        padding: "9px 16px 9px",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        flexShrink: 0,
      }}
      // Capture, not bubble: `Focusable` children stop the bubbling
      // pair, and the rail must un-hide the moment the stick reaches
      // any chip inside it.
      onFocusCapture={() => onFocusWithin(true)}
      onBlurCapture={() => onFocusWithin(false)}
    >
      {/* Row 1 — identity, count, status axis. Folding the status chips
          up here rather than giving them a row of their own is worth
          about 30px, which on a 534px-tall viewport is a third of a
          tile row. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={kickerRule} />
          <span style={kickerText}>Unifideck</span>
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 12,
            letterSpacing: "0.06em",
            color: C.textFaint,
          }}
        >
          {countLabel}
        </div>
        <Focusable
          flow-children="row"
          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
        >
          {statuses.map((option) => (
            <Chip
              key={option.id}
              active={status === option.id}
              onActivate={() => onStatus(option.id)}
            >
              {option.label}
            </Chip>
          ))}
        </Focusable>
      </div>

      {/* Row 2 — store axis, then search and sync. `flow-children="row"`
          keeps left/right inside the row and lets up/down cross to the
          row above, which is what the stick should do at a boundary. */}
      <Focusable
        flow-children="row"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        {stores.map((option) => {
          const active = store === option.id;
          return (
            <Chip
              key={option.id}
              active={active}
              onActivate={() => onStore(option.id)}
            >
              {option.id !== "all" && (
                <StoreIcon
                  store={option.id as StoreId}
                  size={11}
                  color={active ? C.onAmber : storeColor(option.id)}
                />
              )}
              {option.label}
              <Count value={option.count} active={active} />
            </Chip>
          );
        })}

        {/* Search sits at the end of the store row rather than owning a
            row of its own. Labelled rather than placeholdered:
            `TextFieldProps` extends `HTMLAttributes`, not
            `InputHTMLAttributes`, so `placeholder` is not in its
            contract, and `TextField` resolves to a Steam-internal
            component we cannot check for prop forwarding. A label we
            render ourselves is guaranteed to appear. */}
        <div
          style={{
            flex: 1,
            minWidth: 160,
            maxWidth: 300,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: C.textFaint,
              whiteSpace: "nowrap",
            }}
          >
            {searchLabel}
          </span>
          <div style={{ flex: 1 }}>
            <TextField
              value={searchText}
              bShowClearAction
              onChange={(e) => onSearch(e.currentTarget.value)}
            />
          </div>
        </div>

        {/* Sync, reachable without leaving the catalogue. Previously
            this meant backing out to the Quick Access menu. */}
        {onSync && (
          <Chip active={false} onActivate={onSync}>
            {isSyncing ? "…" : syncLabel}
          </Chip>
        )}
      </Focusable>
    </div>
  );
};
