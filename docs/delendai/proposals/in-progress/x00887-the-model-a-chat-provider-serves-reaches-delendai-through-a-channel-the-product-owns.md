---
id: x00887
title: "The model a chat provider serves reaches delendai through a channel the product owns"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-13
last-transition-id: 0be7674e-66be-443a-8640-1c31e0bd03db
last-correlation-id: 0be7674e-66be-443a-8640-1c31e0bd03db
last-transition-from: ready
last-transition-at: 2026-10-13T04:11:30.063Z
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

- **Status**: pending
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

### S2 — The bridge's state is reported, never silent

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/work-identity/provider-model-bridge.helper.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/core/src/cli.ts`
  - `packages/cli/src/index.ts`
  - `packages/core/tests/src/lib/work-identity/provider-model-bridge.spec.ts`
- **Gate**: type
- acceptance:
  - The bridge reports why it gave nothing: `absent`, `stale` (with its age), `other-workspace` or `malformed`. `work enter`'s identity refusal and the server's start-up notice show that reason and the remedy (a provider that publishes, `DELENDAI_PROVIDER_MODEL_FILE`, or `DELENDAI_AGENT_ID`).

### S3 — The writer comes from a channel the product owns

- **Status**: pending
- **Files**:
  - `extensions/vscode/src`
- **Gate**: type
- acceptance:
  - The bridge's writer is delivered by a channel delendai owns or that the provider's author accepts upstream: delendai's own VS Code extension where the host API exposes the serving model, or an upstream contribution to the provider implementing the S1 contract. Opening that contribution is an outward action and needs the owner's go-ahead. No step edits an installed extension.
  - When the provider and the server run in different hosts (local UI against WSL or a remote), the server is told where the provider writes. For example, delendai's extension sets `DELENDAI_PROVIDER_MODEL_FILE` when it registers the server, so an entry written on one side is read on the other.

## acceptance

- In a VS Code window served by Universal Chat Provider, a `work enter` with no `--agent` and no `DELENDAI_AGENT_ID` names the unit after the model that served the turn. With the provider absent, the refusal says that no provider publishes and how to fix it.
- Two windows on different workspaces served by different models each keep their own identity.
