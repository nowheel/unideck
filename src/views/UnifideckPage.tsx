/**
 * UnifideckPage — the standalone, full-screen catalogue page.
 *
 * Registered as its own route (`/unifideck`) rather than spliced into
 * Steam's `/library` tab row, so Steam's own filtering and sorting UI
 * is left untouched.
 *
 * Division of labour, deliberately narrow:
 *
 *   - THIS page is the *catalogue*: browse, filter, search.
 *   - The game's Steam AppDetails page is the *detail + action*
 *     surface. `AppDetailsPatch` already injects `<PlaySectionWrapper>`
 *     there, which owns install / launch / uninstall for Unifideck
 *     titles.
 *
 * Selecting a tile therefore navigates to `/library/app/<appid>`
 * instead of re-implementing the play section here. One install flow,
 * one launch path, one place for bugs to live.
 *
 * ── Why this page was rebuilt ────────────────────────────────────────
 *
 * Its first version reused components written to sit inside an injected
 * Steam library tab, and inherited four faults that a full-screen page
 * on a 700-title library cannot carry:
 *
 *   1. every game was mounted at once — 743 tiles and 743 covers in one
 *      commit, which is what made the page unstable rather than merely
 *      slow. Paging bounds it (see `CatalogueGrid`);
 *   2. the store filter was a native `<select>` and search a native
 *      `<input>`, neither of which Steam's focus navigation can reach,
 *      so both were dead on the device this plugin targets;
 *   3. the tab strip switched filters from `onFocus`, so drifting
 *      across it with the stick re-filtered the library repeatedly;
 *   4. every keystroke re-filtered and re-sorted the full library, and
 *      the post-sync refetch dropped the grid to a "Loading…" line.
 *
 * Search is debounced and the refetch is silent; the filter rules moved
 * to `unifideck-page/catalogue.ts` where they can be tested.
 */
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Focusable, GamepadButton, Navigation, SteamSpinner } from "@decky/ui";
import { useTranslation } from "react-i18next";
import { RootProvider } from "../contexts/RootProvider";
import { useRPCQuery } from "../api/useRPC";
import { rpcRoutes } from "../api/rpc-routes";
import { CatalogueGrid, PAGE_SIZE } from "./unifideck-page/CatalogueGrid";
import { FilterRail, type StoreOption } from "./unifideck-page/FilterRail";
import { PageBar } from "./unifideck-page/PageBar";
import { C, MONO } from "./unifideck-page/theme";
import { clearCoverCache } from "./unifideck-page/cover";
import { toSteamAppId } from "./unifideck-page/appid";
import {
  SORT_KEYS,
  countByStore,
  indexPlaytimes,
  selectCatalogue,
  type SortKey,
  type StatusFilter,
  type StoreFilter,
} from "./unifideck-page/catalogue";
import type { Game, StoreId } from "../types/api";
import type { PlaytimeEntry } from "../types/playtime";

/** Store chips, in the order they appear. `all` leads. */
const STORES: readonly StoreId[] = [
  "steam",
  "epic",
  "gog",
  "amazon",
  "ubisoft",
  "microsoft",
] as const;

/** Milliseconds of quiet before a search term is applied. */
const SEARCH_DEBOUNCE_MS = 220;

/**
 * Insets for Steam's own persistent chrome.
 *
 * Gaming Mode hands a route the whole window and then draws its status
 * bar and its button legend on top of it, so a page that starts at
 * `top: 0` has its first row hidden under the clock. Measured on-device
 * over CDP: the CSS viewport is 854×534 (the panel is 1280×800 at
 * `devicePixelRatio` 1.5), with roughly 38px of bar above and 35px of
 * legend below.
 */
const STEAM_TOP_INSET = 40;
const STEAM_BOTTOM_INSET = 36;

const UnifideckPageInner: FC = () => {
  const { t } = useTranslation();

  const {
    data: games,
    error,
    loading,
    refetch,
  } = useRPCQuery<[], Game[]>(rpcRoutes.getAllUnifideckGames, []);

  // Playtime powers two sorts and the tile meta line. It is fetched
  // independently and never gates the grid: a cold or failed playtime
  // DB should cost the meta line, not the catalogue.
  const { data: playtimeRows } = useRPCQuery<[], PlaytimeEntry[]>(
    rpcRoutes.getAllPlaytimes,
    [],
  );

  const [store, setStore] = useState<StoreFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("title");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Debounce the term the filter actually runs on. `searchText` stays
  // immediate so the field itself never lags behind the keyboard.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchText), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchText]);

  // Re-pull after a sync so a store connected while the page is open
  // appears without a Steam restart. `useRPCQuery` keeps the previous
  // `data` during a refetch, so the grid stays on screen throughout.
  useEffect(() => {
    const onSync = (): void => {
      // A sync can write new artwork into Steam's grid store, so the
      // memoised cover URLs are stale from here on.
      clearCoverCache();
      void refetch();
    };
    window.addEventListener("unifideck-sync-completed", onSync);
    return () => window.removeEventListener("unifideck-sync-completed", onSync);
  }, [refetch]);

  const playtimes = useMemo(
    () => indexPlaytimes(playtimeRows ?? []),
    [playtimeRows],
  );

  const all = useMemo(() => games ?? [], [games]);

  const filtered = useMemo(
    () => selectCatalogue(all, { store, status, sort, search }, playtimes),
    [all, store, status, sort, search, playtimes],
  );

  const storeCounts = useMemo(() => countByStore(all), [all]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // A filter change can leave the current page past the end of the new
  // result set; clamp rather than showing an empty page that the user
  // has to bumper their way back out of.
  const safePage = Math.min(page, pages - 1);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageGames = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [filtered, safePage],
  );

  // Any filter change invalidates the page position: staying on page 7
  // of a result set that just shrank to two pages is never what was
  // meant. Skipped on first run so the initial render does not fight
  // the initial state.
  const firstFilterRun = useRef(true);
  useEffect(() => {
    if (firstFilterRun.current) {
      firstFilterRun.current = false;
      return;
    }
    setPage(0);
  }, [store, status, sort, search]);

  const scrollRef = useRef<HTMLDivElement>(null);

  const goToPage = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, pages - 1));
      setPage(clamped);
      // The grid remounts on a page change, but the scroll container
      // does not — without this the new page opens mid-scroll.
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [pages],
  );

  const cycleSort = useCallback(() => {
    setSort((current) => {
      const at = SORT_KEYS.indexOf(current);
      return SORT_KEYS[(at + 1) % SORT_KEYS.length];
    });
  }, []);

  /**
   * Hand off to Steam's own app page, which `AppDetailsPatch` has
   * already decorated with the Unifideck play section.
   *
   * `app_id` is the *shortcut* AppID, and the backend hands it over in
   * its signed reading. Steam's route wants the unsigned one, and does
   * not complain when it gets the other: `/library/app/-310337468`
   * matches nothing and drops the user on the library home page, so
   * picking a game appeared to do something almost right. Verified
   * against the live client — the unsigned form lands correctly.
   *
   * Titles Unifideck knows about but has not yet mapped to a shortcut
   * have no AppID at all; the tile is inert rather than throwing the
   * user at a broken route.
   */
  const onSelect = useCallback((game: Game): void => {
    if (game.app_id == null) {
      console.warn(
        "[Unifideck] no shortcut AppID for",
        game.title,
        "— cannot open details page",
      );
      return;
    }
    Navigation.Navigate(`/library/app/${toSteamAppId(game.app_id)}`);
  }, []);

  // Bumpers page, Y cycles the sort. Bound on the page root so they
  // work wherever focus happens to be — a shortcut that only fires
  // while a tile is focused is a shortcut users conclude is broken.
  const onButtonDown = useCallback(
    (evt: { detail: { button: number } }): void => {
      switch (evt.detail.button) {
        case GamepadButton.BUMPER_LEFT:
          goToPage(safePage - 1);
          break;
        case GamepadButton.BUMPER_RIGHT:
          goToPage(safePage + 1);
          break;
        case GamepadButton.SECONDARY:
          cycleSort();
          break;
        default:
          break;
      }
    },
    [goToPage, safePage, cycleSort],
  );

  const storeOptions: StoreOption[] = useMemo(
    () => [
      { id: "all", label: t("unifiedLibrary.allStores"), count: all.length },
      ...STORES.filter((id) => (storeCounts.get(id) ?? 0) > 0).map((id) => ({
        id,
        label: t(`deckTabs.${id}`),
        count: storeCounts.get(id) ?? 0,
      })),
    ],
    [all.length, storeCounts, t],
  );

  const statusOptions = useMemo(
    () => [
      { id: "all" as const, label: t("deckTabs.allGames") },
      { id: "installed" as const, label: t("deckTabs.installed") },
      {
        id: "not-installed" as const,
        label: t("unifideckPage.notInstalled", "Not installed"),
      },
      { id: "great-on-deck" as const, label: t("deckTabs.greatOnDeck") },
    ],
    [t],
  );

  const sortLabels: Record<SortKey, string> = {
    title: t("unifideckPage.sortTitle", "Title"),
    recent: t("unifideckPage.sortRecent", "Recently played"),
    playtime: t("unifideckPage.sortPlaytime", "Playtime"),
    size: t("unifideckPage.sortSize", "Size"),
    store: t("unifideckPage.sortStore", "Store"),
  };

  if (error) {
    return (
      <Shell>
        <div style={{ padding: 32 }}>
          <div style={{ color: C.red, fontSize: 16, marginBottom: 10 }}>
            {t("unifiedLibrary.errorLoadingGames")}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12,
              color: C.textFaint,
              marginBottom: 20,
            }}
          >
            {error.message}
          </div>
          <RetryButton label={t("unifideckPage.retry", "Retry")} onRetry={refetch} />
        </div>
      </Shell>
    );
  }

  // Only the very first load blanks the page; every later refetch keeps
  // the grid up while new data arrives underneath it.
  if (loading && games == null) {
    return (
      <Shell>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SteamSpinner />
        </div>
      </Shell>
    );
  }

  return (
    <Shell onButtonDown={onButtonDown}>
      {/* One scroll container holding rail, grid and bar. The two bars
          are `position: sticky` within it, so the grid slides beneath
          the glass — laying them out as siblings above and below the
          scroller would leave nothing behind them to blur. The inner
          column is `minHeight: 100%` so the footer still sits at the
          bottom of the viewport when a page is only half full. */}
      <div
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: "100%",
          }}
        >
          <FilterRail
            total={all.length}
            shown={filtered.length}
            stores={storeOptions}
            statuses={statusOptions}
            store={store}
            status={status}
            searchText={searchText}
            onStore={setStore}
            onStatus={setStatus}
            onSearch={setSearchText}
            searchLabel={t("unifideckPage.search", "Search")}
            countLabel={`${filtered.length} / ${all.length}`}
          />

          <div style={{ flex: 1 }}>
            <CatalogueGrid
              // Remount per page so focus re-enters at the first tile
              // instead of trying to hold a position on tiles that no
              // longer exist.
              key={safePage}
              games={pageGames}
              playtimes={playtimes}
              onSelect={onSelect}
              installedLabel={t("unifideckPage.installedBadge", "Inst")}
              emptyTitle={t("unifideckPage.emptyTitle", "No games match")}
              emptyHint={t(
                "unifideckPage.emptyHint",
                "Try a different store or clear the search. If a store looks empty, connect it and run a library sync from the Quick Access menu.",
              )}
            />
          </div>

          <PageBar
            sortLabel={`${t("unifideckPage.sortBy", "Sort")}: ${
              sortLabels[sort]
            }`}
            page={safePage + 1}
            pages={pages}
            pageLabel={t("unifideckPage.page", "Page")}
            hintPage={t("unifideckPage.hintPage", "L1/R1 page")}
            hintSort={t("unifideckPage.hintSort", "Y sort")}
          />
        </div>
      </div>
    </Shell>
  );
};

/** Page chrome: full-bleed background and the vertical stack. */
const Shell: FC<{
  children: React.ReactNode;
  onButtonDown?: (evt: never) => void;
}> = ({ children, onButtonDown }) => (
  <Focusable
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onButtonDown={onButtonDown as any}
    style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      paddingTop: STEAM_TOP_INSET,
      paddingBottom: STEAM_BOTTOM_INSET,
      boxSizing: "border-box",
      background: C.bg,
      color: C.text,
    }}
  >
    {children}
  </Focusable>
);

/** Focusable retry affordance for the error state. */
const RetryButton: FC<{ label: string; onRetry: () => void }> = ({
  label,
  onRetry,
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <Focusable
      noFocusRing
      onActivate={() => void onRetry()}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        display: "inline-block",
        fontFamily: MONO,
        fontSize: 13,
        letterSpacing: "0.04em",
        padding: "10px 22px",
        borderRadius: 12,
        cursor: "pointer",
        background: focused ? C.amber : "transparent",
        color: focused ? C.onAmber : C.text,
        border: `1px solid ${focused ? C.amber : C.borderStrong}`,
      }}
    >
      {label}
    </Focusable>
  );
};

/**
 * Route component. `RootProvider` must wrap the page here rather than
 * at registration time: Decky mounts the route component fresh on every
 * navigation, and the contexts (auth, downloads, library) have to be
 * re-established with it.
 */
export const UnifideckPage: FC = () => (
  <RootProvider>
    <UnifideckPageInner />
  </RootProvider>
);
