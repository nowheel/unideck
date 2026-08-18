---
tags: [unifideck, moc]
---

# Unifideck

Plugin Decky Loader che porta Epic, GOG, Amazon, Ubisoft e Xbox Cloud Gaming
dentro la libreria Steam della Deck. Autore: [mubaraknumann](https://github.com/mubaraknumann/unifideck),
GPL-3.0-or-later.

Il fork su cui lavoriamo parte da `Release-0.7.3` e vive in
`~/Progetti/unifideck-mio`, pubblicato come [nowheel/unideck](https://github.com/nowheel/unideck).

## I due strati di modifica

1. **Preesistente su questa Deck**, prima di qualsiasi intervento nostro:
   l'iniezione nei tab della libreria di Steam è stata rimossa e sostituita
   da una rotta standalone `/unifideck`, raggiunta da un pulsante nel Quick
   Access. Cinque file: `index.tsx`, `teardown.ts`, `QuickAccessPanel.tsx`,
   più `UnifideckPage.tsx` e `lib/routes.ts` nuovi.
2. **Nostro**: la riscrittura di quella pagina — vedi
   [[Perché paginazione e non virtualizzazione]] — e quattro correzioni al
   plugin, segnalate a monte.

## Architettura rilevante

- Backend Python a cinque livelli, con un EventBus e DI dei servizi.
- Frontend TypeScript/React su `@decky/ui`.
- `Game` come tipo di scambio fra i due — vedi [[Il wire non è il tipo TypeScript]],
  perché i due lati non dicono la stessa cosa.
- Gli shortcut di Steam sono gestiti tramite `shortcuts.vdf` e un
  [[Il registro degli shortcut non si pota|registro]] persistente di AppID.

## Cosa manteniamo noi, cosa no

Store, downloader, launcher, Proton, cloud save, artwork: **non nostri**, non
li manteniamo. Un problema lì va segnalato a monte.

Nostro: la pagina catalogo, e i quattro difetti in
[[Incidente del 18 agosto 2026]], [[Lo schema che invalida se stesso]],
[[SteamClient.Apps.GetAppOverview non esiste]], [[Il wire non è il tipo TypeScript]].

Vedi [[Sopravvivere agli aggiornamenti del plugin]] per come i due layer
convivono quando monte pubblica una versione nuova.
