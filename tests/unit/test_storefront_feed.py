"""The Epic store link, which shipped pointing at a 404.

Fork addition (`NOSTRI in riapplica.sh`): upstream has no storefront feed.

The bug this pins: `_epic_url` read `productSlug` / `urlSlug` first. On the
live feed of 2026-09-11 `productSlug` was ``None`` for every one of that
week's four giveaways, and `urlSlug` was a bare 32-hex catalog id for two of
them — `/p/<id>` is not a store page. Verified with browser headers:

    /p/astral-ascent-b33bc2                 200
    /p/d72ccf025e574bb4a725e3079ea34081     403

The reliable field is `pageSlug`, under `catalogNs.mappings` or
`offerMappings`. It also carries a suffix (`luftrausers-51e5e9`) that the
top-level fields drop, which is why reading the output once was not enough to
catch this: two of the four links *looked* correct.
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "py_modules"))

from unifideck.services.storefront_feed import _epic_url  # noqa: E402

FREE_GAMES = "https://store.epicgames.com/free-games"


def _url(**element: object) -> str:
    return _epic_url(dict(element))


def test_pageslug_wins_over_a_catalog_id() -> None:
    """The exact shape of Astral Ascent, the entry that 404'd."""
    assert _url(
        catalogNs={"mappings": [{"pageSlug": "astral-ascent-b33bc2"}]},
        offerMappings=[{"pageSlug": "astral-ascent-b33bc2"}],
        productSlug=None,
        urlSlug="d72ccf025e574bb4a725e3079ea34081",
    ) == "https://store.epicgames.com/p/astral-ascent-b33bc2"


def test_pageslug_wins_even_when_urlslug_looks_fine() -> None:
    """Luftrausers: `urlSlug` is a real word and still the wrong page.

    Epic happens to redirect this one, so trusting it works by luck. The
    suffix is the address the store actually serves.
    """
    assert _url(
        catalogNs={"mappings": [{"pageSlug": "luftrausers-51e5e9"}]},
        urlSlug="luftrausers",
    ) == "https://store.epicgames.com/p/luftrausers-51e5e9"


def test_offer_mappings_are_used_when_catalogns_is_absent() -> None:
    assert _url(
        offerMappings=[{"pageSlug": "mindcop-78e6c1"}],
        urlSlug="1513de80f23f42e584540be749826057",
    ) == "https://store.epicgames.com/p/mindcop-78e6c1"


def test_a_bare_catalog_id_is_never_used_as_a_slug() -> None:
    """With nothing but an id, the giveaway list beats a dead link."""
    assert _url(urlSlug="d72ccf025e574bb4a725e3079ea34081") == FREE_GAMES


def test_product_slug_is_the_fallback_when_no_mappings_exist() -> None:
    assert _url(productSlug="ghostrunner-2") == "https://store.epicgames.com/p/ghostrunner-2"


def test_a_trailing_path_segment_is_dropped() -> None:
    """`productSlug` sometimes carries one; `/p/game/home` is not a page."""
    assert _url(productSlug="game/home") == "https://store.epicgames.com/p/game"


def test_an_empty_element_falls_back_instead_of_raising() -> None:
    """The feed is public, not contracted; a shape change must not 500."""
    assert _url() == FREE_GAMES
    assert _url(catalogNs={}, offerMappings=[], productSlug=None, urlSlug=None) == FREE_GAMES


def test_malformed_mappings_do_not_break_the_scan() -> None:
    assert _url(
        catalogNs={"mappings": [None, "stringa", {"altro": 1}, {"pageSlug": "buono-a1"}]},
        urlSlug="ignorami",
    ) == "https://store.epicgames.com/p/buono-a1"
