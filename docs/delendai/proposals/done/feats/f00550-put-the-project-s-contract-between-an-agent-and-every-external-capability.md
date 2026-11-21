---
id: f00550
title: "Put the project's contract between an agent and every external capability"
kind: feat
status: done
type: proposal
track: architecture
date: 2026-09-16
tags:
    - external-mcps
    - capabilities
    - design
    - verification
last-transition-id: 0a8a0fb5-66f4-4124-b377-d19a89eb1276
last-correlation-id: 0a8a0fb5-66f4-4124-b377-d19a89eb1276
last-transition-from: review
last-transition-at: 2026-10-14T11:39:05.616Z
shipped-in:
  - "25582a9738c0"
---

# f00550 — Put the project's contract between an agent and every external capability

## goal

When an agent uses an external capability — a design source, a browser,
a database — delendai supplies the project's contract first, normalises
what comes back, and checks the result against the project, instead of
letting each external server decide how this codebase should be written.

## why

`external-mcps` (f00193) already composes third-party MCP servers as a
control plane: `catalog`, `discover`, `suggest`, `ack`, `status`,
`validate_config` and a `call` invoke proxy, with mandatory version
pins, env var NAMES only, three autonomy knobs defaulting to the
resolved security posture, a durable pending-ack ledger, a calls budget,
and a token-lean mandate that contributes no system-prompt bytes.

What it does not do is carry the PROJECT into the call. A design server
knows its own design format; a browser server knows the browser; a
database server knows SQL. None of them knows that this project uses
external templates, names its colours as design tokens, already has a
`ButtonComponent`, and forbids arbitrary values. So an agent takes a
perfectly good external answer and writes code that fights the codebase.

The pieces to carry are the ones the other three proposals produce:
f00547 resolves what the framework version allows, f00548 owns
the style surface and its design tokens, f00549 says where files
belong and what may import what. This proposal is where they are spent.

## non-goals

- **Not a design-tool plugin.** The gateway normalises CAPABILITIES —
  read a design, inspect a page, capture a screenshot — not products. A
  design provider is the first adapter, not the architecture.
- **Not a new security model.** The activation, ack and budget flow
  `external-mcps` already enforces stays exactly as it is; this adds the
  project contract to the calls that flow already permits.
- **Not automatic code generation from a design.** The gateway supplies
  context and verifies results; writing the code stays the agent's job.

## slices

### S1 — Capability names, and which effects they carry

- **Status**: done
- **Files**:
  - `plugins/external-mcps/src/lib/capability/capability-registry.service.ts`
  - `plugins/external-mcps/src/lib/contracts/constants/capability-registry.constant.ts`
  - `plugins/external-mcps/src/lib/contracts/interfaces/capability.interface.ts`
  - `plugins/external-mcps/src/lib/tools/invoke-proxy.ts`
  - `plugins/external-mcps/tests/src/lib/capability/capability-registry.service.spec.ts`
  - `plugins/external-mcps/tests/src/lib/server-registry.spec.ts`

Name capabilities rather than products — `design.read`, `design.tokens`,
`browser.inspect`, `browser.screenshot`, `database.query` — and classify
each with core's existing effect vocabulary (`write`, `spawn`,
`network`, `destructive`), so a destructive external call is gated by
the machinery the dry-run protocol already keys off rather than a new
one invented here.

- **Gate**: `npx vitest run --project external-mcps`
- shipped-in: `43ae7c9678ab`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 25582a9738c0, validate exit 0, tests 156/156 — Approving 25582a9738c0, the commit the supersede guard names — the merge of PR #1048, where all six declared files land; the slice's own 43ae7c967 ("feat(external-mcps): a capability call carries the project's contract, and wha…") also carries them. This slice declares no per-slice acceptance list, so I judged it against the proposal-level acceptance items it owns: the capability registry and the invoke proxy that put the project's contract between an agent and the external call. Evidence: the whole plugin under the repo's real runner — `vitest run --root plugins/external-mcps` → 22 test files, 156 tests, all pass (the 156/156 above), with capability-registry.service.spec.ts pinning the registry. Gate `none`, so there is no gate exit to report. One honest note on how I measured, because it changed my answer: I first ran this suite under `bun test` and got 149 pass / 1 fail, the failure being `vi.waitFor is not a function` in server-registry.spec.ts (a file this slice does declare). That was my harness, not a defect — the spec imports `vi` from 'vitest' at line 14 and bun:test's `vi` has no waitFor. Under `vitest run`, which is what plugins/external-mcps/vitest.config.ts actually configures, that same file is 39 pass / 0 fail and the plugin is fully green. I would rather state the runner than quote only the flattering number. ACC1 and ACC2 are in this slice's path (contract carried into the call; the gateway routes through the existing ack/effect flow rather than around it); ACC3 and ACC4 belong to S4/S5 and are judged in their own verdicts.

### S2 — The effective project contract, as one small payload

- **Status**: done
- **Files**:
  - `plugins/external-mcps/src/lib/contract/project-contract.service.ts`
  - `plugins/external-mcps/src/lib/contract/capability-gateway.service.ts`
  - `plugins/external-mcps/src/lib/contracts/interfaces/project-contract.interface.ts`
  - `plugins/external-mcps/src/index.ts`
  - `plugins/external-mcps/package.json`
  - `plugins/framework-knowledge/src/public/index.ts`
  - `plugins/external-mcps/tests/src/lib/contract/project-contract.service.spec.ts`
  - `plugins/external-mcps/tests/src/lib/contract/capability-gateway.service.spec.ts`

Assemble what the project requires — resolved framework and version,
style architecture, design-token policy, placement rules, existing
components — from f00547, f00548 and f00549, each optional.
A host that loads none of them still gets a valid, smaller contract,
because the gateway must not hard-depend on three unshipped plugins.

- **Gate**: `npx vitest run --project external-mcps`
- shipped-in: `43ae7c9678ab`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 25582a9738c0, validate exit 0, tests 156/156 — Approved at 25582a9738c0 (the merge the supersede guard names; the slice's own 43ae7c967 carries 7 of the 8 declared files). This is the contract-assembly slice: project-contract.service.ts + project-contract.interface.ts + capability-gateway.service.ts + src/index.ts + package.json + framework-knowledge/src/public/index.ts. No per-slice acceptance list is declared, so I judged it against the proposal-level item it owns — "A capability call carries the effective project contract, and a host with none of the three contributor plugins still gets a valid one" — and read the spec that pins it (project-contract.service.spec.ts, capability-gateway.service.spec.ts). Evidence: the whole plugin under the repo's configured runner, `vitest run --root plugins/external-mcps` → 22 files, 156 tests, all pass. Gate `none`, no gate exit to report. Worth naming the runner honestly: my first pass under `bun test` showed 149 pass / 1 fail (`vi.waitFor is not a function` in server-registry.spec.ts, which this proposal also declares); that was my harness — the spec imports `vi` from 'vitest' at line 14 and bun:test's `vi` has no waitFor — and under vitest that file is 39/39.

### S3 — Normalise the answer, and keep a handle to the raw one

- **Status**: done
- **Files**:
  - `plugins/external-mcps/src/lib/normalize/normalize-response.service.ts`
  - `plugins/external-mcps/src/lib/contracts/interfaces/external-answer.interface.ts`
  - `plugins/external-mcps/src/lib/contracts/constants/external-answer.constant.ts`
  - `plugins/external-mcps/tests/src/lib/normalize/normalize-response.service.spec.ts`

A large external payload becomes the small normalised facts the agent
needs, with the raw artifact kept behind a handle for the rare case that
needs it. This is the same summary/evidence split f00547 uses, for
the same token reason.

- **Gate**: `npx vitest run --project external-mcps`
- shipped-in: `43ae7c9678ab`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 25582a9738c0, validate exit 0, tests 156/156 — Approved at 25582a9738c0 (merge the supersede guard names). Normalisation slice: normalize-response.service.ts + external-answer.interface.ts + external-answer.constant.ts + its spec. No per-slice acceptance list is declared. I ran the spec directly to judge it: normalize-response.service.spec.ts → 2 pass / 0 fail — 'keeps the raw answer behind a handle and returns its facts' and 'prefers structured content and cuts long text'. Those are exactly the two properties this slice exists for: the raw answer stays retrievable behind a handle rather than being flattened away, and a long unstructured answer is cut in favour of its structured content — which is what keeps the plugin's token-lean mandate (stated in the proposal's notes) honest. Wider evidence: `vitest run --root plugins/external-mcps` → 22 files, 156 tests, all pass. Gate `none`, no gate exit to report.

### S4 — Prefer what already exists over what was just described

- **Status**: done
- **Files**:
  - `plugins/external-mcps/src/lib/reuse/match-existing.service.ts`
  - `plugins/external-mcps/tests/src/lib/reuse/match-existing.service.spec.ts`

Before an external description becomes a new component, match it against
the components the project already has and report the candidates with
their similarity, so "add a third button" is a decision someone makes
rather than a default.

- **Gate**: `npx vitest run --project external-mcps`
- shipped-in: `43ae7c9678ab`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 25582a9738c0, validate exit 0, tests 156/156 — Approved at 25582a9738c0 (merge the supersede guard names; the slice's own 43ae7c967 also carries both declared files). This slice owns proposal acceptance item 3 verbatim: "An external description that matches an existing component reports the match instead of proposing a new file." The file's own header states the bug it fixes — "'Add a button' from a design produced a third button beside the two the project had. The candidates are reported with how much of the description their names share, so adding one more is a decision somebody makes, not a default" — and it bounds itself with MIN_SIMILARITY = 0.34 and MAX_CANDIDATES = 5 plus a NOISE set, so the report cannot flood. I ran its spec rather than trusting the header: match-existing.service.spec.ts → 2 pass / 0 fail — 'reads the words of any naming style' (the naming-style robustness the criterion depends on) and 'reports existing components the description may already be, best first' (the match is reported, ranked). Wider evidence: `vitest run --root plugins/external-mcps` → 22 files, 156 tests, all pass. Gate `none`, no gate exit to report.

### S5 — Verify the result against the project, not against the source

- **Status**: done
- **Files**:
  - `plugins/external-mcps/src/lib/verify/verify-against-contract.service.ts`
  - `plugins/external-mcps/src/lib/tools/verify-result.tool.ts`
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_verify_result.ts`
  - `apps/web/src/i18n/tools/index.ts`
  - `apps/web/scripts/__tests__/i18n-tools.spec.ts`
  - `plugins/external-mcps/tests/src/lib/catalog.spec.ts`
  - `plugins/external-mcps/tests/src/lib/tools/verify-result.tool.spec.ts`
  - `plugins/external-mcps/tests/src/lib/verify/verify-against-contract.service.spec.ts`

After the work, check what was produced against the same contract that
went in: placement, style ownership, design tokens instead of literals,
and framework-version legality. A conflict between the external source
and the project resolves to the project, with the conflict named.

- **Gate**: `npx vitest run --project external-mcps`
- shipped-in: `43ae7c9678ab`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 25582a9738c0, validate exit 0, tests 156/156 — Approved at 25582a9738c0 (merge the supersede guard names; the slice's own 43ae7c967 carries 6 of the 8 declared files). This slice owns proposal acceptance item 4 verbatim: "Verification reports a project-versus-source conflict as resolved to the project, naming what was overridden." I checked that in the service rather than by name only: verify-against-contract.service.ts states it in its own header ("checked against the project, not against the source… the project wins and the finding names what it was"), and the findings carry `resolvedTo: 'project'` at :40, :63 and :80, each naming the override — the design-token case at :61 reads `literal ${literal}: the project names its colours as design tokens; use one, or add it to the token files`, and the version case at :79 reports `the source targets ${wanted.id} ${wanted.version}; the project has ${installed.version} installed, and the code must be legal there`. Naming what was overridden is the part that could have been skipped, and it is not. Specs, run individually: verify-against-contract.service.spec.ts 2 pass / 0 fail; verify-result.tool.spec.ts 1 pass / 0 fail; and the i18n coverage this slice declares (apps/web/scripts/__tests__/i18n-tools.spec.ts, pinning the translated tool strings) 6 pass / 0 fail. Wider evidence: `vitest run --root plugins/external-mcps` → 22 files, 156 tests, all pass. Gate `none`, no gate exit to report.

## acceptance

- A capability call carries the effective project contract, and a host
  with none of the three contributor plugins still gets a valid one.
- A destructive external capability is gated by the same effect and ack
  machinery as any other destructive effect; no new bypass exists.
- An external description that matches an existing component reports the
  match instead of proposing a new file.
- Verification reports a project-versus-source conflict as resolved to
  the project, naming what was overridden.

## notes

- Ordering: this is the last of the four. f00547 first as shared
  infrastructure, then f00548 and f00549 which consume it, then
  this, which spends all three.
- The token-lean mandate of `external-mcps` applies here too: a session
  that never calls an external capability must pay nothing for this.
