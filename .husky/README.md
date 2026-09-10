# Git Hooks

Questi hook automatizzano i controlli di qualità prima di commitare e pushare.

## Pre-commit Hook

Eseguito prima di ogni `git commit`:
- ✅ TypeScript type-checking
- ✅ ESLint
- ✅ Build (webpack)

Se uno di questi fallisce, il commit è bloccato.

**Bypass (sconsigliato):**
```bash
git commit --no-verify
```

## Pre-push Hook

Eseguito prima di ogni `git push`:
- ✅ Test suite (367 test)

Se i test falliscono, il push è bloccato.

**Bypass (sconsigliato):**
```bash
git push --no-verify
```

## Disabilitare i Hook

```bash
# Tutti
rm -r .husky

# Solo uno
rm .husky/pre-commit
```

## Reinstallare Husky

```bash
pnpm install husky --save-dev
pnpm exec husky install
```
