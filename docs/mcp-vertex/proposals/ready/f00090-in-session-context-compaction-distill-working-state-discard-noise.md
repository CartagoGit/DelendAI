---
id: f00090
status: ready
type: proposal
track: memory+orchestration+token-efficiency
date: 2026-06-30
kind: feat
title: "In-session context compaction — distill the working state into a compact digest and discard accumulated noise to spend far fewer tokens"
shipped-in: []
recan: []
related:
    - f00086 # token cost governance (cache control + prompt bloat); this proposal is the *content*-side companion: f00086 right-sizes the system prompt, f00090 right-sizes the conversation tail
    - f00072 # cache eviction policy (LRU/LFU for the byte cache); compaction is the agent-facing analogue — distil, don't evict blindly
ownership:
    - { agent: implementation_runner, task: 'S1: deterministic context-digest distiller + memory_compact tool (this pass — landed)' }
    - { agent: implementation_runner, task: 'S2: pending — token-budget trigger heuristic (turns/bytes thresholds) surfaced via overview/auto_work so the agent knows WHEN to compact' }
    - { agent: implementation_runner, task: 'S3: pending — auto-recall of the latest session digest into orientation (overview/round_context) so a resumed turn rehydrates the distilled state instead of re-reading' }
    - { agent: implementation_runner, task: 'S4: pending — docs page + i18n keys + knowledge entry wiring the compaction loop into the agent playbook' }
globalGate: validate
acceptance:
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00090 — In-session context compaction

## goal

Give an agent a first-class way to **distil the relevant working state of the
current session into a compact, structured digest and discard the accumulated
noise**, so it keeps everything it needs to continue the *same* chat while
spending far fewer tokens.

The user's intent, verbatim: "quiero que los llm sean capaces de compactar la
información y resumirla para ser eficientes cada cierto tiempo … para que tengan
toda la información que necesiten, pero no vayan arrastrando mierda que ya no
necesitan para continuar en un mismo chat, para que se gasten muchísimos menos
tokens."

## why

A long session accumulates raw tool output, dead-end exploration, superseded
plans and stale file dumps in the conversation tail. The model pays for every
one of those tokens on every subsequent turn, even though only a small distilled
core ("where am I, what did I decide, what is still open") is load-bearing.
mcp-vertex already has the *durable* half of this story (the `memory` plugin
distils reusable facts across sessions) and the *coordination* half
(`proposals_compact_status`, `proposals_round_context` distil swarm state from
sidecar files). What is missing is the **within-session** half: a tool the agent
calls "cada cierto tiempo" that takes the working-state items it is currently
dragging along, separates the signal from the noise deterministically, and hands
back one compact digest — so the agent can drop the raw tail and carry the digest
forward.

This is the content-side companion to f00086 (token cost governance). f00086
right-sizes the *system prompt* and warms the cache; f00090 right-sizes the
*conversation tail*. They compose: a lean prompt plus a compacted tail is the
cheapest a session can be.

## why this design

**Capability on `memory`, NOT a new plugin. Decision: extend the existing
`memory` plugin with a compaction capability;
do not introduce a new plugin.** Rationale (SOLID + minimum-viable):

- **Single Responsibility, correctly scoped.** The `memory` plugin's
  responsibility is already "distilled, low-token information an agent keeps
  instead of re-reading / re-carrying raw context." Cross-session durable notes
  and a within-session digest are two *lifecycles* of the **same**
  responsibility (token-efficient distillation), not two responsibilities. A
  session digest is just a note with a session-scoped TTL.
- **Don't-Repeat-Yourself / no duplicated substrate.** A new plugin would have
  to re-plumb everything `memory` already owns: atomic+mutex store I/O
  (`writeFileAtomic` + `withFileMutex`), `redactSecrets` before persisting,
  corruption quarantine, TTL expiry, the cache-dir path resolution, the config
  options surface, and a knowledge entry. Reusing `memory`'s store means the
  digest inherits redaction and durable-write correctness **for free**.
- **Open/Closed.** The store is already TTL-aware (`ttlSeconds` → `expiresAt`,
  lazy expiry on read, prune on write). A session digest is an *additive* note
  kind on top of the existing record shape — no edit to the store contract.
- **No new namespace / no boot cost.** A new plugin adds a namespace, a preset
  slot, registration cost and a second "memory-ish" surface the agent must learn
  to choose between. Keeping it under `memory_*` means one mental model:
  "distil, then recall."
- **Boundary that justifies a split, if it ever appears.** If session digests
  later need a fundamentally different store shape (e.g. a ring buffer of turn
  windows, or per-turn token accounting), that is the moment to extract a
  `compaction` plugin. Today the note shape fits; extracting now would be
  premature abstraction.

So: a new `memory_compact` tool, backed by a **pure, deterministic distiller**
(`distillContextDigest`) and persisted as a self-expiring note in the existing
store.

## non-goals

- No automatic, agent-invisible compaction (the agent decides when; S2 only
  surfaces the *signal*). Silent context surgery is a footgun.
- No new plugin (see §why this design).
- No provider-level / cache_control changes — that is f00086's lane.
- No semantic LLM-based summarisation inside the engine (the distiller is
  deterministic and structural; the *agent* supplies already-distilled item
  labels). Keeping it deterministic keeps it testable and free.

## architecture

### What gets compacted

The agent passes the working-state **items** it is currently carrying. Each item
is a `{ kind, label, detail?, status?, tokensEstimate? }` record where `kind` is
one of a small closed vocabulary:

| kind | meaning | default disposition |
|---|---|---|
| `decision` | a choice already made and still in force | **keep** (distilled) |
| `open` | an open question / unfinished task | **keep** (distilled) |
| `fact` | a stable fact discovered this session | **keep** (distilled) |
| `pointer` | a `file:line` / id reference worth retaining | **keep** (compact ref only) |
| `output` | raw tool/command output | **discard** unless flagged `pin` |
| `exploration` | a dead-end or superseded attempt | **discard** |
| `superseded` | explicitly replaced by a later item | **discard** |

An item may carry `pin: true` to force-keep, or `drop: true` to force-discard,
overriding the default disposition (explicit agent intent wins).

### When to compact (S2, pending)

The trigger is a heuristic the agent can read from orientation: compact when the
estimated carried-tail tokens cross a threshold, or after N turns. S1 ships the
*mechanism* (the distiller is deterministic and side-effect-free over its input);
S2 wires the *signal* into `overview`/`auto_work` so the agent knows when to call
it. Keeping the trigger out of S1 keeps the first slice pure and testable.

### How it compacts (the distiller — S1)

`distillContextDigest(items, options)` is a **pure function**:

1. Partition items into `keep` and `discard` by disposition (default-by-kind,
   overridden by `pin`/`drop`).
2. Group the `keep` set by kind into stable, sorted sections.
3. Render a compact Markdown digest: one short bullet per kept item
   (`label` + truncated `detail`), pointers rendered as bare refs.
4. Compute a `tokenAccounting` summary: estimated tokens in vs. estimated tokens
   in the digest vs. discarded — so the saving is *visible* (the f00086
   philosophy: make the cost transparent).
5. Return `{ digest, kept, discarded, sections, tokenAccounting }`. Deterministic
   for a given input (stable sort, no clock, no randomness) so it is trivially
   testable.

`memory_compact` is the thin tool: it calls the distiller, runs the digest body
through `redactSecrets` (inherited via `saveNote`), persists it as a note titled
`session-digest:<topic>` with a session-scoped TTL (default 1h), and returns the
digest text + the accounting so the agent can drop the raw tail immediately.

### How it is rehydrated (S3, pending)

A resumed turn recalls the latest `session-digest:*` note (newest first) instead
of re-reading the dropped tail. S3 wires that into orientation; S1 already makes
the digest recallable because it is a normal note.

## slices

### S1 — deterministic distiller + `memory_compact` tool
- **Status**: done
- **Files**: [plugins/memory/src/lib/services/compaction.ts, plugins/memory/src/lib/tools/compact.tool.ts, plugins/memory/src/lib/tools/tools.ts, plugins/memory/src/index.ts, plugins/memory/tests/src/lib/compaction.spec.ts]
- **Gate**: bun run validate
- **Expect**: exit0
- **Acceptance**:
  - "`distillContextDigest` is pure: same input → same digest; no clock, no
    randomness; default dispositions by kind, overridable by `pin`/`drop`."
  - "`memory_compact` persists the digest as a TTL note via the existing store
    (redaction + atomic write inherited); returns digest + token accounting."
  - "`bun run validate` exits 0."

### S2 — compaction trigger heuristic surfaced in orientation
- **Status**: pending
- **Files**: [plugins/memory/src/lib/services/compaction-trigger.ts]
- **Gate**: bun run typecheck
- **Expect**: exit0

### S3 — auto-recall latest session digest into orientation
- **Status**: pending
- **Files**: [plugins/memory/src/lib/services/session-digest-recall.ts]
- **Gate**: bun run typecheck
- **Expect**: exit0

### S4 — docs page + i18n + knowledge wiring
- **Status**: pending
- **Files**: [apps/web/src/pages/docs/memory/compaction.astro, apps/web/src/i18n/ui.ts]
- **Gate**: bun run validate
- **Expect**: exit0

## acceptance

- `bun run lint:proposals` and `bun run validate` are green.
- S1 ships a pure distiller with specs and a `memory_compact` tool that reuses
  the existing redaction + atomic-write store path.
- S2–S4 remain `pending`; the proposal is NOT marked `done`.

## notes

- This is the within-session companion to f00086 (prompt/cache cost) and the
  cross-session `memory` notes: durable facts persist across sessions, session
  digests distil the *current* session and self-expire, raw tail gets dropped.
- The distiller is deterministic on purpose: the agent does the semantic
  judgement (which items, what labels); the engine does the structural
  distillation and the token accounting. This keeps the hot path free of an
  LLM call and the behaviour trivially testable.
</content>
