**Title:** The config schema rejects the `steam` section the plugin itself writes, so it boots in degraded mode every time

---

### Summary

`steam/current_user.py` writes and reads `steam.active_user`. The schema at `config/schema.json` uses `additionalProperties: false` at the root and does not declare a `steam` section. The plugin therefore invalidates its own config on every boot:

```
[Unifideck] config validation FAILED — starting in degraded mode.
1 error(s). First: : Additional properties are not allowed ('steam' was unexpected)
[SecurityService] config validation failed: 1 error(s), first at  (source=user_overrides)
```

This affects any install where an active Steam account has been recorded — i.e. any normal install, since the plugin writes the key itself.

Version: `0.7.3`.

### Steps to reproduce

1. Use the plugin normally until it persists the active user (`[AccountSwitch] Saved current user <id> to settings`), which writes `steam.active_user` into `~/.config/unifideck/config.json`.
2. Restart Decky.
3. Read `~/.local/var/opt/decky-loader/logs/Unifideck/<latest>.log`.

### Expected vs actual

**Expected:** a key the plugin writes itself validates against its own schema.

**Actual:** validation fails and the plugin starts degraded, on every boot, for a config it authored.

### Why it happens

`steam/current_user.py`:

```python
CONFIG_ACTIVE_USER_KEY = "steam.active_user"
```

and it explicitly supports the nested form when reading:

```python
    # Support both nested ({"steam": {"active_user": ...}}) and flat keys.
    steam = data.get("steam")
    if isinstance(steam, dict) and steam.get("active_user"):
        return str(steam["active_user"])
```

The schema's `properties` lists 24 sections; `steam` is not among them, and the root is strict. The schema's own description says *"To add a new config key, add it both to the backend code AND to this schema"* — this is one that was added to the code only.

### Proposed fix

One section, inserted alphabetically before `"sync"` in `properties`:

```json
    "steam": {
      "type": "object",
      "additionalProperties": false,
      "description": "Steam account binding, written by steam/current_user.py (CONFIG_ACTIVE_USER_KEY).",
      "properties": {
        "active_user": {
          "type": "string",
          "description": "Authoritative Steam account id (32-bit, as text)."
        }
      }
    },
```

Verified by validating the merged config (shipped `defaults/config.json` deep-merged with the user overrides) against both schemas:

| Schema | Errors on merged config |
| --- | --- |
| current | 1 — `'steam' was unexpected` |
| with the section above | 0 |

After installing it, the log reads `config validation OK (19 section(s) validated)`.

### Small aside

The root `description` says "24 top-level sections" and enumerates them, but `properties` already contains **26** — so that count was drifting before this. If you take the fix above it becomes 27, and the list is probably worth regenerating rather than hand-editing.
