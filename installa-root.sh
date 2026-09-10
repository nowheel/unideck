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

echo "→ Riavvio di decky-loader"
systemctl restart decky-loader@deck.service

echo "$BACKUP" > /tmp/unifideck-ultimo-backup.txt
echo "→ Backup registrato in /tmp/unifideck-ultimo-backup.txt"
