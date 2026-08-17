#!/usr/bin/env bash
#
# Riapplica le nostre modifiche sopra una versione di Unifideck presa
# da monte, ricompila, e ti lascia installare.
#
# Serve dopo aver accettato un aggiornamento del plugin: Decky
# sovrascrive la cartella, e il nostro lavoro con lei.
#
# Il metodo è un rebase vero, non una patch applicata alla cieca. Si
# costruisce un repo con tre commit che condividono un antenato:
#
#     base   = la versione di monte da cui siamo partiti
#      ├── monte = la versione nuova di monte
#      └── mio   = base + le nostre modifiche
#
# e si fa `git rebase monte` su `mio`. Così git ha entrambe le versioni
# di ogni file più l'antenato comune, e può fondere davvero invece di
# indovinare. Dove non ce la fa lascia i marcatori di conflitto normali,
# che si risolvono come qualsiasi altro conflitto.
#
# Uso:   ./riapplica.sh [Release-0.8.0]
#        senza argomenti usa l'ultima release pubblicata.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_TAG="$(cat "$REPO/.base-upstream" 2>/dev/null || echo Release-0.7.3)"
WORK=/tmp/unifideck-riapplica
UPSTREAM=https://github.com/mubaraknumann/unifideck.git

# I percorsi che consideriamo nostri. Tutto il resto viene da monte.
NOSTRI=(src py_modules/unifideck/config/schema.json)

G="git -c user.email=unifideck@local -c user.name=riapplica"

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
  echo "→ Installa con:  sudo bash \"$REPO/installa-root.sh\" \"$REPO/dist\""
  exit 0
fi

rm -rf "$WORK"; mkdir -p "$WORK"
echo "→ Clono $BASE_TAG e $NEW_TAG"
git clone -q --depth 1 --branch "$BASE_TAG" "$UPSTREAM" "$WORK/src-base"
git clone -q --depth 1 --branch "$NEW_TAG"  "$UPSTREAM" "$WORK/src-nuovo"
rm -rf "$WORK/src-base/.git" "$WORK/src-nuovo/.git"

# Sostituisce il contenuto dell'albero di lavoro con quello di $1.
riempi() {
  find "$WORK/repo" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  cp -a "$1"/. "$WORK/repo"/
}

mkdir -p "$WORK/repo"; cd "$WORK/repo"; git init -q

echo "→ Commit 'base' ($BASE_TAG)"
riempi "$WORK/src-base"; git add -A; $G commit -qm "base: $BASE_TAG"

echo "→ Ramo 'monte' ($NEW_TAG)"
$G checkout -q -b monte
riempi "$WORK/src-nuovo"; git add -A; $G commit -qm "monte: $NEW_TAG"

echo "→ Ramo 'mio' (le nostre modifiche sopra $BASE_TAG)"
$G checkout -q -b mio master 2>/dev/null || $G checkout -q -b mio HEAD~1
for d in "${NOSTRI[@]}"; do
  [[ -e "$REPO/$d" ]] || continue
  rm -rf "${WORK:?}/repo/$d"
  mkdir -p "$(dirname "$WORK/repo/$d")"
  cp -a "$REPO/$d" "$WORK/repo/$d"
done
git add -A; $G commit -qm "mie modifiche"

echo "→ Rebase delle nostre modifiche su $NEW_TAG"
if ! $G rebase monte; then
  echo
  echo "FERMO: conflitti fra le nostre modifiche e $NEW_TAG." >&2
  echo >&2
  git diff --name-only --diff-filter=U | sed 's/^/    /' >&2
  echo >&2
  echo "Risolvili in $WORK/repo, poi:" >&2
  echo "    git add -A && git rebase --continue" >&2
  echo "    pnpm install --ignore-scripts && pnpm run build" >&2
  echo "    sudo bash \"$REPO/installa-root.sh\" \"$WORK/repo/dist\"" >&2
  echo >&2
  echo "E riporta i file risolti in $REPO prima di aggiornare .base-upstream." >&2
  exit 1
fi

echo "→ Fusione pulita. Compilo."
pnpm install --ignore-scripts
pnpm run typecheck
pnpm run build

cat <<EOF

Fatto: $WORK/repo/dist

Installa con:
    sudo bash "$REPO/installa-root.sh" "$WORK/repo/dist"

Quando sei soddisfatto, riporta i sorgenti fusi in questo repo e sposta
la base in avanti:
    cp -a $WORK/repo/src "$REPO/"
    echo "$NEW_TAG" > "$REPO/.base-upstream"
EOF
