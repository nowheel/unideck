/**
 * UnifideckPage — the standalone, full-screen library page.
 *
 * Replaces the library-tab injection as Unifideck's browsing
 * surface. Registered as its own route (`/unifideck`) rather
 * than spliced into Steam's `/library` tab row, so Steam's own
 * filtering / sorting UI is left untouched.
 *
 * Division of labour, deliberately narrow :
 *
 *   - THIS page is the *catalogue* : browse, filter, search.
 *   - The game's Steam AppDetails page is the *detail + action*
 *     surface. `AppDetailsPatch` already injects
 *     `<PlaySectionWrapper>` there, which owns install / launch /
 *     uninstall for Unifideck titles.
 *
 * Selecting a tile therefore navigates to `/library/app/<appid>`
 * instead of re-implementing the play section here. One install
 * flow, one launch path, one place for bugs to live.
 */
import { FC, useMemo, useState } from "react";
import { Focusable, Navigation } from "@decky/ui";
import { useTranslation } from "react-i18next";
import { RootProvider } from "../contexts/RootProvider";
import { UnifiedLibraryView, type LibraryFilter } from "./UnifiedLibraryView";
import type { Game } from "../types/api";

/** The three catalogue-wide filters, mirrored from the old tab set. */
const FILTERS: readonly LibraryFilter[] = [
  "all",
  "installed",
  "great-on-deck",
] as const;

/**
 * Segmented control replacing the injected Steam tabs.
 *
 * Built from `Focusable`s in a `flow-children="row"` row so the
 * D-pad walks the segments left/right in Gaming Mode — the same
 * construct `QuickAccessPanel` uses for its tab pills, and for
 * the same reason (a bare `Focusable` with `onActivate` is a
 * focus target; a `DialogButton` brings chrome that fights the
 * tab look).
 */
const FilterBar: FC<{
  active: LibraryFilter;
  onChange: (f: LibraryFilter) => void;
}> = ({ active, onChange }) => {
  const { t } = useTranslation();

  const label = (f: LibraryFilter): string =>
    f === "installed"
      ? t("deckTabs.installed")
      : f === "great-on-deck"
      ? t("deckTabs.greatOnDeck")
      : t("deckTabs.allGames");

  return (
    <Focusable
      flow-children="row"
      style={{ display: "flex", gap: 8, padding: "12px 20px 0" }}
    >
      {FILTERS.map((f) => {
        const selected = f === active;
        return (
          <Focusable
            key={f}
            // Focus alone switches the segment — matches how Steam's
            // own tab rows behave, so navigating does not feel stalled.
            // `onActivate` keeps click / A-press working.
            onFocus={() => onChange(f)}
            onActivate={() => onChange(f)}
            style={{
              padding: "8px 16px",
              borderRadius: 3,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: "bold",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              background: selected
                ? "rgba(255,255,255,0.15)"
                : "transparent",
              color: selected ? "#ffffff" : "#dcdedf",
            }}
          >
            {label(f)}
          </Focusable>
        );
      })}
    </Focusable>
  );
};

/** Page body — assumes the surrounding `RootProvider` is mounted. */
const UnifideckPageInner: FC = () => {
  const [filter, setFilter] = useState<LibraryFilter>("all");

  /**
   * Hand off to Steam's own app page, which `AppDetailsPatch`
   * has already decorated with the Unifideck play section.
   *
   * `app_id` is the *shortcut* AppID. Titles that Unifideck knows
   * about but has not yet mapped to a shortcut have none — there
   * is no page to route to, so the tile is inert rather than
   * throwing the user at a broken route.
   */
  const onSelect = useMemo(
    () =>
      (game: Game): void => {
        if (game.app_id == null) {
          console.warn(
            "[Unifideck] no shortcut AppID for",
            game.title,
            "— cannot open details page",
          );
          return;
        }
        Navigation.Navigate(`/library/app/${game.app_id}`);
      },
    [],
  );

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        // Steam renders routes edge-to-edge; the top padding keeps the
        // filter row clear of the persistent header bar in Gaming Mode.
        paddingTop: 8,
      }}
    >
      <FilterBar active={filter} onChange={setFilter} />
      <div style={{ flex: 1, minHeight: 0 }}>
        {/* UnifiedLibraryView already owns the store dropdown, the
            search box and the grid — it only ever lacked a host. */}
        <UnifiedLibraryView filter={filter} onSelect={onSelect} />
      </div>
    </div>
  );
};

/**
 * Route component. `RootProvider` must wrap the page here rather
 * than at registration time : Decky mounts the route component
 * fresh on every navigation, and the contexts (auth, downloads,
 * library) have to be re-established with it.
 */
export const UnifideckPage: FC = () => (
  <RootProvider>
    <UnifideckPageInner />
  </RootProvider>
);
