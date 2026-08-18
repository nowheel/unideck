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
import { useSync } from "../contexts/SyncContext";
import { useRPCQuery } from "../api/useRPC";
import { rpcRoutes } from "../api/rpc-routes";
import { CatalogueGrid, PAGE_SIZE } from "./unifideck-page/CatalogueGrid";
import { FilterRail, type StoreOption } from "./unifideck-page/FilterRail";
import { PageBar } from "./unifideck-page/PageBar";
import { C, FOCUS_CSS, MONO } from "./unifideck-page/theme";
import { clearCoverCache } from "./unifideck-page/cover";
import {
  DEFAULT_FILTERS,
  loadFilters,
  saveFilters,
} from "./unifideck-page/preferences";
import { toSteamAppId } from "../lib/appid";
import {
  availableSorts,
  initialOf,
  jumpToAdjacentLetterPage,
  compatFor,
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
  const sync = useSync();

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

  // Filters start from whatever the last visit left behind. No store
  // list is passed here on purpose: the library has not arrived yet, so
  // there is nothing to validate against, and the effect below drops a
  // remembered store that turns out no longer to exist.
  const remembered = useRef(loadFilters()).current;
  const [store, setStore] = useState<StoreFilter>(remembered.store);
  const [status, setStatus] = useState<StatusFilter>(remembered.status);
  const [sort, setSort] = useState<SortKey>(remembered.sort);
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

  // Persist the filters, and drop a remembered store that no longer
  // exists. Without the second half, disconnecting a store would
  // reopen the page filtered to nothing, with the reason invisible.
  useEffect(() => {
    if (all.length === 0) return;
    const known = [...storeCounts.keys()];
    if (store !== "all" && !known.includes(store)) {
      setStore(DEFAULT_FILTERS.store);
      return;
    }
    saveFilters({ store, status, sort });
  }, [all.length, storeCounts, store, status, sort]);

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

  /**
   * Auto-hiding header.
   *
   * The rail costs ~90px of a 534px viewport — most of a tile row — and
   * once you are deep in the grid it is just a lid. So it slides away.
   *
   * The hard part is guaranteeing it comes *back*, because with a stick
   * focus is the cursor: hide the thing focus needs to reach and the
   * filters become unreachable.
   *
   * Scroll direction carries that guarantee: any upward scroll brings
   * the rail back. Steam scrolls a newly focused element into view, so
   * moving focus up from the top row scrolls the container up, which
   * reveals the rail. `onFocusWithin` is wired as a second trigger, so
   * the rail also pins itself open while the stick is inside it.
   *
   * A note for whoever reads this next: an earlier version of this
   * comment claimed the focus path "could not be verified" because no
   * `focusin` ever fired. That was wrong. The probe was driving a
   * window the system did not consider active, so `document.hasFocus()`
   * was false — and an unfocused document dispatches no focus events.
   * With CDP focus emulation on, they fire normally. Both triggers work;
   * scroll direction is simply the one that also handles the case where
   * the user scrolls with the stick without moving focus at all.
   */
  const [railHiddenByScroll, setRailHiddenByScroll] = useState(false);
  const [railFocused, setRailFocused] = useState(false);
  const lastScrollTop = useRef(0);
  const railHidden = railHiddenByScroll && !railFocused;

  const onScroll = useCallback(() => {
    const top = scrollRef.current?.scrollTop ?? 0;
    const previous = lastScrollTop.current;
    lastScrollTop.current = top;
    // Near the top the rail is always shown; scrolling up in any amount
    // brings it back; only sustained downward travel hides it. The 96px
    // floor keeps a short nudge from swallowing the filters.
    if (top <= 8) setRailHiddenByScroll(false);
    else if (top < previous) setRailHiddenByScroll(false);
    else if (top > 96) setRailHiddenByScroll(true);
  }, []);

  const goToPage = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, pages - 1));
      setPage(clamped);
      // The grid remounts on a page change, but the scroll container
      // does not — without this the new page opens mid-scroll, with the
      // rail still tucked away from the previous page's scrolling.
      scrollRef.current?.scrollTo({ top: 0 });
      setRailHiddenByScroll(false);
      lastScrollTop.current = 0;
    },
    [pages],
  );

  // Only the sorts that mean something with the data on hand — see
  // `availableSorts`. Recomputed as playtime arrives, so the cycle
  // grows on its own after the first session.
  const sorts = useMemo(() => availableSorts(playtimes), [playtimes]);

  /**
   * Jump to the next or previous initial.
   *
   * Only offered while sorted by title — under any other order "the
   * next letter" is not a position the grid has.
   *
   * The target is the nearest letter boundary on a *different page*.
   * The first version anchored on the current page's first item and
   * jumped to the next differing initial, which on this library lands
   * at index 3 — still page 1. The jump ran, nothing moved, and the
   * button looked dead. A jump you cannot see has not happened.
   */
  const jumpLetter = useCallback(
    (direction: 1 | -1) => {
      if (sort !== "title") return;
      const target = jumpToAdjacentLetterPage(
        filtered,
        safePage,
        PAGE_SIZE,
        direction,
      );
      if (target == null) return;
      const page = Math.floor(target / PAGE_SIZE);
      setPage(page);
      scrollRef.current?.scrollTo({ top: 0 });
      setRailHiddenByScroll(false);
      lastScrollTop.current = 0;
    },
    [sort, filtered, safePage],
  );

  const cycleSort = useCallback(() => {
    setSort((current) => {
      const at = sorts.indexOf(current);
      // A sort that has just left the list (data went away) restarts
      // the cycle rather than wedging on an index of -1.
      return sorts[(at + 1) % sorts.length] ?? sorts[0];
    });
  }, [sorts]);

  /**
   * Deck-compatibility label for the tile meta line.
   *
   * Verified/playable is Valve's own verdict and outranks ProtonDB's
   * tier, which is the community's. Unknown returns `null` so the tile
   * shows nothing rather than a confident-looking "unknown".
   */
  const deckLabelFor = useCallback(
    (game: Game) => {
      const compat = compatFor(game);
      if (!compat) return null;
      switch (compat.deckVerified) {
        case "verified":
          return { text: t("unifideckPage.deckVerified", "Verified"), tone: C.teal };
        case "playable":
          return { text: t("unifideckPage.deckPlayable", "Playable"), tone: C.amberSoft };
        case "unsupported":
          return { text: t("unifideckPage.deckUnsupported", "Unsupported"), tone: C.red };
        default:
          break;
      }
      switch (compat.tier) {
        case "native":
          return { text: t("unifideckPage.tierNative", "Native"), tone: C.teal };
        case "platinum":
          return { text: t("unifideckPage.tierPlatinum", "Platinum"), tone: C.amberSoft };
        case "gold":
          return { text: t("unifideckPage.tierGold", "Gold"), tone: C.amber };
        case "borked":
          return { text: t("unifideckPage.tierBorked", "Borked"), tone: C.red };
        default:
          return null;
      }
    },
    [t],
  );

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

  // Bumpers page, triggers jump by letter, Y cycles the sort. Bound on
  // the page root so they work wherever focus happens to be — a
  // shortcut that only fires while a tile is focused is a shortcut
  // users conclude is broken.
  //
  // Nothing else in this plugin binds the analog triggers, so whether
  // Steam delivers them here at all was an open question. It does:
  // instrumenting `onButtonDown` on-device recorded 12 presses of
  // TRIGGER_RIGHT and 5 of TRIGGER_LEFT alongside the bumpers.
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
        case GamepadButton.TRIGGER_LEFT:
          jumpLetter(-1);
          break;
        case GamepadButton.TRIGGER_RIGHT:
          jumpLetter(1);
          break;
        default:
          break;
      }
    },
    [goToPage, safePage, cycleSort, jumpLetter],
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
        onScroll={onScroll}
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
            onSync={() => void sync.startSync()}
            syncLabel={t("unifideckPage.sync", "Sync")}
            isSyncing={sync.isSyncing}
            hidden={railHidden}
            onFocusWithin={setRailFocused}
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
              deckLabelFor={deckLabelFor}
              emptyTitle={t("unifideckPage.emptyTitle", "No games match")}
              emptyHint={t(
                "unifideckPage.emptyHint",
                "Try a different store, or clear the search. If a store looks empty, connect it in the Quick Access menu and press Sync above.",
              )}
            />
          </div>

          <PageBar
            sortLabel={`${t("unifideckPage.sortBy", "Sort")}: ${
              sortLabels[sort]
            }`}
            letter={
              sort === "title" && pageGames.length > 0
                ? initialOf(pageGames[0].title)
                : null
            }
            hintLetter={
              sort === "title" ? t("unifideckPage.hintLetter", "L2/R2 letter") : undefined
            }
            syncLine={
              sync.isSyncing
                ? `${t("unifideckPage.syncing", "Syncing")}${
                    sync.progress?.progress_percent
                      ? ` ${Math.round(sync.progress.progress_percent)}%`
                      : "…"
                  }${
                    sync.progress?.current_game?.label
                      ? ` · ${sync.progress.current_game.label}`
                      : ""
                  }`
                : null
            }
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
    {/* Focus highlighting lives in CSS, not in component state — see
        the note on FOCUS_CSS. Mounted with the page so it comes and
        goes with the route rather than leaking into the rest of Steam. */}
    <style>{FOCUS_CSS}</style>
    {children}
  </Focusable>
);

/** Focusable retry affordance for the error state. */
const RetryButton: FC<{ label: string; onRetry: () => void }> = ({
  label,
  onRetry,
}) => (
    <Focusable
      noFocusRing
      onActivate={() => void onRetry()}
      data-udk="btn"
      style={{
        display: "inline-block",
        fontFamily: MONO,
        fontSize: 13,
        letterSpacing: "0.04em",
        padding: "10px 22px",
        borderRadius: 12,
        cursor: "pointer",
        background: "transparent",
        color: C.text,
        border: `1px solid ${C.borderStrong}`,
      }}
    >
      {label}
    </Focusable>
  );

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
