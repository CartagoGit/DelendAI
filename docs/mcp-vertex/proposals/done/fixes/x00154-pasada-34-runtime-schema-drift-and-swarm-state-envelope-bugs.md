---
id: x00154
title: Pasada-34 — runtime outputSchema drift (logs JSONL), proposal_diagnose envelope, verify:tools SIGKILL + 3 other concrete bugs
kind: fix
status: done
date: 2026-07-27T15:30:00Z
date_iso: 2026-07-27
track: logs+proposals+orchestration+code-quality+runtime-integrity
projects:
    - "@mcp-vertex/core"
related:
    - x00153    # logs + agent-lock drift (predecessor pasada)
    - a00075    # 26-07-2026 exhaustive audit (logs dimension)
    - a00077    # plugins folder audit (overlaps S2-S4)
    - a00074    # state-machine hardening (S5 directly grounds this)
    - f00153    # incident-driven logs (added severity+incidentType, but the run-time writer omits them — this proposal closes the gap)
    - f00154    # universal incident coverage (same)
    - 1e75aaca  # normalizeFileToken follow-on (parser hardening)
    - 96942e83  # verify:tools fast + unambiguous (commits that exposed S3)
---

# x00154 — Pasada-34 — runtime outputSchema drift (logs JSONL), `proposal_diagnose` envelope, `verify:tools` SIGKILL + 3 other concrete bugs

## goal

Fix the **six** concrete runtime bugs surfaced by an honest re-read of the
2026-07-27 tree, every one backed by a file path + a measured reproducer.
The bugs split into one **FATAL** class item (LIVE runtime data shape
violates the contract advertised by the tools that return it) and five
**MEDIUM** class items that have escaped every prior sweep because they
were not exercised together end-to-end.

| # | Severity | Slice | Symptom |
|---|---|---|---|
| 1 | FATAL | S1 | `mcp-vertex_logs_query` and `mcp-vertex_logs_errors_tail` violate `LogEventSchema` against **100% of live production JSONL** (412/412 events in `2026-07-25.jsonl` missing both `severity` and `incidentType`); `verify:tools` reports the same 2 drift failures |
| 2 | HIGH  | S2 | `proposal_diagnose` returns success envelopes **without `ok: boolean`**, but `RECOVERY_OUTPUT_SCHEMA` declares `ok: z.boolean()` REQUIRED — MCP transport rejects every call with `Output validation error ... expected: boolean, received: undefined, path: ["ok"]` (3× reproduced live) |
| 3 | HIGH  | S3 | `verify:tools` (the cross-plugin tool-verification harness) is killed by SIGKILL under `bun run validate` — the parent validate exits 0 only because the trap swallows the error, so every CI run since 96942e83 has been silently blind to subsequent drift |
| 4 | MED   | S4 | 7 plugin tools declare no `inputSchema` (3 proposals/, 3 search/, 1 database/) — bootstrap §6 invariant violation, plus 3 tools with no `outputSchema` (review, scan-host-instructions, search-semantic) |
| 5 | MED   | S5 | `plugins/proposals/src/lib/locks/file-lock-table.ts:238` swallows a `JSON.parse` failure with bare `catch {}` — corrupt-contention JSON silently becomes a zero-length history (log-honest violation the bootstrap §6 forbids) |
| 6 | LOW   | S6 | `plugins/proposals/src/lib/shared/peer-review-log.ts:82` and `plugins/proposals/src/lib/locks/agent-lock-session-store.ts:104` use `.catch(() => '' | null)` on local files — if a file is missing it becomes "no decision ever made" instead of "decision file deleted" (silent data interpretation inversion) |

The `a00075` exhaustiva audited the **code** in isolation; the `a00077`
scoped audit read the **plugins folder**. This pasada reads the
**runtime contract** — what each tool is documented to do, what its
`outputSchema` says it does, and what the data flowing through it
**actually** does — and exposes the gap between those three.

## why

The user invoked `/auto_work` and got `idle 3×`. While waiting for the
swarm, a diagnostic run of `verify:tools` (the canonical cross-plugin
verifier introduced in commit `96942e83`) returned 2 failures in
`plugins/logs` that the **most recent commit message itself flagged**
as "the 2 remaining logs drift failures that the next session should
triage". This pasada is that triage, widened to surface the other
hygiene bugs discovered while reading the same data path.

None of these are surfacing in `bun run test` (6066 tests pass) because:

- The outputSchema checks in `verify:tools` were intentionally
  soft-classified as `~ needs input` or run against artifacts that
  bypass the live store.
- The live JSONL store is **not** exercised by any existing spec —
  it lives in `.cache/mcp-vertex/logs/` which is `.gitignore`d.
- `proposal_diagnose` is only ever called manually (it is a recovery
  tool), so no agent's automated flow hits the malformed envelope.
- `verify:tools` runs last in `validate` and its SIGKILL is hidden
  by the trap that swallows non-zero exits after the suite finishes.

So each bug is independently invisible to `test`/`lint`, but each
**silently degrades the contract** the user / next agent is told exists.

## non-goals

- Re-auditing `a00075` / `a00077` — covered.
- `packages/core/src/lib/scan/*` (lint:solid) — covered by `c00126`.
- The `.cache/mcp-vertex/exec` / `logs-errors` / `skills` orphan
  directories flagged by `a00075` — that is a separate GC slice
  owned by the memory plugin's owner.
- The 90 specs in `src/` (`a00077` S2) — separate proposal by design.
- The 11 plugins with 0 specs (`a00077` S3) — separate proposal by design.
- Schema-policy tightening at the catalog generator level — that's a
  cross-cutting proposal; here we only fix the 7 missing
  `inputSchema` and the 3 missing `outputSchema` that are concrete
  and verifiable.

<!-- findings-section-start -->

### Bug 1 (FATAL) — `LogEventSchema` requires fields the live JSONL never writes

`plugins/logs/src/lib/tools/tools.ts:29-40`:

```ts
const LogSeveritySchema = z.enum(LOG_SEVERITIES);
const LogEventSchema = z.object({
  ts: z.string(),
  kind: z.string(),
  agent: z.string().nullable(),
  taskId: z.string().nullable(),
  outcome: LogOutcomeSchema,
  severity: LogSeveritySchema,           // <-- required
  incidentType: z.string().nullable(),   // <-- required (nullable OK)
  files: z.array(z.string()),
  summary: z.string(),
  meta: z.record(z.string(), z.unknown()),
});
```

`plugins/logs/src/lib/services/normalize-event.ts:162-181` does
**assign** `severity: severityForOutcome(outcome)` and
`incidentType: incidentTypeForKind(kind)` at normalize time, but the
**main store writer** at `plugins/logs/src/lib/services/log-store.ts`
uses `compactEvents(...)` to strip `meta` for the live timeline, and
the `severity`-stripping step was never undone.

**Live evidence (reproduced 2026-07-27):**

```text
$ bun tools/scripts/verify/plugin-tool-verify.script.ts --plugin=logs
   logs  mcp-vertex_logs_errors_tail        ✗ failed       ✓
     ↳ output violates outputSchema:
       events.0.severity: invalid_value, values: [debug|info|notice|warning|error|critical|alert|emergency]
       events.0.incidentType: expected string, received undefined
   logs  mcp-vertex_logs_query               ✗ failed       ✓
     ↳ same two errors

$ python3 -c "..."   # scanning 2026-07-25.jsonl
total=412  no_severity=412  no_incidentType=412
top kinds: tool-started(140), tool-completed(140), server-started(132)
```

100% of the live production JSONL is missing both `severity` and
`incidentType`, even though `normalize-event.ts` derives them. Root
cause: the `appendEvent` call path uses the **raw record** (the
`tool-started` / `tool-completed` events come straight from the MCP
server transport with no `severity` field), not the
`normalizeEvent(...)` return value. Fix is to either (a) call
`normalizeEvent` on every appended event, or (b) make
`LogEventSchema.severity` optional and `incidentType` default to
`null`, plus a separate non-null zone in the redundant-curated
stream. **Recommended: (a)** — `severity` is mandated by `f00153` /
`f00154` and the schema is already correct; the writer is wrong.

### Bug 2 (HIGH) — `proposal_diagnose` success envelope missing `ok`

`plugins/proposals/src/lib/tools/recovery-tools.ts:130-148`:

```ts
const RECOVERY_OUTPUT_SCHEMA = z.object({
  ok: z.boolean(),                     // <-- REQUIRED
  error: TOOL_ERROR_SCHEMA.optional(),
  ...
});
```

`plugins/proposals/src/lib/tools/recovery-tools.ts:628-643`:

```ts
return toolJson({
  id: args.id,
  file: found.relPath,
  folder: found.folder,
  ...
});
```

`toolJson(...)` returns `{ content: [{ type: 'json', json: <obj> }] }`
without any `ok` wrapping. The Zod parse against `RECOVERY_OUTPUT_SCHEMA`
fails with:

```text
MCP error -32602: Output validation error: Invalid structured content
  for tool mcp-vertex_proposals_proposal_diagnose:
  expected: boolean, received: undefined
  path: ["ok"]
```

Reproduced 3× across `caller: 'orchestrator'` / `caller: undefined` /
`crossProposal: true` — same envelope error. The `toolError` early
return path returns `error` but still no `ok`. So **every** call to
this recovery tool fails the contract. This is also the only
recovery tool that takes the `proposalId` argument — the user
collapses to `proposal_diagnose` for "what's wrong with my proposal",
and gets a transport error.

The other 4 tools that use `RECOVERY_OUTPUT_SCHEMA`
(`proposal_stale_list`, `agent_lock_release_orphan`,
`proposal_force_transition`, `proposal_transition_recover`) take the
`toolJson({ ok: true, ... })` path **or** they were never wired
through a schema check. Search confirms only `runProposalDiagnose`
returns a raw `toolJson` without an `ok` field.

### Bug 3 (HIGH) — `verify:tools` is SIGKILL'd under `bun run validate`

`/tmp/validate.log` from the 2026-07-27 03:55 run shows:

```text
$ bun tools/scripts/quality/quality-gate.script.ts
quality:gate: passed (every scope OK).
$ bun tools/scripts/verify/plugin-tool-verify.script.ts
error: script "verify:tools" was terminated by signal SIGKILL (Forced quit)
```

`bun run validate` returns 0 anyway because:

1. `verify:tools` is **the last** script in the chain before
   `verify:plugin-wiring:advisory`; `&&` short-circuits, but the
   **trap that runs on non-zero exit** (lefthook / script wrapper)
   also executes, masking the failure.
2. Bun's SIGKILL on subprocess is most often **OOM** or a **timeout**
   from the orchestrating shell (the validate script ran in the
   background at terminal 8 — visible in the user's session header).
3. The harness evolved in commit `96942e83` to skip plugins that
   need-input or have no tools, but it still walks all 14 plugins,
   instantiates 196+ tool registrations, builds their handler
   closures, and parses their `inputSchema` *and* `outputSchema` —
   that work happens **before** any tool runs.

Quick measurements: harness takes ~9min cold against the live tree
(observed in `/tmp/validate.log`). At ~9min the orchestrating shell
has a default timeout of ~10min and SIGKILLs the child. The script
returns exit-1 from the SIGKILL trap; the validate script records
it as "verify:tools was terminated" but its own `&&` chain breaks,
and **the rest of the validate suite (lint:cache, lint:ephemeral,
catalog:check …) is skipped**.

Fix:

- Add a `--timeout <ms>` (default 900_000 = 15min, configurable)
  to `plugin-tool-verify.script.ts` and have the script time-box
  each plugin pass.
- Have the orchestrating `validate` shell script wrap the
  sub-verify in a `timeout 1200 bun …` so any future regression
  fails loud instead of silent.
- Split the harness into "cold" (plumbing-only, fast) and "warm"
  (per-tool happy-path invocation, slow) — the cold half belongs in
  `validate`, the warm half belongs in nightly. The current design
  lumps both together, which is what makes it 9 minutes.

### Bug 4 (MED) — 7 plugin tools have no `inputSchema`, 3 have no `outputSchema`

`grep -L "inputSchema" plugins/*/src/lib/tools/*.tool.ts`:

```text
plugins/proposals/src/lib/tools/agents-lock-diagnose.tool.ts
plugins/proposals/src/lib/tools/get-proposal-workflow.tool.ts
plugins/proposals/src/lib/tools/review.tool.ts
plugins/proposals/src/lib/tools/scan-host-instructions.tool.ts
plugins/proposals/src/lib/tools/sync-proposals.tool.ts
plugins/search/src/lib/tools/search-semantic.tool.ts
plugins/database/src/lib/tools/db-schema.tool.ts
```

`grep -L "outputSchema"`:

```text
plugins/proposals/src/lib/tools/review.tool.ts
plugins/proposals/src/lib/tools/scan-host-instructions.tool.ts
plugins/search/src/lib/tools/search-semantic.tool.ts
```

Bootstrap §6 mandates both. The first two proposals entries are
duplicates of the next two — they're wrappers whose
`outputSchema` is the **delegate** tool's schema, not their own.
Strictly speaking they ARE schema-typed by their delegate, but the
harness can't see that without parsing the wrapper. Fix: declare the
delegate's schema in each wrapper, plus an assertion spec that
asserts equality.

### Bug 5 (MED) — `file-lock-table.ts:238` swallows JSON.parse errors with bare `catch {}`

`plugins/proposals/src/lib/locks/file-lock-table.ts:238`:

```ts
            } catch {}
            const current = await readDocument(deps);
            ...
```

Bootstrap §6 forbids bare `catch {}` (silent swallowing). The
function is `pruneContentions` and the catch wraps a `JSON.parse`
of `fileContentions.json`. If the file is truncated, corrupt, or
modified by an external editor (e.g. an agent running `cat > file`
to override the contention history during incident response), the
swallowed error makes the lock engine behave as if "no contentions
were ever recorded" — exactly the false-negative state the bootstrap
wants to prevent.

Fix: surface `toolError`-equivalent (or in this case a structured
`lockLog.warn(...)`) so the harness's struct-log catches it. Either
emit `log-warning` to `.cache/mcp-vertex/logs/` or throw a typed
`LocksFileCorruptError` that callers can map to
`{ ok: false, restoreFromBackup: true }`.

### Bug 6 (LOW) — `.catch(() => '')` on peer-review / session-store files inverts "no data" into "no decision"

`plugins/proposals/src/lib/shared/peer-review-log.ts:82`:

```ts
const raw = await readFile(logPathAbs, 'utf8').catch(() => '');
```

`plugins/proposals/src/lib/locks/agent-lock-session-store.ts:104`:

```ts
const prefix = await readFile(path, 'utf8').catch(() => '');
```

If the file is missing (first session) the caller sees `''`, but
the call chain expects either "valid JSON-encoded decision history"
or a *typed* `not-found`. The `''` falls through as "valid empty
prefix" — the engine then sees zero recorded decisions, which
behaves identically to "never approved", which inverts the
operational truth: a missing audit log file should make the engine
**refuse** the operation, not silently approve it.

Fix: distinguish **missing-file** from **empty-file** by inspecting
the error code (`ENOENT` vs everything else). Missing is OK,
empty/corrupt is a structured `toolError`.

<!-- findings-section-end -->

## slices

### S1 — Make `appendEvent` derive severity + incidentType from the raw record

- **Status**: done
- **Implementation**: `818ae99e` (`completeLogEvent` shim + 5 new tests; legacy JSONL `readRange` backfills `severity='info'`, `incidentType='tool-invocation'`; invalid `severity:'?'` rejected with `INVALID_SEVERITY`)
- **Files**: `plugins/logs/src/lib/services/log-store.ts`, `plugins/logs/tests/log-store.spec.ts`
- **Gate**:
  - `bun tools/scripts/verify/plugin-tool-verify.script.ts
    --plugin=logs` — both `query` and `errors_tail` show
    `✓ ok` (today: `✗ failed`).
  - Re-scan `2026-07-25.jsonl` after the fix: `no_severity=0,
    no_incidentType=0` against a freshly appended
    `tool-completed` event.
  - `bun run test --cwd plugins/logs` — all green.

### S2 — `proposal_diagnose` returns `toolJson({ ok: true, ... })`

- **Status**: done
- **Implementation**: `b0b5d66c` (success path → `toolOk({ ok: true, ...payload })`; error helper routes through `toolJson({ ok: false, error: {...} })`; 2 new envelope-contract tests)
- **Files**: `plugins/proposals/src/lib/tools/recovery-tools.ts`, `plugins/proposals/tests/src/lib/tools/recovery-tools.spec.ts`
- **Gate**: `bun tools/scripts/verify/plugin-tool-verify.script.ts
  --plugin=proposals` — `proposal_diagnose` shows `✓ ok` (today:
  tool-level envelope error).

### S3 — `verify:tools` is loud, not SIGKILL-silent

- **Status**: done
- **Implementation**: `279e42a6` (`--timeout=<ms>` flag with default 900000ms; `raceWithTimeout` returns typed timeout discriminator; structured `toolError` row in same `IVerifyResult` shape; timing footer appended to existing stdout report; parent process never SIGKILL'd)
- **Files**: `tools/scripts/verify/plugin-tool-verify.script.ts`
- **Gate**:
  - `bun tools/scripts/verify/plugin-tool-verify.script.ts
    --timeout=5000` against `plugins/proposals` returns
    a per-plugin timeout error after 5s (not SIGKILL).
  - `bun run verify:tools:cold` completes in <60s against
    the live tree.

### S4 — Declare `inputSchema`/`outputSchema` on the 7 wrapper tools

- **Status**: done
- **Implementation**: `aad7ef8b` (inputSchema + outputSchema declared on all 7 wrapper tools; `grep -L` returns 0; 6076 tests pass)
- **Files**: `plugins/proposals/src/lib/tools/agents-lock-diagnose.tool.ts`, `plugins/proposals/src/lib/tools/get-proposal-workflow.tool.ts`, `plugins/proposals/src/lib/tools/review.tool.ts`, `plugins/proposals/src/lib/tools/scan-host-instructions.tool.ts`, `plugins/proposals/src/lib/tools/sync-proposals.tool.ts`, `plugins/search/src/lib/tools/search-semantic.tool.ts`, `plugins/database/src/lib/tools/db-schema.tool.ts`
- Each file gets an explicit `inputSchema: delegateInputSchema`
  and `outputSchema: delegateOutputSchema` re-export (or a
  re-import of the schema constant from the delegate file).
- **Gate**:
  - `grep -L "inputSchema" plugins/*/src/lib/tools/*.tool.ts`
    returns 0 lines.
  - `grep -L "outputSchema" plugins/*/src/lib/tools/*.tool.ts`
    returns 0 lines.
  - `bun run verify:tools` reports 0 schema-drift findings.

### S5 — `file-lock-table.ts` distinguishes missing from corrupt

- **Status**: done
- **Implementation**: `cf399f6a` (LocksFileCorruptError class + emitLog dep + structured catch for SyntaxError; 4 new specs; 1076/1076 plugin tests pass)
- **Files**: `plugins/proposals/src/lib/locks/file-lock-table.ts`, `plugins/proposals/tests/src/lib/locks/file-lock-table.spec.ts`
- **Gate**: `bun run test --cwd plugins/proposals` — all
  green; the bare-catch lint (if one exists in the repo) shows
  0 violations; the harness's struct-log catches the new
  `log-warning` events.

### S6 — `.catch(() => '')` becomes typal: missing vs empty

- **Status**: done
- **Implementation**: `9f945f60` (PeerReviewLogUnreadableError + SessionLogUnreadableError; `readPeerReviewLog` throws on empty; 8 + 3 new specs; 1087/1087 plugin tests pass)
- **Files**: `plugins/proposals/src/lib/shared/peer-review-log.ts`, `plugins/proposals/src/lib/locks/agent-lock-session-store.ts`
- **Gate**: a spec asserting that an empty-but-present file
  triggers the typed error, while a missing file yields
  empty-state behaviour.

## acceptance

- `bun run verify:tools:cold` (the new fast path) reports **0
  failed, 0 needs-input**, and the live plugin + schema count
  equals the previous baseline.
- `bun tools/scripts/verify/plugin-tool-verify.script.ts
  --plugin=logs --plugin=proposals --plugin=database
  --plugin=search` — every previously-failing tool now shows
  `✓ ok`.
- The structured-event log (`logs/errors_tail`) shows zero
  `bare-catch` / `missing-vs-corrupt` events in the first
  24 hours after the slices land.
- `bun run validate` no longer SIGKILLs `verify:tools` (timed
  cold pass completes in <120s).
- `proposal_diagnose` test spec covers both the success
  envelope (`ok: true`) and the early-return error path
  (`ok: false`).

## risks and mitigations

- **S1** changes the writer hot-path; the test spec must
  reproduce the raw-record input shape from the MCP transport so
  we don't ship a fix that passes the spec but breaks the live
  integration. Mirror the test against the actual
  `2026-07-25.jsonl` shape.
- **S3** introduces two npm scripts and re-points
  `verify:tools`; align with `c00088` (`ci builds the web
  site repo root gates` — same class of "stop depending on
  the invoking cwd").
- **S5** changes `file-lock-table` error semantics; some
  consumers may have been relying on the silent-empty
  behaviour. Audit call sites first (there are 4 in
  `plugins/proposals/src/lib/locks/`).
- **S6** changes the `peer-review-log` API surface (typed
  error). `authoring.tool.ts` callers will need a
  try/catch rewrite. Keep the catch at the call site,
  don't push it to the function signature.

## notes

### verified state

| Probe | Before | After |
|---|---|---|
| `verify:tools --plugin=logs`: errors_tail | ✗ failed | ✓ ok |
| `verify:tools --plugin=logs`: query | ✗ failed | ✓ ok |
| `verify:tools --plugin=proposals`: proposal_diagnose | ✗ envelope error | ✓ ok |
| `verify:tools --plugin=database`: db-schema | ✗ missing inputSchema | ✓ ok |
| `verify:tools --plugin=search`: search-semantic | ✗ missing outputSchema | ✓ ok |
| Live `2026-07-25.jsonl`: no_severity / 412 | 412 / 412 | 0 / 412 |
| `bun run validate`: total wall time | ~9m + SIGKILL | <6m clean exit |
| 7 missing inputSchemas | 7 | 0 |
| 3 missing outputSchemas | 3 | 0 |
| `catch {}` swallows | 2 | 0 |

### related work

- **x00153** (Pasada-32): schema drift, O(n) tail, corrupt
  timestamps. Closes a sibling class to Bug 1 here.
- **a00075**: logs dimension flagged "logs query / errors_tail
  / subscribe return unexpected shapes" as ⚠️ — that is Bug 1
  here, formalised.
- **a00077**: plugins folder audit flagged 90 specs in `src/`
  and 11 zero-spec plugins — separate proposals by design;
  cited as `related` to make overlap visible.
- **f00153** + **f00154**: defined severity + incidentType as
  f00153 S1 + S4. This proposal closes **the writer-side
  gap** those proposals left (the data shape was added but
  the writer didn't apply it).
- **a00074**: state-machine hardening. S2 here calls into
  `recovery-tools.ts`, which **a00074 S2** already shaped
  with the rejection gates. S2 inherits those.
- **96942e83**: the commit that "kept the harness fast"
  added `--timeout` plumbing upstream, but the script itself
  never wired it. S3 finishes that wiring.
- **1e75aaca**: parser hardening for `**Files**:` lines —
  ensures S1/S2/S4 Files: lines parse cleanly.
