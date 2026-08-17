// @vitest-environment jsdom
/**
 * Tests for cover-art resolution.
 *
 * The case that matters is the signed/unsigned AppID split: shortcut
 * ids travel as negative 32-bit values in `games.map` and as unsigned
 * ones in Steam's app store, and looking one up in the other's form
 * silently yields no artwork — which is precisely how this page ended
 * up rendering blank tiles.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.mock` is hoisted above every other statement in the file, so the
// spy the factory closes over has to be hoisted with it — declaring it
// as a plain const leaves the factory reading it in its temporal dead
// zone. `cover.ts` constructs its bridge at module load, which is when
// that read happens.
const { getAppOverview } = vi.hoisted(() => ({ getAppOverview: vi.fn() }));

vi.mock("../../lib/steam-bridge", () => ({
  SteamBridge: class {
    getAppOverview = getAppOverview;
  },
}));

import { clearCoverCache, resolveCover, resolveCoverForAppId } from "./cover";
import type { Game } from "../../types/api";

/** The pair from this device: games.map stores the signed form. */
const SIGNED = -1735172948;
const UNSIGNED = 2559794348;

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
  getAppOverview.mockReset().mockReturnValue(null);
});

describe("resolveCoverForAppId", () => {
  it("finds artwork registered under the unsigned form of a signed id", () => {
    getAppOverview.mockImplementation((id: number) =>
      id === UNSIGNED
        ? { GetLibraryImageURL: () => "/assets/cover_600x900.jpg" }
        : null,
    );
    expect(resolveCoverForAppId(SIGNED)).toBe("/assets/cover_600x900.jpg");
  });

  it("finds artwork registered under the signed form of an unsigned id", () => {
    getAppOverview.mockImplementation((id: number) =>
      id === SIGNED ? { GetLibraryImageURL: () => "/assets/x.jpg" } : null,
    );
    expect(resolveCoverForAppId(UNSIGNED)).toBe("/assets/x.jpg");
  });

  it("prefers the portrait capsule over the wide ones", () => {
    getAppOverview.mockReturnValue({
      GetLibraryImageURL: () => "portrait.jpg",
      GetCapsuleImageURL: () => "capsule.jpg",
      GetHeaderImageURL: () => "header.jpg",
    });
    expect(resolveCoverForAppId(1)).toBe("portrait.jpg");
  });

  it("falls back through the getters when the preferred one is absent", () => {
    getAppOverview.mockReturnValue({
      GetHeaderImageURL: () => "header.jpg",
    });
    expect(resolveCoverForAppId(1)).toBe("header.jpg");
  });

  it("skips a getter that returns an empty string", () => {
    getAppOverview.mockReturnValue({
      GetLibraryImageURL: () => "",
      GetCapsuleImageURL: () => "capsule.jpg",
    });
    expect(resolveCoverForAppId(1)).toBe("capsule.jpg");
  });

  it("survives a getter that throws", () => {
    getAppOverview.mockReturnValue({
      GetLibraryImageURL: () => {
        throw new Error("Steam internals moved");
      },
      GetCapsuleImageURL: () => "capsule.jpg",
    });
    expect(resolveCoverForAppId(1)).toBe("capsule.jpg");
  });

  it("returns null when Steam knows nothing about the app", () => {
    expect(resolveCoverForAppId(1)).toBeNull();
  });

  it("memoises the miss so a coverless game is asked about once", () => {
    expect(resolveCoverForAppId(1)).toBeNull();
    expect(resolveCoverForAppId(1)).toBeNull();
    // Two candidate forms tried on the first call, none on the second.
    expect(getAppOverview).toHaveBeenCalledTimes(2);
  });

  it("re-queries after the cache is cleared", () => {
    resolveCoverForAppId(1);
    clearCoverCache();
    resolveCoverForAppId(1);
    expect(getAppOverview).toHaveBeenCalledTimes(4);
  });
});

describe("resolveCover", () => {
  it("prefers a backend-supplied cover", () => {
    const out = resolveCover(game({ cover_image: "ubi.jpg", app_id: 1 }));
    expect(out).toBe("ubi.jpg");
    expect(getAppOverview).not.toHaveBeenCalled();
  });

  it("asks Steam when the backend has none", () => {
    getAppOverview.mockReturnValue({ GetLibraryImageURL: () => "steam.jpg" });
    expect(resolveCover(game({ app_id: SIGNED }))).toBe("steam.jpg");
  });

  it("returns null for a game with no shortcut yet", () => {
    expect(resolveCover(game({}))).toBeNull();
    expect(getAppOverview).not.toHaveBeenCalled();
  });
});
