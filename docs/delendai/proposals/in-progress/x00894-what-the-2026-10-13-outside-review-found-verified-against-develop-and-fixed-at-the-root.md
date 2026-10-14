---
id: x00894
title: "what the 2026-10-13 outside review found, verified against develop and fixed at the root"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-13
last-transition-id: ad43e6a4-bab1-47c0-8dba-ddbb95c249a7
last-correlation-id: ad43e6a4-bab1-47c0-8dba-ddbb95c249a7
last-transition-from: ready
last-transition-at: 2026-10-13T23:59:56.927Z
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

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-identity/provider-model-bridge.helper.ts`
  - `packages/core/tests/src/lib/work-identity/provider-model-bridge.spec.ts`
- **Gate**: type
- acceptance:
  - When the caller names a workspace, only an entry recorded for that workspace is used. An entry with no workspace is used only by a caller that names none.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — A tool that acts on the caller's checkout never falls back to the server's in silence

- **Status**: review
- **Files**:
  - `plugins/roadmap/src/index.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.spec.ts`
  - `plugins/roadmap/tests/src/caller-checkout.spec.ts`
- **Gate**: type
- acceptance:
  - A roadmap tool asked for a checkout that cannot be opened refuses with the reason; it never answers from, or writes to, the server's workspace instead.
  - Docker runs in the caller's checkout when the call names one, and says which directory it used.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — A provider's command keeps its quoted arguments

- **Status**: review
- **Files**:
  - `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`
  - `packages/core/src/lib/shared/command-line.helper.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/core/tests/src/lib/shared/command-line.helper.spec.ts`
- **Gate**: type
- acceptance:
  - A command line is split the way a shell would read its quotes (`"a b"` stays one argument), and a structured `command` + `args` is taken as given.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — A dispatch receipt says which token figures are measured

- **Status**: review
- **Files**:
  - `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/contracts.ts`
  - `plugins/agent-orchestrator/src/lib/tools/dispatch.tool.ts`
  - `plugins/agent-orchestrator/tests/src/lib/dispatch/linear-dispatcher.spec.ts`
  - `plugins/agent-orchestrator/tests/src/lib/tools/dispatch.tool.spec.ts`
- **Gate**: type
- acceptance:
  - The orchestrator's own consumption is reported as observed only when the host supplies it; otherwise it is `unknown`, never a count of steps. The receipt keeps the subagents' reported figures apart from estimates.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — A verification step that ran nothing says so

- **Status**: review
- **Files**:
  - `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`
- **Gate**: type
- acceptance:
  - The receipt lists each `verify` step as planned and not executed, so no reader takes it for a passed check.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S6 — A persisted override yields to a changed configuration

- **Status**: pending
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

### S7 — The website links the repository it belongs to

- **Status**: pending
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

### S8 — A contract verification names what it could not check

- **Status**: pending
- **Files**:
  - `plugins/external-mcps/src/lib/tools/verify-result.tool.ts`
  - `plugins/external-mcps/src/lib/contract/project-contract.service.ts`
  - `plugins/external-mcps/src/lib/contracts/interfaces/project-contract.interface.ts`
  - `plugins/external-mcps/tests/src/lib/contract/project-contract.service.spec.ts`
  - `plugins/external-mcps/tests/src/lib/contract/capability-gateway.service.spec.ts`
- **Gate**: type
- acceptance:
  - The verdict lists, beside what was checked, each part of the contract that could not be resolved and why, so an empty finding list is never read as full conformance.

## acceptance

- Each finding the outside review reported that held on develop is fixed, with a spec that fails on the old behaviour.
