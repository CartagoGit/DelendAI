# ADR 0016 — Surface policy: `adaptive` was the default for ordinary MCP clients

> Status: **Superseded by ADR 0017**.
> Date: 2026-08-25.
> Authors: q00005 orchestration.

## Context

The MCP standard places `tools.listChanged` on the **server**
capabilities (the server declares it; clients learn that the tool
list may change). It does **not** define a client-side capability to
negotiate how the client reacts to that notification.

`r00019` (q00004) introduced a private client capability
`delendai/surface` that, when declared by a host, opted the host
into the smaller `adaptive` surface. Hosts that did **not** declare it
landed on the larger `native` surface.

The third external audit (TOK-004) points out that:

1. No mainstream MCP host (Claude Code, Cursor, VS Code Copilot Chat,
   Aider, Codex, MCP Inspector) declares `delendai/surface`.
2. Hosts that do declare it are Vertex-aware tooling that explicitly
   negotiates the smaller surface.
3. Therefore, under the old policy, **every ordinary MCP client was
   getting `native` by default** — the opposite of what the token
   dashboard measures against.
4. The MCP spec does not define a client-side capability for
   `list_changed` handling, so any spec-compliant client is already
   expected to tolerate it.

`r00026` (commit `58ef6288`) flipped the default to `adaptive`; that
decision is retained here as historical context. ADR 0017 later moved the
default to `managed`, which provides the same stable bootstrap intent without
making the session depend on dynamic `tools/list` refreshes.

This ADR codifies that decision and addresses the
"never-refreshing-client" risk that TOK-004 also flagged.

## Historical decision

The surface mode negotiated by `decideSurfaceModeFromCapabilities()`
follows this priority:

1. **`explicitMode` argument** (highest) — caller passed
   `explicitMode: 'native'` or `'adaptive'`. Always wins. Used by
   `gen-capabilities.ts` and the e2e harnesses that need full /
   bootstrap surfaces regardless of client.
2. **`delendai/surface` capability declared by client** — if
   present, the declared value (`adaptive` or `native`) is used. This
   is the private opt-in path.
3. **Default for plain clients** — `adaptive`. The reasoning:
   - `adaptive` is materially cheaper in cold-start bytes.
   - `native` is no safer; it just ships more tool metadata.
   - The MCP spec already requires clients to tolerate
     `tools/list_changed`; there is no spec-defined reason to give a
     plain client `native` automatically.
4. **Reason string** — the result always carries a `reason` so
   observability tools can see why a particular mode was chosen.

The risk addressed by TOK-004 — *"a client that never re-fetches
`tools/list` after the notification is stranded"* — is mitigated by
the bootstrap set: even on `adaptive`, the bootstrap tools
(`delendai_overview`, `delendai_tool_search`,
`delendai_tool_activate`, `delendai_tool_deactivate`,
`delendai_compact_router`, `delendai_status`) are always present. The
new e2e test *"a client that never refreshes tools/list can still
reach an activated tool via the vertex router"* (in
`packages/core/tests/src/lib/e2e/tool-surface.e2e.spec.ts`) proves
this end-to-end.

## Alternatives considered

- **Keep `native` as the default and require clients to opt-in to
  `adaptive`.** Rejected: every ordinary client pays the full cost
  even though none asked for it. The audit's TOK-004 framing is
  unambiguous: this was the wrong default.
- **Add a new private capability `delendai/surface/auto` that
  detects the host and decides.** Rejected: introduces a third path;
  complicates the matrix. Two explicit surfaces plus a documented
  default is simpler.
- **Force all clients to receive `adaptive`, removing the opt-in to
  `native` entirely.** Rejected: some hosts (CI bots, batch
  processors) genuinely want every tool pre-listed; `native` is a
  documented compatibility path.

## Consequences

- The token dashboard's "real preset" measurement now reflects
  actual host behaviour (almost every host now measures against
  `adaptive`, not `native`).
- The bootstrap set stays intact: a never-refreshing client can
  still reach any activated tool via `delendai_compact_router`.
- A new private capability declaration (`delendai/surface:
  'native'`) is still respected — `native` is opt-in, not removed.
- The `host-compatibility-matrix.md` (sibling of this ADR) lists
  every known host's default + override.

## References

- `r00019` (q00004) — initial surface policy (private opt-in to adaptive)
- `r00026` (commit `58ef6288`) — flip default to `adaptive` for plain clients
- `c00019` — proposal that produced this ADR
- `c00018` — `develop nunca rojo` (integration design)
- TOK-004 in `docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md`
