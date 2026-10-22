# Maintenance family completion

Auditor: gpt-6.1-sol on Codex. Written 2026-10-22; fixed source snapshot95841ce85b486112d049a6ad871d1612e4fcfd88. Scope is the exact115 previously pending sources,13,399 lines. Full source read and individual assessment are recorded in coverage.json; no generated/authored exclusions were invented. The earlier20 sources and root4 remain separately documented and were not reread to inflate coverage. All115 source hashes are identical at develop60c3ebc41d5352fc8fe2f58f40505452ee265792 (parity-60c.json).

Score:6.1/10. Contracts, conservative work preservation, read-only governance, journal retry logic and owned offline tests are substantial strengths. Positive certification gating and timestamp/CI evidence projection have concrete failures. This is a source-and-fixture score, not a production reliability measurement or acceptance of pending proposals.

## Results

Five candidate causes, MAINT-05..09, have18 explicit fields in findings.json. MAINT-05 normal queue admission, MAINT-06 late journal cursor and MAINT-07 CI projection have production callers. MAINT-08 is a reproducible public-seam merged-PR mismatch, but current host requests open PRs only. MAINT-09 is a concrete adapter result-contract failure, with current engine integration limited by CP-10. No claim a live forge returned the fixture body.

D28 is extended with fetch-phase origin fallback and first-remote environment authority. ORCH-03 is unchanged and revalidated statically; the durable earlier process probe remains its runtime evidence. MAINT-04 receives a separately limited static reporting extension for release-checkout. None is counted as another new cause. Critical skipped-peer READY and reporting/diagnose contract observations are retained without assigning more finding IDs. See extensions.json and observations.json.

## Verification

43 existing spec files passed389/389 cases, zero failed and zero pending;148 internal describe suites is not a file count. tests-results.json, test-ledger.json, stdout/stderr and custom config retain exact results. Relevant tests include startup reconciler/gate/report, GitHub integration adapter, queue/certifier/forward-sync/promotion, reservation CAS, release plan and maintenance helpers. Snapshot dependencies are reused locally; no dependency install. The historical r00046 baseline verifier was not run because its required cached capture is absent, and it is not represented as a pass.

Own core probe has11 cases/controls and SQLite fold has4; corrected queue probe has4 certification scenarios. Core and SQLite probes exited0/stderr0. Queue pending/uncertified/certified each issue one arm; red control issues none, all exit0/stderr0. Real main/classifier/order are retained; acceptance is an explicit injected valid-candidate port, actual gh commands are handled by an owned PATH executable that cannot delegate, and Git is blocked. Journal uses real NDJSON parser/reader plus typed local ports. CI/PR projection additionally uses actual GenerationsRepo with an owned in-memory SQLite table; it is not a test of production migrations.

An initial queue-preload mock failed to intercept Bun's builtin named import. Four GET requests to a synthetic nonexistent GitHub repository returned404, no writes. Those logs and initial summaries are preserved as discarded and are not evidence of target behavior or offline success. Isolation was corrected at PATH executable boundary, credentials were emptied for the corrected child and all corrected command traces are retained. One initial vitest config import failure is likewise kept as an environment failure, not a product finding.

## Boundaries and reproduction

No repo/product/config/refs were changed. No private records, real provider call, real merge/delete or paid operation is part of the evidence. Owned Git fixtures in existing specs create temporary repositories and local bare remotes. New probes use synthetic identities. Runtime scenarios not executed remain explicitly source-only in each verdict. This closes the115-source pending inventory, not every possible concurrency schedule or every product source.

prepare-snapshot.py reconstructs the fixed archive and local dependency link outside the repository. Run core.ts and sqlite-fold.ts with Bun and the archive tsconfig; queue-preload.ts plus queue-bin/gh must be invoked through run-queue.py to enforce executable isolation. tests.config.ts is the exact local suite configuration. Preserve raw failed-isolation logs as well as corrected outputs when integrating.
