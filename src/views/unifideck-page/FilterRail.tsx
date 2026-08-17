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
import { FC, ReactNode, useState } from "react";
import { Focusable, TextField } from "@decky/ui";
import { StoreIcon } from "../../components/shared/StoreIcon";
import { C, MONO, chipStyle, kickerRule, kickerText, storeColor } from "./theme";
import type { StatusFilter, StoreFilter } from "./catalogue";
import type { StoreId } from "../../types/api";

/** One chip. Owns its focus state so it can render the focus style. */
const Chip: FC<{
  active: boolean;
  onActivate: () => void;
  children: ReactNode;
}> = ({ active, onActivate, children }) => {
  const [focused, setFocused] = useState(false);
  return (
    <Focusable
      noFocusRing
      onActivate={onActivate}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...chipStyle(active, focused),
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </Focusable>
  );
};

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
}) => {
  return (
    <div
      style={{
        background: C.bg1,
        borderBottom: `1px solid ${C.border}`,
        padding: "14px 24px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flexShrink: 0,
      }}
    >
      {/* Identity + result count + search. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
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
        {/* Labelled rather than placeholdered: `TextFieldProps` extends
            `HTMLAttributes`, not `InputHTMLAttributes`, so `placeholder`
            is not part of its contract, and TextField resolves to a
            Steam-internal component we cannot check for prop
            forwarding. A label we render ourselves is guaranteed to
            appear and matches the mono chrome besides. */}
        <div
          style={{
            flex: 1,
            minWidth: 200,
            maxWidth: 360,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 11,
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
      </div>

      {/* Status axis, then store axis. Two `Focusable` rows rather than
          one wrapping row: `flow-children="row"` keeps left/right inside
          a row and lets up/down cross between them, which is what the
          stick should do at a row boundary. */}
      <Focusable
        flow-children="row"
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
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

      <Focusable
        flow-children="row"
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
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
      </Focusable>
    </div>
  );
};
