# ADR 0017 — Surface policy: `managed` is the stable default

> Status: **Accepted**.
> Date: 2026-08-26.

## Decision

MCP-Vertex defaults to `managed` when neither CLI nor config selects a
surface. The server keeps the complete catalog internally, publishes only the
small bootstrap surface, and routes hidden tools through `vertex` without
requiring `tools/list_changed`.

`native` remains the explicit compatibility and diagnostic mode. `adaptive`
and `compact` remain explicit compatibility modes; their semantics are not
used as an implicit client negotiation.

The operator-facing Startup Report is emitted independently on stderr and
distinguishes the complete available catalog from the exposed MCP surface.

## Consequences

- Ordinary MCP clients no longer pay the full tool-schema tax at startup.
- Clients that do not refresh `tools/list` remain functional through the
  stable router.
- Hosts that require every tool in the initial list must opt into
  `--surface=native` or set `surfaceMode: "native"`.
- Budget artifacts may still use `native` as their comparable full-surface
  baseline, but must label that as a measurement surface rather than the
  runtime mode.

## Migration

Existing `surfaceMode: "native"` configurations remain unchanged. Existing
`adaptive` and `compact` configurations remain explicit. The legacy
`extended` surface alias continues to normalize to `adaptive`.
