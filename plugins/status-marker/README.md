# @mcp-vertex/status-marker

**Mandatory coloured close marker** for any agent. Provides the canonical
8-state table that every agent response must end with, plus the
`close` / `validate` MCP tools that produce and audit the closing line.

Designed for [`@mcp-vertex/core`](../../docs/README-MCP-VERTEX.md).

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
- Plugin guide: [`docs/PLUGINS-MCP-VERTEX.md`](../../docs/PLUGINS-MCP-VERTEX.md).

BSD-3-Clause © Cartago