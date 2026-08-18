"""Regression: a failed store fetch must not erase that store's library.

On 2026-08-18 a sync ran while the Deck suspended. The xCloud catalogue
request surfaced its failure 14,596 seconds later, and every error
branch in ``microsoft_catalog._xcloud_titles_sync`` returned ``[]`` —
so a broken fetch reached SyncService as "this account owns no Xbox
games". The library was overwritten with the empty result, the shortcut
reconciler followed it, and **603 Steam shortcuts were deleted**. The
run logged ``sync complete ... (0 errors)`` throughout.

Two defects, tested here as two rules:

1. the catalogue raises :class:`XCloudCatalogUnavailable` on failure,
   so a broken fetch is never mistaken for an empty one;
2. the sync loop carries the previous library forward for any store
   that failed, so even a correctly-reported error cannot delete games.

Freshness is the only thing a failed store may cost.
"""
from __future__ import annotations

import types
import urllib.error

import pytest

from unifideck.core import sync_run_mixin as m
from unifideck.stores.microsoft import microsoft_catalog as mc


# ── 1. Un guasto non deve sembrare un catalogo vuoto ──────────────────

def _headers() -> dict[str, str]:
    return {"Authorization": "Bearer x"}


def test_network_failure_raises_instead_of_returning_empty(monkeypatch):
    def boom(*_a, **_k):
        raise urllib.error.URLError("connection reset")

    monkeypatch.setattr(mc.urllib.request, "urlopen", boom)
    with pytest.raises(mc.XCloudCatalogUnavailable):
        mc._xcloud_titles_sync("https://x/v2/titles", _headers())


def test_timeout_raises_instead_of_returning_empty(monkeypatch):
    def boom(*_a, **_k):
        raise TimeoutError("timed out")

    monkeypatch.setattr(mc.urllib.request, "urlopen", boom)
    with pytest.raises(mc.XCloudCatalogUnavailable):
        mc._xcloud_titles_sync("https://x/v2/titles", _headers())


def test_http_error_raises(monkeypatch):
    def boom(*_a, **_k):
        raise urllib.error.HTTPError("u", 503, "unavailable", {}, None)

    monkeypatch.setattr(mc.urllib.request, "urlopen", boom)
    with pytest.raises(mc.XCloudCatalogUnavailable):
        mc._xcloud_titles_sync("https://x/v2/titles", _headers())


# ── 2. Uno store fallito conserva la libreria precedente ──────────────

class _Svc(m._SyncRunMixin):
    """Minimal harness around the per-store loop."""

    def __init__(self, previous: dict[str, list], result, err) -> None:
        self._all_games = previous
        self._result = result
        self._err = err
        self._cancel_event = types.SimpleNamespace(is_set=lambda: False)
        self._current_store = None
        self.finalized: dict[str, list] | None = None

    async def _setup_sync(self):
        return 0.0, [types.SimpleNamespace(store_name="microsoft")]

    async def _fetch_one(self, _store, _is_force=False):
        return self._result, self._err

    async def _emit_progress(self, *_a, **_k):
        return None

    async def _finalize_guarded(self, libraries, errors, *_a, **_k):
        self.finalized = libraries
        return types.SimpleNamespace(libraries=libraries, errors=errors)


async def _run(previous, result, err):
    svc = _Svc(previous, result, err)
    await svc._run_sync(fetch_artwork=False, resync_artwork=False,
                        is_force=False)
    return svc.finalized


@pytest.mark.asyncio
async def test_failed_store_keeps_its_previous_games():
    # The incident, in miniature: 603 known games, a failed fetch
    # returning nothing. The library must survive.
    previous = {"microsoft": [f"game-{i}" for i in range(603)]}
    finalized = await _run(previous, [], "timeout")
    assert len(finalized["microsoft"]) == 603


@pytest.mark.asyncio
async def test_successful_store_replaces_its_games():
    # The rule must not freeze a store: a clean fetch still wins, and a
    # genuinely empty library is still allowed through.
    previous = {"microsoft": ["old"]}
    finalized = await _run(previous, ["new-a", "new-b"], None)
    assert finalized["microsoft"] == ["new-a", "new-b"]

    finalized = await _run(previous, [], None)
    assert finalized["microsoft"] == []


@pytest.mark.asyncio
async def test_failed_store_with_nothing_known_stays_empty():
    # No prior library means there is nothing to protect; the empty
    # result passes through rather than inventing state.
    finalized = await _run({}, [], "timeout")
    assert finalized["microsoft"] == []
