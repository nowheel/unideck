**Title:** `SteamBridge.getAppOverview()` / `isReady()` call `SteamClient.Apps.GetAppOverview`, which no longer exists

---

### Summary

`SteamBridge.getAppOverview()` reads `window.SteamClient.Apps.GetAppOverview`. On current Steam that property is `undefined`, so the method returns `null` for every appid ever passed to it. `isReady()` tests the same symbol and therefore always returns `false`.

**Impact today is nil**, and I want to be upfront about that: the only consumer, `hooks/useSteamLibrary.ts`, is exported from the hooks barrel but imported by nothing, so it is tree-shaken out of the bundle entirely. I'm reporting it because it is a working-looking API that silently answers "no" to everything, and `isReady()` reads like a readiness gate that can never open.

Version: `0.7.3`, Decky Loader `3.2.6`, Steam client with CEF `126.0.6478.183`.

### Steps to reproduce

In Steam's CEF debugger (`localhost:8080`), in the `SharedJSContext` target:

```js
typeof window.SteamClient?.Apps?.GetAppOverview
// → "undefined"

typeof window.appStore?.GetAppOverviewByAppID
// → "function"

window.appStore.GetAppOverviewByAppID(2559794348)
// → the overview, display_name "Fall Guys"
```

### Expected vs actual

**Expected:** `getAppOverview(appId)` returns the overview for a known appid; `isReady()` becomes true once Steam can answer.

**Actual:** both are hard-wired to a symbol that does not exist. `getAppOverview` returns `null` unconditionally; `isReady()` returns `false` unconditionally.

### Proposed fix

Read `window.appStore`, which is the object that exists:

```ts
function appStore():
  | { GetAppOverviewByAppID?: (appId: number) => unknown }
  | undefined {
  return (window as unknown as {
    appStore?: { GetAppOverviewByAppID?: (appId: number) => unknown };
  }).appStore;
}

isReady(): boolean {
  return typeof appStore()?.GetAppOverviewByAppID === "function";
}

getAppOverview(appId: number): SteamAppOverview | null {
  const store = appStore();
  if (!store?.GetAppOverviewByAppID) return null;
  for (const form of new Set([appId >>> 0, appId | 0])) {
    try {
      const overview = store.GetAppOverviewByAppID.call(store, form);
      if (overview) return overview as SteamAppOverview;
    } catch {
      // A renamed internal costs this lookup, not the caller.
    }
  }
  return null;
}
```

Two details in there that are not incidental:

**Both AppID readings are tried.** Shortcut AppIDs travel through the codebase in two 32-bit forms — the backend and `games.map` use the signed one (`-310337468`), Steam's app store is keyed on the unsigned one (`3984629828`). Looking one up in the other's form returns `null` with no error. This bit me twice elsewhere, including in `Navigate("/library/app/<signed>")`, which matches no route and quietly lands the user on the library home page instead of the game.

**The method is called with its receiver** (`.call(store, form)`). `appStore`'s methods are prototype methods that reach through `this`; a detached reference throws `TypeError`, and a broad `catch` turns that into a silent empty answer. `GetCustomVerticalCapsuleURLs` calls `this.GetCustomImageURLs` internally, for example.

### Note

`window.appStore` exists in `SharedJSContext`, where plugin JS runs. It is **not** present in the Big Picture window's realm, where the rendered DOM lives — worth knowing when debugging, since inspecting the wrong realm gives confident wrong answers.
