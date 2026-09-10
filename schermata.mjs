#!/usr/bin/env node
/**
 * Screenshot della UI di Steam, e della nostra pagina, senza toccare lo schermo.
 *
 * Perche' non con gli strumenti soliti: in Gaming Mode gamescope compone fuori
 * da X, quindi `import`, `scrot` e `ffmpeg -f x11grab` sul root window danno
 * un'immagine **nera**, e la finestra "Steam" su :0 e' un placeholder 10x10.
 * xdotool vede le finestre ma non puo' catturarne il contenuto. Misurato il
 * 10 settembre 2026: ffmpeg x11grab restituisce 1280x800 completamente neri,
 * 4,8 KB di PNG.
 *
 * La strada che funziona: la UI di Steam **e'** Chromium, e la porta di debug
 * e' gia' aperta — e' cosi' che Decky inietta i plugin. Si chiede l'immagine
 * a lui, col DevTools Protocol. Richiede il file
 * ~/.local/share/Steam/.cef-enable-remote-debugging (gia' presente se Decky
 * funziona) e un riavvio di Steam dopo averlo creato.
 *
 * I target utili:
 *   "Big Picture"   la UI visibile — 854x534 @1.5, il viewport vero
 *   "QuickAccess"   il pannello QAM, dove vive il nostro plugin
 *   "SharedJSContext"  il contesto JS: 1x1, non renderizza, non catturarlo
 *
 * Uso:
 *   node schermata.mjs                              Big Picture -> steam.png
 *   node schermata.mjs QuickAccess qam.png          il pannello QAM
 *   node schermata.mjs --rotta /unifideck cat.png   naviga e poi cattura
 *   node schermata.mjs --lista                      elenca i target
 *
 * `--rotta` cambia davvero la pagina che l'utente ha davanti: usa la History
 * API piu' un popstate, che e' cio' che il router di Steam ascolta. Torna
 * indietro con `--rotta /library/home` o col tasto B.
 */
import { writeFileSync } from "node:fs";

const CDP = "http://localhost:8080";
const argv = process.argv.slice(2);

// Gli errori qui sono diagnosi ("il target e' sospeso"), non crash da leggere
// riga per riga: lo stack trace nasconderebbe il messaggio invece di aiutare.
// `uncaughtException` e non solo `unhandledRejection`: con il top-level await
// di un modulo ESM il reject arriva come eccezione non gestita del modulo.
for (const evento of ["unhandledRejection", "uncaughtException"]) {
  process.on(evento, (e) => {
    console.error(String(e?.message ?? e));
    process.exit(1);
  });
}

const prendi = (nome) => {
  const i = argv.indexOf(nome);
  if (i === -1) return null;
  return argv.splice(i, 2)[1] ?? null;
};
const rotta = prendi("--rotta");
const soloLista = argv.includes("--lista");
// Un solo posizionale che finisce in .png e' la destinazione, non il nome di
// un target: `schermata.mjs --rotta /unifideck out.png` e' come viene naturale
// scriverlo, e interpretarlo come target fallisce con un messaggio che elenca
// finestre di Steam quando il problema era l'ordine degli argomenti.
const posizionali = argv.filter((a) => !a.startsWith("--"));
if (posizionali.length === 1 && /\.png$/i.test(posizionali[0])) posizionali.unshift("Big Picture");
const [cerca = "Big Picture", dest = "steam.png"] = posizionali;

let targets;
try {
  targets = await (await fetch(`${CDP}/json/list`)).json();
} catch {
  console.error(`Nessuna risposta da ${CDP}.`);
  console.error("Steam e' avviato? Esiste ~/.local/share/Steam/.cef-enable-remote-debugging?");
  process.exit(1);
}

if (soloLista) {
  for (const t of targets) console.log(`  [${t.type}] ${t.title}`);
  process.exit(0);
}

const target = targets.find(
  (t) => t.type === "page" && (t.title ?? "").toLowerCase().includes(cerca.toLowerCase()),
);
if (!target) {
  console.error(`Nessun target contiene "${cerca}". Disponibili:`);
  for (const t of targets) console.error(`  [${t.type}] ${t.title}`);
  process.exit(1);
}

/** Apre una connessione CDP e restituisce una funzione per invocare metodi. */
async function connetti(url) {
  const ws = new WebSocket(url);
  const attese = new Map();
  let id = 0;
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    const attesa = msg.id != null && attese.get(msg.id);
    if (!attesa) return;
    attese.delete(msg.id);
    msg.error ? attesa.rifiuta(new Error(msg.error.message)) : attesa.risolvi(msg.result);
  });
  await new Promise((risolvi, rifiuta) => {
    ws.addEventListener("open", risolvi, { once: true });
    ws.addEventListener("error", () => rifiuta(new Error(`connessione fallita: ${url}`)), { once: true });
  });
  // Un target sospeso accetta la connessione e poi non risponde mai: il QAM
  // a pannello chiuso fa esattamente questo. Senza scadenza lo script resta
  // appeso in silenzio, che e' il modo peggiore di fallire.
  const invia = (method, params = {}) =>
    new Promise((risolvi, rifiuta) => {
      const mio = ++id;
      const scadenza = setTimeout(() => {
        attese.delete(mio);
        rifiuta(new Error(`${method}: nessuna risposta in 8s — il target e' sospeso? ` +
          `Un pannello chiuso non renderizza: aprilo e riprova.`));
      }, 8000);
      attese.set(mio, {
        risolvi: (v) => { clearTimeout(scadenza); risolvi(v); },
        rifiuta: (e) => { clearTimeout(scadenza); rifiuta(e); },
      });
      ws.send(JSON.stringify({ id: mio, method, params }));
    });
  return { invia, chiudi: () => ws.close() };
}

// La rotta si cambia nel contesto che possiede la history, non nella finestra
// che disegna: sono due target diversi e cambiarla in quello sbagliato non fa
// nulla di visibile.
if (rotta) {
  const ctx = targets.find((t) => t.title === "SharedJSContext");
  if (!ctx) {
    console.error("SharedJSContext non trovato: non so dove cambiare rotta.");
    process.exit(1);
  }
  const { invia, chiudi } = await connetti(ctx.webSocketDebuggerUrl);
  const { result } = await invia("Runtime.evaluate", {
    expression: `(() => {
      const prima = location.pathname;
      history.pushState({}, "", ${JSON.stringify(`/routes${rotta}`)});
      dispatchEvent(new PopStateEvent("popstate", { state: {} }));
      return prima;
    })()`,
    returnByValue: true,
  });
  console.log(`rotta   : ${result.value} -> /routes${rotta}`);
  chiudi();
  // Il render non e' sincrono con il popstate: senza questa pausa si cattura
  // la pagina precedente e sembra che la navigazione non abbia funzionato.
  await new Promise((r) => setTimeout(r, 600));
}

const { invia, chiudi } = await connetti(target.webSocketDebuggerUrl);

// Il viewport e' la prova di aver preso il target giusto: la Big Picture e'
// 854x534, SharedJSContext e' 1x1 e catturarlo da un PNG di 81 byte.
const { result: dim } = await invia("Runtime.evaluate", {
  expression: "`${innerWidth}x${innerHeight} @${devicePixelRatio}`",
  returnByValue: true,
});
const { data } = await invia("Page.captureScreenshot", { format: "png" });
writeFileSync(dest, Buffer.from(data, "base64"));
chiudi();

console.log(`target  : ${target.title}`);
console.log(`viewport: ${dim.value}`);
console.log(`file    : ${dest}`);

// `ws.close()` non basta a far uscire node: il socket resta fra gli handle
// attivi e il processo penzola finche' non lo si uccide. Con `--rotta` sono
// due socket, e senza questa riga lo script sembra bloccato a meta'.
process.exit(0);
