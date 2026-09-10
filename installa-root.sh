#!/usr/bin/env bash
# Parte privilegiata dell'installazione. Eseguita come root con una
# sola autenticazione. Non contiene credenziali.
set -euo pipefail

SRC="${1:-/home/deck/Progetti/unifideck-mio/dist}"
PLUGIN="/home/deck/.local/var/opt/decky-loader/plugins/Unifideck"
DEST="$PLUGIN/dist"
BACKUP="$PLUGIN/dist.backup-$(date +%Y%m%d-%H%M%S)"

[[ -f "$SRC/index.js" ]] || { echo "ERRORE: bundle non trovato in $SRC" >&2; exit 1; }

# Ripulisce un backup lasciato a metà da un tentativo precedente.
for stale in "$PLUGIN"/dist.backup-*; do
  [[ -d "$stale" && ! -f "$stale/index.js" ]] && rm -rf "$stale"
done

echo "→ Backup in $BACKUP"
cp -a "$DEST" "$BACKUP"
[[ -f "$BACKUP/index.js" ]] || { echo "ERRORE: backup incompleto" >&2; exit 1; }

echo "→ Copia del nuovo bundle"
install -o root -g root -m 644 "$SRC/index.js"     "$DEST/index.js"
install -o root -g root -m 644 "$SRC/index.js.map" "$DEST/index.js.map"

# I file Python nostri. Vanno installati QUI e non a mano: sono l'altra meta'
# della patch, e un frontend nuovo sopra un backend di monte e' una coppia che
# nessuno ha mai provato. L'elenco e' nostri-py.txt, accanto alla dir passata:
# vale sia per $REPO/dist sia per $WORK/repo/dist dopo un rebase.
ORIG="$(dirname "$SRC")"
LISTA="$ORIG/nostri-py.txt"
if [[ -f "$LISTA" ]]; then
  echo "→ Copia dei file Python nostri"
  mkdir -p "$BACKUP/py_modules"
  while IFS= read -r riga; do
    riga="${riga%%#*}"
    riga="$(printf '%s' "$riga" | tr -d '[:space:]')"
    [[ -n "$riga" ]] || continue
    sorgente="$ORIG/py_modules/$riga"
    destinazione="$PLUGIN/py_modules/$riga"
    if [[ ! -f "$sorgente" ]]; then
      echo "   ! $riga: assente in $ORIG/py_modules — salto" >&2
      continue
    fi
    # Backup accanto a quello del bundle, cosi' un ripristino e' una cosa sola.
    if [[ -f "$destinazione" ]]; then
      mkdir -p "$(dirname "$BACKUP/py_modules/$riga")"
      cp -a "$destinazione" "$BACKUP/py_modules/$riga"
    fi
    install -o root -g root -m 644 -D "$sorgente" "$destinazione"
    echo "   ✓ $riga"
  done < "$LISTA"
  # I .pyc della versione precedente vincono sul .py appena copiato se il
  # timestamp non li invalida; toglierli e' piu' economico che ragionarci.
  find "$PLUGIN/py_modules/unifideck" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
else
  echo "   ! nostri-py.txt non trovato in $ORIG — installo solo il bundle" >&2
fi

# Le dipendenze vendored di monte sono wheel compilate per il Python di
# SteamOS (cpython-311). Questo Deck non gira SteamOS ma CachyOS, che ha
# Python 3.14: rpds.rpds non si carica, quindi jsonschema non si importa e
# il plugin parte in modalita' degradata a ogni avvio. Non e' un difetto di
# monte — sulla piattaforma per cui ha buildato quelle wheel vanno bene.
#
# CachyOS ha gia' python-jsonschema e le sue dipendenze come pacchetti di
# sistema, e bastano: il validator usa Draft7Validator, stabile in tutta la
# serie 4.x. Tolte le copie vendored, Python le trova in site-packages.
#
# Il test e' funzionale e non euristico sul tag ABI: si prova l'import come
# lo farebbe il plugin, e si tocca qualcosa solo se fallisce E il sistema
# offre un rimpiazzo che funziona. Su SteamOS il primo controllo passa e
# questo blocco non fa nulla.
# L'interprete da interrogare e' quello che esegue davvero i plugin, cioe'
# quello nello shebang di decky-loader — non `python3` del PATH. Su questo
# Deck coincidono, ma dove non coincidessero il controllo qui sotto direbbe
# la sua su un Python diverso da quello che poi importa, e un falso positivo
# non lascia il plugin com'era: gli toglie dipendenze che gli servono.
PY=""
DECKY_BIN="$(command -v decky-loader || echo /usr/bin/decky-loader)"
if [[ -r "$DECKY_BIN" ]] && IFS= read -r shebang < "$DECKY_BIN" && [[ "$shebang" == '#!'* ]]; then
  read -r cand extra <<< "${shebang#\#!}"
  # `#!/usr/bin/env python3` → l'interprete e' l'argomento, non env.
  [[ "$(basename "$cand")" == env ]] && cand="$(command -v "${extra%% *}" || true)"
  [[ -x "$cand" ]] && PY="$cand"
fi
[[ -n "$PY" ]] || PY="$(command -v python3 || true)"
VENDORED_JSONSCHEMA=(rpds referencing jsonschema jsonschema_specifications)
if [[ -z "$PY" ]]; then
  echo "   ! nessun interprete Python identificato — non tocco le vendored" >&2
elif ! "$PY" -c "import sys; sys.path.insert(0, '$PLUGIN/py_modules'); import jsonschema" 2>/dev/null; then
  if "$PY" -c "import jsonschema, rpds" 2>/dev/null; then
    echo "→ jsonschema vendored incompatibile con $("$PY" -V) — uso quello di sistema"
    mkdir -p "$BACKUP/py_modules-vendored"
    for pkg in "${VENDORED_JSONSCHEMA[@]}"; do
      [[ -d "$PLUGIN/py_modules/$pkg" ]] || continue
      mv "$PLUGIN/py_modules/$pkg" "$BACKUP/py_modules-vendored/$pkg"
      echo "   ✓ rimosso $pkg (nel backup)"
    done
  else
    echo "   ! jsonschema vendored rotto e il sistema non ne ha uno — resta degradato" >&2
  fi
fi

echo "→ Riavvio di decky-loader"
systemctl restart decky-loader@deck.service

echo "$BACKUP" > /tmp/unifideck-ultimo-backup.txt
echo "→ Backup registrato in /tmp/unifideck-ultimo-backup.txt"
