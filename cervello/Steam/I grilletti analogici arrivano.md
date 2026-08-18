---
tags: [steam, gamepad]
---

# I grilletti analogici arrivano

`GamepadButton.TRIGGER_LEFT` (7) e `TRIGGER_RIGHT` (8) **vengono consegnati**
a `onButtonDown` di un `Focusable`, come i bumper.

Non era scontato: nessun altro punto del plugin li usava, quindi non c'era
alcuna prova che Steam li propagasse invece di consumarli. L'ho verificato
strumentando `onButtonDown` sul dispositivo e facendo premere i tasti:
12 pressioni di R2 e 5 di L2 registrate.

## Perché vale la pena ricordarlo

Il primo tentativo di usarli è sembrato fallire, e la spiegazione naturale era
«Steam non li passa». Era invece un difetto di ancoraggio nel salto per
lettera — vedi [[Perché paginazione e non virtualizzazione]].

Se avessi accettato la spiegazione comoda avrei spostato il comando su un
tasto diverso, lasciando il difetto vero al suo posto. Vale come esempio di
[[Verificare il meccanismo sbagliato]] al contrario: qui il meccanismo
funzionava e il difetto era altrove.

## Mappatura in uso nella pagina catalogo

| Tasto | Azione |
| --- | --- |
| A | apri il gioco |
| L1 / R1 | pagina precedente / successiva |
| L2 / R2 | lettera precedente / successiva |
| Y | cicla l'ordinamento |
