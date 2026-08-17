// @vitest-environment jsdom
/**
 * Tests for shortcut AppID normalisation.
 *
 * The pair used throughout is a real one from this device: `games.map`
 * records "3 out of 10" as -310337468, while Steam's app store and its
 * routes know the same shortcut as 3984629828.
 */
import { describe, it, expect } from "vitest";

import { appIdForms, toSteamAppId } from "./appid";

const SIGNED = -310337468;
const UNSIGNED = 3984629828;

describe("toSteamAppId", () => {
  it("converts the backend's signed reading to Steam's unsigned one", () => {
    // Regression: the signed form in `/library/app/<id>` matches no
    // route, and Steam silently lands on the library home page.
    expect(toSteamAppId(SIGNED)).toBe(UNSIGNED);
  });

  it("leaves an already-unsigned id untouched", () => {
    expect(toSteamAppId(UNSIGNED)).toBe(UNSIGNED);
  });

  it("is idempotent", () => {
    expect(toSteamAppId(toSteamAppId(SIGNED))).toBe(UNSIGNED);
  });

  it("handles small ids unchanged", () => {
    expect(toSteamAppId(570)).toBe(570);
  });
});

describe("appIdForms", () => {
  it("offers Steam's form first", () => {
    expect(appIdForms(SIGNED)).toEqual([UNSIGNED, SIGNED]);
  });

  it("is symmetric — either input yields the same pair", () => {
    expect(appIdForms(UNSIGNED)).toEqual(appIdForms(SIGNED));
  });

  it("collapses to one form below 2^31, where the readings coincide", () => {
    expect(appIdForms(570)).toEqual([570]);
  });
});
