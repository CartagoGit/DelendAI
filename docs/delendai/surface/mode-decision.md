# Surface mode policy

The effective mode stays stable during the session and does not depend on the
client announcing or honoring `notifications/tools/list_changed`.

Current rules:

- Without an explicit override, the mode is `managed`.
- `managed` publishes only the bootstrap surface and routes the rest
  internally through `vertex`.
- `native`, `adaptive`, and `compact` remain as explicit overrides for
  compatibility, measurement, or hosts that need a different surface.

Explicit overrides:

- CLI: `--surface=managed|native|adaptive|compact` has the highest precedence.
- Config: `delendai.config.json.surfaceMode` applies when the CLI did not set the mode.

Client capabilities are kept in the decision API for compatibility,
but do not silently change the effective mode.
