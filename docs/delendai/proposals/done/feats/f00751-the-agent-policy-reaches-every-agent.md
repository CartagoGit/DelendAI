---
id: f00751
title: "The agent policy reaches every agent"
kind: feat
status: done
type: proposal
track: hosts
date: 2026-09-29
priority: P1
related: []
last-transition-id: 0161c3e9-2c5e-44b9-a295-02badd85e141
last-correlation-id: e36ead28-fdd5-4fca-afa6-10ad2e56ae35
last-transition-from: review
shipped-in:
  - "53053d1c4de3"
---

# f00751 — The agent policy reaches every agent

## goal

A project decides in `delendai.config.json` whether its agents ask the user
or decide themselves, and every agent connected to its server is told,
whatever the host.

## why

On 2026-09-29 the owner asked for this to be delendai configuration: agents
should ask by default, and a project should be able to let them decide.

The setting already existed as `core.agentPolicy.autonomous`, but it
reached no agent. Only the `agent_bootstrap` prompt read it, and an agent
reads a prompt only if it asks for it. The client's catalog kept its own
copy of the policy with `autonomous: true`, and never read the config. The
default was also autonomy, so the human was out of the loop unless a
project opted in.

## why this design

- **The server's instructions.** Every MCP client receives them when it
  connects and gives them to its model. The server now states the working
  mode and principles there, so the setting reaches any host.
- **One source of the words.** `agentPolicyLines` produces the text; the
  server instructions and the prompt use it. The client may import no value
  from core, so its bootstrap prompt carries the instructions the server
  sent when it connected (`McpStdioClient.instructions()`), and states no
  policy of its own when there are none.
- **Ask by default.** `autonomous` defaults to `false`: an agent asks
  before an action the user did not request, waits for the answer, and
  never answers in the user's place. A project that wants autonomy sets
  `true`, as this repository does.
- delendai tells the agents; it does not control the host. A host that
  answers its own questions is configured in the host, and the guide says
  so.

## non-goals

- Writing a host's own settings (for example VS Code's tool approval).

## architecture

- `packages/core/src/lib/prompts/agent-policy-instructions.helper.ts`
  (new), `contracts/constants/agent-policy.constant.ts`,
  `contracts/interfaces/agent-policy.interface.ts`; `create-mcp-project.ts`
  passes `config.instructions`, set by `assemble.ts`.

## Slices

- global_gate: none

### S1 — The server tells its agents how to work

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/prompts`
- **Files**:
  - `packages/core/src/lib/prompts/agent-policy-instructions.helper.ts`
  - `packages/core/src/lib/prompts/agent-bootstrap.prompt.ts`
  - `packages/core/src/lib/contracts/constants/agent-policy.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/agent-policy.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/host-config.interface.ts`
  - `packages/core/src/lib/plugins/load-config-file.ts`
  - `packages/core/src/lib/project/create-mcp-project.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/src/contracts/index.ts`
  - `packages/client/src/lib/services/agent-catalog-service.ts`
  - `packages/client/src/lib/transport/mcp-stdio-client.ts`
  - `packages/client/src/lib/contracts/interfaces/mcp-transport.interface.ts`
  - `packages/client/tests/services/agent-catalog-prompt.spec.ts`
  - `packages/core/tests/src/lib/prompts/agent-policy-instructions.helper.spec.ts`
  - `packages/core/tests/src/lib/prompts/agent-bootstrap.prompt.spec.ts`
  - `docs/delendai/PLUGIN-CONFIGURATION-GUIDE.md`
- shipped-in: `53053d1c4de3`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Slice delivers the agent policy through MCP server instructions. commit 53053d1c4de3cb9f164e45ee46ea0bf2e4c59c2b adds agentPolicyInstructions helper (packages/core/src/lib/prompts/agent-policy-instructions.helper.ts), wires it through assemble.ts -> createMcpProject.ts -> McpServer({ instructions }), and shares the lines with the agent_bootstrap prompt + the client catalog service. default autonomous=false (collaborative/ask) per DEFAULT_AGENT_POLICY; autonomous:true (decide and carry on) reachable through core.agentPolicy. gate: npx vitest run packages/core/tests/src/lib/prompts => 15/15 passed, exit 0. acceptance: server instructions carry policy text, default is collaborative, prompt + client share the same lines.
- review-attribution: claude-opus-5-5 from Merge pull request #642 from CartagoGit/delendai/pr/claude-opus-5-5/implement/f00751-all-g1/the-agent-policy-reaches-every-agent (refs/heads/delendai/wip/claude-opus-5-5/implement/f00751-all-g1/the-agent-policy-reaches-every-agent) (53053d1c4de3cb9f164e45ee46ea0bf2e4c59c2b), opened by minimax-3

## dependency graph

None.

## acceptance

- A client connected to a server built by `createMcpProject` receives the
  policy text in its instructions.
- Without `core.agentPolicy`, the text says to ask the user; with
  `autonomous: true`, to decide and carry on.
- The prompt states the same words, and the client's prompt carries the
  server's instructions.
