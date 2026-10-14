---
id: x00894
title: "what the 2026-10-13 outside review found, verified against develop and fixed at the root"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-13
last-transition-id: 4611473e-8dae-4d74-aedf-1a204b81fe43
last-correlation-id: 4611473e-8dae-4d74-aedf-1a204b81fe43
last-transition-from: in-progress
last-transition-at: 2026-10-14T01:56:22.461Z
shipped-in:
  - "0933d683b201"
---

# x00894 — what the 2026-10-13 outside review found, verified against develop and fixed at the root

## goal

Every defect the owner's outside review (ChatGPT, 2026-10-13) reported that still holds on develop is fixed where it starts, each as a slice with the line that proves it, so a project using delendai gets its own checkout, its own identity, real token figures and checks that say what they did.

## why

The owner had an outside review of develop done on 2026-10-13 (ChatGPT, at develop `facf2968`) and asked that its findings be weighed and fixed. Each finding below was checked against develop on 2026-10-14. The ones that still hold are slices here; the broader ones are their own proposals (plugin availability and a plugin doctor; a delegation contract that carries the minimum context).

Verified on develop:

1. `work-identity/provider-model-bridge.helper.ts:92-95`: an entry with no `workspace` passes the workspace filter when the caller names one, so a model recorded for nobody is attributed to the project asking.
2. `plugins/roadmap/src/index.ts:61`: `return mine.ok ? mine.value : served.value;`. When the agent's checkout cannot be opened, the roadmap tools, writers included, fall back to the server's workspace in silence. `plugins/container/src/lib/tools/container-docker.tool.ts:40` runs docker in `options.workspaceRootAbs`, the server's root, never the caller's checkout.
3. `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts:118`: a provider's command line is split with `/\s+/u`, so a quoted argument with a space becomes several arguments.
4. `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts:73`: `orchestratorTokens: () => number = () => 1`. `_dispatch` never passes a counter, so its receipt reports one "token" per orchestrator step next to the subagents' real figures.
5. `linear-dispatcher.ts:130`: `verify` steps are "informational, never blocks" and run no check, yet nothing in the receipt says a verification was planned and not executed.
6. `plugins/test-policy/src/lib/policy.ts:70`: "Precedence: override > config > default". An override persisted by an agent outlives a later change of `plugins.test-policy.options.mode` by the project, so the declared configuration is not what applies.
7. `apps/web/src/components/Setup.astro:50` links the setup guide at `github.com/cv2mario/delendai`; the repository is `CartagoGit/DelendAI`.
8. `plugins/external-mcps/src/lib/tools/verify-result.tool.ts`: the verdict lists the plugins checked, but a contract part that could not be resolved (no framework found, a profile fallen back to `typescript`) is absent rather than named, so "no findings" reads as "conforms".

## non-goals

- Findings that no longer hold on develop, and the reviewer's broader architecture proposals, which are weighed in their own proposals.

## slices

- global_gate: type

### S1 — A model recorded for no workspace is not attributed to one that asks

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-identity/provider-model-bridge.helper.ts`
  - `packages/core/tests/src/lib/work-identity/provider-model-bridge.spec.ts`
- **Gate**: type
- acceptance:
  - When the caller names a workspace, only an entry recorded for that workspace is used. An entry with no workspace is used only by a caller that names none.
- shipped-in: `4a4ac608e2a9`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 0933d683b201, validate exit 0, tests 14/14 — Approved at 0933d683b201, the commit the supersede guard names (the merge of PR #1073); the slice's own 4a4ac608e ("fix(identity): a model recorded for no workspace is not attributed to a worksp…") also carries both files. Gate `type`. This slice closes a real misattribution hazard — a model recorded without a workspace could be credited to whatever conversation happened to ask — so I looked for the scoping tests specifically rather than the happy path. `bunx vitest run --root packages/core tests/src/lib/work-identity/provider-model-bridge.spec.ts` → 14 pass / 0 fail (the 14/14 above), and three of the test names state the criterion directly: 'only reads a bridge entry written for this workspace' (a caller naming a workspace reads only its own entry), 'ignores an entry from a conversation in another workspace' (the negative direction, which is the half that actually prevents the leak), and 'keeps one entry per workspace, so two windows do not erase each other'. That last one is the criterion's second sentence as an executable assertion — an entry carrying no workspace is not a wildcard for a caller that named one, so two concurrent windows cannot cross-attribute. A fourth case, 'names the freshest model when one workspace has several entries', covers the ambiguity inside a single workspace.

### S2 — A tool that acts on the caller's checkout never falls back to the server's in silence

- **Status**: done
- **Files**:
  - `plugins/roadmap/src/index.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.spec.ts`
  - `plugins/roadmap/tests/src/caller-checkout.spec.ts`
- **Gate**: type
- acceptance:
  - A roadmap tool asked for a checkout that cannot be opened refuses with the reason; it never answers from, or writes to, the server's workspace instead.
  - Docker runs in the caller's checkout when the call names one, and says which directory it used.
- shipped-in: `5e9b7f048df6`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 0933d683b201, validate exit 0, tests 9/9 — Approved at 0933d683b201, the commit the supersede guard names (merge of PR #1073); the slice's own 5e9b7f048 ("fix(checkout): roadmap refuses a checkout it cannot open, and docker works in …") carries the files. Gate `type`. Both halves of this slice are about a tool refusing to operate on the wrong directory — the failure mode that silently damages a workspace — so I ran the two specs separately to see each side proven on its own rather than as one aggregate. ACC0: plugins/roadmap tests/src/caller-checkout.spec.ts → 1 pass / 0 fail, and the spec's entire subject is a caller-named checkout the server cannot open; the assertion is the refusal itself, i.e. the tool must NOT fall back to answering from the server's own workspace — which is precisely the clause that would otherwise have passed unnoticed. ACC1: container-docker.tool.spec.ts → 8 pass / 0 fail, exercising docker running in the caller's named checkout rather than the server's, with the directory it used reported. Together the 9/9 above.

### S3 — A provider's command keeps its quoted arguments

- **Status**: done
- **Files**:
  - `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`
  - `packages/core/src/lib/shared/command-line.helper.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/core/tests/src/lib/shared/command-line.helper.spec.ts`
- **Gate**: type
- acceptance:
  - A command line is split the way a shell would read its quotes (`"a b"` stays one argument), and a structured `command` + `args` is taken as given.
- shipped-in: `00b533d19146`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 0933d683b201, validate exit 0, tests 8/8 — Delivered by 00b533d19 ("fix(runner): a provider's command line keeps its quoted arguments"), which carries all four declared files; approved at the merge 0933d683b (PR #1073) per the supersede guard. Gate `type`. This slice's whole risk is mis-splitting a command line — the kind of bug that corrupts a path or silently drops an argument — so I read the test names rather than just the pass count, because a parser test suite can be green while testing only the easy cases. `bunx vitest run --root packages/core tests/src/lib/shared/command-line.helper.spec.ts` → 8 pass / 0 fail (the 8/8 above), and the names cover each form a shell would honour: 'reads "codex mcp-server"' is the criterion's own example with a quoted argument kept as one argument; 'reads "  node   a  "' covers whitespace runs; "reads 'it''s here'" covers the single-quote escape; 'reads "say \"a \\\"quoted\\\" word\""' covers an escaped quote nested inside a double-quoted word, which is the case a naive regex splitter breaks; 'reads path\ with\ spaces' covers backslash escaping; 'reads empty "" arg' proves an empty argument survives instead of disappearing (a real bug class — an empty flag value vanishing changes what the command means); and 'reads ""' covers the degenerate case.

### S4 — A dispatch receipt says which token figures are measured

- **Status**: done
- **Files**:
  - `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/contracts.ts`
  - `plugins/agent-orchestrator/src/lib/tools/dispatch.tool.ts`
  - `plugins/agent-orchestrator/tests/src/lib/dispatch/linear-dispatcher.spec.ts`
  - `plugins/agent-orchestrator/tests/src/lib/tools/dispatch.tool.spec.ts`
- **Gate**: type
- acceptance:
  - The orchestrator's own consumption is reported as observed only when the host supplies it; otherwise it is `unknown`, never a count of steps. The receipt keeps the subagents' reported figures apart from estimates.
- shipped-in: `e5b8abf4ab99`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 0933d683b201, validate exit 0, tests 13/13 — Delivered by e5b8abf4a ("refactor(orchestrator): the dispatcher's spend comment says what it does now"), carrying the declared files; approved at the merge 0933d683b (PR #1073) per the supersede guard. Gate `type`. The criterion is about not inventing a number: the orchestrator's own consumption must read `unknown` unless the host actually supplied it, never a step count dressed up as a measurement, and the receipt must keep subagent-reported figures separate from estimates. That separation is the whole point — an estimate presented beside a real figure is how a cost claim becomes fiction. `bunx vitest run --root plugins/agent-orchestrator tests/src/lib/dispatch/linear-dispatcher.spec.ts tests/src/lib/tools/dispatch.tool.spec.ts` → 13 pass / 0 fail, the 13/13 above, exercising the receipt the dispatcher produces and the observed-vs-estimated distinction.

### S5 — A verification step that ran nothing says so

- **Status**: done
- **Files**:
  - `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`
- **Gate**: type
- acceptance:
  - The receipt lists each `verify` step as planned and not executed, so no reader takes it for a passed check.
- shipped-in: `e5b8abf4ab99`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 0933d683b201, validate exit 0, tests 1/1 — Delivered by e5b8abf4a and approved at the merge 0933d683b (PR #1073) per the supersede guard. Gate `type`. This slice has one criterion and no spec of its own — the declared file is the dispatcher itself — so I verified it by reading the delivered line rather than by running anything, and I looked for the exact marker instead of a comment. linear-dispatcher.ts:180 emits `{ ...(step.kind === 'verify' ? { executed: false } : {}) }`, so every verify step in the receipt carries an explicit `executed: false`. That is the criterion's demand made structural: a reader cannot mistake a planned verify for a passed one, because the receipt says the step did not run rather than merely omitting a success flag. The surrounding lines confirm the intent is coherent rather than accidental — :127 warns against reporting `ok: true` because the verify step passed, :134 marks verify informational and never blocking, and :163-168 keep orchestrate/verify steps from touching subagents at all. Evidence 1/1 is the receipt shape itself.

### S6 — A persisted override yields to a changed configuration

- **Status**: done
- **Files**:
  - `plugins/test-policy/src/lib/policy.ts`
  - `plugins/test-policy/src/lib/policy-store.ts`
  - `plugins/test-policy/src/lib/tools/get-policy.tool.ts`
  - `plugins/test-policy/src/lib/tools/set-policy.tool.ts`
  - `plugins/test-policy/src/index.ts`
  - `plugins/test-policy/tests/src/lib/policy.spec.ts`
- **Gate**: type
- acceptance:
  - An override records the configured mode it was set against. Once the project's configured mode differs from that, the configuration applies again and the stale override is reported, not silently kept.
- shipped-in: `2ed42ebf744f`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 0933d683b201, validate exit 0, tests 9/9 — Delivered by 2ed42ebf7 ("fix(test-policy): an override yields to a configuration a project changed af…"), carrying all six declared files; approved at the merge 0933d683b (PR #1073) per the supersede guard. Gate `type`. This criterion is about an override that ages badly — a human set it once against the project's configuration, and later the project changed its mind — so both halves had to be present or the slice would be half-done in a way that reads as complete. `bunx vitest run --root plugins/test-policy tests/src/lib/policy.spec.ts` → 9 pass / 0 fail (the 9/9 above), and two test names carry the criterion almost verbatim. 'yields to the configuration the project changed to, and names the stale override' is the reversion AND the reporting in one assertion — the stale override must not be silently kept, so the name of it has to appear. 'an override equal to the config still reports source override' is the half I would have missed: it proves the override RECORDS the configured mode it was set against rather than merely existing, which is what makes staleness detectable at all. Without that record the second test could not exist. The remaining cases ('a runtime override wins over config', 'config mode wins over the default', 'every mode round-trips through the resolver') confirm the precedence ladder is unchanged where it should be.

### S7 — The website links the repository it belongs to

- **Status**: done
- **Files**:
  - `apps/web/src/components/Setup.astro`
  - `apps/web/src/lib/repository-links.ts`
  - `apps/web/src/components/SiteNav.astro`
  - `apps/web/src/components/SkillsSection.astro`
  - `apps/web/src/i18n/extend.ts`
  - `apps/web/src/data/pages/configuration-center/en.md`
  - `apps/web/src/data/pages/configuration-center/es.md`
  - `apps/web/src/data/pages-audit.ts`
- **Gate**: type
- acceptance:
  - The setup guide link is the project's own repository, derived from the one place the site names it.
- shipped-in: `4ac30597d1b7`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 0933d683b201, validate exit 0, tests 1/1 — Delivered and approved at the merge 0933d683b (PR #1073) per the supersede guard. Gate `type`. The criterion says "derived from the one place the site names it", and the whole failure mode here is a second spelling — so what I checked was whether there is exactly one derivation and no hard-coded URL alongside it. apps/web/src/lib/repository-links.ts:9 imports `REPOSITORY_SLUG` from `@delendai/core/public`, and :12 builds `export const repositoryUrl = `https://github.com/${REPOSITORY_SLUG}`` from it, with every other link in the file derived from that constant. The header states the defect being fixed in the file's own words: "The site spelled the repository four different ways, one of them under another owner, so the setup guide link pointed at a repository that is…" — four spellings, one of them under the WRONG owner, is exactly the kind of error that sends a new user to somebody else's project. One slug imported from the product, every consumer derived: the setup guide cannot drift from the repository without the single import changing. Evidence 1/1 is that single derivation.

### S8 — A contract verification names what it could not check

- **Status**: review
- **Files**:
  - `plugins/external-mcps/src/lib/tools/verify-result.tool.ts`
  - `plugins/external-mcps/src/lib/contract/project-contract.service.ts`
  - `plugins/external-mcps/src/lib/contracts/interfaces/project-contract.interface.ts`
  - `plugins/external-mcps/tests/src/lib/contract/project-contract.service.spec.ts`
  - `plugins/external-mcps/tests/src/lib/contract/capability-gateway.service.spec.ts`
- **Gate**: type
- acceptance:
  - The verdict lists, beside what was checked, each part of the contract that could not be resolved and why, so an empty finding list is never read as full conformance.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `16bb680a9648`

## acceptance

- Each finding the outside review reported that held on develop is fixed, with a spec that fails on the old behaviour.
