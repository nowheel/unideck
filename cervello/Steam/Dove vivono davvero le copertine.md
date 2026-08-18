---
tags: [steam, trappola, artwork]
---

# Dove vivono davvero le copertine

**Non nei dati del plugin.** `Game.cover_image` è vuoto per tutti e 741 i
giochi in cache; `hero_url`, `icon_url` e `logo_url` sono `null` per tutti.
Solo il percorso Ubisoft popola `cover_image`.

L'artwork esiste eccome: la sincronizzazione la scrive nel **grid store di
Steam**, indicizzata per AppID dello shortcut —
`~/.steam/steam/userdata/<id>/config/grid/<appid>p.jpg` e simili. È così che
questi giochi hanno la copertina nella libreria nativa.

Quindi la tile deve chiederla a **Steam**, non al backend.

## Quale API, e quale URL

`appStore.GetCustomVerticalCapsuleURLs(overview)` restituisce più candidati.
Provandone cinque su questo dispositivo, **ne carica uno solo**:

| Candidato | Esito |
| --- | --- |
| `/customimages/<appid>p.jpg?v=…` | **carica** (1440×2160 o 720×1080) |
| `/customimages/<appid>p.png?v=…` | 404 |
| `/assets/<appid>/library_600x900.jpg` | 404 |
| `/assets/<appid>_library_600x900.jpg` | 404 |
| URL della CDN (`GetVerticalCapsuleURLForApp`) | 404 |

Gli ultimi tre funzionano per i giochi Steam veri, non per gli shortcut. Il
codice li tiene comunque in coda alla lista e lascia che sia la `<img>` a
scoprirlo, avanzando al candidato successivo su `onError`.

## Tre modi di sbagliare, tutti già fatti

1. Passare l'AppID nella forma sbagliata → [[AppID in due forme]]
2. Chiamare il metodo staccato dall'oggetto → [[I metodi di appStore vogliono il ricevitore]]
3. Memoizzare la risposta vuota prima che Steam sia pronto: se la pagina monta
   prima che la mappa degli shortcut sia popolata, un buco messo in cache resta
   per tutta la sessione. Registrare il buco **solo se Steam ha ammesso di
   conoscere l'app**.
