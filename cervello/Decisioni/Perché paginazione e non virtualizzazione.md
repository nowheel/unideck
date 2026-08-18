---
tags: [decisione, ui, prestazioni]
---

# Perché paginazione e non virtualizzazione

La pagina catalogo mostra 42 tile per volta invece di scorrere liberamente
su 741. Deliberato, non un limite tecnico accettato per pigrizia.

## Il conflitto reale

Una lista a finestra (virtualizzazione) e la navigazione a focus di Steam
sono in conflitto diretto: il D-pad cammina sul DOM, quindi una tile
smontata per risparmiare memoria è una tile che lo stick **non può
raggiungere**. Espandere la finestra quando il focus arriva al suo margine
inseguirebbe un gestore di focus già in movimento — una corsa fra due
sistemi che non si parlano.

La paginazione evita l'intera classe di bug: il DOM è limitato per
costruzione, ogni tile montata è raggiungibile, e il confine di pagina è
un'azione esplicita (L1/R1, o [[I grilletti analogici arrivano|L2/R2]] per
lettera) invece di una posizione di scroll da inferire.

## Cosa succedeva prima

La prima versione della pagina montava **tutte** le 743 tile e tutte le
copertine in un solo colpo. Era questo, non il vetro, a rendere la pagina
instabile — vedi [[Misurare le prestazioni, e calibrare la misura]].

## Il numero scelto

42 tile a pagina: circa sei righe da sette colonne su
[[Il viewport è 854x534|un viewport di 854×534]], due o tre schermate di
scroll per pagina. Bilancia il numero di tile montate (memoria, copertine
decodificate) contro la frequenza dei cambi di pagina.
