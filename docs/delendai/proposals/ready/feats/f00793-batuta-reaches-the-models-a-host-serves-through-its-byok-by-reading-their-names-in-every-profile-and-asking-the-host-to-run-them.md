---
id: f00793
title: "Batuta reaches the models a host serves through its BYOK, by reading their names in every profile and asking the host to run them"
kind: feat
status: ready
type: proposal
track: batuta
date: 2026-10-27
---

# f00793 — Batuta reaches the models a host serves through its BYOK, by reading their names in every profile and asking the host to run them

## goal

Batuta knows every model a host editor serves on the person's own keys (Copilot BYOK in VS Code: vendors, model ids, capabilities, in every profile), never reading a credential, and can run a task on one of them by asking the host through MCP sampling when the person has allowed it. Each model is a roster entry with its route, its state (`usable`, `not-allowed`, `host-unavailable`) and the evidence, detected when the server starts on whatever machine it runs.

## why

Owner's dogfood, 2026-10-27. The owner serves MiniMax, Alibaba (qwen3.8-max/flash, deepseek-v4, glm-5.2), the GLM Coding Plan (glm-5.3, glm-5.3-flash), xAI, OpenCode Go and a universal provider through Copilot BYOK, and wants Batuta to hand light work to them. f00781 concluded that Copilot keeps BYOK models in secret storage because `<User>/chatLanguageModels.json` is empty: the models live in the active profile's copy, `<User>/profiles/<id>/chatLanguageModels.json`, which nothing read. Found, they still had no route: the keys are the host's, so the route that keeps them there is MCP sampling (`sampling/createMessage` with a model hint), which VS Code grants per server (`chat.mcp.serverSampling`), and no invoker uses it. The owner also asked that nothing of this be tied to one computer: a clone on another machine has another editor layout, or none, and must detect and configure itself when the server starts.

## non-goals

- Reading, copying or forwarding any credential the host holds; calling a BYOK endpoint directly.
- Changing the person's editor settings on its own: Batuta says which setting would allow a model; the person (or an explicit command they run) changes it.
- Host-specific code outside a host reader: the roster and the sampling invoker are host-neutral.

## slices

- global_gate: type

### S1 — The host's BYOK roster, by name, detected at start
- **Status**: pending
- **Files**: `packages/cli/src/contracts/constants/offer-messages.constant.ts`, `packages/core/schema/delendai.config.schema.json`, `packages/core/src/cli.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/contracts/constants/host-byok.constant.ts`, `packages/core/src/lib/contracts/constants/provider-account-modes.constant.ts`, `packages/core/src/lib/contracts/constants/provider-entry-schema.constant.ts`, `packages/core/src/lib/contracts/interfaces/account-finding.interface.ts`, `packages/core/src/lib/contracts/interfaces/host-byok.interface.ts`, `packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts`, `packages/core/src/lib/plugins/account-offer-flow.service.ts`, `packages/core/src/lib/plugins/account-offers.service.ts`, `packages/core/src/lib/shared/account-sources.service.ts`, `packages/core/src/lib/shared/host-model-roster.service.ts`, `packages/core/tests/src/lib/plugins/account-offers.service.spec.ts`, `packages/core/tests/src/lib/shared/host-model-roster.service.spec.ts`, `packages/cli/src/contracts/constants/offer-messages.constant.spec.ts`
- **Gate**: type
- acceptance:
  - "Every editor profile's `chatLanguageModels.json` (JSON with comments) is read for vendor, provider name, model id, display name, endpoint host, tool calling, vision, thinking, context window and reasoning efforts; no other field — a key, a header, a token — is returned, stored, logged or compared, and a spec proves no fixture key value appears in any output."
  - "The roster names each model's profile and which profile the workspace opens in (the editor's own association); on the owner's machine it lists the delendai workspace's profile, not the empty root file."
  - "Nothing is configured per machine: the roster is detected when the MCP server starts, on whatever layout it runs (Windows from WSL, macOS, Linux, no profiles, no editor), kept in the user cache, and a machine without BYOK gets an empty roster and says so; the repository holds no machine's providers."
  - "The account offer (f00781) offers each BYOK provider as an account whose credential mode is `host-held`."

### S2 — Asking the host to run a model
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/AGENT.md`, `plugins/orchestrator-runner/src/index.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/host-sampling.interface.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`, `plugins/orchestrator-runner/src/lib/invoke/handoff.ts`, `plugins/orchestrator-runner/src/lib/router/advise.ts`, `plugins/orchestrator-runner/src/lib/schemas.ts`, `plugins/orchestrator-runner/src/lib/services/acp-roster.service.ts`, `plugins/orchestrator-runner/src/lib/services/host-sampler.service.ts`, `plugins/orchestrator-runner/src/lib/invoke/host-sampling-invoker.service.ts`, `plugins/orchestrator-runner/src/lib/tools/discover.tool.ts`, `plugins/orchestrator-runner/tests/e2e/fallback-chain.e2e.spec.ts`, `plugins/orchestrator-runner/tests/e2e/invoke-real-subprocess.e2e.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/invoke/acp-invoker.service.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/invoke/manager-journal.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/invoke/manager.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/invoke/unicode-safe-prompt.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/services/acp-roster.service.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/invoke/host-sampling-invoker.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A `host-sampling` invoker sends `sampling/createMessage` with the model as a hint and returns the host's reply, the model the host says it used and the stop reason; a host that does not offer sampling, refuses, or serves another model than the one hinted is a structured outcome, never a silent substitution."
  - "Discovery proposes each BYOK model as a roster entry routed through `host-sampling`, for the person to confirm; a call says `host-unavailable` outside a host that samples, `host-refused` with the setting that would allow the model (VS Code: `chat.mcp.serverSampling`) when the host declines, and `host-substituted` when it answers with another model."

### S3 — Dogfood evidence
- **Status**: pending
- **Files**: `docs/delendai/BATUTA.md`
- **Gate**: none
- acceptance:
  - "On the owner's machine, with sampling allowed for the delendai server, one real hop each to a qwen, a glm and a MiniMax model runs through Batuta and is journalled with its outcome; the guide records what was proved and what was not."
  - "A throwaway project outside this repository, set up with `delendai init`, shows its own machine's roster and route with no delendai-specific configuration."

## acceptance

- The host's BYOK models are listed by name from every profile, detected at server start on any machine, and no credential value reaches any output.
- Batuta runs a task on a BYOK model only through the host's sampling, and says why when it cannot.
- Real hops on the owner's machine and a foreign project prove the route.

## notes

- The roster code landed in a commit titled for the proposal text (be82afc7a): the code commit before it was refused by a hook, and the files it had staged went with the next one.
- Whether a host allows a model is learned when it is asked, not read ahead from the editor's settings: the setting's keys name servers the way each editor labels them, and the answer the host gives is the evidence.
- `host-sampling` stays a spending kind under the runner's spend guard: the model runs on the person's own key.
