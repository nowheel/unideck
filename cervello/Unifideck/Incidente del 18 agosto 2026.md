---
tags: [unifideck, incidente, perdita-dati]
---

# Incidente del 18 agosto 2026

Una sincronizzazione automatica delle 08:50 è partita mentre la Deck andava
in sospensione. Risultato: **603 shortcut cancellati da Steam**, libreria da
743 a 140 giochi, scoperto per caso giorni dopo.

## La catena

Un socket non invecchia mentre la macchina dorme, quindi una richiesta con
`timeout=30` ha riportato il proprio fallimento **14.596 secondi dopo**
(quattro ore). Questo è l'incidente. Il difetto è cosa è successo dopo:

```
[MicrosoftCatalog] /v2/titles unexpected TimeoutError
[MicrosoftCatalog] /v2/titles returned 0 titles in 14596.8s
[SyncService] microsoft: 0 games
[SyncService] Saved library cache (140 games) to library_cache.json
[SyncService] sync complete — 140 games across 3 stores in 39282ms (0 errors)
[ShortcutService]   (added=0 removed=603 reclaimed=0)
```

**`0 errors`.** Due difetti indipendenti, ognuno sufficiente da solo:

1. `microsoft_catalog._xcloud_titles_sync` fa `return []` su **ogni** ramo
   d'errore. Un guasto arriva a valle come «questo account non possiede
   giochi Xbox» — indistinguibile da una libreria vuota.
2. `sync_run_mixin.py` assegna `libraries[store] = games`
   **incondizionatamente**. Anche un errore riportato correttamente
   avrebbe comunque svuotato lo store.

## La correzione, in due parti

- Il catalogo solleva `XCloudCatalogUnavailable` invece di restituire `[]`:
  un guasto resta un guasto.
- Uno store fallito **conserva la libreria precedente** — in
  `sync_run_mixin.py` per il giro completo, in `sync_service.py` per il
  refresh singolo. L'unica cosa che un guasto può costare è la freschezza
  del dato, non i dati.

Una terza aggiunta, non parte della correzione minima: un avviso (non un
blocco) quando una fetch **riuscita** restituisce meno della metà dei giochi
precedenti, con una soglia di 10 per non allarmarsi su librerie piccole.

## Il ripristino ha funzionato, e dimostra un'altra cosa

Una sincronizzazione riuscita ha rimesso 601 giochi e 742 shortcut,
`added=601 removed=0 reclaimed=140` — vedi
[[Il registro degli shortcut non si pota]]. Se il registro fosse stato
potato, il ripristino avrebbe perso tutta l'artwork.

## Segnalazione

`mubaraknumann/unifideck#405` era già aperta da un altro utente dal 23
luglio, senza diagnosi. Commentata con causa e correzione invece di aprire
un duplicato — vedi [[00 Indice|controllo periodico]] sulle segnalazioni.
