# Unifideck — versione locale

Questo repo è **Unifideck `Release-0.7.3` di monte** più due strati di
modifiche: quelle che c'erano già sulla Deck quando ho iniziato, e la
riscrittura della pagina catalogo.

Monte: <https://github.com/mubaraknumann/unifideck>
Installato in: `/home/deck/.local/var/opt/decky-loader/plugins/Unifideck`

---

## Come è nato questo repo

Sulla Deck non c'erano sorgenti, solo il bundle compilato. Li ho
ricostruiti dal `index.js.map` (122 file), clonato `Release-0.7.3` da
monte e confrontati. La modifica preesistente era chirurgica: rimossa
l'iniezione nei tab della libreria Steam, aggiunta la rotta `/unifideck`
con un pulsante nel Quick Access — cinque file in tutto.

Ricompilando quell'albero ho ottenuto un bundle **identico byte per
byte** a quello installato (`sha256 474c9157…`). È la prova che la
ricostruzione era corretta e che la pipeline funziona: da lì in poi
ogni modifica è partita da una base verificata.

---

## Uso quotidiano

```bash
pnpm install --ignore-scripts     # una volta
pnpm run typecheck && pnpm test   # verifica
pnpm run build                    # produce dist/
sudo bash installa-root.sh dist   # backup + copia + riavvio di decky
```

`installa-root.sh` fa un backup con data della `dist/` attuale prima di
sovrascrivere, e stampa il comando per tornare indietro.

### Dopo un aggiornamento di monte

Il plugin **non** si sovrascrive da solo: l'updater controlla ogni 6 ore
e manda una notifica, ma l'installazione la lanci tu. Quando la lanci,
Decky rimpiazza la cartella e queste modifiche spariscono. Per
rimetterle:

```bash
./riapplica.sh                 # ultima release
./riapplica.sh Release-0.8.0   # una precisa
```

Costruisce un repo dove `base`, `monte` e `mio` condividono un antenato
e fa un rebase vero, così git fonde invece di indovinare. Dove non ce la
fa si ferma, nomina i file in conflitto e ti lascia risolverli — non
installa mai una fusione a metà. Provato andando *all'indietro* da 0.7.3
a 0.7.2, che è il caso peggiore: i file di traduzione si sono fusi da
soli, è rimasto un conflitto legittimo.

I percorsi considerati "nostri" sono in `NOSTRI=` dentro lo script:
`src/` e `py_modules/unifideck/config/schema.json`.

---

## Cosa è stato cambiato, e perché

### La pagina catalogo (`src/views/UnifideckPage.tsx` + `unifideck-page/`)

Riusava componenti nati per stare dentro un tab di Steam. A schermo
intero su 743 giochi ereditava quattro difetti: montava **tutte** le
tile e tutte le copertine in un colpo solo (la vera causa
dell'instabilità), filtrava con `<select>` e `<input>` nativi che il pad
non raggiunge, cambiava filtro su `onFocus`, e rifiltrava l'intera
libreria a ogni tasto premuto.

Ora: griglia paginata a 42 tile (DOM limitato per costruzione), chip
`Focusable`, ricerca con debounce, refetch silenzioso. Le regole di
selezione stanno in `unifideck-page/catalogue.ts`, coperte da test.

### Lo schema di configurazione (`py_modules/unifideck/config/schema.json`)

Il plugin ripartiva **in modalità degradata a ogni avvio**. Non era
sporcizia nella configurazione utente: `steam/current_user.py` scrive e
legge `steam.active_user`, ma lo schema ha `additionalProperties: false`
e non prevedeva quella sezione — il plugin invalidava la propria
configurazione. Aggiunta la sezione: validando la configurazione fusa,
1 errore prima, 0 dopo.

**Questo file è del plugin, quindi ogni aggiornamento lo riporta
indietro.** È fra i percorsi di `riapplica.sh`, quindi si risistema.

---

## L'incidente del 18 agosto 2026 — e la regola che ne è uscita

Una sincronizzazione automatica è partita alle 08:50 e la Deck è andata
in sospensione a metà. Il socket non conta il tempo in cui la macchina
dorme, così una richiesta con `timeout=30` ha riportato il proprio
fallimento **14.596 secondi dopo**. Fin qui è un incidente.

Il difetto è quello che è successo dopo. In `microsoft_catalog.py` ogni
ramo d'errore faceva `return []`, quindi il guasto è arrivato a valle
come «questo account non possiede giochi Xbox». `SyncService` ci ha
creduto, ha riscritto la cache, e il riconciliatore ha **cancellato 603
shortcut da Steam**. Il log diceva `sync complete — 0 errors`.

E sotto c'era un secondo difetto: `libraries[store] = games` era
incondizionato. Anche con l'errore riportato correttamente, la libreria
sarebbe stata svuotata lo stesso.

**La regola, ora fissata da `tests/unit/test_sync_failed_store_keeps_library.py`:**
un guasto deve restare un guasto (il catalogo solleva
`XCloudCatalogUnavailable`), e uno store fallito conserva la libreria
precedente. L'unica cosa che un guasto può costare è la freschezza del
dato, che è la cosa giusta da perdere.

Ripristino: una sincronizzazione riuscita ha rimesso 601 giochi e 742
shortcut, con `added=601 removed=0 reclaimed=140` — gli AppID sono
stati riusati dal registro, quindi l'artwork si è riagganciata.

---

## Trappole di Steam, imparate a caro prezzo

Tre cose che è costato scoprire e che conviene non riscoprire.

### `SteamClient.Apps.GetAppOverview` non esiste

Su questo client `typeof` è `undefined`. `SteamBridge.getAppOverview()`
restituisce quindi sempre `null`, e `isReady()` sempre `false` perché
controlla proprio quel metodo. Nel bundle spedito è codice morto —
l'unico consumatore, `useSteamLibrary`, non è importato da nessuno e
non finisce nel bundle — ma **non fidarsi di quei due metodi**.

L'API viva è `window.appStore`, e vive solo in `SharedJSContext`: nella
finestra Big Picture non c'è.

### Gli AppID degli shortcut esistono in due forme

Il backend e `games.map` usano quella **con segno** (`-310337468`);
l'app store di Steam e le sue rotte quella **senza** (`3984629828`).
Stessi bit, e sbagliare non dà errore — dà silenzio:

- `GetAppOverviewByAppID(-310337468)` → `null`, e le copertine
  spariscono;
- `Navigate("/library/app/-310337468")` → nessuna rotta combacia e
  Steam ti deposita sulla home, come se avessi quasi ragione.

Entrambi sono stati bug veri. La conversione è in
`unifideck-page/appid.ts`; passare sempre di lì.

### I metodi di `appStore` vanno chiamati con il loro ricevitore

`GetCustomVerticalCapsuleURLs` è un metodo di prototipo che internamente
chiama `this.GetCustomImageURLs`. Invocato staccato dall'oggetto lancia
`TypeError`, e un `catch` di troppo lo trasforma in «questo gioco non ha
copertina». Usare `fn.call(store, overview)`.

Delle copertine candidate che Steam restituisce, per gli shortcut
**solo il `.jpg` di `GetCustomVerticalCapsuleURLs` carica**: il `.png`
gemello, entrambe le forme `/assets/…library_600x900.jpg` e l'URL della
CDN danno 404. La tile le prova in ordine.

### Dove sono le copertine

*Non* nei dati del plugin: `cover_image` è vuoto per tutti i 743 giochi
(solo il percorso Ubisoft lo popola). La sincronizzazione le scrive nel
grid store di **Steam**, indicizzate per AppID dello shortcut.

---

## Il wire non è il tipo TypeScript

La dataclass `Game` del backend **non ha `id`** (ha `store_game_id`), né
`cover_image`, né `is_installed` (ha `installed`). L'interfaccia
TypeScript è più vecchia e dichiara i primi: valgono solo per le righe
passate da `adaptGame` (`hooks/useGameInfo.ts`), non per quelle grezze
che questa pagina consuma.

Usare `gameId()` / `gameKey()` / `isInstalled()` da `catalogue.ts`.

---

## Strumenti

`cdp.py` — client per il debugger CEF di Steam, che ascolta su
`localhost:8080`. È l'unico modo per vedere davvero cosa fa la pagina
dentro Gaming Mode.

```bash
python3 cdp.py list                              # i target disponibili
python3 cdp.py shot "Big Picture" foto.png       # schermata
python3 cdp.py eval SharedJSContext 'espressione' # esegue JS
python3 cdp.py eval SharedJSContext 'window.SteamUIStore.Navigate("/unifideck")'
```

Il DOM della pagina sta nel target **Big Picture**; `appStore`,
`SteamUIStore` e il codice del plugin stanno in **SharedJSContext**.
Sono realm diversi: cercare la cosa sbagliata nel posto sbagliato porta
a conclusioni false, come è successo più di una volta.

`perf.py` — campiona i delta di `requestAnimationFrame` mentre la
griglia scorre.

### Numeri misurati (non stimati)

| Condizione | Mediana | Frame persi (>33ms) |
|---|---|---|
| Com'è spedita | 16,7 ms | 0 |
| `blur(40px)` su tutte e 42 le tile | 16,7 ms | 0 |
| Carico deliberatamente assurdo | 33,3 ms | 96 |

La terza riga è la calibrazione, e serve: senza, un 60fps inchiodato non
distingue «va tutto bene» da «la misura è cieca». Il vetro costa niente,
il margine c'è. Ciò che rendeva instabile la pagina erano le 743 tile
montate insieme.

---

## Geometria del bersaglio

Il viewport CSS in Gaming Mode è **854×534**, non 1280×800: il
`devicePixelRatio` è 1.5. Steam disegna poi la propria barra di stato
(~38px) e la legenda dei tasti (~35px) *sopra* la rotta, quindi una
pagina che parte da `top: 0` ha la prima riga nascosta sotto l'orologio.
Da lì `STEAM_TOP_INSET` / `STEAM_BOTTOM_INSET`.

---

## Da segnalare a monte

- Lo schema di configurazione non prevede la sezione `steam` che il
  plugin stesso scrive → modalità degradata a ogni avvio.
- `SteamBridge` si appoggia a `SteamClient.Apps.GetAppOverview`, che su
  Steam attuale non esiste; `isReady()` ne consegue.
- L'interfaccia TypeScript `Game` non corrisponde alla dataclass del
  backend, e il commento in cima a `types/api.ts` avverte proprio di
  questa deriva.

---

## Rimasto da verificare

Il movimento del focus col pad fra i chip e la griglia, e il ritorno
della barra dei filtri quando si è ritirata. Il focus programmatico da
CDP **non genera eventi** (`activeElement` cambia, nessun `focusin`
scatta), quindi non è simulabile da qui. Per questo la barra torna in
base alla **direzione dello scorrimento**, che è verificabile, e non in
base al focus.
