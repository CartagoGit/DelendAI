---
id: f00784
title: "Batuta runs its hops on any ACP agent and any catalogue provider: an acp kind, an invoker over the ACP driver, and a roster fed by what is detected"
kind: feat
status: ready
type: proposal
track: batuta
date: 2026-10-21
---

# f00784 — Batuta runs its hops on any ACP agent and any catalogue provider: an acp kind, an invoker over the ACP driver, and a roster fed by what is detected

## goal

A hop Batuta routes can run on any agent the ACP registry or a declaration describes, and on any models.dev provider whose key is set, with the same routing, quota holds, spend checks, journal and cancel as the four kinds it has today. The roster is fed by what `delendai agents list` finds, so an agent installed tomorrow is a routable provider without a delendai release.

## why

f00783 lets delendai find, declare, install and greet any agent (ACP registry, declarations, PATH, IDEs, packages) and call any catalogue provider through its API family. Batuta does not use any of that yet: `InvocationManager.runOne` picks an invoker by `ProviderKind` (`api`, `subscription`, `cli`, `mcp-server`), and each client still needs its own argv in KNOWN_CLIENTS. The owner, 2026-10-21: 'lo que quiero realmente es que el sistema sea capaz de detectar y configurar para su uso cualquier llm, agente, cli, host o lo que sea para que delendai y batuta en específico puedan usarlo y trabajar con ellos'.

## non-goals

- Replacing the existing kinds: a `cli` or `subscription` entry keeps working as it does.
- Unattended spend without the person's consent: an ACP hop goes through the same spend check, quota hold and confirmBeforeExecute as any other.
- Auto-approving what an agent asks to do: permission requests follow the hop's toolsAllow and are refused otherwise.

## slices

- global_gate: type

### S1 — An acp provider kind and its invoker
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts`, `plugins/orchestrator-runner/src/lib/invoke/acp-invoker.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`
- **Gate**: type
- acceptance:
  - "`ProviderKind` gains `acp`; a roster entry `invoke.acp` names an agent id (registry or declared) or a command with args. The acp invoker starts it through the f00783 driver, sends the hop's prompt, streams its text, maps its usage to the journal, and cancels on timeout or user cancel."
  - "A permission request is allowed only when the tool it names is in the hop's `toolsAllow`; every other request is refused, and the refusal is journalled."

### S2 — Catalogue providers as api hops
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/catalogue-api-invoker.ts`
- **Gate**: type
- acceptance:
  - "An `api` roster entry that names a models.dev provider id (and a model) is called through the f00783 provider adapter (OpenAI-compatible, OpenAI, Anthropic), with the key read from the provider's variable at call time; usage is journalled; an unsupported family or a missing key fails the hop with that reason and the chain falls back."

### S3 — A roster fed by what is detected
- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/lib/discovery/acp-roster.ts`, `plugins/orchestrator-runner/src/lib/tools/discover.tool.ts`
- **Gate**: type
- acceptance:
  - "Discovery proposes a roster entry for every agent `listAgents` can start over ACP and for every catalogue provider whose key is set, with its capabilities taken from what the agent says (modes, prompt capabilities) and its cost class from the account it runs on; nothing is added without the existing discovery consent."

### S4 — One real hop, proved
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/tests/src/lib/invoke/acp-invoker.spec.ts`, `docs/delendai/batuta/guide.md`
- **Gate**: type
- acceptance:
  - "A spec drives a full invoke through the manager to a fake ACP agent over stdio (prompt, streamed text, a refused permission, usage in the journal, cancel). The Batuta guide says how an ACP agent and a catalogue provider become routable, and the owner's machine proves one consented hop on OpenCode over ACP."

## acceptance

- `ProviderKind` gains `acp`; a roster entry `invoke.acp` names an agent id (registry or declared) or a command with args. The acp invoker starts it through the f00783 driver, sends the hop's prompt, streams its text, maps its usage to the journal, and cancels on timeout or user cancel.
- A permission request is allowed only when the tool it names is in the hop's `toolsAllow`; every other request is refused, and the refusal is journalled.
- An `api` roster entry that names a models.dev provider id (and a model) is called through the f00783 provider adapter (OpenAI-compatible, OpenAI, Anthropic), with the key read from the provider's variable at call time; usage is journalled; an unsupported family or a missing key fails the hop with that reason and the chain falls back.
- Discovery proposes a roster entry for every agent `listAgents` can start over ACP and for every catalogue provider whose key is set, with its capabilities taken from what the agent says (modes, prompt capabilities) and its cost class from the account it runs on; nothing is added without the existing discovery consent.
- A spec drives a full invoke through the manager to a fake ACP agent over stdio (prompt, streamed text, a refused permission, usage in the journal, cancel). The Batuta guide says how an ACP agent and a catalogue provider become routable, and the owner's machine proves one consented hop on OpenCode over ACP.
