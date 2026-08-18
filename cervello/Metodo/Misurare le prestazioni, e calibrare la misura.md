---
tags: [metodo, prestazioni]
---

# Misurare le prestazioni, e calibrare la misura

Campionare i delta di `requestAnimationFrame` mentre la griglia scorre, per
sapere se un effetto costa qualcosa invece di argomentarlo a memoria.

## Perché un 60fps piatto non basta come risposta

Un risultato "zero frame persi" può voler dire due cose opposte: **va tutto
bene**, oppure **la misura è cieca**. Senza distinguerle il numero non vale
niente.

## La calibrazione

Prima di fidarsi del risultato, imporre un carico deliberatamente assurdo e
verificare che la misura *peggiori* di conseguenza:

| Condizione | Mediana | Frame persi (>33ms) |
| --- | --- | --- |
| Com'è spedito | 16,7 ms | 0 |
| `blur(40px)` su tutte le 42 tile | 16,7 ms | 0 |
| Carico deliberatamente assurdo | 33,3 ms | 96 |

La terza riga è la calibrazione: dimostra che la misura **vede** il costo di
composizione. Solo allora le prime due righe significano qualcosa — il
margine è reale, non un artefatto della misura.

## Cosa ha smentito

Avevo scritto nel codice che il vetro andava razionato, per principio, prima
di misurare. La misura ha detto il contrario: ciò che rendeva instabile la
pagina erano le 743 tile montate insieme, non il vetro. Il commento è stato
riscritto con i numeri. Vedi [[Verificare il meccanismo sbagliato]].
