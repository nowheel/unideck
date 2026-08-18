---
tags: [metodo, debug, cdp]
---

# Parlare con il debugger di Steam

Steam espone il protocollo DevTools di Chromium su `localhost:8080`. È
l'unico modo per vedere cosa fa davvero una pagina dentro Gaming Mode, invece
di dedurlo dal codice.

```bash
curl -s http://localhost:8080/json/list   # i target disponibili
```

Un client minimo (`cdp.py` nel repo) espone tre comandi:

```bash
python3 cdp.py list
python3 cdp.py shot "Big Picture" foto.png
python3 cdp.py eval SharedJSContext 'espressione JS'
```

## L'errore da non fare: quale target

Vedi [[Due realm, due window]]. Confondere `SharedJSContext` con `Big Picture`
produce risposte sbagliate ma plausibili — è successo più di una volta.

## L'errore da non fare: emulazione del focus

`document.hasFocus()` è `false` per una finestra che il sistema non
considera attiva — cioè quella pilotata dal debugger, per default. Un
documento senza focus non emette eventi di focus **né combacia con
`:focus`**.

```python
await session.send("Emulation.setFocusEmulationEnabled", enabled=True)
```

Va abilitato **prima** di misurare qualunque cosa riguardi il focus. Senza,
si conclude "gli eventi non scattano" quando in realtà scattano — vedi
[[Verificare il meccanismo sbagliato]].

## Simulare i tasti del pad

Il focus da gamepad non è il focus del DOM (vedi
[[Il focus del pad non è il focus del DOM]]), quindi non è simulabile
chiamando `.focus()`. Per i pulsanti, l'unico modo verificato è strumentare
`onButtonDown` e far premere i tasti a chi ha in mano il controller — vedi
[[I grilletti analogici arrivano]].
