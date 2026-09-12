"""stores/epic/web_session.py — a signed-in Epic store in the browser.

Fork addition (`NOSTRI in riapplica.sh`); upstream implements this only for
Amazon, on the assumption that the other browser stores "sign in through
ordinary web logins that leave a session behind". On this device Epic does
not: legendary authenticates with its own OAuth client and keeps the tokens
to itself, so the shared Edge profile holds no `epicgames.com` cookies at
all — measured, the profile's cookie DB had none. The shop opened at "Sign
in" while the library worked perfectly, which for a free-game giveaway is
the difference between one tap and a login form.

Epic publishes the exchange its own launcher uses to open a signed-in store:

    GET  https://account-public-service-prod.ol.epicgames.com
         /account/api/oauth/exchange        (Bearer <legendary access token>)
      → { "code": "...", "expiresInSeconds": 300 }

    GET  https://www.epicgames.com/id/exchange?exchangeCode=<code>
      → Set-Cookie: EPIC_BEARER_TOKEN, EPIC_SSO, ... (the web session)

Verified against a live account 2026-09-12: the exchange returned a code
valid for 299 seconds.

Il redeem **non si puo' fare via HTTP**: la pagina e' un'applicazione
JavaScript, e una GET da `urllib` torna 200 con il solo cookie
`__cf_bm` di Cloudflare e nessuna sessione. Misurato. Quindi non si
iniettano cookie nel profilo come fa Amazon: si fa aprire a Edge
direttamente l'URL di exchange, che redime il codice, riceve la sessione
e segue `redirectUrl` fino al negozio. Verificato a video: la pagina
arriva con l'avatar dell'account al posto di "Sign in" e la lista dei
desideri dell'utente in evidenza.

**Il codice e' monouso e scade in cinque minuti**, quindi l'URL va
costruito immediatamente prima di aprire il browser, mai messo in cache.
"""
from __future__ import annotations

import asyncio
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_EXCHANGE_URL = (
    "https://account-public-service-prod.ol.epicgames.com"
    "/account/api/oauth/exchange"
)
_REDEEM_URL = "https://www.epicgames.com/id/exchange"
_TIMEOUT_S = 20

#: Epic risponde 403 a un client senza intestazioni da browser — misurato sia
#: con urllib sia con curl. Non e' un aggiramento di protezioni: e' la stessa
#: richiesta che farebbe il launcher, con le intestazioni che si aspetta.
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like "
        "Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

#: legendary's own credential file. Read directly rather than through the
#: store's token manager, for the same reason Amazon does: the token Epic
#: will accept for this exchange is the one legendary's OAuth client holds.
_LEGENDARY_USER_FILE = Path("~/.config/legendary/user.json").expanduser()

def _read_access_token() -> str:
    """legendary's Epic access token, or ``""`` when unavailable."""
    try:
        data = json.loads(_LEGENDARY_USER_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        logger.info("[EpicWebSession] no legendary credentials: %s", e)
        return ""
    if not isinstance(data, dict):
        return ""
    return str(data.get("access_token") or "")


def _fetch_code_sync(access_token: str) -> str:
    """Blocking half: token → exchange code. Empty string on any failure."""
    # GET, non POST: l'endpoint risponde 405 al POST. Verificato.
    req = urllib.request.Request(
        _EXCHANGE_URL,
        headers={"Authorization": f"bearer {access_token}"},
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as r:
        return str((json.load(r) or {}).get("code") or "")


async def signed_in_url(destination: str) -> str:
    """An URL that lands on ``destination`` already signed in, or ``""``.

    Never raises. No legendary login, an expired token, Epic having a bad
    day — all answer ``""``, and the caller opens the plain storefront, which
    is the behaviour before this existed.
    """
    token = _read_access_token()
    if not token:
        return ""
    try:
        code = await asyncio.to_thread(_fetch_code_sync, token)
    except (urllib.error.URLError, OSError, ValueError) as e:
        logger.info("[EpicWebSession] exchange failed: %s", e)
        return ""
    if not code:
        logger.warning("[EpicWebSession] exchange returned no code")
        return ""
    query = urllib.parse.urlencode(
        {"exchangeCode": code, "redirectUrl": destination}
    )
    logger.info("[EpicWebSession] signed-in storefront URL minted")
    return f"{_REDEEM_URL}?{query}"
