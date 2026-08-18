---
tags: [unifideck, decisione, dati]
---

# Il registro degli shortcut non si pota

`shortcuts_registry.json` mappa `"<store>:<game_id>" → AppID`. Cresce e
basta: 743 voci contro 741 giochi, senza che nessuno cancelli mai niente.

**Sembra un difetto. Non lo è — l'ho proposto io e mi sbagliavo.**

Il docstring di `registry.py` lo dice: il file sopravvive a disinstallazione
e reinstallazione **apposta**, perché è quello che permette di *reclamare*
un AppID già assegnato — e con esso l'artwork che Steam ha già in cache per
quell'ID.

## La prova

[[Incidente del 18 agosto 2026]]: i 601 giochi Xbox tornati hanno ripreso i
loro AppID dal registro (`reclaimed=140`, 543 icone riagganciate). Con un
registro potato avrebbero ricevuto ID nuovi e perso tutta l'artwork.

## Il numero, per chi dubita che sia sostenibile

743 voci sono 124 KB. A dieci volte questa libreria, un megabyte. Non è una
perdita di spazio, è una memoria che funziona.

## La lezione

Ho scambiato una proprietà **voluta** per un accumulo indesiderato, senza
prima aver letto perché il file esiste. Il controllo che avrei dovuto fare
prima di proporre — leggere il modulo — è lo stesso che ha impedito di farne
un guaio vero.
