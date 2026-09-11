"""Storefront feed RPC mixin for Plugin class.

Fork addition; upstream has no equivalent route. The page cannot call the
storefronts itself — the Steam webview has no route to the open internet — so
this is the only way the catalogue's home can know what is free this week.

See ``unifideck/services/storefront_feed.py`` for why these two sources and
how they are allowed to fail.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from unifideck.services.storefront_feed import fetch_feed

logger = logging.getLogger(__name__)

#: Country used when the configured locale does not imply one. Prices and
#: giveaway availability are regional, so a wrong guess shows a real offer at
#: the wrong price — worse than an obvious default.
DEFAULT_COUNTRY = "US"
DEFAULT_LOCALE = "en"

#: `it-IT` and `pt-BR` already carry a region; `it` and `en` do not.
_LOCALE_COUNTRY = {
    "it": "IT", "de": "DE", "fr": "FR", "es": "ES", "nl": "NL",
    "pl": "PL", "pt": "BR", "ru": "RU", "tr": "TR", "uk": "UA",
    "ja": "JP", "ko": "KR", "zh": "CN", "ar": "SA", "en": "US",
}


def _locale_and_country(raw: str) -> tuple[str, str]:
    """Split a stored locale into what each storefront wants.

    Epic takes a bare language, Steam a country, and the config holds
    whatever the language picker wrote — `auto`, `it`, or `it-IT`.
    """
    value = (raw or "").strip().replace("_", "-")
    if not value or value.lower() == "auto":
        return DEFAULT_LOCALE, DEFAULT_COUNTRY
    parts = value.split("-")
    language = parts[0].lower()
    country = parts[1].upper() if len(parts) > 1 and len(parts[1]) == 2 else ""
    return language, country or _LOCALE_COUNTRY.get(language, DEFAULT_COUNTRY)


class StorefrontFeedRPCMixin:
    """Free games and discounts for the catalogue home."""

    config: Any

    async def get_storefront_feed(self, force: bool = False, ui_locale: str = "") -> Any:
        """Return ``{free, deals, errors, fetched_at, stale}``.

        Never raises: the page renders the parts that arrived and reports the
        sources that did not. ``force`` skips the cache, for the refresh
        button — a user who just heard a giveaway went live should not have to
        wait out a six-hour TTL.

        The fetch runs in a worker thread. ``requests`` is synchronous and two
        storefronts at ten seconds each would otherwise hold the event loop
        long enough to stall every other RPC, including the ones the library
        view is waiting on.
        """
        # The page's own language wins over the stored preference, which is
        # "auto" on a default install and would resolve to en/US — showing an
        # Italian user prices in dollars. A wrong currency is worse than no
        # price: it looks like an answer.
        raw_locale = (ui_locale or "").strip()
        if not raw_locale or raw_locale.lower() == "auto":
            try:
                raw_locale = str(self.config.get("ui.locale", "auto") or "auto")
            except Exception:  # noqa: BLE001 — a missing config is not fatal
                raw_locale = "auto"
        locale, country = _locale_and_country(raw_locale)

        try:
            cache_dir = Path(str(self.config.cache_dir))
        except Exception:  # noqa: BLE001
            # Without a cache we still answer; we just pay the network every
            # time, which is worse than a cache and better than an error.
            cache_dir = Path("/tmp")

        # Una cache per paese. Prezzi e disponibilità sono regionali, quindi un
        # file solo servirebbe i prezzi del paese precedente per sei ore dopo
        # un cambio di lingua — e sarebbero prezzi giusti nella valuta di
        # qualcun altro, che è il modo peggiore di sbagliare.
        return await asyncio.to_thread(
            fetch_feed,
            cache_dir / f"storefront_feed_{country.lower()}.json",
            country=country,
            locale=locale,
            force=bool(force),
        )
