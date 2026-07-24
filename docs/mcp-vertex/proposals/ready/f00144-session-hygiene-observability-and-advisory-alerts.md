---
id: f00144
title: "Session hygiene observability and advisory alerts"
kind: feat
status: ready
type: proposal
track: usage-tracking+memory+notification
date: 2026-07-24
---

# f00144 — Session hygiene observability and advisory alerts

## Goal

Turn local MCP activity into an honest per-session hygiene signal with bounded advisory alerts, without claiming access to host-private context or quota.

## why

The usage log already carries an MCP-run identifier, timestamps and tool
metadata, while the core independently measures response bytes. Neither is
currently exposed as an honest session-level signal. Agents therefore receive
only prose guidance and can drift into long, idle or output-heavy sessions
without a factual checkpoint prompt.

## non-goals

- No claim that MCP activity equals the host conversation, host context, or
  subscription quota.
- No automatic compaction, process termination, or destructive state change.
- No dependency from `memory` to `usage-tracking`; both plugins remain useful
  independently.

## Slices

- global_gate: validate

### S1 — Persist local response-volume evidence
- **Status**: pending
- **Files**: `plugins/usage-tracking/src/lib/types.ts`, `plugins/usage-tracking/src/lib/record.ts`, `plugins/usage-tracking/src/index.ts`, `plugins/usage-tracking/tests/src/lib/record.spec.ts`
- **Gate**: usage-tracking tests
- **Acceptance**: each new metadata-only row includes response bytes; old rows
  remain readable as zero.

### S2 — Pure session-hygiene analysis and report
- **Status**: pending
- **Files**: `plugins/usage-tracking/src/lib/session-hygiene.ts`, `plugins/usage-tracking/src/lib/tools/session-hygiene.tool.ts`, `plugins/usage-tracking/src/lib/tools/index.ts`, `plugins/usage-tracking/src/public/index.ts`, `plugins/usage-tracking/tests/src/lib/session-hygiene.spec.ts`, `plugins/usage-tracking/tests/src/lib/tools.spec.ts`
- **Gate**: usage-tracking tests
- **Acceptance**: the report exposes observed MCP age, largest observed idle
  gap, estimated MCP-output tokens and explicit evidence boundaries.

### S3 — One-shot advisory logging
- **Status**: pending
- **Files**: `plugins/usage-tracking/src/index.ts`, `plugins/usage-tracking/src/lib/session-hygiene.ts`, `plugins/usage-tracking/README.md`
- **Gate**: usage-tracking tests + typecheck
- **Acceptance**: age, idle-gap and output-volume breaches alert once per
  observed session/reason; the alert is advisory and bounded.

## acceptance

- All session outputs say `observedMcpOnly: true`.
- Threshold defaults align with the existing two-hour session policy and the
  8k carried-tail heuristic, while each is configurable.
- The hot path performs O(1) in-memory observation and never reads the log.
- No message content, credentials, or host-private meter is persisted.
