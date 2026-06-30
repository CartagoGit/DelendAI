# @mcp-vertex/status-marker

**Mandatory coloured close marker** for any agent. Provides the canonical
8-state table that every agent response must end with, plus the
`close` / `validate` MCP tools that produce and audit the closing line.

Designed for [`@mcp-vertex/core`](../../docs/mcp-vertex/README-MCP-VERTEX.md).

## The 8 states

| Emoji | State | Reason required | Meaning |
|-------|-------|-----------------|---------|
| 🟩 | `HECHO` | optional | Proposal closed and reviewed. |
| 🟨 | `CAP` | **yes** | Turn exhausted; checkpoint + relauncher left. |
| 🟧 | `RE-PIVOT` | **yes** | The cascade changed direction; the loop stays active. |
| 🟦 | `CHECKPOINT-REQUIRED` | **yes** | Handoff to the orchestrator. |
| 🟫 | `REPAIR-NEEDED` | **yes** | The verifier asked for bounded repair. |
| 🟥 | `BLOQUEADO` | **yes** | Hard blocker; human intervention required. |
| 🟪 | `SIN PROPUESTAS LIBRES` | optional | Catalog has `in_progress` but all are taken. |
| ⬜ | `SIN PROPUESTA DE NINGUN TIPO` | optional | Catalog is empty of executables. |

## Format rules

- The closing line is `<marker>` alone, or `<marker> — <short-reason>`.
- Separator between marker and reason: ` — ` (U+2014 with surrounding spaces).
- The full line ≤ **120 chars** (helper truncates with `…` when needed).
- If a state that requires a reason is rendered without one, the helper
  appends literal `<reason-missing>` and the convention is broken.

## Enable

```jsonc
{
	"servers": {
		"mcp-vertex": {
			"command": "bunx",
			"args": ["@mcp-vertex/core", "--plugins=status-marker"]
		}
	}
}
```

## Tools

| Tool | Purpose |
|---|---|
| `<prefix>_close` | Returns the exact closing line for `state` (+ optional `reason`). |
| `<prefix>_validate` | Audits a block of text; reports whether the last line is a valid close. |
| `<prefix>_ping` | Health check for the plugin. |

Prefix defaults to `status-marker`; override via `mcp-vertex.config.json`:

```jsonc
{ "plugins": { "status-marker": { "prefix": "close" } } }
```

## Extend the marker set (no fork)

A host can add, disable, or override close-markers from
`mcp-vertex.config.json` — without forking the plugin (proposal `f00071`).
The block lives under `plugins.status-marker.options.markers` and has three
disjoint fields:

```jsonc
{
	"plugins": {
		"status-marker": {
			"options": {
				"markers": {
					"add": [
						{
							"id": "REVIEW",
							"emoji": "🔷",
							"requiresReason": true,
							"locales": { "es": "REVISIÓN", "en": "REVIEW" },
							"instruction": "Close after a successful code review pass."
						}
					],
					"disable": ["SIN PROPUESTA DE NINGUN TIPO"],
					"override": {
						"BLOQUEADO": {
							"instruction": "Use when an external dependency (CI, registry, vault) blocks the slice."
						}
					}
				}
			}
		}
	}
}
```

Merge rules:

- **`add`** appends new states at the end of the iteration order. Both `id`
  (`UPPER_SNAKE_CASE`) and `emoji` must be unique across the merged table —
  a collision with a built-in is rejected at boot.
- **`disable`** removes a built-in state. `HECHO` is the floor and is **not**
  disablable; disabling an unknown id is rejected.
- **`override`** patches a built-in's `instruction`, per-locale `locales`, or
  `requiresReason`. The `emoji` is **never** overridable (it is part of the
  wire contract with consumers that match by emoji).

A user state that omits a locale falls back to its `id` for that locale
(matching the built-in `es` behaviour). Host-declared markers surface on
`<prefix>_ping` under `markers.userDefined`, including their `instruction`,
so the agent's in-context skill learns when to emit them.

The `bun run lint:user-markers` CI check (part of `bun run validate`)
verifies the declared markers collide cleanly with the built-ins.

## Programmatic reuse

```typescript
import {
	MARKERS,
	formatCloseMarker,
	validateCloseMarker,
	type CloseMarker,
} from '@mcp-vertex/status-marker/public';

const line = formatCloseMarker('CAP', 'slice cerrada, validación pendiente');
const audit = validateCloseMarker(line);
```

## See also

- Proposal [`l104`](../../docs/mcp-vertex/proposals/l104-feat-status-marker-plugin-de-cierre-obligatorio-coloreado.md).
- Proposal [`f00071`](../../docs/mcp-vertex/proposals/ready/f00071-status-marker-user-configurable-set.md) — user-configurable marker set.
- Plugin guide: [`docs/mcp-vertex/PLUGINS-MCP-VERTEX.md`](../../docs/mcp-vertex/PLUGINS-MCP-VERTEX.md).

BSD-3-Clause © Cartago