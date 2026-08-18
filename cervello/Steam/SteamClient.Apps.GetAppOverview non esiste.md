---
tags: [steam, trappola, api]
---

# SteamClient.Apps.GetAppOverview non esiste

Su Steam attuale `window.SteamClient.Apps.GetAppOverview` è **`undefined`**.
Verificato dal debugger contro il client vivo.

Conseguenza in [[Unifideck]]: `SteamBridge.getAppOverview()` restituiva `null`
per ogni AppID mai passato, e `isReady()` — che controlla proprio quel
simbolo — restituiva sempre `false`. Una verifica di prontezza che non può
mai diventare vera.

L'impatto reale era nullo, perché l'unico consumatore (`useSteamLibrary`) non
è importato da nessuno e non finisce nel bundle. Ma è un'API che sembra
funzionare e risponde «no» a tutto.

## L'API viva

```js
window.appStore.GetAppOverviewByAppID(appid)
```

Esiste in `SharedJSContext` (vedi [[Due realm, due window]]), va chiamata con
il ricevitore ([[I metodi di appStore vogliono il ricevitore]]) e con l'AppID
nella forma giusta ([[AppID in due forme]]).

Segnalato a monte: `mubaraknumann/unifideck#431`.
