#!/usr/bin/env bash
# Parte privilegiata dell'installazione. Eseguita come root con una
# sola autenticazione. Non contiene credenziali.
set -euo pipefail

SRC="/tmp/claude-1000/-home-deck/1e449fb4-8ad3-4b78-aa7a-c256106a3d66/scratchpad/work/dist"
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

echo "→ Riavvio di decky-loader"
systemctl restart decky-loader@deck.service

echo "$BACKUP" > /tmp/unifideck-ultimo-backup.txt
echo "→ Backup registrato in /tmp/unifideck-ultimo-backup.txt"
