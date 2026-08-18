**Title:** A failed store fetch wipes that store's library and deletes its Steam shortcuts (reported as `0 errors`)

---

### Summary

When a store's library fetch fails, Unifideck replaces that store's library with an empty list. The empty list then flows into the library cache and into the shortcut reconciler, which deletes the corresponding Steam shortcuts.

On my Deck this cost **603 deleted Steam shortcuts** from a single transient network failure. The sync logged `sync complete … (0 errors)` while doing it, so nothing indicated anything had gone wrong — I found out days later by accident.

Version: `0.7.3` · Decky Loader `3.2.6` · library of 741 games (Epic 104, GOG 36, Microsoft/xCloud 601).

### What happened

A scheduled sync started, and the Deck suspended partway through. A socket does not age while the machine sleeps, so a request with `timeout=30` surfaced its failure four hours later:

```
[MicrosoftCatalog] /v2/titles unexpected TimeoutError
  File ".../stores/microsoft/microsoft_catalog.py", line 288, in _xcloud_titles_sync
[MicrosoftCatalog] /v2/titles returned 0 titles in 14596.8s
[MicrosoftCatalog] /v2/titles returned 0 titles            (WARNING)
[SyncService] microsoft: 0 games
[SyncService] populated app_id for 140 games
[SyncService] Saved library cache (140 games) to library_cache.json
[SyncService] sync complete — 140 games across 3 stores in 39282ms (0 errors)
[ShortcutService] IMPORTANT: Steam restart required to see shortcut changes!
[ShortcutService]   (added=0 removed=603 reclaimed=0)
```

`shortcuts.vdf` went from 744 entries to 141.

The suspend is the trigger, not the bug. The bug is that a failure became an empty success.

### Root cause

There are two independent problems, and either one alone is enough to lose the library.

**1. `microsoft_catalog._xcloud_titles_sync` converts every error into an empty result.**

Every branch — `HTTPError`, `URLError`, the generic `except`, and the non-JSON path — ends in `return []`. A broken fetch therefore reaches `SyncService` as "this account owns no Xbox games", which is indistinguishable from a genuinely empty library. This is why the run counted zero errors: nothing ever raised.

**2. `core/sync_run_mixin.py` overwrites the library even when the fetch is known to have failed.**

```python
games, err = await self._fetch_one(store, is_force)
libraries[store.store_name] = games        # unconditional
if err is not None:
    errors[store.store_name] = err          # collected, but only reported
```

`_fetch_one` already returns `[], "timeout"` and `[], "cancelled"`, and `_sync_one_store` returns `[], str(e)` — so the failure paths are correctly detected, and then the empty list is stored anyway. `core/sync_service.py` does the same in the single-store refresh path.

So even after fixing (1), a reported failure would still empty the store.

### Steps to reproduce

No suspend needed:

1. Connect a Microsoft account with a Game Pass library.
2. Make the catalogue call fail — block `*.gssv-play-prod.xboxlive.com`, or drop the network mid-sync.
3. Run a library sync.
4. Observe: `microsoft: 0 games`, the cache rewritten, `removed=<n>` from the shortcut reconciler, and `0 errors` in the summary.
5. Restart Steam — the games are gone from the library.

The same shape applies to any store whose fetch can fail.

### Expected vs actual

**Expected:** a store that fails to fetch is skipped. Its previously known games stay, the error is reported, and the next sync retries. Freshness is the only thing lost.

**Actual:** the store's library is replaced with nothing, its Steam shortcuts are deleted, and the run reports success.

### Proposed fix

Two small changes. I have both running on my device; happy to open a PR if you'd like one, or to leave it with you to implement in your own style — per `CONTRIBUTING.md` I did not want to send an unsolicited PR.

**1. Let a failed fetch be a failure** (`stores/microsoft/microsoft_catalog.py`):

```python
class XCloudCatalogUnavailable(RuntimeError):
    """The xCloud catalogue could not be fetched.

    Distinct from "the catalogue is empty" — that distinction is what
    keeps a network error from being read as an empty library.
    """
```

Then replace each `return []` in `_xcloud_titles_sync` with a raise:

```python
    except urllib.error.HTTPError as e:
        logger.exception(...)
        raise XCloudCatalogUnavailable(f"HTTP {e.code}: {e.reason}") from e
    except urllib.error.URLError as e:
        logger.exception(...)
        raise XCloudCatalogUnavailable(f"unreachable: {e.reason!r}") from e
    except Exception as e:
        logger.exception(...)
        raise XCloudCatalogUnavailable(f"{type(e).__name__}: {e}") from e
```

…including the `json.JSONDecodeError` and non-dict branches. And drop the `or []` in the caller, which would otherwise flatten the exception back into an empty list:

```python
-        result = await asyncio.get_event_loop().run_in_executor(
-            None, lambda: _xcloud_titles_sync(url, headers),
-        )
-        return result or []
+        return await asyncio.get_event_loop().run_in_executor(
+            None, lambda: _xcloud_titles_sync(url, headers),
+        )
```

`_sync_one_store`'s existing `except Exception` then catches it, emits `SYNC_FAILED` and the retry toast, and reports the store as failed — all of which already works.

**2. Never replace a library with nothing because of an error** (`core/sync_run_mixin.py`):

```python
             games, err = await self._fetch_one(store, is_force)
-            libraries[store.store_name] = games
             if err is not None:
                 errors[store.store_name] = err
+                previous = (self._all_games or {}).get(store.store_name)
+                if previous:
+                    logger.warning(
+                        "[SyncService] %s failed (%s) — keeping the %d "
+                        "previously known game(s) rather than clearing them",
+                        store.store_name, err, len(previous),
+                    )
+                    libraries[store.store_name] = list(previous)
+                else:
+                    libraries[store.store_name] = games
+            else:
+                libraries[store.store_name] = games
```

And the same rule in `core/sync_service.py`, where a single-store refresh has the identical unconditional assignment.

This deliberately does **not** block a shrinking library: a successful fetch that returns fewer games — a lapsed subscription, a revoked licence — is still recorded. Only *failed* fetches are treated as no-ops.

### Notes

- The `PER_STORE_FETCH_TIMEOUT_SECONDS` guard works correctly; it just cannot help here, because nothing timed out from `asyncio`'s point of view — the request had already returned, with an empty result.
- Recovery was painless once the fetch succeeded again: `shortcuts_registry.json` had kept all 743 entries, so the re-created shortcuts reclaimed their original AppIDs and the artwork reattached (`added=601 removed=0 reclaimed=140`, 543 icons updated). That registry design saved the day — worth keeping as-is.
- Separately, I added a warning (not a block) when a *successful* fetch returns less than half of a store's previous count, floored at 10 games. That is an enhancement rather than part of this fix, so I've left it out of the proposal above — glad to share it if it's of interest.

Thanks for Unifideck — everything above sits on top of a plugin that does a lot of hard things well.
