---
id: x00887
title: "The model a chat provider serves reaches delendai through a channel the product owns"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-13
last-transition-id: 950e9949-caa6-40f4-8732-d85605dc1920
last-correlation-id: 950e9949-caa6-40f4-8732-d85605dc1920
last-transition-from: in-progress
last-transition-at: 2026-10-13T10:39:40.207Z
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

- **Status**: review
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
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `37b96b404cb6`

### S2 — The bridge's state is reported, never silent

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-identity/provider-model-bridge.helper.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/core/src/cli.ts`
  - `packages/cli/src/index.ts`
  - `packages/core/tests/src/lib/work-identity/provider-model-bridge.spec.ts`
- **Gate**: type
- acceptance:
  - The bridge reports why it gave nothing: `absent`, `stale` (with its age), `other-workspace` or `malformed`. `work enter`'s identity refusal and the server's start-up notice show that reason and the remedy (a provider that publishes, `DELENDAI_PROVIDER_MODEL_FILE`, or `DELENDAI_AGENT_ID`).
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `37b96b404cb6`

### S3 — The model is read from the editor itself, no provider needed

- **Status**: review
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
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `37b96b404cb6`

### S4 — One identity per model, its release stage included

- **Status**: review
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
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- In a VS Code window served by Universal Chat Provider or any other model provider, a `work enter` with no `--agent` and no `DELENDAI_AGENT_ID` names the unit after the model the editor recorded serving the turn, with no cooperation from the provider. With the provider absent, the refusal says that no provider publishes and how to fix it.
- Two windows on different workspaces served by different models each keep their own identity.
