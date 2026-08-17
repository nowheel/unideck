#!/usr/bin/env python3
"""Minimal CDP client for Steam's CEF debugger.

Steam runs its UI in Chromium with the DevTools protocol on :8080, so
the plugin page can be inspected and photographed from outside the
Gaming Mode session. `websockets` is not in the system interpreter but
is vendored by the plugin, so its py_modules directory is borrowed.
"""
import asyncio
import base64
import json
import sys
import urllib.request

sys.path.insert(
    0, "/home/deck/.local/var/opt/decky-loader/plugins/Unifideck/py_modules"
)
import websockets  # noqa: E402

DEBUGGER = "http://localhost:8080"


def targets():
    with urllib.request.urlopen(f"{DEBUGGER}/json/list", timeout=10) as r:
        return json.load(r)


def find(title_contains):
    for t in targets():
        if title_contains.lower() in t.get("title", "").lower():
            return t
    raise SystemExit(f"target non trovato: {title_contains}")


class Session:
    def __init__(self, ws):
        self.ws = ws
        self.n = 0

    async def send(self, method, **params):
        self.n += 1
        await self.ws.send(
            json.dumps({"id": self.n, "method": method, "params": params})
        )
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get("id") == self.n:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})


async def connect(target):
    return await websockets.connect(
        target["webSocketDebuggerUrl"], max_size=200 * 1024 * 1024
    )


async def screenshot(target, out_path):
    async with await connect(target) as ws:
        s = Session(ws)
        await s.send("Page.enable")
        res = await s.send("Page.captureScreenshot", format="png",
                           captureBeyondViewport=False)
        data = base64.b64decode(res["data"])
        with open(out_path, "wb") as f:
            f.write(data)
        return len(data)


async def evaluate(target, expression):
    async with await connect(target) as ws:
        s = Session(ws)
        await s.send("Runtime.enable")
        res = await s.send(
            "Runtime.evaluate",
            expression=expression,
            returnByValue=True,
            awaitPromise=True,
        )
        return res.get("result", {}).get("value")


def main():
    cmd = sys.argv[1]
    if cmd == "list":
        for t in targets():
            print(f"{t['type']:8} | {t['title'][:50]:50} | {t['url'][:70]}")
    elif cmd == "shot":
        t = find(sys.argv[2])
        n = asyncio.run(screenshot(t, sys.argv[3]))
        print(f"{sys.argv[3]} ({n} byte) da «{t['title']}»")
    elif cmd == "eval":
        t = find(sys.argv[2])
        print(json.dumps(asyncio.run(evaluate(t, sys.argv[3])),
                         ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
