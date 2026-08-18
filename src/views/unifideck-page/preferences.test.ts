// @vitest-environment jsdom
/**
 * Tests for remembered filters.
 *
 * The rule that matters is the difference between "no stores are
 * valid" and "the library has not loaded yet". Conflating them threw
 * away every remembered store on mount, which is how this feature
 * first shipped doing nothing at all.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// `preferences` pulls `SORT_KEYS` from `catalogue`, which reaches the
// compat caches and through them `@decky/api` — not loadable here.
// Same stubs the catalogue suite uses.
vi.mock("../../lib/library-facets", () => ({
  getCompatByShortcutAppId: () => null,
}));
vi.mock("../../lib/protondb-cache", () => ({
  getCachedCompatByTitle: () => null,
  meetsGreatOnDeckCriteria: () => false,
}));

import { DEFAULT_FILTERS, loadFilters, saveFilters } from "./preferences";

beforeEach(() => window.localStorage.clear());

describe("loadFilters", () => {
  it("returns defaults when nothing was stored", () => {
    expect(loadFilters()).toEqual(DEFAULT_FILTERS);
  });

  it("round-trips what was saved", () => {
    saveFilters({ store: "gog", status: "installed", sort: "size" });
    expect(loadFilters()).toEqual({
      store: "gog",
      status: "installed",
      sort: "size",
    });
  });

  it("keeps a remembered store when the library has not loaded yet", () => {
    // Regression: called with no argument it must trust the stored
    // value, not discard it for lack of anything to check against.
    saveFilters({ ...DEFAULT_FILTERS, store: "gog" });
    expect(loadFilters().store).toBe("gog");
  });

  it("drops a store that is no longer in the library", () => {
    saveFilters({ ...DEFAULT_FILTERS, store: "gog" });
    expect(loadFilters(["epic", "microsoft"]).store).toBe("all");
  });

  it("keeps a store that is still there", () => {
    saveFilters({ ...DEFAULT_FILTERS, store: "gog" });
    expect(loadFilters(["epic", "gog"]).store).toBe("gog");
  });

  it("falls back on unknown status or sort values", () => {
    window.localStorage.setItem(
      "unifideck:catalogue-filters:v1",
      JSON.stringify({ store: "all", status: "bogus", sort: "nonsense" }),
    );
    expect(loadFilters()).toEqual(DEFAULT_FILTERS);
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem("unifideck:catalogue-filters:v1", "{not json");
    expect(loadFilters()).toEqual(DEFAULT_FILTERS);
  });
});
