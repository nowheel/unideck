---
tags: [metodo, reverse-engineering]
---

# Ricostruire i sorgenti da un sourcemap

Sulla Deck non esisteva un repository sorgente per [[Unifideck]], solo il
bundle compilato. `dist/index.js.map` contiene `sourcesContent`: i sorgenti
originali, per intero, se il build li ha inclusi.

```python
import json, pathlib
m = json.load(open("index.js.map"))
for src, content in zip(m["sources"], m["sourcesContent"]):
    if "node_modules" in src or content is None: continue
    rel = src.split("/plugin/Unifideck/", 1)[-1]
    p = pathlib.Path(OUT) / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)
```

122 file recuperati così.

## La verifica che rende il lavoro fidabile

Ricostruire non basta: bisogna dimostrare che la ricostruzione sia corretta.
Clonato il tag di monte corrispondente (`Release-0.7.3`), confrontato con
`diff -rq` per isolare le modifiche locali, poi **ricompilata** l'unione e
confrontato l'hash del bundle:

```
sha256(bundle ricompilato) == sha256(bundle installato)   # 474c9157…
```

Identico byte per byte. Da quel momento ogni modifica successiva è partita
da una base **verificata**, non presunta.

## Perché conta

Senza questo passaggio, ogni ipotesi su "cosa fa il codice installato"
sarebbe stata una supposizione. Con questo passaggio, è un fatto dimostrato
una volta e mai più rimesso in discussione.
