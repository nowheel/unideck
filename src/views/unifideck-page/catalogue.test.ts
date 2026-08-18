// @vitest-environment jsdom
/**
 * Tests for the catalogue page's selection core.
 *
 * These cover the rules that the previous version of the page got
 * wrong or could not express at all: the installed flag arriving under
 * the wire name rather than the adapted one, sorts that were unstable
 * across renders, and store counts that collapsed to zero as soon as a
 * status filter was applied.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// The compat lookups reach into module-level caches; stub them so the
// Great-on-Deck rule can be driven directly.
const compatByAppId = vi.fn();
const compatByTitle = vi.fn();

vi.mock("../../lib/library-facets", () => ({
  getCompatByShortcutAppId: (id: number) => compatByAppId(id),
}));
vi.mock("../../lib/protondb-cache", () => ({
  getCachedCompatByTitle: (title: string) => compatByTitle(title),
  meetsGreatOnDeckCriteria: (compat: { verdict?: boolean } | null) =>
    Boolean(compat?.verdict),
}));

import {
  availableSorts,
  initialBoundaries,
  initialOf,
  jumpToAdjacentInitial,
  jumpToAdjacentLetterPage,
  countByStore,
  gameId,
  gameKey,
  formatPlaytime,
  formatSize,
  indexPlaytimes,
  isInstalled,
  lastPlayedMs,
  playedSecs,
  selectCatalogue,
  SORT_KEYS,
  type CatalogueQuery,
} from "./catalogue";
import type { Game } from "../../types/api";
import type { PlaytimeEntry } from "../../types/playtime";

function game(over: Partial<Game> & { id: string; title: string }): Game {
  return {
    store_game_id: over.id,
    store: "epic",
    is_installed: false,
    ...over,
  } as Game;
}

function playtime(over: Partial<PlaytimeEntry>): PlaytimeEntry {
  return {
    store: "epic",
    total_seconds: 0,
    store_total_secs: null,
    session_count: 0,
    last_played: null,
    current_streak: 0,
    longest_streak: 0,
    is_active: false,
    ...over,
  } as PlaytimeEntry;
}

const QUERY: CatalogueQuery = {
  store: "all",
  status: "all",
  sort: "title",
  search: "",
};

beforeEach(() => {
  compatByAppId.mockReset().mockReturnValue(null);
  compatByTitle.mockReset().mockReturnValue(null);
});

describe("isInstalled", () => {
  it("reads the raw wire field from get_all_unifideck_games rows", () => {
    // Regression: the old view filtered on `is_installed` only, so the
    // Installed tab was empty for every un-adapted RPC row.
    expect(isInstalled(game({ id: "a", title: "A", installed: true }))).toBe(
      true,
    );
  });

  it("falls back to the adapted field", () => {
    expect(
      isInstalled(game({ id: "a", title: "A", is_installed: true })),
    ).toBe(true);
  });

  it("is false when neither is set", () => {
    expect(isInstalled(game({ id: "a", title: "A" }))).toBe(false);
  });
});

describe("selectCatalogue", () => {
  const games = [
    game({ id: "c", title: "Celeste", store: "gog", installed: true }),
    game({ id: "a", title: "Alba", store: "epic" }),
    game({ id: "b", title: "Braid", store: "epic", installed: true }),
  ];

  it("sorts by title by default", () => {
    expect(selectCatalogue(games, QUERY, new Map()).map((g) => g.title)).toEqual(
      ["Alba", "Braid", "Celeste"],
    );
  });

  it("filters by store", () => {
    const out = selectCatalogue(
      games,
      { ...QUERY, store: "epic" },
      new Map(),
    );
    expect(out.map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("filters by installed status", () => {
    const out = selectCatalogue(
      games,
      { ...QUERY, status: "installed" },
      new Map(),
    );
    expect(out.map((g) => g.id)).toEqual(["b", "c"]);
  });

  it("filters by not-installed status", () => {
    const out = selectCatalogue(
      games,
      { ...QUERY, status: "not-installed" },
      new Map(),
    );
    expect(out.map((g) => g.id)).toEqual(["a"]);
  });

  it("matches search case-insensitively on a substring", () => {
    const out = selectCatalogue(games, { ...QUERY, search: "  ELE " }, new Map());
    expect(out.map((g) => g.id)).toEqual(["c"]);
  });

  it("does not mutate the input array", () => {
    const input = [...games];
    selectCatalogue(input, QUERY, new Map());
    expect(input.map((g) => g.id)).toEqual(["c", "a", "b"]);
  });

  it("resolves Great on Deck from the shortcut facet first", () => {
    compatByAppId.mockImplementation((id: number) =>
      id === 42 ? { verdict: true } : null,
    );
    const withShortcut = [
      game({ id: "a", title: "Alba", app_id: 42 }),
      game({ id: "b", title: "Braid", app_id: 7 }),
    ];
    const out = selectCatalogue(
      withShortcut,
      { ...QUERY, status: "great-on-deck" },
      new Map(),
    );
    expect(out.map((g) => g.id)).toEqual(["a"]);
    expect(compatByTitle).not.toHaveBeenCalledWith("Alba");
  });

  it("falls back to title compat when a game has no shortcut yet", () => {
    compatByTitle.mockImplementation((title: string) =>
      title === "Braid" ? { verdict: true } : null,
    );
    const out = selectCatalogue(
      [game({ id: "b", title: "Braid" }), game({ id: "a", title: "Alba" })],
      { ...QUERY, status: "great-on-deck" },
      new Map(),
    );
    expect(out.map((g) => g.id)).toEqual(["b"]);
  });

  describe("stable ordering", () => {
    // Every non-alphabetical sort must break ties on title, or the
    // hundreds of games sharing a zero value reshuffle between renders.
    const tied = [
      game({ id: "c", title: "Celeste" }),
      game({ id: "a", title: "Alba" }),
      game({ id: "b", title: "Braid" }),
    ];

    for (const sort of SORT_KEYS) {
      it(`is total for sort=${sort}`, () => {
        const out = selectCatalogue(tied, { ...QUERY, sort }, new Map());
        expect(out.map((g) => g.title)).toEqual(["Alba", "Braid", "Celeste"]);
      });
    }
  });

  it("sorts by playtime descending", () => {
    const index = indexPlaytimes([
      playtime({ game_id: "a", total_seconds: 100 }),
      playtime({ game_id: "b", total_seconds: 900 }),
    ]);
    const out = selectCatalogue(
      [game({ id: "a", title: "Alba" }), game({ id: "b", title: "Braid" })],
      { ...QUERY, sort: "playtime" },
      index,
    );
    expect(out.map((g) => g.id)).toEqual(["b", "a"]);
  });

  it("sorts by size descending, treating unknown as zero", () => {
    const out = selectCatalogue(
      [
        game({ id: "a", title: "Alba" }),
        game({ id: "b", title: "Braid", size_bytes: 5 }),
      ],
      { ...QUERY, sort: "size" },
      new Map(),
    );
    expect(out.map((g) => g.id)).toEqual(["b", "a"]);
  });
});

describe("playtime index", () => {
  it("prefers the store's cross-device total over the local one", () => {
    const index = indexPlaytimes([
      playtime({ game_id: "a", total_seconds: 60, store_total_secs: 7200 }),
    ]);
    expect(playedSecs(game({ id: "a", title: "Alba" }), index)).toBe(7200);
  });

  it("falls back to the local total before the first store sync", () => {
    const index = indexPlaytimes([
      playtime({ game_id: "a", total_seconds: 60, store_total_secs: null }),
    ]);
    expect(playedSecs(game({ id: "a", title: "Alba" }), index)).toBe(60);
  });

  it("matches on store_game_id when the row id differs", () => {
    const index = indexPlaytimes([
      playtime({ game_id: "native-id", total_seconds: 30 }),
    ]);
    const g = game({ id: "other", title: "Alba" });
    (g as Game).store_game_id = "native-id";
    expect(playedSecs(g, index)).toBe(30);
  });

  it("ignores rows with no game id", () => {
    expect(indexPlaytimes([playtime({ total_seconds: 5 })]).size).toBe(0);
  });

  it("returns 0 for an unparseable last_played", () => {
    const index = indexPlaytimes([
      playtime({ game_id: "a", last_played: "not a date" }),
    ]);
    expect(lastPlayedMs(game({ id: "a", title: "Alba" }), index)).toBe(0);
  });
});

describe("countByStore", () => {
  it("counts against the unfiltered library", () => {
    const counts = countByStore([
      game({ id: "a", title: "A", store: "epic" }),
      game({ id: "b", title: "B", store: "epic" }),
      game({ id: "c", title: "C", store: "gog" }),
    ]);
    expect(counts.get("epic")).toBe(2);
    expect(counts.get("gog")).toBe(1);
    expect(counts.get("amazon")).toBeUndefined();
  });
});

describe("formatters", () => {
  it.each([
    [0, ""],
    [-5, ""],
    [90, "2m"],
    [30, "1m"],
    [3600, "1.0h"],
    [45000, "13h"],
    [39600, "11h"],
  ])("formats %i seconds as %s", (secs, expected) => {
    expect(formatPlaytime(secs)).toBe(expected);
  });

  it.each([
    [undefined, ""],
    [0, ""],
    [5 * 1024 ** 2, "5 MB"],
    [Math.round(1.5 * 1024 ** 3), "1.5 GB"],
    [42 * 1024 ** 3, "42 GB"],
  ])("formats %s bytes as %s", (bytes, expected) => {
    expect(formatSize(bytes as number | undefined)).toBe(expected);
  });
});

describe("game identity", () => {
  it("reads store_game_id, which is what the wire actually carries", () => {
    // Regression: the backend `Game` dataclass has no `id` field, so
    // keying tiles on `game.id` produced 42 children keyed `undefined`
    // and made every playtime lookup miss.
    const g = { store: "epic", store_game_id: "native-77" } as Game;
    expect(gameId(g)).toBe("native-77");
    expect(gameKey(g)).toBe("epic:native-77");
  });

  it("still accepts an adapted row carrying id", () => {
    const g = { store: "gog", id: "adapted-3" } as Game;
    expect(gameId(g)).toBe("adapted-3");
  });

  it("qualifies the key by store so two storefronts cannot collide", () => {
    const a = { store: "epic", store_game_id: "same" } as Game;
    const b = { store: "gog", store_game_id: "same" } as Game;
    expect(gameKey(a)).not.toBe(gameKey(b));
  });

  it("matches playtime rows through the same rule", () => {
    const index = indexPlaytimes([
      playtime({ game_id: "native-77", total_seconds: 42 }),
    ]);
    const g = { store: "epic", store_game_id: "native-77" } as Game;
    expect(playedSecs(g, index)).toBe(42);
  });
});

describe("availableSorts", () => {
  it("hides playtime and recency while nothing has been played", () => {
    // Sorting 743 identical zeros silently yields alphabetical order,
    // so offering these would be offering two settings that do nothing.
    expect(availableSorts(new Map())).toEqual(["title", "size", "store"]);
  });

  it("offers every sort once playtime exists", () => {
    const index = indexPlaytimes([playtime({ game_id: "a" })]);
    expect(availableSorts(index)).toEqual([...SORT_KEYS]);
  });
});

describe("letter jump", () => {
  const titles = [
    "1000xRESIST", "33 Immortals",           // bucket "#"
    "Abyssus", "ABZU", "Aliens",             // bucket "A"
    "Braid",                                 // bucket "B"
    "Celeste", "Cocoon",                     // bucket "C"
  ];
  const games = titles.map((t, i) =>
    ({ id: String(i), store_game_id: String(i), title: t, store: "epic" } as Game),
  );

  it("groups digits and symbols under a single bucket", () => {
    expect(initialOf("1000xRESIST")).toBe("#");
    expect(initialOf("33 Immortals")).toBe("#");
    expect(initialOf("  spaced")).toBe("S");
    expect(initialOf("")).toBe("#");
  });

  it("jumps forward to the start of the next letter", () => {
    expect(jumpToAdjacentInitial(games, 0, 1)).toBe(2);   // # → A
    expect(jumpToAdjacentInitial(games, 2, 1)).toBe(5);   // A → B
    expect(jumpToAdjacentInitial(games, 5, 1)).toBe(6);   // B → C
  });

  it("jumps back to the start of the previous letter, not its end", () => {
    // From "Cocoon" the useful destination is "Braid", and from mid-A
    // it is the first "#" entry — landing on the last item of the
    // previous letter would feel like the jump undershot.
    expect(jumpToAdjacentInitial(games, 7, -1)).toBe(5);
    expect(jumpToAdjacentInitial(games, 3, -1)).toBe(0);
  });

  it("returns null at the ends", () => {
    expect(jumpToAdjacentInitial(games, 7, 1)).toBeNull();
    expect(jumpToAdjacentInitial(games, 0, -1)).toBeNull();
  });

  it("handles an empty list and out-of-range indices", () => {
    expect(jumpToAdjacentInitial([], 0, 1)).toBeNull();
    expect(jumpToAdjacentInitial(games, 999, 1)).toBeNull();
    expect(jumpToAdjacentInitial(games, -5, -1)).toBeNull();
  });
});

describe("letter jump anchored on pages", () => {
  // Mirrors the shape of the real library: "#" is a tiny bucket, so the
  // first letter boundary falls inside page 1 and an item-anchored jump
  // would appear to do nothing.
  const titles = [
    ...["1000xRESIST", "33 Immortals"],        // 0-1   "#"
    ...Array.from({ length: 8 }, (_, i) => `A game ${i}`),  // 2-9  "A"
    ...Array.from({ length: 6 }, (_, i) => `B game ${i}`),  // 10-15 "B"
    ...Array.from({ length: 6 }, (_, i) => `C game ${i}`),  // 16-21 "C"
  ];
  const games = titles.map((t, i) =>
    ({ id: String(i), store_game_id: String(i), title: t, store: "epic" } as Game),
  );
  const PAGE = 5; // pagine: 0=[0..4] 1=[5..9] 2=[10..14] 3=[15..19] 4=[20..21]

  it("lists every letter boundary", () => {
    expect(initialBoundaries(games)).toEqual([0, 2, 10, 16]);
  });

  it("skips a boundary that sits on the current page", () => {
    // Regression: "A" starts at index 2, still page 0. Jumping there
    // would leave the view unchanged and read as a dead button.
    expect(jumpToAdjacentLetterPage(games, 0, PAGE, 1)).toBe(10);
  });

  it("always lands on a later page going forward", () => {
    const target = jumpToAdjacentLetterPage(games, 1, PAGE, 1)!;
    expect(Math.floor(target / PAGE)).toBeGreaterThan(1);
  });

  it("always lands on an earlier page going back", () => {
    const target = jumpToAdjacentLetterPage(games, 3, PAGE, -1)!;
    expect(Math.floor(target / PAGE)).toBeLessThan(3);
  });

  it("returns null at the ends", () => {
    expect(jumpToAdjacentLetterPage(games, 4, PAGE, 1)).toBeNull();
    expect(jumpToAdjacentLetterPage(games, 0, PAGE, -1)).toBeNull();
  });

  it("handles an empty library", () => {
    expect(jumpToAdjacentLetterPage([], 0, PAGE, 1)).toBeNull();
    expect(initialBoundaries([])).toEqual([]);
  });
});
