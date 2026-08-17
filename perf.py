#!/usr/bin/env python3
"""Measure frame pacing while the catalogue grid scrolls.

Drives a scroll from inside the page and samples `requestAnimationFrame`
deltas, which is what the user actually perceives. Reports the frame
budget at 60 Hz (16.7 ms) and how often it is missed.
"""
import asyncio
import json
import sys

sys.path.insert(0, "/home/deck/.local/var/opt/decky-loader/plugins/Unifideck/py_modules")
from cdp import Session, connect, find  # noqa: E402

MEASURE = """
(() => new Promise((resolve) => {
  let grid = null;
  for (const d of document.querySelectorAll("div"))
    if (d.style?.gridTemplateColumns?.includes("112px")) { grid = d; break; }
  if (!grid) return resolve({ error: "griglia non trovata" });
  let host = grid.parentElement;
  while (host && host.scrollHeight <= host.clientHeight + 2) host = host.parentElement;
  if (!host) return resolve({ error: "contenitore di scorrimento non trovato" });

  const deltas = [];
  let last = performance.now();
  let top = 0;
  const maxTop = host.scrollHeight - host.clientHeight;
  const step = Math.max(4, Math.round(maxTop / 110));

  function frame(now) {
    deltas.push(now - last);
    last = now;
    top = Math.min(top + step, maxTop);
    host.scrollTop = top;
    if (deltas.length < 130) requestAnimationFrame(frame);
    else {
      const d = deltas.slice(6).sort((a, b) => a - b);   // scarta l'avvio
      const at = (p) => d[Math.min(d.length - 1, Math.floor(d.length * p))];
      resolve({
        campioni: d.length,
        mediana: +at(0.5).toFixed(1),
        p95: +at(0.95).toFixed(1),
        peggiore: +d[d.length - 1].toFixed(1),
        oltre_i_16_7ms: d.filter((x) => x > 16.7).length,
        oltre_i_33ms: d.filter((x) => x > 33).length,
        scorrimento: Math.round(host.scrollTop) + "/" + Math.round(maxTop),
      });
    }
  }
  requestAnimationFrame(frame);
}))()
"""


async def main():
    target = find("Big Picture")
    async with await connect(target) as ws:
        s = Session(ws)
        await s.send("Runtime.enable")
        res = await s.send(
            "Runtime.evaluate", expression=MEASURE,
            returnByValue=True, awaitPromise=True,
        )
        print(json.dumps(res["result"]["value"], indent=1, ensure_ascii=False))


asyncio.run(main())
