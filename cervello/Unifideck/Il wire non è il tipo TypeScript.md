---
tags: [unifideck, trappola, tipi]
---

# Il wire non è il tipo TypeScript

La dataclass `Game` del backend (`core/types/domain.py`) ha:

```
app_id, store, store_game_id, title, installed, install_path,
exe_path, size_bytes, tags, icon_url, hero_url, logo_url, metadata
```

**Non ha** `id`, `is_installed`, `cover_image`. L'interfaccia TypeScript in
`types/api.ts` dichiarava proprio questi tre, perché è più vecchia del
refactor che ha unificato i tipi.

`adaptGame` in `hooks/useGameInfo.ts` fa da ponte fra le due forme, e il suo
commento lo dice già:

> *senza questo adattatore, ogni consumatore vede `is_installed === undefined`
> (falso → "non installato") e `id === undefined` (il confronto per il
> download non trova mai corrispondenza)*

Il problema è che quel bridge esiste **solo per le righe adattate**. Chi
consuma le righe grezze di `get_all_unifideck_games` — come la pagina
catalogo — legge `undefined` in silenzio.

## Cosa è costato prima di correggerlo

Tre bug distinti, che sembravano tre problemi diversi ed erano lo stesso:

1. filtro "Installato" sempre vuoto (letto `is_installed` invece di `installed`)
2. griglia con tutte le chiavi React a `undefined` (letto `game.id`)
3. ricerche del tempo di gioco che non trovavano mai corrispondenza (idem)

## La correzione

`lib/game-identity.ts` e `lib/appid.ts` centralizzano la regola:

```ts
gameId(game)   // store_game_id ?? id ?? ""
gameKey(game)  // `${store}:${gameId(game)}` — qualificata per store
```

Renderla onesta nel tipo (`types/api.ts`) ha fatto emergere **cinque punti di
chiamata** che assumevano `game.id: string`. Non è stata proposta a monte
come patch: toccarli tutti insieme è il tipo di cambiamento ampio che il
`CONTRIBUTING` del progetto chiede di non mandare senza prima discuterne.
Segnalato come nota: `mubaraknumann/unifideck#432`.
