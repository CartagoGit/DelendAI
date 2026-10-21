# Prioritized maintenance source review

Snapshot `26b442f8fa1e73e9583be5044b5ca557b59c8919`; reviewer gpt-6.1-sol / Codex; 2026-10-21.

**20 selected production sources, 4,065 lines, fully read.** Score **6.0/10 for this selected maintenance batch**. No complete maintenance-family closure is claimed. All twenty files are byte-identical at later develop `df29b656ca803d2c9e8b453092b4566b07c8ddb4` (delta-equality.json). Four files already read by root were excluded.

The code has concrete preservation protections: per-ref hold before publication, monotonic remote checks, conservative unknown diff handling, session-aware unit heartbeats and local expected-SHA cleanup. Four independent defects remain in proof-directory ownership, remote identity selection, initial maintainer acquisition and cleanup reporting. Additional expected-tip omissions extend existing RECLAIM-02 instead of duplicating it.

## Executed local evidence

Six owned probe cases/controls exit0. The first uses real Git only in a private temp repository and replaces bun install with success; all gate callbacks are synthetic. A nested same-SHA contender fails its add and removes the first proof directory. Git stderr contains the expected already-exists and no-working-tree diagnostics and is retained, not described as empty.

The second uses real private remote-tracking refs with no network to show the wrong-remote SHA classifies spent while the intended origin SHA does not. No maintenance/delete is called. The third uses actual private lease files with fs wrappers enforcing a legal interleaving; both production hold calls return true. A fourth case runs the real cleanup function over synthetic typed Git/forge ports, returning deleted despite a nonthrowing forge refusal. Controls show ordinary sequential lease exclusion/release works, successful forge cleanup reports deleted, and local CAS refusal remains retained. No host background task, real provider, forge request, actual dependency install, shared/user ref or product file was touched.

Probe commands: `bun maintenance/probe.ts`. Structured results: probe-result.jsonl; original mixed stdout: probe-result.raw.log; expected fixture failures: probe-stderr.log. Fixtures are retained under owned-fixtures-* and never added to source-reading credit. No full source-family suites or repository validate were executed.

## Findings

| ID | Severity | Finding |
|---|---|---|
| MAINT-01 | P2 | A colliding preflight removes the other invocation’s worktree after its own add fails |
| MAINT-02 | P2 | Namespace maintenance can classify one remote’s tip and delete a different remote’s branch |
| MAINT-03 | P2 | Two initial maintenance contenders can both acquire the lease after observing absence |
| MAINT-04 | P3 | Cleanup reports successful deletion after the forge explicitly refuses its branch deletion |

findings.json contains seventeen populated fields per finding (the fifteen-field evidence record plus explicit status and regressionTest), including exact source excerpts, expected/actual behavior, cause, correction, verification, relationships and limits.

## Existing issue extensions and historical anchors

RECLAIM-02 gains callers in maintain-ref-namespace reap, forge work-branch publication cleanup, sync-with-integration local update-ref and GitHub integration deleteBranch. The namespace optional prior remote read is not an atomic lease; some callers omit even that prior SHA. The concrete GitHub adapter ignores expectedSha although cleanup-step correctly forwards it. The root’s original reclaim remote force-with-lease remains positive counterevidence for that caller only. See existing-finding-extensions.json.

G37 is a historically fixed shared-rule issue; inspected publisher and namespace callers use that rule. Their current expected-tip/evidence defects do not reopen the old rule-duplication finding. C7’s 47/13 commit numbers describe historical observed WIP, not current state; publishing/session/retired-tip source does not prove every pack is integrated or enforce unique reviewer assignment. See historical-anchor-opinions.json and exact acta-anchors.json.

## Per-file assessment

| Source | Full read | Assessment |
|---|---:|---|
| `packages/core/src/lib/wip-engine/work-checkout-publisher.ts` | 1–372 | Cadence/visibility/auto-push gates, per-ref hold, remote standing and monotonic tip checks are explicit. Uses shared work-ref openness rule. Timer uses void tick without catch; possible rejected tick remains a candidate pending rejection-path/caller review, not elevated. |
| `packages/core/src/lib/development-policy/maintenance-lease.service.ts` | 1–253 | MAINT-03 initial acquisition can return true twice. Observe is correctly read-only; process identity includes nonce and heartbeat reports changes. |
| `tools/scripts/git/maintain-ref-namespace.script.ts` | 1–584 | MAINT-02 drops remote identity. RECLAIM-02 extension for unconditional reap; unknown integration/diff remains conservative. Calls the shared workRefFate rule (G37 family). |
| `tools/scripts/forge/publish-candidate.script.ts` | 1–1083 | MAINT-01 same-SHA preflight cleanup ownership. RECLAIM-02 extension for later remote/local work-branch deletion. Proof isolates actual candidate object and uses scoped temp index, but unchanged candidate cleanup races remain. |
| `tools/scripts/forge/publish-cleanup.ts` | 1–60 | Cleanup steps continue after an individual failure and verify throw-after-success cases, reporting leftovers/remedies. It cannot compensate for unguarded deletion supplied by its caller. |
| `tools/scripts/forge/queue-acceptance.ts` | 1–122 | Candidate fetch failure rejects that candidate. Integration fetch return is ignored and stale integration may remain: end-to-end queue SHA provenance remains pending in unselected queue runner; not confirmed as an independent defect here. |
| `tools/scripts/forge/queue-order.ts` | 1–103 | Pure deterministic queue/head and repair selection. No mutation in helper. Classification relies on supplied red/conflicting/full-run facts; live forge correctness not exercised. |
| `tools/scripts/forge/independent-candidates.ts` | 1–116 | Conservative unknown zone model; read-only-zone carveout and creates metadata are deliberate heuristics. No isolated semantic-overlap defect confirmed; caller planner correctness not fully audited in this family. |
| `tools/scripts/forge/candidate-disposition.ts` | 1–140 | Explicit draft/author/regenerate/refresh states prevent repeated refresh once integration merge/regeneration is identified. Generated classification source itself was not executed. |
| `tools/scripts/forge/candidate-footprint.ts` | 1–71 | Uses shared affected/test-zone planner. Empty file footprint avoids zone work; unreadable merge-base returns undefined. Basename-only move heuristic is a candidate requiring realistic cross-document aggregate-invariant evidence, not promoted. |
| `tools/scripts/forge/advance-queue.script.ts` | 1–107 | Dispatch once per tip based on persisted marker; no wait inside hydration pass. Direct marker write has no own lock; whether multiple production callers can race is pending in full hydrator/queue orchestration. |
| `tools/scripts/forge/open-publication-prs.script.ts` | 1–107 | PR list/API errors are left for next pass rather than treated as no-PR. Explicit apply gate; delegates publication opener. No forge call executed. |
| `tools/scripts/forge/close-unpublished-prs.script.ts` | 1–128 | Fork branches excluded. Empty publication and malformed head are closed only with apply; forward-sync history is exempt. Decisions use list snapshot and are not atomically tied to PR head; live race/caller review pending, no new finding. |
| `tools/scripts/forge/sync-with-integration.script.ts` | 1–169 | Fetch errors throw before classification. Ahead/diverged guards preserve local work under stable state. RECLAIM-02 extension: final unchecked-branch update-ref lacks expected old SHA; other-worktree checkout guard only tests current root HEAD. |
| `packages/core/src/lib/work-units/unit-lease.service.ts` | 1–119 | Owner session prevents refreshing a known foreign non-null session. Unknown session is accepted, intentional compatibility path. Entry origin stays stable and heartbeat updates via store mutex. |
| `packages/core/src/lib/work-units/unit-lease.store.ts` | 1–89 | Mutex/atomic writer prevents ordinary lost updates. Corrupt/schema-invalid file becomes absent and can be replaced by touch; preservation-policy/runtime recovery consequences remain a candidate, not promoted without caller evidence. |
| `packages/core/src/lib/integration-engine/cleanup-step.ts` | 1–187 | Local expected-SHA deletion correctly forwarded; MAINT-04 ignores nonthrowing forge refusal. Concrete GitHub deletion expectedSha omission extends RECLAIM-02 rather than this reporter issue. |
| `packages/core/src/lib/startup-reconciler/retired-tips.service.ts` | 1–56 | Lists integration remote retired tips; best-effort fetches missing objects, returns advertised tips even when fetch fails. Reader must handle unavailable ancestry conservatively; downstream callers outside twenty remain pending. |
| `packages/core/src/lib/startup-reconciler/phases/reap-leases.ts` | 1–156 | Expired leases mark nonterminal owner work recoverable and release expired claims; conflicting live owners become a blocker. Query ports are global expired-owner sets; repository/lease-instance attribution needs separate full port/caller validation before claiming cross-repo impact. |
| `packages/core/src/lib/startup-gate/start-checkout-hydration.ts` | 1–43 | Thin startup wrapper injects policy/git seam/watch and standDown callback; reports hydration only when true. Watch and seam implementations remain explicit nonselected pending sources. |

## Remaining scope

pending.json lists exact nonselected source paths/line counts and opaque dependencies. Important remaining implementations include keep-the-queue-moving, forward-sync-release, startup git seam/hydration watch and the wider reconciliation phases. Source completeness for this twenty is distinct from full-family and runtime coverage. Candidate observations without complete caller/probe evidence remain explicitly unelevated.

## Score rationale

Preservation intent and several correct fail-closed checks justify 7/10 for explicit contracts and recoverability. Concurrency is 4/10 because ownership is not atomic in two different resources. Evidence identity is 5/10 due cross-remote coalescing. Result observability is 5/10 because cleanup discards an ordinary refusal. Testability is 8/10 for pure helpers/injectable ports, moderated by isolated cases rather than full-suite execution. Maintainability is 7/10 for centralized lifecycle and queue rules, moderated by duplicated Git cleanup semantics. Mean of those six scoped dimensions is 6.0/10. This is not a global product score.

## Durable evidence

coverage.json: all twenty actual reads, hashes/ranges and opinions. source-hashes.json: retained Git object checks. delta-equality.json: comparison with later develop. findings.json: four new records. existing-finding-extensions.json: deduplicated caller extensions. pending.json: honest remaining work. support-coverage.json: bounded supplementary source. probe.ts and results retain reproducible evidence. finalize.py regenerates metadata/report and verifies all retained source bytes against Git.
