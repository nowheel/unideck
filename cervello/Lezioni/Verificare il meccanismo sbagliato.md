---
tags: [lezione, metodo]
---

# Verificare il meccanismo sbagliato

L'errore più ripetuto in questo lavoro: dire "verificato" avendo controllato
un percorso diverso da quello reale. Non un errore isolato — è successo tre
volte sullo stesso problema, il focus.

## Le tre volte

1. **Stato React (`onFocus`/`onBlur`)** non si illuminava mai. Diagnosi:
   "gli eventi di focus non scattano qui" — perché `activeElement` cambiava
   ma nessun `focusin` arrivava.
2. Quella diagnosi era **falsa**: la finestra pilotata dal debugger non era
   quella attiva per il sistema (`document.hasFocus() === false`), e un
   documento senza focus non emette quegli eventi. Corretto passando a CSS
   `:focus`, e **verificato forzando il focus con l'emulazione CDP attiva**.
3. Funzionava nel test. Non funzionava col pad. Perché
   [[Il focus del pad non è il focus del DOM|Steam non sposta il focus del
   DOM quando navighi col controller]] — un fatto che nessuno dei due test
   precedenti poteva rivelare, perché entrambi esercitavano `.focus()`
   programmatico, non la navigazione reale.

Solo leggendo `document.querySelectorAll(".gpfocus")` — il meccanismo
**vero** — la correzione ha funzionato, confermata infine dall'utente col
pad in mano.

## La regola che ne resta

**Una verifica che esercita un percorso diverso da quello reale non è una
verifica.** È una rassicurazione, e vale meno di zero: fa smettere di
cercare mentre il difetto resta.

Prima di dire "verificato", chiedersi: il meccanismo che ho appena esercitato
è lo stesso che userà chi ha il problema? Se la risposta è "quasi", non è
verificato.

## Corollario

Quando l'unico test possibile esercita il meccanismo sbagliato — come
`.focus()` per il pad — l'onestà è dirlo esplicitamente e aspettare la
verifica vera, non spacciare l'unico test disponibile per una prova.
