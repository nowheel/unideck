# CLAUDE.md — Guida per lo Sviluppo

Questo file documenta lo stato attuale del fork e i cambiamenti rispetto a monte, per facilitare il lavoro futuro.

---

## Aggiornamento a Release-0.7.5 (10 settembre 2026)

**Commit:** `650a413` — Rebase completato con successo

### Risoluzione Conflitti
7 file avevano conflitti di merge che sono stati risolti intelligentemente:

| File | Conflitto | Soluzione |
|------|-----------|-----------|
| `usePlaySection.ts` | `game.id` vs `gameId()` | ✅ Mantieni helper NOSTRI + controllo `isTerminal` di monte |
| `index.tsx` | Import diversi | ✅ Prendi gli import completi di NOSTRI |
| `teardown.ts` | Refactor di monte | ✅ Accetta il refactor migliore di monte |
| `types/api.ts` | Compat API cambiate | ✅ Combina CompatTestResult/CompatTrackInfo di monte + doc di NOSTRI |
| `en-US.json` | Sezioni ortogonali | ✅ Merge di "reconcile", "gamevault", "unifideckPage" |
| `it-IT.json` | Come en-US | ✅ Stesso merge in italiano |
| `QuickAccessPanel.tsx` | Import e button | ✅ Prendi tutto da monte |

### Correzioni TypeScript (Build Perfetto)
Dopo il rebase, il build aveva 4 type errors. Risolti:

```typescript
// ❌ Prima
export type StoreId = "steam" | "epic" | "gog" | "ubisoft" | "amazon";
// ✅ Dopo
export type StoreId = "steam" | "epic" | "gog" | "ubisoft" | "amazon" | "microsoft";

// ❌ Prima (rpc-routes.ts)
getPlaytime: "get_playtime",
// ✅ Dopo
getAllPlaytimes: "get_all_playtimes",  // ripristinato da NOSTRI

// ❌ Prima (UnifideckPage.tsx)
switch (compat.deckVerified) {
// ✅ Dopo
switch (compat.status) {
```

### Test Suite (367/367 Passati ✅)
- **Frontend:** 367 test passati (100%)
- **Coverage:** usePlaySection, catalogue, hooks, components, utilities
- **Fallimenti risolti:**
  - usePlaySection: fix ID coerenti in test
  - JSX tests: aggiunta `@vitest-environment jsdom`

---

## Cos'è questo repo

Un fork di `mubaraknumann/unifideck` — plugin Decky Loader per Steam Deck con:
- ✅ Pagina catalogo autonoma
- ✅ Sincronizzazione libreria migliorata
- ✅ Fix di stabilità (issue #405, #430)
- ✅ Support per Microsoft/Xbox Game Pass

Il fork si installa **nella stessa cartella** del plugin ufficiale:
`~/.local/var/opt/decky-loader/plugins/Unifideck/`

**Versione upstream:** Release-0.7.5

---

## Modifiche NOSTRI (Divergenze da Monte)

### Frontend (tutto in `src/`)
- **UnifideckPage.tsx** + `unifideck-page/` — pagina catalogo autonoma
- **game-identity.ts, appid.ts, routes.ts** — helper e correzioni
- **SteamBridge.ts** — fix alle API Steam

### Backend (7 file Python in `py_modules/`)
```
py_modules/unifideck/
  ├── core/sync_run_mixin.py         # Safety net su libreria
  ├── core/sync_service.py
  ├── stores/microsoft/microsoft_catalog.py
  ├── config/schema.json             # Fix schema steam
  ├── launcher/proton/infrastructure/{ge_installer,selector}.py
  └── rpc/mixins/playtime.py         # Ripristina get_all_playtimes
```

**Elenco in:** `nostri-py.txt` + array `NOSTRI=` negli script

---

## Le 7 Trappole Critiche del Codice

### 1. `game.id` non esiste su righe grezze
```typescript
// ❌ SBAGLIATO
const id = game.id;  // undefined su raw rows

// ✅ CORRETTO
import { gameId } from "../lib/game-identity";
const id = gameId(game);  // usa store_game_id ??id
```

### 2. AppID: due forme
```typescript
// Backend/libreria: forma con segno
const signed = -310337468;

// Steam APIs: forma senza segno
const unsigned = toUnsigned(signed);  // vedi lib/appid.ts
```

### 3. Focus del pad è `.gpfocus`, non DOM
```typescript
// ❌ Non funziona
element.focus();
element === document.activeElement;  // false

// ✅ Corretto
element.classList.contains("gpfocus");
document.querySelectorAll(".gpfocus");  // gli elementi con focus del pad
```

### 4. Metodi `appStore` richiedono il receiver
```typescript
// ❌ TypeError: this is undefined
const method = store.GetAppOverviewByAppID;
method(appId);  // ERRORE

// ✅ Corretto
store.GetAppOverviewByAppID.call(store, appId);
```

### 5. `SteamClient.Apps.GetAppOverview` non esiste
```typescript
// ❌ Non esiste su Steam attuale
SteamClient.Apps.GetAppOverview(appId);

// ✅ Usa invece
window.appStore.GetAppOverviewByAppID(appId);
```

### 6. Viewport reale: 854×534 CSS (devicePixelRatio 1.5)
```typescript
// Gaming Mode: 1280×800 * 1.5 = 854×534 CSS
// Steam disegna barra di stato + legenda sopra la pagina

// Usa gli inset:
const { STEAM_TOP_INSET, STEAM_BOTTOM_INSET } = constants;
```

### 7. Libreria di riferimento: 743 giochi
```
→ Usa PAGINAZIONE non virtualizzazione
→ Copertine con loading="lazy"
→ Qualunque work-per-gioco va pensato a quella scala
```

---

## Comandi

### Aggiornare il fork
```bash
bash riapplica.sh        # Rebase a monte, compila, installa
```

### Sviluppo
```bash
# Verifiche
pnpm run typecheck && pnpm run lint && pnpm run build

# Test
pnpm exec vitest run
PYTHONPATH=py_modules python3 -m pytest tests/unit -q

# Health check
./controlla.sh            # veloce
./controlla.sh --test     # con test suite
```

### Git
```bash
# Trovare divergenze da monte
grep -rn "NOSTRI in riapplica.sh" src/ py_modules/
```

---

## Issues Aperte su Monte

| Numero | Titolo | Stato a 0.7.5 | Note |
|--------|--------|---------------|------|
| #405 | Fetch fallito cancella libreria | ❌ NON risolto | La nostra patch `sync_run_mixin.py` serve ancora |
| #430 | Schema rifiuta sezione `steam` | ❌ NON risolto | Fix in `config/schema.json` |
| #431 | `GetAppOverview` non esiste | ❌ NON risolto | Usa `window.appStore` |
| #432 | Tipo `Game` non corrisponde | ❌ NON risolto | Commentato in `types/api.ts` |

**Regola:** Quando monte risolve una issue, verificare nel codice prima di togliere la nostra patch.

---

## Pre-commit Hooks (Planned)

Per evitare regressioni future:
```bash
# A implementare
npm install husky lint-staged --save-dev
npx husky install

# Verifica TypeScript + eslint prima di ogni commit
# Corre i test interessati
# Non committa se ci sono errori
```

---

## Convenzioni

**Lingua:**
- Documentazione interna (CLAUDE.md, LEGGIMI.md, cervello/): **italiano**
- Codice + commenti tecnici: **inglese** (compatibile con monte)
- Divergenze da monte nei commenti: marcate con `NOSTRI in riapplica.sh` in **italiano**

**Stile:**
- I commenti spiegano il **perché**, non il cosa
- Se spieghi una trappola o un bug risolto, cita il numero della issue
- Se togli una riga con commento storico, spiega perché nel commit

---

## Ultima Verifica (10 set 2026)

✅ **Build:** Zero errori TypeScript
✅ **Test:** 367/367 passati (100%)
✅ **Plugin:** Caricato, 853 giochi in cache, 853 shortcut create
✅ **Git:** 30 commit, tutto committato e spinto a GitHub
