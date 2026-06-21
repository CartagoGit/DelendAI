---
id: l115
status: done
type: proposal
track: plugins+security
date: 2026-06-21
kind: chore
title: Decide & close M13 (security plugin + securecoder bridge)
---

# l115 — Decide & close M13 (security plugin + securecoder bridge)

## Goal

Close the master audit's last `[ ]` on M13 by **deciding** (and acting on the
decision) what to do with the proposed `security` plugin and the
`securecoder` bridge. The audit currently reads
*"M13 · Plugin `security` + bridge securecoder — descartado explícitamente
(alcance indefinido); solo se hizo allow/deny de comandos en `quality`."* but
the checkbox is still `- [ ]`. This proposal forces a final verdict.

## Why

- The 11-reviewer consensus (see §8 of the master audit) ranks `security` as
  one of the two highest-value P3 plugins (Codex: ⭐⭐⭐⭐⭐; Sonnet & Gemini
  agree).
- The "scope-indefinite" objection is real: a full `security` plugin
  (threat-model per plugin, secret-scan, command allow/deny, path sanitiser
  central) is a major workstream that can swallow a sprint if scoped wrong.
- What is **not** indefinite is the *minimum viable* security surface:
  central command allow/deny (already in `quality`), secret redaction
  (already in core, M23), path containment (already in core, M22). What's
  open is whether to package these as a *plugin* (so consumers can swap it
  out) or keep them as core primitives forever.

## Decision to make (single binary)

Pick one of:

- **(A) Land a `security` plugin** with the three primitives (command
  allow/deny, secret redaction, path containment) re-exported from core
  through a single `security_*` surface, **plus** a declarative
  `threat-model.json` opt-in that lists which plugin's `effects` are
  allowed in which context. ~2–3 days.
- **(B) Keep security as core primitives forever** and update the audit
  to mark M13 as **"deferred indefinitely (core primitives cover the
  minimum viable surface)"**. Zero code, just the audit note + this
  proposal closes.
- **(C) Land only the `security_*` tool surface, no threat-model DSL**.
  Re-export the three primitives as a thin plugin that the bootstrap can
  load by default. ~1 day. The DSL can come later if needed.

## Non-goals

- Re-implementing secret redaction or path containment (already in core).
- The `securecoder` *bridge* (consumes an external `securecoder` binary) —
  out of scope regardless of the decision; that bridge needs its own spec.
- Any change to `quality` command semantics.

## Slices (option A)

### S1 — Security plugin skeleton + re-exports
  - **Status**: ready
  - **Files**: `plugins/security/package.json`, `plugins/security/src/index.ts`,
    `plugins/security/src/lib/tools.ts` (re-exports core `redact` +
    `resolveWorkspaceContained` + `quality` allow/deny as `<prefix>_security_*`).
  - **Command**: `bun run typecheck`
  - **Expect**: new package discovered by `discover-plugins.ts`; no `validate`
    regression.

### S2 — `threat-model.json` loader + opt-in
  - **Status**: ready
  - **Files**: `plugins/security/src/lib/threat-model.ts`,
    `plugins/security/tests/src/lib/threat-model.spec.ts`,
    `plugins/security/src/lib/tools.ts` (new `security_threat_model` tool:
    validate/apply/list).
  - **Command**: `bunx vitest run plugins/security`
  - **Expect**: pass

### S3 — Wire into `swarm` preset
  - **Status**: ready
  - **Files**: `mcp-vertex.config.json` (add `security` to the swarm preset),
    `docs/proposals/audits/a1-16-06-2026-…md` (line 275 → `[x]` with note).
  - **Command**: `bun run validate`
  - **Expect**: green; master audit `M13` checkbox is now `[x]`.

## Slices (option B)

### S1 — Audit note only
  - **Status**: ready
  - **Files**: `docs/proposals/audits/a1-16-06-2026-…md` (line 275 → `[x]`
    with the "core primitives cover MV surface" verdict; link to this
    proposal).
  - **Command**: none (markdown only).
  - **Expect**: master audit `M13` checkbox is now `[x]`.

## Slices (option C)

### S1 — Thin `security` plugin
  - **Status**: ready
  - **Files**: `plugins/security/package.json`, `plugins/security/src/index.ts`,
    `plugins/security/src/lib/tools.ts` (re-exports only, no threat-model DSL).
  - **Command**: `bun run typecheck`
  - **Expect**: green.

## Acceptance (any option)

- [x] Decision (A / B / C) is recorded in the proposal's `## Decision` section
      below.
- [x] The corresponding slice is implemented (A or C) or only the audit
      change is made (B).
- [x] Master audit M13 checkbox is `[x]`.

## Decision (filled by the implementer)

**(B) — close as deferred, core primitives cover the minimum viable
surface.**

Rationale: the three primitives the audit's "minimum viable security
surface" lists already exist and are exercised in production —
`packages/core/src/lib/shared/redact.ts` (secret redaction, M23),
`packages/core/src/lib/shared/contain-path.ts` (path containment,
M22), and command allow/deny in `plugins/quality`. Packaging them as a
standalone `security` plugin only pays off once a second consumer
needs to swap the implementation independently of `quality`/core — no
such consumer exists today, and the `securecoder` bridge (the other
half of M13) is explicitly out of scope regardless of the option
picked. Option A's `threat-model.json` DSL is speculative design for a
requirement nobody has stated yet (over-engineering risk noted in
AGENTS.md). Zero code changes; this proposal closes with the audit
note only.

<!-- ( ) A — full plugin + threat-model DSL
     (x) B — close as deferred, core primitives cover MV
     ( ) C — thin plugin, no DSL                                  -->

## Linked references

- Master audit: `docs/proposals/done/audits/a016-16-06-2026-auditoria-maestra-unificada.md` (M13, line ~293).
- Core primitives already in place: `packages/core/src/lib/shared/redact.ts`
  (M23), `packages/core/src/lib/shared/contain-path.ts` (M22),
  `plugins/quality` command allow/deny.
- 11-reviewer scoreboard: same audit §8 (security ranked ⭐⭐⭐⭐⭐ by Codex).
