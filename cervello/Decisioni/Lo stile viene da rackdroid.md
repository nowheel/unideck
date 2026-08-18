---
tags: [decisione, design]
---

# Lo stile viene da rackdroid

Palette ambra su bruno quasi nero, micro-etichette monospaziate maiuscole,
pannelli che si sollevano al tocco: presa da [rackdroid.org](https://rackdroid.org),
su richiesta esplicita.

## Tre adattamenti obbligati dal bersaglio

1. **Ogni `:hover` diventa focus.** Gaming Mode non ha puntatore; il focus è
   il solo cursore che esiste. Vedi [[Il focus del pad non è il focus del DOM]]
   per come si implementa davvero.
2. **Il blur non è stato razionato per principio**, contrariamente a quanto
   scritto in una prima versione del codice — la misura ha detto che il
   costo è quasi nullo. Vedi [[Misurare le prestazioni, e calibrare la misura]].
3. **Il font Geomini non è incluso.** È un webfont proprietario del sito, non
   redistribuibile dentro un plugin. L'identità visiva sopravvive comunque,
   perché è il trattamento monospaziato delle etichette a portarla, non il
   carattere del titolo.

## Cosa prendere, cosa lasciare

Preso: palette, chip, texture del rack come divisore, il vetro sulle barre
sticky (non sulle tile — vedi
[[Perché paginazione e non virtualizzazione]] per il perché delle tile
paginate). Lasciato: il carattere display, gli sfondi decorativi del sito
che non hanno senso su un catalogo di giochi.
