#!/usr/bin/env bash
#
# Controllo di salute: repo, installazione, log e dati.
#
# Esiste perché lo stesso controllo fatto a mano ha già trovato una
# deriva reale — lo schema di configurazione corretto viveva solo sul
# dispositivo, e il prossimo aggiornamento avrebbe silenziosamente
# riportato la modalità degradata.
#
# Confronta anche i conteggi con l'ultimo stato registrato, cosa che
# nessuno faceva: il 18 agosto una sincronizzazione ha cancellato 603
# shortcut e ce ne siamo accorti per caso giorni dopo.
#
# Uso:  ./controlla.sh          controllo veloce (secondi)
#       ./controlla.sh --test   include le due suite di test
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST=/home/deck/.local/var/opt/decky-loader/plugins/Unifideck
DATI=/home/deck/.local/share/unifideck
STATO="$REPO/.ultimo-stato"
LOGDIR=/home/deck/.local/var/opt/decky-loader/logs/Unifideck

problemi=0
avvisi=0
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; avvisi=$((avvisi+1)); }
bad()  { printf "  \033[31m✗\033[0m %s\n" "$1"; problemi=$((problemi+1)); }

echo "── Repo ──"
cd "$REPO"
sporco=$(git status --short | wc -l)
[[ $sporco -eq 0 ]] && ok "niente di non salvato ($(git log --oneline | wc -l) commit)" \
                    || warn "$sporco file non salvati"

echo "── Installato contro repo ──"
if [[ -f dist/index.js && -f "$DEST/dist/index.js" ]]; then
  [[ "$(sha256sum <dist/index.js)" == "$(sha256sum <"$DEST/dist/index.js")" ]] \
    && ok "dist/index.js" || bad "dist/index.js DIVERSO — ricompila e reinstalla"
else
  warn "dist/index.js assente da una delle due parti"
fi
# I file che consideriamo nostri; devono coincidere con NOSTRI= in riapplica.sh
for f in py_modules/unifideck/config/schema.json \
         py_modules/unifideck/stores/microsoft/microsoft_catalog.py \
         py_modules/unifideck/core/sync_run_mixin.py \
         py_modules/unifideck/core/sync_service.py; do
  if [[ -f "$f" && -f "$DEST/$f" ]]; then
    diff -q "$f" "$DEST/$f" >/dev/null 2>&1 \
      && ok "$(basename "$f")" \
      || bad "$(basename "$f") DIVERSO — un aggiornamento lo ha sovrascritto? ./riapplica.sh"
  else
    warn "$(basename "$f") assente"
  fi
done

echo "── Plugin ──"
LOG="$LOGDIR/$(ls -t "$LOGDIR" 2>/dev/null | head -1)"
if [[ -f "$LOG" ]]; then
  [[ $(grep -c "plugin loaded" "$LOG") -ge 1 ]] && ok "caricato" || bad "non risulta caricato"
  e=$(grep -cE "Traceback|\]: ERROR" "$LOG")
  [[ $e -eq 0 ]] && ok "nessun errore nel log" || warn "$e riga/e di errore nel log"
  d=$(grep -c "degraded" "$LOG")
  [[ $d -eq 0 ]] && ok "configurazione valida" || bad "modalità degradata — schema sovrascritto?"
else
  warn "nessun log trovato"
fi
systemctl is-active --quiet decky-loader@deck.service \
  && ok "decky-loader attivo" || bad "decky-loader non attivo"

echo "── Libreria ──"
letture=$(python3 - "$DATI" "$DEST" <<'PY'
import json, sys, pathlib
dati, dest = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
sys.path.insert(0, str(dest / "py_modules"))
giochi = shortcut = registro = -1
try:
    d = json.loads((dati / "library_cache.json").read_text())
    giochi = sum(len(v) for v in d["libraries"].values())
except Exception:
    pass
try:
    import vdf
    p = next((pathlib.Path.home() / ".steam/steam/userdata").glob("*/config/shortcuts.vdf"))
    sc = vdf.binary_load(open(p, "rb")).get("shortcuts", {})
    shortcut = sum(1 for v in sc.values()
                   if "Unifideck" in str(v.get("Exe", "")))
except Exception:
    pass
try:
    registro = len(json.loads((dati / "shortcuts_registry.json").read_text()))
except Exception:
    pass
print(giochi, shortcut, registro)
PY
)
read -r GIOCHI SHORTCUT REGISTRO <<<"$letture"
[[ $GIOCHI   -ge 0 ]] && ok "giochi in cache: $GIOCHI"      || bad "cache libreria illeggibile"
[[ $SHORTCUT -ge 0 ]] && ok "shortcut Unifideck: $SHORTCUT" || bad "shortcuts.vdf illeggibile"
[[ $REGISTRO -ge 0 ]] && ok "registro: $REGISTRO voci (cresce e basta: è voluto)" \
                      || warn "registro illeggibile"

if [[ $GIOCHI -ge 0 && $SHORTCUT -ge 0 ]]; then
  scarto=$(( GIOCHI > SHORTCUT ? GIOCHI - SHORTCUT : SHORTCUT - GIOCHI ))
  [[ $scarto -le 5 ]] && ok "giochi e shortcut allineati" \
    || warn "scarto di $scarto fra giochi e shortcut — serve un riavvio di Steam?"
fi

echo "── Confronto con l'ultimo controllo ──"
if [[ -f "$STATO" ]]; then
  read -r PG PS _ < "$STATO"
  if [[ $GIOCHI -ge 0 && $PG -gt 0 ]]; then
    if (( GIOCHI * 2 < PG )); then
      bad "i giochi sono crollati da $PG a $GIOCHI — NON riavviare Steam prima di aver capito perché"
    elif (( GIOCHI < PG )); then
      warn "giochi scesi da $PG a $GIOCHI"
    else
      ok "giochi: $PG → $GIOCHI"
    fi
  fi
  if [[ $SHORTCUT -ge 0 && $PS -gt 0 ]] && (( SHORTCUT * 2 < PS )); then
    bad "gli shortcut sono crollati da $PS a $SHORTCUT"
  fi
else
  echo "  (primo controllo: nessun riferimento precedente)"
fi
[[ $GIOCHI -ge 0 ]] && echo "$GIOCHI $SHORTCUT $REGISTRO" > "$STATO"

if [[ "${1:-}" == "--test" ]]; then
  echo "── Test ──"
  if timeout 600 pnpm exec vitest run >/tmp/udk-vitest.log 2>&1; then
    ok "frontend: $(grep -oE 'Tests +[0-9]+ passed' /tmp/udk-vitest.log | tail -1)"
  else
    bad "frontend: falliti — /tmp/udk-vitest.log"
  fi
  if PYTHONPATH=py_modules timeout 900 python3 -m pytest tests/unit -q \
       >/tmp/udk-pytest.log 2>&1; then
    ok "backend: $(tail -1 /tmp/udk-pytest.log)"
  else
    # flake8 non installato fa fallire un test di tooling, non il codice
    coda=$(tail -1 /tmp/udk-pytest.log)
    if grep -q "test_lint_scope" /tmp/udk-pytest.log && \
       [[ "$(grep -c FAILED /tmp/udk-pytest.log)" == "1" ]]; then
      warn "backend: $coda (solo flake8 mancante, ambientale)"
    else
      bad "backend: $coda — /tmp/udk-pytest.log"
    fi
  fi
fi

echo
if [[ $problemi -gt 0 ]]; then
  printf "\033[31m%d problema/i\033[0m, %d avviso/i\n" "$problemi" "$avvisi"; exit 1
elif [[ $avvisi -gt 0 ]]; then
  printf "\033[33mTutto in ordine, con %d avviso/i\033[0m\n" "$avvisi"; exit 0
else
  printf "\033[32mTutto in ordine\033[0m\n"; exit 0
fi
