---
tags: [steam, trappola, identita]
---

# AppID in due forme

L'AppID di uno shortcut non-Steam è un valore a 32 bit che questo sistema
conserva in **due letture diverse**:

| Dove | Forma | Esempio |
| --- | --- | --- |
| Backend, `games.map`, `Game.app_id` | **con segno** | `-310337468` |
| App store di Steam, rotte `/library/app/…` | **senza segno** | `3984629828` |

Stessi bit. Sbagliarla **non dà errore**: dà silenzio, che è peggio.

## I due modi in cui morde

`appStore.GetAppOverviewByAppID(-310337468)` restituisce `null`. Nessuna
eccezione, nessun avviso — semplicemente niente copertina, per ogni gioco.

`Navigate("/library/app/-310337468")` non combacia con nessuna rotta e Steam
deposita l'utente sulla **home della libreria**. Sembra quasi giusto: la
navigazione avviene, la destinazione è plausibile, e non c'è modo di
distinguerla da una scelta deliberata.

Entrambi sono stati bug veri, scoperti a giorni di distanza l'uno dall'altro
prima di capire che erano la stessa cosa.

## La conversione

In `src/lib/appid.ts`:

```ts
toSteamAppId(appId)   // appId >>> 0 — la forma che Steam vuole
appIdForms(appId)     // entrambe, deduplicate, la unsigned per prima
```

`>>> 0` reinterpreta il bit di segno invece di troncare, quindi un valore già
senza segno passa invariato. Sotto 2³¹ le due letture coincidono, ed è per
questo che `appIdForms` deduplica: interrogare Steam due volte con lo stesso
numero è puro spreco su una pagina che risolve 42 tile.

**Usare sempre quelle funzioni** quando un AppID viene passato a Steam. È la
terza volta che questa distinzione ha fatto danno; la quarta si evita solo
avendo un posto unico dove sta scritta.

Vedi anche [[SteamClient.Apps.GetAppOverview non esiste]] e
[[Dove vivono davvero le copertine]].
