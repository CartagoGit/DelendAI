---
id: x00887
title: "The model a chat provider serves reaches delendai through a channel the product owns"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-13
last-transition-id: cd41dbeb-ae41-4d4d-b545-d05badf01195
last-correlation-id: cd41dbeb-ae41-4d4d-b545-d05badf01195
last-transition-from: review
last-transition-at: 2026-10-14T12:55:22.016Z
shipped-in:
  - "84b48b38e"
---

# x00887 — The model a chat provider serves reaches delendai through a channel the product owns

## goal

Work done through a chat provider such as Universal Chat Provider is named after the model that served it, through a published contract delendai reads, reports and helps install, never through a hand-patched third-party bundle.

## why

PR #1037 (qwen-3.8-max) added a `provider` identity source: a chat provider writes the model that served each request to `~/.cache/delendai/provider-model.json`, and `resolveWorkAgentId` reads it between the environment and the MCP client name. f00758 (in review) then made the source a policy axis. The reading side is sound: freshness window, workspace check, lazy read, hermetic specs. The writing side is not part of the product. A review on 2026-10-13, after the owner reported that models served through Universal Chat Provider are still not detected, found:

1. **The writer is a hand edit of a third-party bundle.** `maxdewald.universal-chat-provider-1.1.0/dist/index.cjs` under `~/.vscode-server/extensions` was edited in place on 2026-10-12 05:34. It sits in no repository, nobody reviewed it, and the next extension update erases it.
2. **It never ran.** The remote extension host last activated the extension at 03:55 that day and has not reloaded since. The Windows-side copy, which also activates, is unpatched. `~/.cache/delendai/provider-model.json` has never existed on this machine.
3. **Nothing says so.** An absent, stale or foreign bridge reads as `undefined` without a word. With the default `unrecognizedModel: refuse`, work is refused, and the refusal does not say that no provider publishes.
4. **One machine-wide file serves every window.** Two windows on different workspaces overwrite each other's entry, and the reader correctly rejects the other workspace's entry. Each window therefore loses its identity whenever the other one speaks.
5. **The contract is only in a JSDoc.** A provider author has no published format to implement. The only consumer-facing description is the patch itself.
6. **Host boundaries are not crossed.** A provider in the local (Windows) extension host writes to that host's home, while a server in WSL or a remote reads its own. The `DELENDAI_PROVIDER_MODEL_FILE` override exists, but nothing sets it.

## non-goals

- Guessing a model from the host application name, or scraping a provider's private logs (the proxy does log `model=` per request, but that format is not a contract).
- Changing f00758's policy axis or the order of the identity chain.
- Editing installed third-party extensions. That path is what this proposal replaces.

## slices

- global_gate: type

### S1 — A published bridge contract, one entry per workspace

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-identity/provider-model-bridge.helper.ts`
  - `packages/core/src/lib/work-identity/provider-model-bridge.constant.ts`
  - `packages/core/tests/src/lib/work-identity/provider-model-bridge.spec.ts`
  - `docs/delendai/configuration/provider-model-bridge.md`
  - `packages/core/src/lib/contracts/interfaces/provider-model-reading.interface.ts`
- **Gate**: type
- acceptance:
  - The format (model, at, provider, workspace) and where it is written are documented for provider authors in a page delendai publishes. The page is host-agnostic and names no single provider as the reference.
  - Entries are kept per workspace (a map, or one file per workspace key), so two windows on different workspaces never erase each other. The single-file format is still read.
- shipped-in: `37b96b404cb6`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 84b48b38e, validate exit 0, tests 14/14; acceptance 2/2: (1) docs/delendai/configuration/provider-model-bridge.md exists (41 lines) and documents the four fields with a worked example whose provider is the generic `"my-c… (2) Pinned by three named passing tests in provider-model-bridge.spec.ts: 'only reads a bridge entry written for this workspace', 'keeps one entry per workspace, s… — Delivered by 37b96b404 ("feat(identity): the model at work is read from the editor's own chat sessions,…"), carrying the files; approved at the merge 84b48b38e (PR #1056) per the supersede guard. Gate `type`. ACC0: docs/delendai/configuration/provider-model-bridge.md exists (41 lines) and documents the four fields with a worked example whose provider is the generic `"my-chat-provider"` at :20, alongside `"model": "claude-opus-5-5"` at :19. I checked that clause carefully because "names no single provider as the reference" is easy to satisfy by accident and easy to violate by example — a page that used a real vendor in the `provider` field would name it as the reference. It does not: the provider slot is the placeholder `my-chat-provider`, the model value is only sample data in a payload, and the entries are keyed per workspace (`"entries": { "/work/acme": {…} }`). ACC1 is pinned by three named passing tests in provider-model-bridge.spec.ts: 'only reads a bridge entry written for this workspace', 'keeps one entry per workspace, so two windows do not erase each other' (the criterion's own sentence as a test title), and 'ignores an entry from a conversation in another workspace' — the negative direction that prevents the cross-window erase. Suite 14 pass / 0 fail, the 14/14 above.

### S2 — The bridge's state is reported, never silent

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-identity/provider-model-bridge.helper.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/core/src/cli.ts`
  - `packages/cli/src/index.ts`
  - `packages/core/tests/src/lib/work-identity/provider-model-bridge.spec.ts`
- **Gate**: type
- acceptance:
  - The bridge reports why it gave nothing: `absent`, `stale` (with its age), `other-workspace` or `malformed`. `work enter`'s identity refusal and the server's start-up notice show that reason and the remedy (a provider that publishes, `DELENDAI_PROVIDER_MODEL_FILE`, or `DELENDAI_AGENT_ID`).
- shipped-in: `37b96b404cb6`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 84b48b38e, validate exit 0, tests 14/14; acceptance 1/1: (1) All four reasons exist as the criterion spells them, in provider-model-bridge.helper.ts: `absent` at :79, `malformed` at :85/:88/:105, `other-workspace` at :10… — Delivered by 37b96b404 and approved at the merge 84b48b38e (PR #1056) per the supersede guard. Gate `type`. This slice exists so a silent identity reads as a refusal with a remedy rather than as silence, so I checked the vocabulary literally rather than inferring it from a test count. All four reasons exist in provider-model-bridge.helper.ts exactly as the criterion spells them: `absent` at :79, `malformed` at :85, :88 and :105, `other-workspace` at :100, and `stale` at :108 — and the stale case carries `ageMs` next to the reason, which is the criterion's "with its age", not a bare label. Then the rendering half: work-unit-enter.service.ts:176 composes the refusal as the identity remedy naming DELENDAI_AGENT_ID plus `Provider bridge: ${providerBridgeSilence(providerModelReading({ workspace: root }))}`, so the reason reaches the person whose `work enter` refused. The 'never guess' property is pinned by the test 'refuses a malformed or model-less entry rather than guessing'. Suite 14 pass / 0 fail, the 14/14 above.

### S3 — The model is read from the editor itself, no provider needed

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-identity/host-chat-model.helper.ts`
  - `packages/core/src/lib/contracts/constants/host-chat-model.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/host-chat-model.interface.ts`
  - `packages/core/src/lib/work-identity/provider-model-bridge.helper.ts`
  - `packages/core/tests/src/lib/work-identity/host-chat-model.helper.spec.ts`
  - `tools/scripts/lib/hermetic-agent-bridge-setup.ts`
  - `packages/core/src/lib/scan/dip-violation.ts`
  - `packages/core/tests/src/lib/scan/dip-violation.spec.ts`
- **Gate**: type
- acceptance:
  - The owner ruled out a contribution to a provider's repository (2026-10-13): delendai learns the model without any program's cooperation.
  - VS Code-family editors (Code, Insiders, Cursor, VSCodium, Windsurf; their Windows side from WSL included) record, for every chat request, the model it went to (`modelId`, `<vendor>/<id>`), in the chat sessions they keep per workspace. When no provider publishes the bridge, the newest of those sessions for the workspace, or one containing it, names the model while it is recent.
  - Specs never read the machine's editor: the hermetic setup points the observer at an empty directory.
- shipped-in: `37b96b404cb6`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 84b48b38e, validate exit 0, tests 14/14; acceptance 3/3: (1) Pinned by 'names the model through the bridge reading when no provider publishes' — the editor's own chat sessions are read directly, with no provider particip… (2) Pinned by three passing tests in host-chat-model.helper.spec.ts: 'reads the last request of the workspace, a worktree inside it included' (the "or one containi… (3) Confirmed in the delivered setup file: tools/scripts/lib/hermetic-agent-bridge-setup.ts resolves the bridge path under tmpdir() at three call sites (:19, :26, … — Delivered by 37b96b404 (6 of 8 declared files) and approved at the merge 84b48b38e (PR #1056) per the supersede guard. Gate `type`. ACC0 is the design constraint that makes the other two interesting: the owner ruled out asking a provider's project for cooperation, so the model must come from files the editor already writes. The test that pins it is 'names the model through the bridge reading when no provider publishes' — the fallback fires precisely when the cooperative path is unavailable. ACC1's clauses each have a named passing test: 'reads the last request of the workspace, a worktree inside it included' covers the "or one containing it" clause (a linked worktree's sessions are found from the parent workspace's folder), 'says nothing about a session too old to be the one working now' pins the freshness bound — without it a stale session would name yesterday's model — and 'names the model through the bridge reading when no provider publishes' confirms the ordering the criterion specifies. Suite 4 pass / 0 fail. ACC2 is the one a reviewer should not take on trust, because a hermetic setup that fails open makes every test machine-dependent, so I read the delivered file: tools/scripts/lib/hermetic-agent-bridge-setup.ts resolves the bridge path under tmpdir() at three call sites (:19, :26, :30), its header says "no test reads the machine's provider", and :10 names the failure it prevents — the observer aimed at the real editor. The associated dip-violation.spec.ts is green at 10 pass / 0 fail.

### S4 — One identity per model, its release stage included

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-identity/model-identity.helper.ts`
  - `packages/core/src/lib/work-identity/model-spelling.helper.ts`
  - `packages/core/src/lib/work-identity/resolve-work-agent.service.ts`
  - `packages/core/tests/src/lib/work-identity/model-identity.helper.spec.ts`
  - `packages/core/src/lib/work-identity/identity-policy.helper.ts`
  - `packages/core/src/lib/development-policy/resolve-identity.ts`
  - `packages/core/src/lib/development-policy/resolve.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/policy-identity.interface.ts`
  - `packages/core/src/lib/plugins/development-config-schema.constant.ts`
  - `packages/core/schema/delendai.config.schema.json`
- **Gate**: type
- acceptance:
  - Observed on 2026-10-13: one model signed reviews and work as `minimax-3`, `minimax-3.1`, `minimax-m3`, `minimax-m3.1`, `minimax-m31` and `MiniMax-M3`. The editor's record names it `minimax/MiniMax-M3.1-Flash-Preview`.
  - Every model id an identity source gives is named canonically: the vendor's own id, lower-cased, its stage (`preview`) kept, so the released model is a different identity. A spelling that names no model exactly is resolved to the one model this machine was seen running whose brand, version digits and words it fits. A spelling that fits several models, or none, is kept as written. A client application's name is never treated as a model.
  - The models seen are remembered in the user cache (`~/.cache/delendai/models-seen.json`, overridable), fed by the editor observation.
  - A project declares spellings for agents whose machine never saw the model in an editor (a swarm on another host): `development.identity.aliases`, e.g. `{ "minimax-3.1": "minimax/MiniMax-M3.1-Flash-Preview" }`, applied to every source but a client's name.
- shipped-in: `37b96b404cb6`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 84b48b38e, validate exit 0, tests 14/14; acceptance 4/4: (1) The six observed spellings and the editor's own id are both recorded, and they are what the canonicalisation exists to reconcile. Verified in the model-identit… (2) Pinned by the model-identity spec's canonicalisation and ambiguity cases (14 pass / 0 fail), which cover the resolved case, the ambiguous case kept as written,… (3) Confirmed in the delivered code: model-identity.helper.ts imports SEEN_MODELS_FILE (host-chat-model.constant.ts:25 names it 'models-seen.json'), and `seenModel… (4) The declared axis exists in the plugin config and the schema: plugins/proposals/src/index.ts:151 declares redactIdentity and the identity axis carries aliases;… — Delivered and approved at the merge 84b48b38e (PR #1056) per the supersede guard. Gate `type`. This is the slice that motivated the whole proposal — one model signing as six different identities — so I checked each criterion against the delivered mechanism rather than against a pass count. ACC2 is the literal one and it is confirmed in code: model-identity.helper.ts imports SEEN_MODELS_FILE, which host-chat-model.constant.ts:25 names 'models-seen.json', and `seenModelsPath` at :32-38 defaults to join(homedir(), '.cache', 'delendai', SEEN_MODELS_FILE) after consulting an environment override — the criterion's exact path AND its overridability, both present. ACC3 exists for the swarm case the observed spellings reveal: an agent on another host never ran in this machine's editor, so its model cannot be in the cache, and the project must be able to declare it — which it does through the identity axis, with applyIdentityPolicy as the single applier shared by the agent engine, the CLI and commit-policy, and the rule excluding a client's name so an alias cannot land on 'Visual Studio Code'. ACC1's spec suite (14 pass / 0 fail, the 14/14 above) covers canonicalisation to the vendor's lower-cased id with its stage kept, resolution of an unmatched spelling to the one seen model it fits, and the two honest refusals: ambiguous or unfitting spellings are kept as written rather than guessed.

## acceptance

- In a VS Code window served by Universal Chat Provider or any other model provider, a `work enter` with no `--agent` and no `DELENDAI_AGENT_ID` names the unit after the model the editor recorded serving the turn, with no cooperation from the provider. With the provider absent, the refusal says that no provider publishes and how to fix it.
- Two windows on different workspaces served by different models each keep their own identity.
