---
tags: [steam, layout]
---

# Il viewport è 854x534

In Gaming Mode il `devicePixelRatio` è **1.5**. Quindi un pannello da 1280×800
è un **viewport CSS di 854×534**, non di 1280×800.

Progettare sul numero sbagliato porta a interfacce che sembrano corrette negli
screenshot e sono soffocate sul dispositivo: la prima versione della barra dei
filtri si mangiava 149 dei 534 pixel, cioè il 28%, e la prima riga finiva
nascosta.

## Steam disegna sopra la rotta

Una rotta riceve tutta la finestra, e Steam ci dipinge **sopra** la propria
barra di stato (~38px CSS) e la legenda dei tasti (~35px). Una pagina che
parte da `top: 0` ha la prima riga sotto l'orologio.

Da lì `STEAM_TOP_INSET` e `STEAM_BOTTOM_INSET` nella pagina.

## Conseguenze sul dimensionamento

Con 854px di larghezza e tile da `minmax(148px, 1fr)` si ottengono **cinque**
colonne, che sembrano enormi. A 112px se ne ottengono sei o sette, che è la
densità giusta per sfogliare.

Verificare così, invece di dedurlo:

```js
({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })
```

dal target Big Picture — vedi [[Due realm, due window]].
