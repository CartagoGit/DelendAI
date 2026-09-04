# Checkpoint advisories

Host-agnostic quality + compute protection. Plugins compose existing
signals (session hygiene, memory checkpoint freshness, round context,
loop detection, slice acceptance) into one structured
`checkpointAdvisory` envelope. Core injects it into the result `_meta`
(never `structuredContent`, which MCP clients validate against the
tool's `outputSchema`) when `triggered: true`. Compliant agents surface
the message verbatim.

User-facing recommendations always begin with:

> **At this point, I recommend ...**

## Codes

| Code | Typical severity | nextAction |
|---|---|---|
| `SESSION_TOO_LONG` | recommend (strong if several hygiene reasons) | `checkpoint-and-fresh-session` or `checkpoint-and-compact` |
| `STALE_CHECKPOINT` | recommend | `create-semantic-checkpoint` |
| `REQUIREMENTS_NOT_CONSOLIDATED` | recommend / strong | `consolidate-requirements` |
| `MICRO_VALIDATION_LOOP` | recommend | `finish-slice-before-validating` |
| `CONTEXT_DRIFT` | strong (interactive) | `handoff-to-fresh-agent` |
| `STALE_ACCEPTANCE` | recommend on commit, **block** on push | `validate-before-push` |

Severity `block` is reserved for objectively invalid transitions (stale
required acceptance before push). Session age never hard-blocks work.

## Server-observed vs agent-enforced

- **Server-observed:** MCP tool calls the server can see (quality,
  git_push, session hygiene from invocation metadata).
- **Agent-enforced:** host-private terminals. If you run two or more
  equivalent validation cycles without a meaningful implementation
  delta, treat it as a micro-validation loop and surface the same
  advisory yourself. delendai cannot pretend to see host-private
  commands.

## Checkpoint → fresh session → resume

```
complete/stop at a coherent boundary
        ↓
persist semantic checkpoint (memory_compact)
        ↓
persist proposal/slice state
        ↓
release unnecessary locks
        ↓
start a fresh agent/session
        ↓
orient (overview)
        ↓
resume from memory_checkpoint_packet
```

The new agent receives decisions, current state, pointers, remaining
work, next action and acceptance criteria — not a reconstructed
transcript.

## Configuration

Plugin options, not a parallel root block:

```jsonc
{
  "plugins": {
    "usage-tracking": {
      "options": {
        "sessionHygiene": {
          "enabled": true,
          "maxSessionAgeMinutes": 120,
          "maxMcpOutputTokens": 8000
        }
      }
    },
    "proposals": {
      "options": {
        "checkpointAdvisories": {
          "enabled": true,
          "microValidation": { "equivalentRunsBeforeWarning": 2 },
          "contextDrift": { "interactiveSeverity": "strong" },
          "pushGuard": { "enabled": true }
        }
      }
    }
  }
}
```

Deduplication: the same `dedupeKey` is not re-injected until the
relevant state changes.
