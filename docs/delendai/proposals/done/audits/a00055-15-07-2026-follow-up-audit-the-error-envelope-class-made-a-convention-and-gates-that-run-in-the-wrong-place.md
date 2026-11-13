---
id: a00055
title: "15-07-2026 follow-up audit — the error-envelope class made a convention, and gates that run in the wrong place"
kind: audit
status: done
type: proposal
track: audit
date: 2026-07-15
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 1 commits referencing a00055 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 1-commit batch
shipped-in:
  - 2981880c # fix(verify): x00107 — probes mirror the SDK's isError semantics; revert the 3 x0
---

# a00055 — 15-07-2026 claude-code fable-5 follow-up audit — the error-envelope class made a convention, and gates that run in the wrong place

## Goal

Follow-up audit at develop cc52e5dc, hours after a00054's backlog drained: generalize the x00105 discovery (outputSchemas that reject their own error envelope) into a repo-wide census, and audit WHERE gates run (CI vs validate vs cwd) for the zones a00054 did not deep-read (packages/client, extensions/vscode, apps/web, CI workflow). Derives x00107 and c00088.

## why

User directive: keep pushing every dimension to 11/10, re-auditing as needed. a00054's headline (gates that lie) was fixed for verify:tools specifically; this pass asks the same question of every other gate and codifies the schema-envelope lesson before it regresses.

## non-goals

- No re-read of areas already exhaustively covered by a00053/a00054 with no changes since.
- Findings without file:line evidence are not recorded (playbook rule).

## Slices

- global_gate: lint

### S1 — Census + findings + derived proposals
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/audits/a00055-15-07-2026-follow-up-audit-the-error-envelope-class-made-a-convention-and-gates-that-run-in-the-wrong-place.md`
- **Gate**: lint
- acceptance:
  - "Every finding carries evidence; every open finding maps to a proposal id (x00107, c00088)."
  - "bun run lint:proposals green."

## acceptance

- Every finding carries evidence; every open finding maps to a proposal id (x00107, c00088).
- bun run lint:proposals green.

---

## Verified state

Follow-up pass at develop `cc52e5dc` (a00054's four derived proposals all
done; validate VALIDATE_EXIT=0; verify:tools 120 tools / 0 failed).

| Measure | Value |
|---|---|
| HEAD | `cc52e5dc` |
| biome | 0 warnings, 0 infos (1977 files) |
| Coverage floors | 80/67/79/81 (measured 83.46/70.78/82.63/84.91, widened scope) |
| verify:tools | 120 tools, 0 failed — plugin-owned probed since x00105 |

## Findings

### F-1 (P1) — the error-envelope class is systemic: 8 more files declare schemas their own error path violates
**Evidence** (cross-reference: `z.literal(true)` in an outputSchema + `toolError` calls in the same file):

| File | literal-true schemas | toolError calls |
|---|---|---|
| `plugins/git/src/lib/tools/write-tools.ts:305,335` | 2 | 11 |
| `plugins/memory/src/lib/tools/tools.ts:137,354,389,439` | 4 | 10 |
| `plugins/proposals/src/lib/tools/authoring.tool.ts:149,418` | 3 | 11 |
| `plugins/audit/src/lib/tools/audit-consolidate.tool.ts:79` | 1 | 3 |
| `plugins/external-mcps/src/lib/tools/{catalog,status,suggest}.tool.ts` | 3 | 3 |
| `plugins/proposals/src/lib/tools/{adopt,inherit-host-instructions}.tool.ts` | 2 | 2 |
| `plugins/status-marker/src/lib/tools/close-tools.ts` | 2 | 2 |
| `plugins/usage-tracking/src/lib/tools/clear.tool.ts` | 1 | 1 |

x00105 fixed the 3 instances the empty-input probe happened to reach; the
44 need-input tools never exercise their error path under any gate, so the
class survives everywhere else. A schema-validating host rejects these
tools' honest failures; the generated SDK types assert `ok: true` for
fallible calls.
**Resolution Track**: `x00107` — envelope-acceptance becomes a static probe
over every captured outputSchema, then the offenders widen.

### F-2 (P2) — CI never builds the web site
**Evidence**: `.github/workflows/ci.yml` — jobs run lint, typecheck,
test:coverage, build, smoke and metrics; no `bun run site`. Two recorded
incidents (04b13fcb vite alias shadowing; 7dae147b f00102 5-way breakage)
broke ONLY the site build while astro-check (`lint:web`, in validate) and
everything CI runs stayed green.
**Resolution Track**: `c00088` S1 — a `site` CI job.

### F-3 (P3) — two tools specs only pass when invoked from the repo root
**Evidence**: reproduced live this session — `cd tools && bun vitest run`
fails `style-integrity.script.spec.ts` (cwd-relative
`../apps/web/src/components/…`) and `system-prompt-size.script.spec.ts`
("AGENTS.md is tracked but missing"), while the root runner passes 463/463.
A gate whose verdict depends on the invoker's cwd is a flake seed.
**Resolution Track**: `c00088` S2 — resolve fixtures via the repo-root helper.

### F-4 (re-check, clean) — client/vscode swallowed-error + disposal sweep
`.catch(() => …)` sites in `packages/client` and `extensions/vscode` are
best-effort UI fallbacks (dashboard snapshot, tool-detail metrics,
knowledge list) with explicit fallback values — the pattern is deliberate,
not drift. The extension's disposal chain (deactivate + LIFO subscriptions
counter, `extension.ts:208-259`) is sound. No finding.

## Scoreboard

Only the affected dimension moves vs a00054: gates & verification honesty
6 → 7.5 (verify:tools now honest + catalog:check/stray-cache de-flaked; F-1
convention and F-2/F-3 placement gaps remain until x00107/c00088 land).
Overall: 8.0 → **8.3**.

### Derived proposals

| Id | Kind | Finding | Status |
|---|---|---|---|
| `x00107` | fix | F-1 error-envelope convention + gate + 8 offender files | ready |
| `c00088` | chore | F-2/F-3 CI site build + cwd-robust specs | ready |

## notes

**CORRECTION (2026-07-15, recorded by the x00107 implementation):** F-1's
premise was falsified during execution. The MCP SDK's
`validateToolOutput` skips outputSchema validation for `isError` results,
so an outputSchema is the SUCCESS contract only — the 8 "offender" files
are correct as written, and no schema widening is needed (nor was the
x00105 widening of ack/correlate/close_plan, which x00107 reverted). The
real defect was the verify harness dropping `isError` before validating
(fixed in x00107). F-2/F-3 stand unchanged. Scoreboard note: the 8.3 holds
— the dimension moved for the harness fix, not for the (retracted) schema
findings.
