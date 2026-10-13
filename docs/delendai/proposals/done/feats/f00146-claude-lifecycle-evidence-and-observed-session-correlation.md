---
id: f00146
title: "Claude lifecycle evidence and observed-session correlation"
kind: feat
status: done
type: proposal
track: host-adapters+usage-tracking
date: 2026-07-24
closed-by: cartago (close pass 2026-07-24, restored 2026-07-26)
closed-evidence:
  - S1-S3 ratified — plugins/usage-tracking/src/lib/host-lifecycle.ts persists validated events
  - tools/scripts/host/record-lifecycle.script.ts is the non-blocking command-hook recorder
shipped-in:
  - dd7ba156 # capture Claude lifecycle session evidence
  - a921589d # checkpoint freshness
---

# f00146 — Claude lifecycle evidence and observed-session correlation

## Goal

Record explicit Claude lifecycle events without transcripts, expose them separately from MCP-only sessions, and correlate only when a host supplies the same session id.

## why

The existing hygiene report correctly measures only MCP activity. It cannot
distinguish a long Claude conversation from a long-lived MCP process, count
host turns, or observe compaction boundaries. Claude's command hooks expose
those boundaries without sending a tool result back into every model turn.

## non-goals

- No prompt, transcript path, response text, private context meter, or quota
  is persisted.
- No assertion that an MCP boot id is a Claude conversation id.
- No forced compaction, host shutdown, or host-specific behavior in core.

## Slices

- global_gate: validate

### S1 — Persist validated lifecycle evidence
- **Status**: done
- **Files**: `plugins/usage-tracking/src/lib/host-lifecycle.ts`, `plugins/usage-tracking/src/lib/types.ts`, `plugins/usage-tracking/tests/src/lib/host-lifecycle.spec.ts`
- **Gate**: usage-tracking tests + typecheck
- **Acceptance**: malformed NDJSON rows are ignored; valid rows contain only
  opaque id, event and timestamp; summaries report turns and compaction/end
  counts without merging them into MCP sessions.
- review-state: done
- review-implementer: copilot-minimax-m3
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Slice S1 peer-reviewed and approved by delivery_verifier; landed commits verified against the close evidence in the proposal.
### S2 — Install a non-blocking Claude command-hook recorder
- **Status**: done
- **Files**: `tools/scripts/host/record-lifecycle.script.ts`, `tools/scripts/host/record-lifecycle.script.spec.ts`, `config/external/claude/session-hygiene.hooks.json`, `config/external/claude/README.md`
- **Gate**: recorder tests + JSON validation
- **Acceptance**: documented Claude events append a redacted, mutex-guarded
  local row; malformed input or I/O failure exits cleanly and never blocks a
  host turn.
- review-state: done
- review-implementer: copilot-minimax-m3
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Slice S2 peer-reviewed and approved by delivery_verifier; landed commits verified against the close evidence in the proposal.
### S3 — Expose separate observations and literal-only correlation
- **Status**: done
- **Files**: `plugins/usage-tracking/src/lib/tools/session-hygiene.tool.ts`, `plugins/usage-tracking/src/lib/tools/index.ts`, `plugins/usage-tracking/src/index.ts`, `plugins/usage-tracking/tests/src/lib/tools.spec.ts`, `plugins/usage-tracking/src/public/index.ts`
- **Gate**: usage-tracking tests + generated tool type check
- **Acceptance**: the report labels host and MCP evidence independently, and
  sets a correlation flag only when their supplied ids are exactly equal.
- review-state: done
- review-implementer: copilot-minimax-m3
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Slice S3 peer-reviewed and approved by delivery_verifier; landed commits verified against the close evidence in the proposal.
## acceptance

- A Claude lifecycle report can state observed session duration, turns,
  compactions and end events honestly as local host-adapter evidence.
- Existing MCP-only report behavior and one-shot advisories remain unchanged.
- The normal user-turn hook adds no MCP result to Claude context.
