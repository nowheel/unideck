"""Free games and discounts from the storefronts, for the catalogue's home.

Fork addition; upstream has nothing like it.

Why this lives in the backend and not in the page: the Steam webview cannot
reach the open internet. Measured 2026-09-10 from `SharedJSContext` — a fetch
to `steamloopback.host` returns 200, one to `store.steampowered.com` fails
outright. So the page asks us, and we do the talking.

Two sources, both first-party public endpoints rather than scraping:

  * Epic's ``freeGamesPromotions``, the same one its own store page calls.
    It returns current giveaways *and* the ones queued behind them, which is
    the more useful half: a free game you hear about after it ends is just an
    annoyance.
  * Steam's ``featuredcategories``, whose ``specials`` block is the discount
    carousel on the store front page.

Both can change shape without notice — they are public, not contracted. Every
field is read defensively and a source that fails is *reported*, never quietly
omitted: an empty list rendered as "nothing free this week" would repeat, in
miniature, the library that shrank without saying so.
"""
from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

EPIC_URL = "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions"
STEAM_URL = "https://store.steampowered.com/api/featuredcategories"

#: Six hours. Epic rotates weekly and Steam's carousel daily, so anything
#: shorter spends the user's bandwidth to re-learn the same answer. The cache
#: is also the offline story: a stale feed beats an empty page.
TTL_SECONDS = 6 * 60 * 60

#: Bumped whenever the shape of a cached entry changes — a corrected URL
#: counts. Without it a fix ships and the cache keeps serving the broken
#: payload for six hours, which looks exactly like the fix not working.
#: 2 (2026-09-11): il link Epic puntava a un 404.
#: 3 (2026-09-12): aggiunto steam_appid, senza il quale la pagina Steam
#:     si apre nel browser invece che nel client — cioe' slegata.
CACHE_VERSION = 3

#: Past this the request is abandoned. The page renders without the feed
#: rather than making the user wait on a storefront having a bad day.
TIMEOUT_SECONDS = 10

_UA = "Mozilla/5.0 (X11; Linux x86_64) Unifideck"


def _epic_free(country: str, locale: str) -> list[dict[str, Any]]:
    """Current and upcoming Epic giveaways, newest offer first."""
    r = requests.get(
        EPIC_URL,
        params={"locale": locale, "country": country, "allowCountries": country},
        headers={"User-Agent": _UA},
        timeout=TIMEOUT_SECONDS,
    )
    r.raise_for_status()
    elements = (
        r.json().get("data", {}).get("Catalog", {}).get("searchStore", {}).get("elements")
        or []
    )

    out: list[dict[str, Any]] = []
    for e in elements:
        if not isinstance(e, dict):
            continue
        promos = e.get("promotions") or {}
        # Two shapes, same structure: what is free now, and what is queued.
        for key, active in (("promotionalOffers", True), ("upcomingPromotionalOffers", False)):
            groups = promos.get(key) or []
            offers = [o for g in groups if isinstance(g, dict) for o in (g.get("promotionalOffers") or [])]
            if not offers:
                continue
            offer = offers[0]
            # A "promotion" at less than 100% off is a sale, not a giveaway,
            # and this list promises free. Epic encodes it as a percentage
            # *remaining*, so zero is the free one.
            setting = (offer.get("discountSetting") or {}).get("discountPercentage")
            if setting not in (None, 0):
                continue
            out.append(
                {
                    "store": "epic",
                    "title": e.get("title") or "",
                    "image": _epic_image(e),
                    "url": _epic_url(e),
                    "starts": offer.get("startDate"),
                    "ends": offer.get("endDate"),
                    "active": active,
                }
            )
            break
    # Active first, then by soonest end: the one about to expire is the one
    # worth acting on.
    out.sort(key=lambda g: (not g["active"], g.get("ends") or ""))
    return [g for g in out if g["title"]]


def _epic_image(element: dict[str, Any]) -> str:
    """Best available art, preferring the tall capsule the grid wants."""
    images = element.get("keyImages") or []
    by_type = {
        i.get("type"): i.get("url")
        for i in images
        if isinstance(i, dict) and i.get("url")
    }
    for kind in ("OfferImageTall", "Thumbnail", "DieselStoreFrontTall", "OfferImageWide"):
        if by_type.get(kind):
            return by_type[kind]
    return next(iter(by_type.values()), "")


#: A 32-character hex blob is a catalog id, not a page slug. `urlSlug` holds
#: one for some offers, and `/p/<id>` is a 404.
_ID_LIKE = re.compile(r"^[0-9a-f]{32}$", re.I)


def _epic_url(element: dict[str, Any]) -> str:
    """Store page for the offer.

    The slug is read from ``catalogNs.mappings`` / ``offerMappings`` **first**,
    and only then from ``productSlug`` / ``urlSlug``. Measured on the live feed
    2026-09-11, for all four giveaways of that week:

        Luftrausers    urlSlug 'luftrausers'  → pageSlug 'luftrausers-51e5e9'
        Astral Ascent  urlSlug 'd72ccf02…'    → pageSlug 'astral-ascent-b33bc2'

    ``productSlug`` was ``None`` every time, ``urlSlug`` was sometimes a bare
    catalog id, and even when it looked like a real slug it was missing the
    suffix the store page actually lives at. Reading the top-level fields
    first sent every link to a 404 — including the ones that looked right,
    which is why the bug survived a first reading of the output.
    """
    candidates: list[str] = []
    for source in (
        (element.get("catalogNs") or {}).get("mappings") or [],
        element.get("offerMappings") or [],
    ):
        for m in source:
            if isinstance(m, dict) and m.get("pageSlug"):
                candidates.append(str(m["pageSlug"]))
    for key in ("productSlug", "urlSlug"):
        value = element.get(key)
        if value:
            candidates.append(str(value))

    for slug in candidates:
        cleaned = slug.strip().strip("/")
        # `productSlug` sometimes carries a trailing path segment ("game/home").
        cleaned = cleaned.split("/")[0]
        if cleaned and not _ID_LIKE.match(cleaned):
            return f"https://store.epicgames.com/p/{cleaned}"

    # No usable slug: the giveaway page lists everything free right now, which
    # is a worse link than the right one and a much better link than a 404.
    return "https://store.epicgames.com/free-games"


def _steam_deals(country: str, language: str) -> list[dict[str, Any]]:
    """The store front page's discount carousel, deepest cut first."""
    r = requests.get(
        STEAM_URL,
        params={"cc": country, "l": language},
        headers={"User-Agent": _UA},
        timeout=TIMEOUT_SECONDS,
    )
    r.raise_for_status()
    items = (r.json().get("specials") or {}).get("items") or []

    out: list[dict[str, Any]] = []
    for i in items:
        if not isinstance(i, dict) or not i.get("name"):
            continue
        discount = i.get("discount_percent") or 0
        if discount <= 0:
            continue
        out.append(
            {
                "store": "steam",
                "title": i.get("name") or "",
                "image": i.get("large_capsule_image") or i.get("header_image") or "",
                "url": f"https://store.steampowered.com/app/{i.get('id')}",
                # L'appid separato dall'URL: con questo la pagina si apre
                # *dentro* il client Steam (`steam://store/<id>`), dove
                # l'utente e' gia' autenticato, invece che in un browser che
                # non lo e'. L'URL http resta per chi non ha il client.
                "steam_appid": i.get("id"),
                "discount": int(discount),
                # Prices arrive in minor units; the frontend formats, we do
                # not guess at a currency symbol from a country code.
                "price_final": i.get("final_price"),
                "price_original": i.get("original_price"),
                "currency": i.get("currency") or "",
            }
        )
    out.sort(key=lambda d: -d["discount"])
    return out


def _read_cache(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return None


def fetch_feed(
    cache_path: Path,
    *,
    country: str = "IT",
    locale: str = "it",
    force: bool = False,
) -> dict[str, Any]:
    """Free games and discounts, from cache when it is still warm.

    Never raises. A source that fails contributes its message to ``errors``
    and the other one still renders — the page is useful with half a feed and
    useless with an exception.

    On a total failure the last good payload is returned with ``stale`` set,
    so the user sees last week's giveaways labelled as old rather than an
    empty page that looks like "nothing is free".
    """
    cached = _read_cache(cache_path)
    if cached and cached.get("v") != CACHE_VERSION:
        cached = None
    if not force and cached and time.time() - cached.get("fetched_at", 0) < TTL_SECONDS:
        return {**cached, "stale": False}

    free: list[dict[str, Any]] = []
    deals: list[dict[str, Any]] = []
    errors: list[str] = []

    try:
        free = _epic_free(country, locale)
    except Exception as e:  # noqa: BLE001 — a storefront is allowed to be down
        errors.append(f"epic: {type(e).__name__}")
        logger.warning("[storefront_feed] epic failed: %s", e)

    try:
        deals = _steam_deals(country, locale)
    except Exception as e:  # noqa: BLE001
        errors.append(f"steam: {type(e).__name__}")
        logger.warning("[storefront_feed] steam failed: %s", e)

    if not free and not deals and cached:
        # Everything failed and we have something older: say so rather than
        # pretending the week is empty.
        return {**cached, "stale": True, "errors": errors}

    payload = {
        "v": CACHE_VERSION,
        "free": free,
        "deals": deals,
        "errors": errors,
        "fetched_at": int(time.time()),
    }
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(payload), "utf-8")
    except OSError as e:
        logger.warning("[storefront_feed] could not write the cache: %s", e)

    logger.info(
        "[storefront_feed] %d free, %d discounted, %d source(s) down",
        len(free), len(deals), len(errors),
    )
    return {**payload, "stale": False}
