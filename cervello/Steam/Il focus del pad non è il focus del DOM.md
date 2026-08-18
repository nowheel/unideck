---
tags: [steam, trappola, focus, gamepad]
---

# Il focus del pad non è il focus del DOM

**Steam non sposta il focus del DOM quando navighi col controller.** Marca
l'elemento a fuoco con una sua classe, `gpfocus`, e mette `gpfocuswithin` su
tutti gli antenati.

Conseguenza: `:focus` **non combacia mai** durante la navigazione col pad, e
qualunque evidenziazione basata su di esso — o sugli eventi React `onFocus` —
resta invisibile. La navigazione funziona benissimo; semplicemente non si vede
dove sei.

## Come verificarlo

```js
document.querySelectorAll(".gpfocus")   // l'elemento a fuoco col pad
```

Da eseguire nel target **Big Picture** (vedi [[Due realm, due window]]).

**Chiamare `.focus()` a mano non dimostra niente** sul comportamento del pad:
esercita un meccanismo diverso. Vedi [[Verificare il meccanismo sbagliato]].

## Come si applica uno stile

Le pseudo-classi non si esprimono in stili inline, quindi serve un foglio di
stile vero, agganciato con un attributo `data-` — non con `className`, perché
Steam mette le sue classi (`Panel Focusable`) su quegli elementi e ci aggiunge
`gpfocus` in coda.

```css
[data-udk].gpfocus,
[data-udk]:focus { outline: 2px solid …  !important; }
```

`!important` non è sciatteria: gli elementi hanno stili inline, che altrimenti
vincono su qualunque regola del foglio a prescindere dalla specificità. Il
`:focus` accanto serve alla Modalità Desktop, dove mouse e Tab spostano il
focus DOM vero e Steam non aggiunge nessuna classe.

## Insidia nel misurare

Questi elementi hanno `transition: 0.18s`. Leggere lo stile calcolato subito
dopo il focus restituisce valori **a metà strada** — un bordo a
`rgba(252,213,143,0.157)` sembra una regola che non si applica, mentre mezzo
secondo dopo è `rgb(249,177,48)`. Aspettare prima di leggere.
