// @vitest-environment jsdom
/**
 * Tests for cover-art resolution.
 *
 * Two things here were learned the hard way against the live client and
 * are worth pinning down:
 *
 *   - shortcut AppIDs exist in signed and unsigned 32-bit form, and
 *     looking one up in the other's form returns nothing at all, with
 *     no error to notice;
 *   - `appStore` hands back several candidate URLs of which only one
 *     resolves, so the list must be preserved in order rather than
 *     collapsed to a first guess.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { clearCoverCache, coverCandidates, resolveCovers } from "./cover";
import type { Game } from "../../types/api";

/** The pair from this device: games.map stores the signed form. */
const SIGNED = -1735172948;
const UNSIGNED = 2559794348;

const GetAppOverviewByAppID = vi.fn();
const GetCustomVerticalCapsuleURLs = vi.fn();
const GetCachedVerticalCapsuleURL = vi.fn();
const GetVerticalCapsuleURLForApp = vi.fn();

function installAppStore(): void {
  (window as unknown as { appStore: unknown }).appStore = {
    GetAppOverviewByAppID,
    GetCustomVerticalCapsuleURLs,
    GetCachedVerticalCapsuleURL,
    GetVerticalCapsuleURLForApp,
  };
}

function game(over: Partial<Game>): Game {
  return {
    id: "g",
    store_game_id: "g",
    title: "Fall Guys",
    store: "epic",
    is_installed: false,
    ...over,
  } as Game;
}

beforeEach(() => {
  clearCoverCache();
  for (const fn of [
    GetAppOverviewByAppID,
    GetCustomVerticalCapsuleURLs,
    GetCachedVerticalCapsuleURL,
    GetVerticalCapsuleURLForApp,
  ]) {
    fn.mockReset().mockReturnValue(undefined);
  }
  installAppStore();
});

describe("coverCandidates", () => {
  it("finds artwork registered under the unsigned form of a signed id", () => {
    GetAppOverviewByAppID.mockImplementation((id: number) =>
      id === UNSIGNED ? { name: "Fall Guys" } : null,
    );
    GetCustomVerticalCapsuleURLs.mockReturnValue(["/customimages/x.jpg"]);
    expect(coverCandidates(SIGNED)).toEqual(["/customimages/x.jpg"]);
  });

  it("finds artwork registered under the signed form of an unsigned id", () => {
    GetAppOverviewByAppID.mockImplementation((id: number) =>
      id === (UNSIGNED | 0) ? { name: "Fall Guys" } : null,
    );
    GetCustomVerticalCapsuleURLs.mockReturnValue(["/customimages/x.jpg"]);
    expect(coverCandidates(UNSIGNED)).toEqual(["/customimages/x.jpg"]);
  });

  it("keeps every candidate, custom art first", () => {
    // On-device only the first of these loads, but the tile discovers
    // that by trying — the resolver must not prune for it.
    GetAppOverviewByAppID.mockReturnValue({});
    GetCustomVerticalCapsuleURLs.mockReturnValue(["/c.jpg", "/c.png"]);
    GetCachedVerticalCapsuleURL.mockReturnValue(["/assets/a.jpg"]);
    GetVerticalCapsuleURLForApp.mockReturnValue("https://cdn/x.jpg");
    expect(coverCandidates(1)).toEqual([
      "/c.jpg",
      "/c.png",
      "/assets/a.jpg",
      "https://cdn/x.jpg",
    ]);
  });

  it("accepts a bare string as well as an array", () => {
    GetAppOverviewByAppID.mockReturnValue({});
    GetCustomVerticalCapsuleURLs.mockReturnValue("/single.jpg");
    expect(coverCandidates(1)).toEqual(["/single.jpg"]);
  });

  it("drops empty strings and de-duplicates", () => {
    GetAppOverviewByAppID.mockReturnValue({});
    GetCustomVerticalCapsuleURLs.mockReturnValue(["", "/dup.jpg"]);
    GetCachedVerticalCapsuleURL.mockReturnValue(["/dup.jpg"]);
    expect(coverCandidates(1)).toEqual(["/dup.jpg"]);
  });

  it("survives a getter that throws", () => {
    GetAppOverviewByAppID.mockReturnValue({});
    GetCustomVerticalCapsuleURLs.mockImplementation(() => {
      throw new Error("Steam internals moved");
    });
    GetCachedVerticalCapsuleURL.mockReturnValue(["/fallback.jpg"]);
    expect(coverCandidates(1)).toEqual(["/fallback.jpg"]);
  });

  it("returns nothing when Steam knows nothing about the app", () => {
    GetAppOverviewByAppID.mockReturnValue(null);
    expect(coverCandidates(1)).toEqual([]);
  });

  it("returns nothing when appStore is absent entirely", () => {
    delete (window as unknown as { appStore?: unknown }).appStore;
    expect(coverCandidates(1)).toEqual([]);
  });

  it("calls the getters with appStore as the receiver", () => {
    // Regression: these are prototype methods that reach through
    // `this`, so a detached call throws and the catch turns it into
    // "no artwork" — the bug that shipped a coverless build.
    GetAppOverviewByAppID.mockReturnValue({});
    GetCustomVerticalCapsuleURLs.mockImplementation(function (
      this: unknown,
    ): string[] {
      if (!this) throw new TypeError("Cannot read properties of undefined");
      return ["/c.jpg"];
    });
    expect(coverCandidates(1)).toEqual(["/c.jpg"]);
  });

  it("memoises a genuine miss once Steam knows the app", () => {
    GetAppOverviewByAppID.mockReturnValue({});
    coverCandidates(1);
    coverCandidates(1);
    // One id form resolved on the first call, nothing on the second.
    expect(GetAppOverviewByAppID).toHaveBeenCalledTimes(1);
  });

  it("does NOT memoise while Steam has no overview yet", () => {
    // The page can mount before the shortcut map is populated. Caching
    // the cold answer would blank every cover for the whole session.
    GetAppOverviewByAppID.mockReturnValue(null);
    coverCandidates(1);
    GetAppOverviewByAppID.mockReturnValue({});
    GetCustomVerticalCapsuleURLs.mockReturnValue(["/late.jpg"]);
    expect(coverCandidates(1)).toEqual(["/late.jpg"]);
  });

  it("re-queries after the cache is cleared", () => {
    GetAppOverviewByAppID.mockReturnValue({});
    GetCustomVerticalCapsuleURLs.mockReturnValue(["/c.jpg"]);
    coverCandidates(1);
    clearCoverCache();
    coverCandidates(1);
    expect(GetAppOverviewByAppID).toHaveBeenCalledTimes(2);
  });
});

describe("resolveCovers", () => {
  it("puts a backend-supplied cover ahead of Steam's", () => {
    GetAppOverviewByAppID.mockReturnValue({});
    GetCustomVerticalCapsuleURLs.mockReturnValue(["/steam.jpg"]);
    expect(resolveCovers(game({ cover_image: "ubi.jpg", app_id: 1 }))).toEqual([
      "ubi.jpg",
      "/steam.jpg",
    ]);
  });

  it("asks Steam when the backend has none", () => {
    GetAppOverviewByAppID.mockReturnValue({});
    GetCustomVerticalCapsuleURLs.mockReturnValue(["/steam.jpg"]);
    expect(resolveCovers(game({ app_id: SIGNED }))).toEqual(["/steam.jpg"]);
  });

  it("returns nothing for a game with no shortcut yet", () => {
    expect(resolveCovers(game({}))).toEqual([]);
    expect(GetAppOverviewByAppID).not.toHaveBeenCalled();
  });
});
