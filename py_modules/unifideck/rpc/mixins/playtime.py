"""Playtime RPC mixin for Plugin class.
"""
from __future__ import annotations

from typing import Any

from unifideck.rpc.errors import RpcError


class PlaytimeRPCMixin:
    """Per-game and aggregate playtime queries."""

    services: Any

    def _require_playtime(self) -> Any:
        """Return PlaytimeService or raise ``service_unavailable``."""
        svc = getattr(self.services, "playtime", None)
        if svc is None:
            raise RpcError("service_unavailable", service="playtime")
        return svc

    async def get_playtime(self, store: str, game_id: str) -> Any:
        """Return playtime data for a specific game.

        Real method is :meth:`PlaytimeService.get_playtime` (see
        handler twin for the rationale).

        Upstream removed two siblings as dead in the audit §1.2 pass:
        ``sync_playtime_now`` (the drain already runs at startup and on
        every ``PLAYTIME_UPDATED``, with unreported sessions persisted in
        the DB until they land) and ``get_all_playtimes`` — the latter is
        restored below, see its docstring.
        """
        return await self._require_playtime().get_playtime(store, game_id)

    # NOSTRI in riapplica.sh
    async def get_all_playtimes(self) -> Any:
        """Return playtime data for every game with sessions.

        Divergenza da monte, che l'ha tolta nell'audit §1.2 perche' la sua
        vista libreria prende il playtime in blocco da ``GetPlaytime`` di
        Steam. La nostra pagina catalogo no: ordina per tempo di gioco su
        tutta la libreria in una volta sola, e con la rotta per-gioco
        servirebbe una chiamata per titolo — a 743 giochi non e' una
        differenza di stile. La chiama ``views/UnifideckPage.tsx`` via
        ``rpcRoutes.getAllPlaytimes``.

        E' anche l'unica rotta che popola ``game_id`` e ``title`` su
        ``PlaytimeEntry`` (vedi ``src/types/playtime.ts``): la per-gioco
        non li imposta, perche' chi la chiama li conosce gia'.
        """
        return await self._require_playtime().get_all_playtimes()
