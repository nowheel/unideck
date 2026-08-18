---
tags: [unifideck, bug, config]
---

# Lo schema che invalida se stesso

`steam/current_user.py` scrive e legge `steam.active_user`, supportando
esplicitamente la forma annidata. Lo schema di configurazione
(`config/schema.json`) ha `additionalProperties: false` alla radice e **non
prevede** una sezione `steam`.

Risultato: il plugin invalida la propria configurazione a ogni avvio per
chiunque abbia un utente Steam attivo registrato — cioè per chiunque lo usi
normalmente.

```
[Unifideck] config validation FAILED — starting in degraded mode.
1 error(s). First: Additional properties are not allowed ('steam' was unexpected)
```

## La correzione

Undici righe di JSON: una sezione `steam` con `active_user: string`, inserita
nello schema. Verificato validando la configurazione **fusa** (default +
override utente):

| Schema | Errori |
| --- | --- |
| originale | 1 — `'steam' was unexpected` |
| con la sezione aggiunta | 0 |

Dopo l'installazione, il log dice `config validation OK (19 section(s) validated)`.

## Una nota a margine trovata per caso

La descrizione dello schema dichiara "24 top-level sections" mentre
`properties` ne contiene 26 — disallineamento già presente **prima** della
nostra aggiunta. Segnalato insieme al resto.

## Perché va rifatto a ogni aggiornamento

Questo file appartiene al plugin, non al nostro strato. Ogni aggiornamento di
monte lo sovrascrive e la modalità degradata torna. È fra i percorsi che
[[Sopravvivere agli aggiornamenti del plugin|riapplica.sh]] considera nostri,
quindi si ripristina da solo — ma [[Sopravvivere agli aggiornamenti del plugin|controlla.sh]] lo verifica comunque ad
ogni controllo, perché una deriva silenziosa qui è esattamente il tipo di
cosa che passa inosservata.

Segnalato a monte: `mubaraknumann/unifideck#430`.
