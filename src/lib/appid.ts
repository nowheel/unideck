/**
 * Shortcut AppID normalisation.
 *
 * A non-Steam shortcut's AppID is a 32-bit value that this system
 * stores in two different forms. The backend and `games.map` keep the
 * **signed** reading (`-310337468`); Steam's own app store and its
 * routes use the **unsigned** one (`3984629828`). They are the same
 * bits, and mixing them up fails silently rather than loudly:
 *
 *   - `appStore.GetAppOverviewByAppID(-310337468)` returns `null`, so
 *     artwork lookups come back empty and every tile renders blank;
 *   - `Navigate("/library/app/-310337468")` does not error — Steam
 *     cannot match the route and quietly lands the user on the library
 *     home page instead of the game they picked.
 *
 * Both were shipped as bugs before this module existed. Anything that
 * hands a shortcut AppID to Steam goes through here.
 */

/**
 * The form Steam expects: unsigned 32-bit.
 *
 * `>>> 0` reinterprets the sign bit rather than clamping, so a value
 * that is already unsigned passes through unchanged.
 */
export function toSteamAppId(appId: number): number {
  return appId >>> 0;
}

/**
 * Both readings of the same AppID, Steam's preferred one first.
 *
 * De-duplicated: below 2^31 the two coincide, and asking Steam the same
 * question twice is pure waste on a page that resolves 42 tiles at a
 * time. Used where we must *look up* an id that may have arrived in
 * either form; use {@link toSteamAppId} where we are handing one out.
 */
export function appIdForms(appId: number): number[] {
  return [...new Set([appId >>> 0, appId | 0])];
}
