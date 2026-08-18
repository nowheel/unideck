**Title:** The frontend `Game` interface does not match the backend `Game` dataclass, and the mismatch fails silently

---

### Summary

`types/api.ts` declares fields the wire does not send. Code that consumes raw `get_all_unifideck_games` rows reads `undefined` with no error, no warning and no type complaint.

This is a maintainability report rather than a user-facing bug, and low priority — but it has real teeth, because the failure mode is silence rather than a crash.

Version: `0.7.3`.

### The mismatch

`core/types/domain.py` defines:

```
app_id, store, store_game_id, title, installed, install_path,
exe_path, size_bytes, tags, icon_url, hero_url, logo_url, metadata
```

`types/api.ts` declares `id`, `is_installed`, `cover_image`, `executable`, `store_tags` — none of which exist on the dataclass — and omits `exe_path`, `tags`, `icon_url`, `hero_url`, `logo_url`, `metadata`, which do.

`adaptGame` in `hooks/useGameInfo.ts` bridges the two, and its docstring already documents the trap precisely:

> *Without this adapter, every consumer of `useGameInfo` sees `game.is_installed === undefined` (falsy → "not installed") and `game.id === undefined` (so download-queue matching by `game.id === download.game_id` always misses), which is why the Play section stays on Install even mid-download.*

So the hazard is known. The type still describes the adapted shape as if it were the only one.

### What it cost downstream

Building a view on raw RPC rows, I hit three separate bugs from this before correcting the type:

- an "Installed" filter that was always empty, because it read `is_installed` rather than `installed`;
- a grid whose React children were all keyed `undefined`, because `game.id` does not exist on raw rows;
- playtime lookups that never matched, for the same reason.

Each looked like a different bug. All three were this.

### Suggestion

I'm deliberately not proposing a patch. Making the type honest surfaced five call sites that assume `game.id` is a `string`, and touching them all at once is exactly the kind of sweeping change `CONTRIBUTING.md` asks contributors not to send unsolicited.

Two smaller options that would each help on their own:

1. **Annotate rather than restructure.** Mark the adapted-only fields optional and note which shape provides each one. The comment at the top of `types/api.ts` already warns that the contract is enforced by reviewers rather than tooling — making the two shapes visible in the type is in the same spirit.

2. **Expose the identity rule once.** A tiny `gameId(game)` helper applying `store_game_id ?? id` — the same rule `adaptGame` already uses — would remove the need for every call site to know which shape it holds.

Happy to prepare either if it is useful, or to leave it as a note.
