#!/bin/bash
# Backend test runner — esegue test Python se pytest disponibile

echo "🧪 Verifica Backend Python"
echo ""

if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 non disponibile"
    exit 1
fi

if ! python3 -m pytest --version &> /dev/null; then
    echo "⚠️  pytest non installato"
    echo ""
    echo "Installa con:"
    echo "  pip install pytest"
    exit 1
fi

echo "✅ pytest trovato"
echo ""

# Verifica rsync (richiesto per alcuni test)
if ! command -v rsync &> /dev/null; then
    echo "⚠️  rsync non installato — ~21 test falliranno"
    echo "   Installa con: apt-get install rsync"
    echo ""
fi

echo "🚀 Esecuzione test backend..."
echo ""

PYTHONPATH=py_modules python3 -m pytest tests/unit -q \
    --tb=short \
    --disable-warnings

exit $?
