---
tags: [metodo, manutenzione]
---

# Sopravvivere agli aggiornamenti del plugin

Il nostro lavoro sta sopra un plugin che si aggiorna. Un aggiornamento
sovrascrive la cartella e con essa ogni modifica locale — inclusa
[[Lo schema che invalida se stesso|la correzione allo schema]], che
altrimenti torna sui suoi passi ad ogni release.

## riapplica.sh

Non una patch applicata alla cieca — la prima versione usava
`git apply --3way` e falliva su ogni file appena monte si scostava, perché
il repo di destinazione non ha i blob della base. La seconda versione
costruisce un repo con tre commit che condividono un antenato:

```
base   = la versione di monte da cui siamo partiti
 ├── monte = la versione nuova di monte
 └── mio   = base + le nostre modifiche
```

e fa un **rebase vero**. Git ha entrambe le versioni più l'antenato comune, e
può fondere davvero. Dove non ce la fa, si ferma e nomina i file in
conflitto — non installa mai una fusione a metà.

Provato andando **all'indietro** di versione (0.7.3 → 0.7.2), il caso
peggiore possibile: i file di traduzione si sono fusi da soli, è rimasto un
solo conflitto legittimo.

## controlla.sh

Confronta repo e installazione file per file, legge il log del plugin, conta
giochi/shortcut/registro e li paragona all'**ultimo controllo**. Nato dopo
aver trovato a mano una deriva reale — lo schema corretto viveva solo sul
dispositivo, non nel repo — e dopo [[Incidente del 18 agosto 2026]], che
sarebbe stato visibile subito con un confronto automatico invece che scoperto
per caso giorni dopo.

Gli allarmi sono stati **provati**, non solo scritti: una perdita lieve dà un
avviso, un dimezzamento dà errore con il consiglio di non riavviare Steam
prima di aver capito perché.
