# `@mcp-vertex/cache`

Opt-in cache eviction plugin (f00072). Makes the shared
`.cache/mcp-vertex/` root self-cleaning by declaring eviction as
**data** — a set of TTL / keep-last rules contributed to the core
eviction registry — and exposing a single tool to preview or apply the
sweep. **No network, no secrets.**

## Activate

```bash
mcp-vertex --plugins=cache
```

Hosts that never load it keep the current grow-forever behaviour.

## Tools

### `cache_gc { dryRun?, onlyOwner? }`

Run the eviction registry over `.cache/mcp-vertex`.

- `dryRun: true` (default) — return a report of what **would** be
  removed; delete nothing.
- `dryRun: false` — actually delete and shrink the cache. Idempotent:
  a second apply is a no-op.
- `onlyOwner: "logs"` — scope the run to a single contributing plugin
  (`cache`, `logs`, `memory`, `notification`, …).

The report lists `removed` (id, path, bytes), `skipped`, `errors`,
`totalBytes` and `rulesEvaluated`.

## Built-in static rules

| id | path | strategy |
|---|---|---|
| `drift-snapshots` | `drift/*` | `olderThanDays: 14` |
| `bootstrap-snapshots` | `bootstrap/*` | `olderThanDays: 14` |
| `verify-snapshots` | `verify/*` | `olderThanDays: 7` |
| `s3-driver-snapshots` | `s3-driver/*` | `olderThanDays: 7` |
| `s4-s5-driver-snapshots` | `s4-s5-driver/*` | `olderThanDays: 7` |
| `rules-snapshots` | `rules/*` | `olderThanDays: 30` |
| `state-journal-roll` | `state` | `keepLastN: 5` |
| `cache-worktrees-orphans` | `.worktrees` | `keepLastN: 3` |

Every `olderThanDays` lifetime is capped at `maxAgeDays` (default 30)
so a host can **shorten** (never silently lengthen) the defaults.

## Boot sweep

The core runs the registry once on boot. Posture is governed by
`config.cache.runOnBoot` in `mcp-vertex.config.json`:

- `'dry-run'` (default) — log the report, delete nothing.
- `'apply'` — delete on boot (only when this plugin is loaded).
- `'off'` — skip the boot sweep entirely.

## Configuration

```jsonc
{
  "cache": { "runOnBoot": "dry-run", "maxAgeDays": 30 },
  "plugins": {
    "cache": {
      "options": {
        "maxAgeDays": 14,
        "worktrees": { "enabled": true, "keepLastN": 3 }
      }
    }
  }
}
```
