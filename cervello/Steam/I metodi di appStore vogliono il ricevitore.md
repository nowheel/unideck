---
tags: [steam, trappola, javascript]
---

# I metodi di appStore vogliono il ricevitore

I metodi di `window.appStore` sono metodi di prototipo che passano per `this`.
`GetCustomVerticalCapsuleURLs`, per esempio, internamente chiama
`this.GetCustomImageURLs`.

Invocarne un riferimento **staccato** dall'oggetto lancia:

```
TypeError: Cannot read properties of undefined (reading 'GetCustomImageURLs')
```

```js
const fn = as.GetCustomVerticalCapsuleURLs;
fn(ov);              // ✗ TypeError
fn.call(as, ov);     // ✓
```

## Perché è pericoloso e non solo scomodo

Il codice che risolve le copertine è pieno di `try/catch`, perché sono API
interne di Steam che cambiano fra versioni. Quel `catch` trasforma il
`TypeError` in «questo gioco non ha copertina» — indistinguibile dal caso
legittimo.

È così che è stata spedita una build con **zero copertine** su 741 giochi, e
la diagnosi ha richiesto di strumentare la funzione dal vivo perché l'errore
non compariva da nessuna parte.

## La regola generale

Un `catch` che ingoia troppo non tollera un'assenza: **nasconde un difetto**.
Se il ramo d'errore e il ramo «dato mancante» producono lo stesso risultato,
non si può più distinguere un guasto da una condizione normale. Stesso
schema, in grande, in [[Incidente del 18 agosto 2026]].

Vedi anche [[Dove vivono davvero le copertine]].
