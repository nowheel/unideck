#!/usr/bin/env bash
#
# Riapplica le nostre modifiche sopra una versione di Unifideck presa
# da monte, ricompila e installa.
#
# Serve dopo aver accettato un aggiornamento del plugin, che sovrascrive
# la cartella in decky-loader e quindi anche il nostro lavoro.
#
# Il metodo: si clona la versione di monte da cui siamo partiti, si
# calcola la differenza fra quella e questo repo, e la si applica sopra
# la versione nuova. Se monte ha toccato gli stessi file la fusione può
# fallire: in quel caso lo script si ferma e lascia l'albero in
# /tmp/unifideck-riapplica/nuovo perché tu risolva a mano, invece di
# installare qualcosa a metà.
#
# Uso:   ./riapplica.sh [Release-0.8.0]
#        senza argomenti usa l'ultima release pubblicata.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_TAG="$(cat "$REPO/.base-upstream" 2>/dev/null || echo Release-0.7.3)"
WORK=/tmp/unifideck-riapplica
UPSTREAM=https://github.com/mubaraknumann/unifideck.git

NEW_TAG="${1:-}"
if [[ -z "$NEW_TAG" ]]; then
  echo "→ Cerco l'ultima release di monte"
  NEW_TAG=$(curl -s https://api.github.com/repos/mubaraknumann/unifideck/releases/latest \
            | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')
fi
echo "→ Base: $BASE_TAG   Nuova: $NEW_TAG"

if [[ "$BASE_TAG" == "$NEW_TAG" ]]; then
  echo "→ Stessa versione: basta ricompilare questo repo."
  cd "$REPO" && pnpm install --ignore-scripts && pnpm run build
  exec sudo bash "$REPO/installa-root.sh"
fi

rm -rf "$WORK"; mkdir -p "$WORK"
echo "→ Clono $BASE_TAG e $NEW_TAG"
git clone -q --depth 1 --branch "$BASE_TAG" "$UPSTREAM" "$WORK/base"
git clone -q --depth 1 --branch "$NEW_TAG"  "$UPSTREAM" "$WORK/nuovo"
rm -rf "$WORK/base/.git" "$WORK/nuovo/.git"

# La nostra differenza rispetto alla base di monte, limitata a ciò che
# tocchiamo davvero: i sorgenti del frontend, le traduzioni, lo schema.
echo "→ Calcolo le nostre modifiche rispetto a $BASE_TAG"
( cd "$WORK/base" && git init -q && git add -A \
    && git -c user.email=x@y -c user.name=x commit -qm base )
for d in src py_modules/unifideck/config/schema.json; do
  [[ -e "$REPO/$d" ]] || continue
  rm -rf "$WORK/base/$d"
  mkdir -p "$(dirname "$WORK/base/$d")"
  cp -a "$REPO/$d" "$WORK/base/$d"
done
( cd "$WORK/base" && git add -A && git diff --cached --binary > "$WORK/nostre-modifiche.patch" )
echo "→ Patch: $(wc -l < "$WORK/nostre-modifiche.patch") righe"

echo "→ Applico sopra $NEW_TAG"
if ! ( cd "$WORK/nuovo" && git init -q && git add -A \
       && git -c user.email=x@y -c user.name=x commit -qm nuovo \
       && git apply --3way "$WORK/nostre-modifiche.patch" ); then
  echo
  echo "FERMO: la patch non si applica pulita su $NEW_TAG." >&2
  echo "Monte ha toccato gli stessi file. Risolvi in $WORK/nuovo," >&2
  echo "poi lancia lì:  pnpm install --ignore-scripts && pnpm run build" >&2
  echo "e infine:       sudo bash $REPO/installa-root.sh" >&2
  exit 1
fi

echo "→ Compilo"
cd "$WORK/nuovo"
pnpm install --ignore-scripts
pnpm run typecheck
pnpm run build

cat <<EOF

Compilato in $WORK/nuovo/dist.
Controlla il risultato, poi installa con:

  sudo bash "$REPO/installa-root.sh" "$WORK/nuovo/dist"

E quando sei soddisfatto, porta le modifiche in questo repo e aggiorna
la base:  echo "$NEW_TAG" > "$REPO/.base-upstream"
EOF
