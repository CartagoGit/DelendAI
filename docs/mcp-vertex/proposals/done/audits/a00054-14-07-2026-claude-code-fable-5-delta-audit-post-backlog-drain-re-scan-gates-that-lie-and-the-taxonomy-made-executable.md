---
id: a00054
title: "14-07-2026 claude-code fable-5 delta audit — post-backlog-drain re-scan, gates that lie, and the taxonomy made executable"
kind: audit
status: done
type: proposal
track: audit
date: 2026-07-14
closed-by: legacy (pre-convention; consolidated pass 2026-07-26)
closed-evidence:
  - a00054 predates the shipped-in convention (pre-2026-07-24)
  - proposal body lists the original audit/fix/test deliverables
  - status was already 'done' before this consolidation pass
---

# a00054 — 14-07-2026 claude-code fable-5 delta audit — post-backlog-drain re-scan, gates that lie, and the taxonomy made executable

## Goal

Delta audit of the monorepo at HEAD b5515428, two days after the exhaustive a00053 (7.2/10): re-check a00053's open dimensions against the live tree, audit everything that landed since (x00100-x00103, t00002, r00009, f00113-f00115), and hunt for gates that report green without verifying what they claim. Findings carry file:line evidence per the playbook; each unresolved finding derives a proposal (x00105, x00106, c00087, t00004).

## why

User directive 2026-07-14: keep finding improvements/refactors to push every audit dimension toward 11/10, re-auditing as needed. The playbook forbids repeating a00053 findings without re-checking, so this is a delta audit: full pre-flight, hard-rules scan, targeted deep reads where this session produced live evidence.

## non-goals

- Not a full re-read of every file audited exhaustively 2 days ago in a00053 — unchanged areas are re-checked via the hard-rules scan, not re-narrated.
- No fixes inside the audit itself beyond what already shipped in f00113/f00114 this session; everything else derives a proposal.

## Slices

- global_gate: lint

### S1 — Run the delta audit and record findings + scoreboard + derived proposals
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/audits/a00054-14-07-2026-delta-audit-post-backlog-drain-re-scan-gates-that-lie-and-the-taxonomy-made-executable.md`
- **Gate**: lint
- acceptance:
  - "Findings table with file:line evidence for every entry; scoreboard justified by findings; every open finding maps to a created proposal id."
  - "bun run lint:proposals green on this file."

## acceptance

- Findings table with file:line evidence for every entry; scoreboard justified by findings; every open finding maps to a created proposal id.
- bun run lint:proposals green on this file.

---

## Verified state

Phase 0 pre-flight, run live on 2026-07-14:

| Measure | Value |
|---|---|
| HEAD | `b5515428` (f00113 multi-language profiles) |
| Build | 25 packages green (`bun run build`) — +1 vs a00053 (test-policy) |
| Tests (spot: core / proposals / conventions / test-policy) | 906 / 861 / 57 / 22 — all green |
| Token budget e2e | 5/5 green after adding test-policy to the project config |
| biome ci | 1977 files, **12 warnings + 31 infos** (all FIXABLE) |
| LOC (`*.ts`, no dist/node_modules) | 252,168 |
| verify:tools | 288 rows, 0 failed — **but see F-1** |
| Proposals tree | 223 files; `lint:proposals` green; taxonomy verification spec green after F-5 fixes |

### What changed since a00053 (re-check, not repetition)

a00053 (2026-07-14, HEAD 2cd3011e) scored 7.2/10 and derived x00101–x00103,
t00002, r00009 — **all executed and verified done**. Re-checked this pass:

- Token defaults: `plan`/`analyze`/`get_rules` compact-by-default — still wired, budgets green.
- `assemble.ts` split: 484 lines + 4 concern modules — no regression, imports clean.
- Coverage PARSE_ERROR: gone; branch floors hold (but see F-6 for the *scope* of the gate).
- aria i18n + ratchet detector: live; `check:i18n` green at 12 × 473 keys.
- Adoption out-of-the-box: `mcpv init` summary + external-install smoke both green.

New since a00053, audited here: f00113 (conventions profiles), f00114
(taxonomy schemas — which found real tree drift, see F-5), f00115
(test-policy plugin, default-on in standard/vertex).

### Hard-rules scan (AGENTS.md 1–10)

| Rule | Result |
|---|---|
| 1 core agnostic | ✅ no plugin imports in core; f00114 enum deliberately placed in the proposals plugin, NOT core |
| 2 no `process.cwd()` in engines | ✅ only CLI entrypoints (`packages/cli/src/index.ts:53,147,149`) + an interactive-init zod default (`init-answers.schema.ts:87`) — both boot-time seams |
| 3 no `*Sync` in hot paths | ✅ zero matches in plugin/lib hot paths (only doc strings) |
| 4 durable writes via primitives | ✅ new stores this round (policy-store, override) use `withFileMutex` + `writeFileAtomic` + quarantine, with corruption specs |
| 5 `resolveWorkspaceContained` | ✅ verify script + fs tools still route through it |
| 6 `redactSecrets` | ✅ create_proposal reports `redactedSecrets` count per call |
| 7 token budgets | ✅ 5/5 e2e; agent_catalog orientation projection intact |
| 8 outputSchema everywhere | ⚠️ declared everywhere checked, **but nothing verifies handler output matches it** — see F-1/F-4 |
| 9 i18n complete | ✅ 12 × 473 + shared check + es-authored check green |
| 10 tools/ TS-only | ✅ no `.py/.sh/.bash/.zsh/.pl/.rb` under tools/ |

## Findings

### F-1 (P1) — verify:tools never probes plugin-owned tools; its plugin list is hardcoded and stale
**File**: `tools/scripts/verify/plugin-tool-verify.script.ts:48` (PLUGIN_LIST), `tools/scripts/lib/plugin-test-bed.ts:115`

```text
Total: 240 ok, 48 need-input, 0 failed across 288 tools   ← 16 plugins × the same 18 CORE rows
```

The run output contains **zero** plugin-owned tool ids (no `close`, no
`conventions_classify`, no `get_test_policy`); every plugin section is the
identical 18 core-tool rows, so the gate verifies "the server assembles with
this plugin", not "this plugin's tools respond". PLUGIN_LIST additionally
omits 5 existing plugins (conventions, external-mcps, issues,
orchestrator-runner, usage-tracking) and needed a manual edit for test-policy
— the hardcoded-list anti-pattern the bootstrap bans.
**Impact**: schema/handler drift in plugin tools ships silently — F-4 proves it did.
**Resolution Track**: Deferred to proposal `x00105`.

### F-2 (P2) — close_slice trips over its own stale index after every transition
**File**: `plugins/proposals/src/lib/tools/authoring.tool.ts:473,658,699`

Live repro twice this session: `create_proposal` → `proposal_transition` →
`close_slice` fails with `proposal file missing: …/ready/<file>` because the
index still holds the pre-transition path; a manual `sync_proposals` + retry
heals it every time. The tool can run that bounded retry itself.
**Impact**: every orchestrated agent burns a failed call + a sync + a retry per proposal; naive agents treat it as a real error.
**Resolution Track**: Deferred to proposal `x00106` S1.

### F-3 (P2) — transitioning a freshly created proposal falsely warns "blame history not preserved"
**File**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts:381`, `plugins/proposals/src/lib/tools/recovery-tools.ts:310`

`create_proposal` writes the file without staging it, so the first
transition's `git mv` fails (`not under version control`) and falls back to a
plain rename with a scary warning — but an untracked file has no history to
lose, and the warning masks the one case that matters (git mv failing on a
TRACKED file).
**Impact**: warning fatigue; the real signal drowns.
**Resolution Track**: Deferred to proposal `x00106` S2.

### F-4 (P2, fixed in-session) — outputSchema enum drift: conventions_classify declared 10 roles, the profile has 30+
**File**: `plugins/conventions/src/lib/tools/classify-paths.tool.ts` (pre-f00113: `ROLE_ENUM = z.enum(['interface','constant',…,'other'])`)

The tool's outputSchema enum listed 10 of the TypeScript profile's 30+ roles
(`test`, `config`, `script`, `entry`, `webview`… all missing), so a truthful
handler response violated its own declared schema. Nothing failed because no
gate validates handler output against outputSchema (F-1).
**Impact**: typed SDK consumers and schema-validating hosts get lied to.
**Resolution Track**: Resolved in f00113 S5 (open string role + structured error envelope); the *class* is guarded once x00105 lands output-vs-schema probing.

### F-5 (P2, fixed in-session) — real taxonomy drift in the proposals tree: stale id and mis-kinded files
**Files** (all `done/`): `feats/f00052-….md` (frontmatter `id: u00002` — unknown prefix, stale pre-rename id), `chores/l00001-….md` (`kind: chore` on an `l` id, wrong folder), `feats/f00060-….md` (`kind: refactor` on an `f` id), `fixes/x00010-….md` (`kind: feat` on an `x` id), `refactors/f00102-….md` (`kind: refactor` on an `f` id, wrong folder)

Found by the new repo-wide verification spec
(`plugins/proposals/tests/src/lib/proposals/prefix-taxonomy-verification.spec.ts`)
the moment the taxonomy became executable — five files that every previous
lint pass had waved through.
**Impact**: index/kind statistics and the done/ kind-mirror lied for these files.
**Resolution Track**: Resolved in f00114 S3 (files fixed; spec now guards the whole tree).

### F-6 (P3) — the coverage gate only sees packages/ and plugins/
**File**: `vitest.config.ts:35`

```typescript
include: ['packages/*/src/**/*.ts', 'plugins/*/src/**/*.ts'],
```

apps/shared (the 12-language i18n source of truth), extensions/vscode and
tools/scripts never enter the coverage accounting, so the 72/55/75/73
thresholds describe roughly half the runtime surface.
**Impact**: a regression to 0% coverage in apps/shared would not move any gate.
**Resolution Track**: Deferred to proposal `t00004`.

### F-7 (P3) — 12 biome warnings + 31 infos tolerated
**Files**: `plugins/external-mcps/src/lib/ack/pending-acks.ts:114–136` (useLiteralKeys ×12), `plugins/external-mcps/src/lib/tools/suggest.tool.ts:202,232`, 3 external-mcps specs, `tools/scripts/dev/api/setup-install.ts:159,235,238` (useTemplate), `apps/shared/src/lib/escape.spec.ts:35`

All FIXABLE; a tolerated-nonzero warning count trains the repo to ignore the linter.
**Resolution Track**: Deferred to proposal `c00087`.

### F-8 (note, no action) — f00067a residual id survives as documented history
`done/feats/f00067a-….md` carries the only suffixed id in the tree. f00114's
read-seam schema accepts it explicitly (documented as historical); the write
seam can never mint another. Renaming it would rewrite links for zero value.

### Concurrency table (delta)

| Scenario | Risk | Mitigation | Gap |
|---|---|---|---|
| Two agents set test-policy override simultaneously | torn `policy.json` | `withFileMutex` + `writeFileAtomic` (`plugins/test-policy/src/lib/policy-store.ts`) | ✅ |
| Corrupt `policy.json` read | boot crash / silent wrong mode | quarantine + treat-as-absent + spec | ✅ |
| Concurrent proposal transitions vs index readers | stale path reads | index re-synced post-move; **tools don't self-heal** | ❌ → x00106 |

## Scoreboard

| Dimension | a00053 | now | Why |
|---|---|---|---|
| Architecture & agnosticism | 8 | 8.5 | assemble split held; f00114 enum placed plugin-side on purpose |
| Token efficiency | 6 | 9 | compact-by-default defaults shipped and budget-guarded |
| Concurrency & durability | 8 | 8.5 | new stores exemplary; index self-heal gap remains (x00106) |
| Gates & verification honesty | 6 | 6 | F-1 is exactly the class a00053 warned about: green ≠ verified |
| Tests & coverage | 7 | 7.5 | branch floors up (t00002); scope gap remains (t00004) |
| Docs / proposals hygiene | 7 | 8.5 | taxonomy executable + tree drift fixed + parking-lot triage live |
| Adoption & DX | 7 | 8 | init/adoption smoke green; multi-language profiles opened non-TS repos |
| **Overall** | **7.2** | **8.0** | derived proposals: x00105, x00106, c00087, t00004 |

### Derived proposals

| Id | Kind | Finding | Status |
|---|---|---|---|
| `x00105` | fix | F-1 verify:tools probes plugin tools + disk-derived list | ready |
| `x00106` | fix | F-2/F-3 authoring ergonomics (self-heal index, honest mv warning) | ready |
| `c00087` | chore | F-7 zero-warning biome baseline | ready |
| `t00004` | test | F-6 coverage scope widening | ready |
