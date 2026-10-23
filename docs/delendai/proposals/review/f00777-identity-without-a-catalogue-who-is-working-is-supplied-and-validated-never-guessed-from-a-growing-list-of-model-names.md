---
id: f00777
title: "Identity without a catalogue: who is working is supplied and validated, never guessed from a growing list of model names"
kind: feat
status: review
type: proposal
track: architecture
date: 2026-10-20
last-transition-id: 7bc75990-4402-4a07-b51a-ce29d5258d21
last-correlation-id: 7bc75990-4402-4a07-b51a-ce29d5258d21
last-transition-from: in-progress
last-transition-at: 2026-10-22T07:20:59.104Z
shipped-in:
  - "56b79dee9dfc4e6de0b189d3d757060825b9f43c"
---

# f00777 — Identity without a catalogue: who is working is supplied and validated, never guessed from a growing list of model names

## goal

An agent's identity stops being a string the model writes about itself from memory. It becomes a claim that arrives from somewhere — the host, the environment, the provider, the orchestrator — and that carries its own provenance, its own confidence and its own channel, recorded whether or not the model being named is one delendai has ever heard of. The project decides what an unverified claim may do, and that decision is one declared axis rather than per-call-site code. A maker, host or provider that appears tomorrow is served by the existing path, not by a patch.

## why

**The identity is a bare string, and the string is written by the model about itself.** `IWorkAgentIdentity` (`packages/core/src/lib/work-identity/resolve-work-agent.interface.ts:16-22`) is `{ id: string; source: IWorkAgentSource }`. `source` is not persisted — it is recomputed on every call and discarded. Nothing records who declared the id, through what, or how certain that declaration is. Meanwhile the value in the string is asserted by the model in its own prompt, and that prompt makes the model responsible for knowing something it cannot observe.

The dogma is explicit about this. `packages/core/src/lib/contracts/constants/agent-environment.constant.ts:58-59`:

> "Set DELENDAI_AGENT_ID to your exact model id before any delendai or git call: **which model you are is yours to know**; how it is written is fixed — lowercase, maker first in letters, then the version your maker publishes for you in a part of its own, then the tier (`glm-5.3-flash`, `qwen-3.8-flash`, never `qwen3-flash`), with no effort word such as `-high`; **never a shortened, invented or borrowed id (a re-spelling of an identity already at work is refused)** […] If your host exposes no model id to you at all, do not invent one […] failing either, **say plainly that your host does not supply your model id and stop, instead of guessing**."

Three things follow, and all three are load-bearing. First, **the writing rule is the project's, not the maker's**. A maker that publishes `o5-pro-2026-03-01` cannot write its official id and be correct; the cost of agnosticism lands on the maker. Second, **guessing is forbidden and stopping is mandated**. Third, and least discussed: a host that exposes no model id turns an agent into an unproductive one, not merely a badly named one — the "stop" rule meets `work enter`'s refusal.

**The two "unknown" states are markers, not identities, and they behave identically.** `resolveWorkAgentId` has no exit that is "there is an agent here but I cannot say who": it falls to `client-<application>` or to `unknown-agent` (`resolve-work-agent.constant.ts:7,18`). Running `describeAgentNameShape` over what the system produces shows both refused identically — "it carries no version: write the one your maker publishes for you" — for `unknown-agent`, `client-claude-code` and `model-without-version` alike. The two-marker design buys two spellings of one error. And the id is a flat string, so "is this `client-claude-code` the same actor as the `glm-5.3-flash` that did that?" cannot be answered without parsing heuristics.

**The precedence chain is code, and `IWorkAgentSource` is a closed enum of six.** `resolve-work-agent.service.ts:117-123` hardcodes the array `[model, environment, provider, client]`. A new identity channel — a gateway that stamps requests, a proxy that knows the route — requires editing the interface *and* the precedence array. That is the shape of a system that cannot meet a model it has not seen.

**There is no instance identity anywhere that survives the session.** A lease token does exist — `subscription_id: randomUUID()` and `lease_until` (`plugins/proposals/src/lib/tools/agent-names.tool.ts:501-509`), persisted in `subagent-registry.json` and enforced by `task-queue-engine.ts:699,706-726`. Four defects make it unusable as the system's identity: it lives in a `proposals` plugin store rather than the core identity contract; it exists only for agents with a name of their own; `agent_names list` returns the brief by default, which excludes it (`agent-names-list.ts:13-21`); and it is absent from `WORK_REF_SHAPE` (`profiles.constant.ts:113-114`). Git refs, the most durable artefact the system produces, carry nothing but a flat agent name.

**Eight parallel host catalogues, none generated from another.** `AGENT_HOSTS`, `AgentHost` (`agent-identity.interface.ts:37-44`), `KNOWN_HOSTS` (`agent-identity.ts:39-47`), `AGENT_HOST_MARKERS`, `AGENT_HOST_MARKER_PREFIXES`, `HOST_CHAT_PRODUCTS`, `HOST_APPLICATION_IDS`, `KNOWN_CLIENTS`. A new host must be added to six of them to be fully recognised, and misses two in a way that is actively harmful: an unlisted host application can pass the "is this a program, not a model" check and fail the agent markers that make it an agent at all — so a real agent is treated as a person. `AgentHost` collapses anything unknown to `'unknown'`, so two different hosts become one name. This exact failure was already solved for roles and extended to nobody: `AGENT_SLOTS` and `AGENT_CANONICAL_ROLES` are two copies kept in step by `agent-slots-in-sync.script.ts:4-8`. The same structural bug now lives in eight host lists with no lint.

**Gates degrade to false-green for anything they have not seen.** The LLM-brand check is a hand-written allowlist of ten makers (`post-slice-f00500-evidence.script.ts:152,164`) whose `gpt-?[3-9]` does not match `gpt-10`. And `measurePresetTokenizerCosts` silently omits any model outside its three profiles — no row, no warning — so a report quietly stops describing reality the day a fourth maker appears.

**The provider name is computed and thrown away.** `providerModelReading()` returns `provider` (`provider-model-bridge.helper.ts:112-114`); `resolveWorkAgentId` uses only `.model` (`:117-123`). The channel is known at the moment it is read and discarded at the next line.

**The commit author does not consume the resolved identity at all.** `resolveWorkAgentId` names refs (`work-ref-naming.service.ts:33-49`); the author comes from a different path — `clientName || 'agent'` and `modelName || 'unknown-model'` (`commit-author.ts:103-104`), defaulting to plain `git config user.name`. Two attribution paths that never meet.

**Operations are already blocked for want of a verifiable identity:** `work enter`, `work checkpoint`, `work publish`, `WIP_NO_AGENT_IDENTITY` (`wip-persistence.ts:145-155`), `work retire`, and an empty journal actor (`work-event-journal.service.ts:79`). A host that publishes nothing to the bridge cannot work through delendai at all.

**Why this design.** Identity is not a name, and delendai already proves it: host, role and lease are three separate contracts in three packages, none of which is the identity. The failure is not that these exist separately — that separation is correct — it is that the thing that ties them together is a string the model typed. So the proposal gives the *claim* a shape and keeps the three existing dimensions where they are. The claim becomes data, not a channel in code: the union opens and the precedence becomes a declared list, which is the same move `f00758` already made for the identity *policy*. Absence becomes a first-class value, modelled on `payload-percentile.ts:26-32`, which already refuses to coerce "no samples" into `0` — the two unverified states collapse into one claim carrying which channel failed and why. And an open catalogue with an honest fallback beats a closed one that goes stale: `InMemoryModelCatalog` (`model-catalog.ts:112`) and `model-ranking.service.ts` are already written and empty, waiting for data, and the tokenizer's silent omission becomes the declared generic `bytes/4` estimate at `estimated-byte-ratio` confidence.

What this deliberately does **not** do is let the model assert its own identity. "Which model you are is yours to know" is the line that has to move, because an LLM cannot observe which weights served it. The replacement is not "guess less carefully" — it is that the model declares **what it has been told**, and the system's job is to record the channel that supplied it. That keeps the anti-forgery force intact while removing the requirement that the model know the unobservable.

**Re-analysis before working any slice.** Written from a reading of the repository on 2026-10-20. Every claim is cheap to re-check and all of them drift. `resolve-work-agent.interface.ts:9-15` may no longer define a six-member union and `resolve-work-agent.service.ts:117-123` may no longer hardcode the array (then S1/S2 are partly done); `describeAgentNameShape` may have learned to distinguish `unknown-agent` from `client-*` (then S1's collapse is unnecessary); the eight host lists may have grown or shrunk (`grep -rn "AGENT_HOSTS\|KNOWN_HOSTS\|HOST_CHAT_PRODUCTS\|HOST_APPLICATION_IDS\|KNOWN_CLIENTS\|AGENT_HOST_MARKERS" packages/core/src plugins/proposals/src`); `agent-environment.constant.ts:58-59` may already have moved (then S9 is done); `post-slice-f00500-evidence.script.ts:152,164` may no longer be a ten-name allowlist and `tokenizer-real.script.ts:113-139` may already emit a generic row (either retires part of S5); `profiles.constant.ts:113-114` may already carry an instance segment (then S7's additive half is done). Falsifiers: `grep -rn "subscription_id" packages/core/src`; read `commit-author.ts:103-104` against `work-ref-naming.service.ts:33-49`; `grep -rn "InMemoryModelCatalog" --include=*.ts`.

## non-goals

- Removing `DELENDAI_AGENT_ID`, or making it optional. It remains the declared channel, and the anti-evasion rules stay exactly as strong.
- Removing, renaming or reordering the `IWorkAgentSource` values themselves. `model`, `environment`, `provider`, `client`, `policy` and `none` keep their meanings and their precedence; what changes is that the set is not closed against new channels.
- Changing `WORK_REF_SHAPE`'s agent segment or the branch-naming lint. Existing refs keep their names; the instance segment is additive and older refs stay valid.
- Making the bridge mandatory, or writing on behalf of a provider. `f00533`/x00887 already scoped the write side out, and this proposal leaves it out: the bridge stays read-only.
- Collapsing host, role and lease into the identity object. They stay three contracts. What moves is the claim's provenance.
- Any model ranking, routing or quality judgement. `model-ranking.service.ts` is named as the place a catalogue would live, not as something this proposal changes.
- Migrating `subagent-registry.json`. Its shape and its v1→v2 migration (`agent-registry-store.ts:75-92`) are untouched.

## slices

- global_gate: type

### S1 — An identity claim carries its channel, its confidence and its reason
- **Status**: done
- **Files**: `packages/core/src/lib/work-identity/resolve-work-agent.interface.ts`, `packages/core/src/lib/work-identity/resolve-work-agent.service.ts`, `packages/core/tests/src/lib/work-identity/resolve-work-agent.spec.ts`
- **Gate**: none
- acceptance:
  - "`IWorkAgentIdentity` gains a channel, a confidence and a reason, alongside the existing `id` and `source`. `source` keeps its six values and their meanings; the union is no longer the only way to name a channel, so an unrecognised channel id is carried and reported rather than impossible to express."
  - "An unresolved claim is one value, not two: `client-<app>` and `unknown-agent` both yield a claim whose `reason` distinguishes *a program connected* from *nothing declared anything*. Both still fail `describeAgentNameShape` the way they do today."
  - "A spec runs a source unknown to the system and asserts the claim is returned with its channel preserved, not coerced to `none`."
- shipped-in: `f0b4d6220f8f`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 56b79dee9dfc, validate exit 0, tests 94/94; acceptance 3/3: (1) resolve-work-agent.interface.ts:36-49 declares `IWorkAgentIdentity` with `id`, `source`, and the new optional `channel`, `confidence` and `reason`. `IWorkAgent… (2) resolve-work-agent.service.ts:155-167 gives the application case the reason "a program connected (<id>) but nothing named the model working through it", and li… (3) Spec "carries a channel the system has not met, not coerced to none" (resolve-work-agent.spec.ts:239-255) resolves with a `gateway` channel and asserts the res… — Read the delivering merge and the current implementation of every named file; each clause is implemented and asserted by the named spec. The twelve spec files of this slice group ran 94 tests green; the agent-slots and host-instructions lints both exited 0.

### S2 — Precedence is declared data, not an array in code
- **Status**: done
- **Files**: `packages/core/src/lib/work-identity/resolve-work-agent.constant.ts`, `packages/core/src/lib/work-identity/resolve-work-agent.service.ts`, `packages/core/tests/src/lib/work-identity/resolve-work-agent.spec.ts`
- **Gate**: none
- acceptance:
  - "The precedence array at `resolve-work-agent.service.ts:117-123` becomes a declared ordered list. Reordering it is a data change; the existing order `model → environment → provider → client` is the default and is unchanged."
  - "A spec asserts the default order resolves exactly as today and that a reordered declaration changes which source wins."
- shipped-in: `f0b4d6220f8f`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 56b79dee9dfc, validate exit 0, tests 94/94; acceptance 2/2: (1) `DEFAULT_WORK_AGENT_PRECEDENCE` is declared in resolve-work-agent.constant.ts as an ordered list of `IWorkAgentChannelRule` — `model`, `environment`, `provider… (2) Spec "resolves as before by default, and a reordered precedence changes the winner" (resolve-work-agent.spec.ts:257-273) asserts the default resolves the envir… — Read the delivering merge and the current implementation of every named file; each clause is implemented and asserted by the named spec. The twelve spec files of this slice group ran 94 tests green; the agent-slots and host-instructions lints both exited 0.

### S3 — The project declares what an unverified claim may do, in one axis
- **Status**: done
- **Files**: `packages/core/src/lib/work-identity/identity-policy.helper.ts`, `packages/core/src/lib/contracts/interfaces/policy-identity.interface.ts`, `packages/core/src/lib/development-policy/resolve-identity.ts`, `packages/core/src/lib/development-policy/resolve.interface.ts`, `packages/core/src/lib/development-policy/validate.ts`, `packages/core/schema/delendai.config.schema.json`, `packages/core/src/lib/plugins/development-config-schema.constant.ts`, `packages/core/tests/src/lib/development-policy/policy-identity.spec.ts`, `packages/core/tests/src/lib/work-identity/identity-policy.spec.ts`
- **Gate**: none
- acceptance:
  - "The `development.identity` axis gains one control for unverified claims, naming what they may do — at minimum `refuse`, alongside the existing `unrecognizedModel` behaviour — and it is enforced at the single resolution point, not at each consumer."
  - "`validateDevelopmentPolicy` names an unusable value back to the operator, as it does for the existing axis members (`validate.ts:106-128`), and the JSON schema and the Zod schema are updated in the same slice."
  - "A project that declares nothing keeps today's behaviour exactly: the chain resolves, `unknown-agent` still appears in a ref, and every refusal listed in `why` still refuses."
  - "A spec drives a policy that permits an unverified claim and one that refuses it, and asserts the difference is visible at resolution and nowhere else."
- shipped-in: `6b3f121bffd7`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 56b79dee9dfc, validate exit 0, tests 94/94; acceptance 4/4: (1) policy-identity.interface.ts declares `UNVERIFIED_CLAIM_POLICIES = ['accept', 'refuse']` and the `unverifiedClaims?: IUnverifiedClaimPolicy` member of `IPolicy… (2) validate.ts:109-115 calls `oneOf('identity.unverifiedClaims', policy.identity.unverifiedClaims, UNVERIFIED_CLAIM_POLICIES, out)` so an unusable value is named … (3) The axis member is optional and its default is `accept`, so a policy that declares nothing behaves as before; spec "is inert without an axis" (identity-policy.… (4) Specs "accepts a self-declared model by default and when the project accepts it" (identity-policy.spec.ts:91-101) and "refuses it when the project refuses unve… — Read the delivering merge and the current implementation of every named file; each clause is implemented and asserted by the named spec. The twelve spec files of this slice group ran 94 tests green; the agent-slots and host-instructions lints both exited 0.

### S4 — Hosts stop being eight parallel lists
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/constants/agent-hosts.constant.ts`, `packages/core/src/lib/contracts/interfaces/agent-host.interface.ts`, `packages/core/src/lib/contracts/interfaces/agent-identity.interface.ts`, `packages/core/src/lib/contracts/constants/agent-environment.constant.ts`, `packages/core/src/lib/contracts/constants/host-chat-model.constant.ts`, `packages/core/src/lib/development-policy/profiles.constant.ts`, `packages/core/src/contracts/index.ts`, `plugins/proposals/src/lib/shared/agent-identity.ts`, `plugins/proposals/src/lib/tools/agent-worktree.tool.ts`, `tools/scripts/lint/agent-slots-in-sync.script.ts`, `tools/scripts/lint/agent-slots-in-sync.spec.ts`, `packages/core/tests/src/lib/contracts/constants/agent-hosts.constant.spec.ts`, `plugins/proposals/tests/src/lib/shared/agent-identity.spec.ts`
- **Gate**: none
- acceptance:
  - "The host catalogues are reduced to one declared source with the others derived or delegating to it, the way `AGENT_SLOTS` already governs roles through `agent-slots-in-sync.script.ts:4-8`."
  - "An unrecognised host keeps a distinct value instead of collapsing to `'unknown'` (`agent-identity.interface.ts:29-33`), so two different unlisted hosts are two different names."
  - "An unrecognised host application still fails the program-not-model check (`kindInAgent`, `work-unit-shared.service.ts:263-278`)."
  - "The lint fails on any new host list added without being declared in the single source, so the count of parallel lists cannot grow again."
- shipped-in: `f0b4d6220f8f`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 56b79dee9dfc, validate exit 0, tests 94/94; acceptance 4/4: (1) packages/core/src/lib/contracts/constants/agent-hosts.constant.ts declares `AGENT_HOSTS` as the one list, with each host's programs and chat products inside it… (2) agent-identity.interface.ts:31-37 declares `export type AgentHost = string` with the comment "the host's own name when it is not listed, so two different unlis… (3) `kindInAgent` (work-unit-shared.service.ts:281-294) refuses any id `isHostApplicationId` accepts, with the message that the id "is the program the agent runs i… (4) tools/scripts/lint/agent-slots-in-sync.script.ts refuses a list kept beside the source; spec "names a new array that spells two host names" (agent-slots-in-syn… — Read the delivering merge and the current implementation of every named file; each clause is implemented and asserted by the named spec. The twelve spec files of this slice group ran 94 tests green; the agent-slots and host-instructions lints both exited 0.

### S5 — The model catalogue is observed, and an unknown model is a row, not a gap
- **Status**: done
- **Cut from this slice**: feeding `InMemoryModelCatalog` (`model-catalog.ts:112`). It has no consumer in product code; the catalogue that serves work is the public one `f00783` shipped (`model-catalogue.service.ts`, the models.dev snapshot refreshed on start), which the trailer check here already reads.
- **Files**: `packages/core/src/lib/work-identity/model-spelling.helper.ts`, `packages/core/src/lib/work-identity/model-identity.helper.ts`, `tools/scripts/report/tokenizer-real.script.ts`, `tools/tests/report/tokenizer-profiles.spec.ts`, `tools/scripts/verify/llm-trailer.helper.ts`, `tools/scripts/verify/llm-trailer.helper.spec.ts`, `tools/scripts/verify/post-slice-f00500-evidence.script.ts`
- **Gate**: none
- acceptance:
  - "A model absent from `TOKENIZER_PROFILES` produces a row with the declared generic `bytes/4` estimate at `estimated-byte-ratio` confidence, instead of the silent omission `measurePresetTokenizerCosts` performs today (`tokenizer-real.script.ts:113-139`). Every model-dependent number keeps carrying `ITokenizerConfidence` (`:27-30`)."
  - "The maker check at `post-slice-f00500-evidence.script.ts:152,164` stops being a ten-name allowlist whose `gpt-?[3-9]` misses `gpt-10`, and its behaviour on an unrecognised maker is the declared one rather than a pass."
  - "`canonicalModelId` cannot merge two future spellings of one model; when it cannot, the two remain distinct and that fact is reportable, not silently split into two agents with no note."
- shipped-in: `c1e32b9bb5e4`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 56b79dee9dfc, validate exit 0, tests 94/94; acceptance 3/3: (1) `buildTokenizerEstimates` (tokenizer-real.script.ts:95-124) maps every observed model that has no `TOKENIZER_PROFILES` entry to a row with `confidence: 'estima… (2) post-slice-f00500-evidence.script.ts:20 builds `MAKER_VOCABULARY` with `makerVocabulary(await readModelCatalogue())`, and llm-trailer.helper.ts:32-50 derives t… (3) model-spelling.helper.ts:104-115 documents that "a spelling that fits none, or several, stays as it was written: guessing would put one model's work under anot… — Read the delivering merge and the current implementation of every named file; each clause is implemented and asserted by the named spec. The twelve spec files of this slice group ran 94 tests green; the agent-slots and host-instructions lints both exited 0.

### S6 — An instance exists, and it reaches the durable artefacts
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-event-journal.service.ts`, `packages/core/src/lib/contracts/interfaces/work-event-journal.interface.ts`, `packages/core/tests/src/lib/work-units/work-event-journal.service.spec.ts`, `plugins/proposals/src/lib/shared/agent-names-list.ts`, `plugins/proposals/src/lib/contracts/interfaces/agent-assignment-brief.interface.ts`, `plugins/proposals/tests/src/lib/shared/agent-names-list.spec.ts`
- **Gate**: none
- acceptance:
  - "`work enter` issues an instance id and records it with the identity claim; two agents running the same model on one machine are distinguishable without either inventing a name."
  - "The instance id is readable where the journal records an actor: the line `work enter` journals carries `instance_id` (the session it stamped on the unit) beside `actor_id`, and a line without one is unchanged."
  - "`agent_names list` exposes the instance and its lease without needing `detail: true` (`agent-names-list.ts:13-21,37-40`), and `subagent-registry.json`'s shape and v1→v2 migration are unchanged."
  - "An agent whose identity resolves to an unverified claim is refused where it is refused today — `work enter` (`:172,190`), `work checkpoint`, `work publish`, `WIP_NO_AGENT_IDENTITY` (`wip-persistence.ts:145-155`) — unless the project's S3 axis says otherwise."
- shipped-in: `9f353fd457dd`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 56b79dee9dfc, validate exit 0, tests 94/94; acceptance 4/4: (1) `claimWorktree` (work-unit-shared.service.ts:349-358) issues the session when there is none — `session ?? worktreeSession(path) ?? randomUUID().slice(0, 8)` — … (2) work-event-journal.service.ts:52 writes `instance_id: entry.instance` on the line, and work-event-journal.interface.ts:19 declares `readonly instance_id?: stri… (3) agent-names-list.ts:14-28 builds every listed assignment through `brief`, which adds `instance: assignment.subscription_id` and `lease_until` when the assignme… (4) The refusals live where they did — the entry path, the checkpoint path, the publish path and `WIP_NO_AGENT_IDENTITY` in wip-persistence.ts:145-155 — and the id… — Read the delivering merge and the current implementation of every named file; each clause is implemented and asserted by the named spec. The twelve spec files of this slice group ran 94 tests green; the agent-slots and host-instructions lints both exited 0.

### S7 — Work refs carry the instance, additively
- **Status**: retired
- **Retired because**: a work ref names the unit, and a unit outlives the instance that entered it — an idle unit is adopted by another instance (`work swarm`), so an instance segment in the ref would name the wrong one after adoption, and every ref reader would have to learn a new component count for no gain. The instance is stamped on the unit's worktree at `work enter` (`worktreeSession`) and journalled (S6); that is where it is read.
- **Files**: `packages/core/src/lib/development-policy/profiles.constant.ts`
- **Gate**: none
- acceptance:
  - "`WORK_REF_SHAPE` (`profiles.constant.ts:113-114`) is unchanged, so no ref written before this proposal is rewritten or reads differently."
- shipped-in: `f0b4d6220f8f`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S8 — One identity, one author
- **Status**: done
- **Files**: `packages/core/src/lib/shared/commit-author.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/work-units/work-unit-shared.service.ts`, `packages/core/tests/src/lib/shared/commit-author-claim.spec.ts`
- **Gate**: none
- acceptance:
  - "The commit author is derived from the resolved identity claim, so the name in a work ref and the name in the author line come from one resolution rather than two paths (`commit-author.ts:103-104` versus `work-ref-naming.service.ts:33-49`)."
  - "A refactor that changes either path alone fails a gate, so the two cannot drift apart again."
  - "The durable maker attribution in git-note trailers (`commit-maker-notes.service.ts:129-141`) keeps working for refs written before this change, and a spec covers an old ref."
  - "Nothing in the author path invents a model: when the claim is unverified, the author records that it is unverified rather than writing a plausible name."
- shipped-in: `0b381d8ad8cb`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 56b79dee9dfc, validate exit 0, tests 94/94; acceptance 4/4: (1) `commitAuthorIdentityFor` (commit-author.ts:95-104) takes the resolved `IWorkAgentIdentity` and derives the author from it, and the spec compares that derivati… (2) That equality assertion IS the gate: the spec holds the author name and the ref name against each other, so changing `agentClaim`/`agentFor` without changing `… (3) The maker is read from the git notes by prefix — `git log -1 --notes=maker:* --notes=maker-remote:* --format=%N` — and the `maker:` line is taken from whatever… (4) commit-author.ts:99-103 sets `modelName` to `unverified-model` when the claim's source is `none` or `client`, and only otherwise to the claim's own id, so no m… — Read the delivering merge and the current implementation of every named file; each clause is implemented and asserted by the named spec. The twelve spec files of this slice group ran 94 tests green; the agent-slots and host-instructions lints both exited 0.

### S9 — The dogma stops asking the model to know what it cannot observe
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/constants/agent-environment.constant.ts`, `packages/core/src/lib/work-units/agent-name-canon.service.ts`, `packages/core/tests/src/lib/development-policy/served-agent-identity.spec.ts`
- **Gate**: none
- acceptance:
  - "`AGENT_IDENTITY_INSTRUCTION` no longer says "which model you are is yours to know". It states that the model declares what it has been told, that the channel it came through is recorded, and that inventing or borrowing an id is refused — keeping the force of the existing anti-forgery rules."
  - "The instruction remains served as the last line of the work model (`served-work-model.ts:53-66`) and `served-agent-identity.spec.ts:11-22` still passes, updated to the new wording and still asserting the passage contains `DELENDAI_AGENT_ID` and `exact model id`."
  - "`bun run lint:host-instructions` still passes: `AGENTS.md`, `CLAUDE.md` and `.github/copilot-instructions.md` point at `AGENT-BOOTSTRAP.md` and enumerate no ids (`host-instructions.script.ts:5-13`, `:37-42`)."
  - "A spec asserts the served instruction contains no instruction to self-report a model from memory, so the wording cannot regress by re-adding it."
- shipped-in: `f0b4d6220f8f`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- `IWorkAgentIdentity` gains a channel, a confidence and a reason, alongside the existing `id` and `source`. `source` keeps its six values and their meanings; the union is no longer the only way to name a channel, so an unrecognised channel id is carried and reported rather than impossible to express.
- An unresolved claim is one value, not two: `client-<app>` and `unknown-agent` both yield a claim whose `reason` distinguishes *a program connected* from *nothing declared anything*. Both still fail `describeAgentNameShape` the way they do today.
- A spec runs a source unknown to the system and asserts the claim is returned with its channel preserved, not coerced to `none`.
- The precedence array at `resolve-work-agent.service.ts:117-123` becomes a declared ordered list. Reordering it is a data change; the existing order `model → environment → provider → client` is the default and is unchanged.
- A spec asserts the default order resolves exactly as today and that a reordered declaration changes which source wins.
- The `development.identity` axis gains one control for unverified claims, naming what they may do — at minimum `refuse`, alongside the existing `unrecognizedModel` behaviour — and it is enforced at the single resolution point, not at each consumer.
- `validateDevelopmentPolicy` names an unusable value back to the operator, as it does for the existing axis members (`validate.ts:106-128`), and the JSON schema and the Zod schema are updated in the same slice.
- A project that declares nothing keeps today's behaviour exactly: the chain resolves, `unknown-agent` still appears in a ref, and every refusal listed in `why` still refuses.
- A spec drives a policy that permits an unverified claim and one that refuses it, and asserts the difference is visible at resolution and nowhere else.
- The host catalogues are reduced to one declared source with the others derived or delegating to it, the way `AGENT_SLOTS` already governs roles through `agent-slots-in-sync.script.ts:4-8`.
- An unrecognised host keeps a distinct value instead of collapsing to `'unknown'` (`agent-identity.interface.ts:29-33`), so two different unlisted hosts are two different names.
- An unrecognised host application still fails the program-not-model check (`kindInAgent`, `work-unit-shared.service.ts:263-278`).
- The lint fails on any new host list added without being declared in the single source, so the count of parallel lists cannot grow again.
- A model absent from `TOKENIZER_PROFILES` produces a row with the declared generic `bytes/4` estimate at `estimated-byte-ratio` confidence, instead of the silent omission `measurePresetTokenizerCosts` performs today (`tokenizer-real.script.ts:113-139`). Every model-dependent number keeps carrying `ITokenizerConfidence` (`:27-30`).
- The maker check at `post-slice-f00500-evidence.script.ts:152,164` stops being a ten-name allowlist whose `gpt-?[3-9]` misses `gpt-10`, and its behaviour on an unrecognised maker is the declared one rather than a pass.
- `canonicalModelId` cannot merge two future spellings of one model; when it cannot, the two remain distinct and that fact is reportable, not silently split into two agents with no note.
- `work enter` issues an instance id and records it with the identity claim; two agents running the same model on one machine are distinguishable without either inventing a name.
- The instance id is readable where the journal records an actor: the line `work enter` journals carries `instance_id` (the session it stamped on the unit) beside `actor_id`, and a line without one is unchanged.
- `agent_names list` exposes the instance and its lease without needing `detail: true` (`agent-names-list.ts:13-21,37-40`), and `subagent-registry.json`'s shape and v1→v2 migration are unchanged.
- An agent whose identity resolves to an unverified claim is refused where it is refused today — `work enter` (`:172,190`), `work checkpoint`, `work publish`, `WIP_NO_AGENT_IDENTITY` (`wip-persistence.ts:145-155`) — unless the project's S3 axis says otherwise.
- The commit author is derived from the resolved identity claim, so the name in a work ref and the name in the author line come from one resolution rather than two paths (`commit-author.ts:103-104` versus `work-ref-naming.service.ts:33-49`).
- A refactor that changes either path alone fails a gate, so the two cannot drift apart again.
- The durable maker attribution in git-note trailers (`commit-maker-notes.service.ts:129-141`) keeps working for refs written before this change, and a spec covers an old ref.
- Nothing in the author path invents a model: when the claim is unverified, the author records that it is unverified rather than writing a plausible name.
- `AGENT_IDENTITY_INSTRUCTION` no longer says "which model you are is yours to know". It states that the model declares what it has been told, that the channel it came through is recorded, and that inventing or borrowing an id is refused — keeping the force of the existing anti-forgery rules.
- The instruction remains served as the last line of the work model (`served-work-model.ts:53-66`) and `served-agent-identity.spec.ts:11-22` still passes, updated to the new wording and still asserting the passage contains `DELENDAI_AGENT_ID` and `exact model id`.
- `bun run lint:host-instructions` still passes: `AGENTS.md`, `CLAUDE.md` and `.github/copilot-instructions.md` point at `AGENT-BOOTSTRAP.md` and enumerate no ids (`host-instructions.script.ts:5-13`, `:37-42`).
- A spec asserts the served instruction contains no instruction to self-report a model from memory, so the wording cannot regress by re-adding it.
