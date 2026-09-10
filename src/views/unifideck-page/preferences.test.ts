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
  meetsGreatOnCurrentDevice: () => false,
}));

import {
  DEFAULT_FILTERS,
  loadFilters,
  loadStoreCounts,
  saveFilters,
  saveStoreCounts,
} from "./preferences";

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

/**
 * The baseline the shrink warning compares against.
 *
 * Every read here is defensive for the same reason the filters are: whatever
 * is in localStorage was written by some past version, and a page that throws
 * on mount because of it is worse than a page that forgets.
 */
describe("store counts", () => {
  it("is empty before anything was stored", () => {
    expect(loadStoreCounts()).toEqual({});
  });

  it("round-trips a map through storage", () => {
    saveStoreCounts(new Map([["epic", 104], ["microsoft", 608]]));
    expect(loadStoreCounts()).toEqual({ epic: 104, microsoft: 608 });
  });

  it("survives a corrupt entry", () => {
    window.localStorage.setItem("unifideck:store-counts:v1", "{not json");
    expect(loadStoreCounts()).toEqual({});
  });

  it("survives a stored value that is not an object", () => {
    window.localStorage.setItem("unifideck:store-counts:v1", '"epic"');
    expect(loadStoreCounts()).toEqual({});
  });

  it("drops entries that are not usable counts", () => {
    // A string here would reach a subtraction and surface as NaN in the
    // banner, which reads as a bug in the count rather than in the storage.
    window.localStorage.setItem(
      "unifideck:store-counts:v1",
      JSON.stringify({ epic: 104, gog: "molti", amazon: -3, ubisoft: null }),
    );
    expect(loadStoreCounts()).toEqual({ epic: 104 });
  });

  it("does not use the same key as the filters", () => {
    // They have different lifetimes: one corrupt value must not reset both.
    saveStoreCounts(new Map([["epic", 104]]));
    expect(loadFilters()).toEqual(DEFAULT_FILTERS);
  });
});
