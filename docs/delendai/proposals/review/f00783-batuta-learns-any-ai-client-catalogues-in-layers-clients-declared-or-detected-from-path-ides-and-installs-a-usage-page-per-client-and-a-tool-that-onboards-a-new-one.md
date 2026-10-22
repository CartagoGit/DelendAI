---
id: f00783
title: "Batuta learns any AI client: catalogues in layers, clients declared or detected from PATH, IDEs and installs, a usage page per client, and a tool that onboards a new one"
kind: feat
status: review
type: proposal
track: architecture
date: 2026-10-21
last-transition-id: ae6d6f4a-414f-44fc-a0a2-29cb39416822
last-correlation-id: ae6d6f4a-414f-44fc-a0a2-29cb39416822
last-transition-from: in-progress
last-transition-at: 2026-10-22T06:45:53.376Z
---

# f00783 — Batuta learns any AI client: catalogues in layers, clients declared or detected from PATH, IDEs and installs, a usage page per client, and a tool that onboards a new one

## goal

Batuta can find, set up and drive any AI agent, model or provider on a person's machine, and none of them is known only because delendai's code lists it. Two public catalogues name them: the Agent Client Protocol registry for agents (43 agents on 2026-10-21, each with how to launch it) and models.dev for providers and models (232 providers, each with its key variables, API base URL and SDK family). One protocol drives every agent (ACP over stdio). One adapter per API family drives every provider directly. The catalogues are read in layers that end in a dated snapshot shipped with delendai. A person or Batuta can declare anything the catalogues miss in the same shape the registry uses. Each agent and provider gets a usage page generated from what it says about itself. A Batuta tool onboards a new one end to end.

## why

The owner, 2026-10-21, on f00782: "eso de cualquier modelo o proveedor es algo que hardcodeas aquí; si en un futuro aparecen nuevos, Batuta se queda en la mierda". Then: "lo que quiero realmente es que el sistema sea capaz de detectar y configurar para su uso cualquier LLM, agente, CLI, host o lo que sea para que delendai y Batuta en específico puedan usarlo y trabajar con ellos".

What is fixed in code on 2026-10-21:
- **Agents:** the clients Batuta can drive are a list of 8 (KNOWN_CLIENTS), each with its own command flags for login, models and prompts, plus one plan tool (PLAN_TOOLS: mmx). A new agent CLI, an IDE agent or a gateway is not seen unless someone writes a `clients` entry by hand, and is not driven unless someone writes its flags.
- **Catalogue:** f00782 names providers and models from models.dev, with no vendor in code. But it reads one URL, a fresh install has no copy, and if the source disappears only the last cached copy remains.
- **Usage:** how to drive each client lives in code, not in a page an agent or a person can read and correct.

How others solve it, read 2026-10-21:
- **opencode** (the source of models.dev) loads any provider from the models.dev list. It autoloads a provider whose key variable is set, keeps logins in its own auth store, and reaches each provider through the SDK family the catalogue names (`npm`: `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`...) at the catalogue's `api` URL.
- **Zed and JetBrains** drive any agent through the Agent Client Protocol (JSON-RPC over stdio: initialize, authenticate, session/new, session/prompt, permission requests). The public registry (`https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`, schema at github.com/agentclientprotocol/registry) gives each agent's distribution: an npx or uvx package with its arguments, or per-platform binary archives with their sha256. It lists Claude Agent, Codex, Copilot, Gemini CLI, OpenCode, Qwen Code, Kimi CLI, GLM Agent, MiniMax Code, Mistral Vibe, Cursor, goose, Junie and others.

Driving agents through ACP and providers through the catalogue's API families replaces per-client flags with two protocols that public catalogues describe. A new agent or provider then needs no delendai release.

## non-goals

- Running anything unattended before the person adds its account and turns automation on (the f00775 rules stand). Installing an agent asks first and verifies its sha256.
- Reading a credential's value: detection reads names, manifests, package lists and the agents' own `initialize` answers. A provider's key is passed to its API by reference to the variable, never stored by delendai.
- Replacing f00782: this builds on its catalogue reader and its offer of accounts.

## slices

- global_gate: type

### S1 — Two public catalogues, read in layers
- **Status**: review
- **Files**: `packages/core/data/agent-registry.snapshot.json`, `packages/core/data/model-catalogue.snapshot.json`, `tools/scripts/catalog/refresh-public-catalogues.script.ts`, `packages/core/src/lib/shared/public-catalogue-sources.service.ts`, `packages/core/src/lib/shared/public-catalogues-refresh.service.ts`, `packages/core/src/lib/shared/model-catalogue-cache.migration.service.ts`, `packages/core/src/lib/shared/agent-registry.service.ts`, `packages/core/src/lib/shared/model-catalogue.service.ts`, `packages/core/src/lib/contracts/constants/public-catalogues.constant.ts`, `packages/core/src/lib/contracts/constants/catalogue-sources-schema.constant.ts`, `packages/core/src/lib/contracts/interfaces/public-catalogue.interface.ts`
- **Gate**: type
- acceptance:
  - "The agent registry and the model catalogue are each read from their sources in `catalogues.agents` and `catalogues.models` (delendai.config.json; the ACP registry and models.dev by default), in order. After the sources comes the cache under the user cache `delendai/catalogues/`, then the snapshot shipped in @delendai/core. Each copy records its source URL, fetchedAt, sha256 and ETag."
  - "At each MCP start and each offer, a source is asked again only with If-None-Match/If-Modified-Since. An unchanged answer costs no download. A source that answers nothing or disappears leaves the cached copy in place."
  - "The shipped snapshots are the copies fetched 2026-10-21, with their metadata. `bun tools/scripts/catalog/refresh-public-catalogues.script.ts` refreshes them."
  - "The f00782 cache file `model-catalogue.json` is moved into `catalogues/models.json` on the first read after the upgrade, once, journalled in `catalogues/journal.jsonl`."
- shipped-in: `60c3ebc41d53`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — One ACP driver for every agent
- **Status**: review
- **Files**: `packages/core/src/lib/shared/acp-session.service.ts`, `packages/core/src/lib/shared/acp-client.service.ts`, `packages/core/src/lib/contracts/interfaces/acp.interface.ts`
- **Gate**: type
- acceptance:
  - "Any agent the registry or a declaration describes is started from its distribution (npx/uvx package with args, or the platform's binary `cmd` and args). It is driven over stdio JSON-RPC: initialize (its capabilities, auth methods, modes and models are recorded), authenticate when it asks, session/new, session/prompt with streamed updates, and cancel. A permission request is answered by delendai's rules (spend asks the person), never auto-approved."
  - "A spec drives a fake ACP agent through a full prompt, a permission request and a cancel."
- shipped-in: `60c3ebc41d53`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — One adapter per API family for every provider
- **Status**: review
- **Files**: `packages/core/src/lib/shared/provider-api-client.service.ts`, `packages/core/src/lib/contracts/constants/provider-api-families.constant.ts`, `packages/core/src/lib/contracts/interfaces/provider-api.interface.ts`
- **Gate**: type
- acceptance:
  - "A provider is reached at the catalogue's `api` URL through the family its `npm` field names (OpenAI-compatible, Anthropic, Google). The key is read from the provider's variable at call time and never written anywhere. A family delendai has no adapter for is reported, not guessed."
- shipped-in: `60c3ebc41d53`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — Detection from every place an agent or provider can be
- **Status**: review
- **Files**: `packages/core/src/lib/shared/agent-detection.service.ts`, `packages/core/src/lib/shared/detection-machine.service.ts`, `packages/core/src/lib/contracts/interfaces/agent-detection.interface.ts`
- **Gate**: type
- acceptance:
  - "Registry agents are found where they are installed: a binary `cmd` on PATH, an npx/uvx package in a global package list (npm, pnpm, bun, pipx, uv), an IDE extension or host config (VS Code, Cursor, Windsurf, VSCodium, JetBrains extensions, on both sides of WSL), . Providers are found by their key variables and local servers by their ports (f00781/f00782)."
  - "An executable on PATH that no catalogue names, but whose `--help` (short deadline, no credentials) speaks ACP or names a model, a provider or a key variable, is offered as a possible agent. The person's answer is kept, so nothing is asked twice."
- shipped-in: `60c3ebc41d53`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — Declarations in the registry's own shape
- **Status**: review
- **Files**: `packages/core/src/lib/contracts/constants/declared-agent-schema.constant.ts`, `packages/core/src/lib/contracts/interfaces/declared-agent.interface.ts`, `packages/core/src/lib/shared/declared-agents.service.ts`, `packages/core/src/lib/plugins/agents-flow.service.ts`, `packages/cli/src/commands/agents.command.ts`
- **Gate**: type
- acceptance:
  - "`agents[]` in delendai.config.json (or the person's own file) declares an agent with the ACP registry's agent.json fields. A non-ACP agent declares `kind: cli | exec | http | file | mcp` with what reaches it (a command, an executable or script, a URL, an MCP server name) and its probes (login, models, prompt, quota). `providers[]` declares a provider in models.dev's shape. A declaration overrides the catalogue entry of the same id."
  - "`delendai agents list` shows every agent and where each came from (registry, project, personal, detected). `delendai agents add` writes a declaration from flags, and `delendai agents install <id>` installs a registry agent's binary after a yes, verifying its sha256, and `delendai agents show <id> [--write]` greets an ACP agent at no cost. Nobody edits a file by hand."
- shipped-in: `60c3ebc41d53`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S6 — A usage page per agent and provider, from what it says about itself
- **Status**: review
- **Files**: `docs/delendai/models/README.md`, `packages/core/src/lib/shared/agent-usage-doc.service.ts`
- **Gate**: type
- acceptance:
  - "Each agent or provider in use has a page `docs/delendai/models/<id>.md`. It is built from its catalogue entry and its own answers (ACP initialize, its model list), never from text delendai keeps. It says how it is reached, how it logs in, what a prompt may carry, whether it resumes sessions, and the version it was written for; nothing about the machine it was written on. A page is regenerated when that version or the declaration changes, and a person's edit in its marked section survives."
- shipped-in: `60c3ebc41d53`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S7 — Batuta onboards a new agent or provider
- **Status**: review
- **Files**: `plugins/orchestrator-runner/src/lib/tools/agent-onboard.tool.ts`, `plugins/orchestrator-runner/src/lib/contracts/constants/onboard-agent-schema.constant.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/onboard-agent.interface.ts`, `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_onboard_agent.ts`
- **Gate**: type
- acceptance:
  - "Given a name, a command, an executable, a file or a URL, the tool first looks it up in both catalogues. When neither has it and it is not ACP, the model Batuta runs on reads the agent's own help or docs and drafts a declaration. Either way the tool shows the declaration and the usage page for the person's yes, writes them, points to the f00782 offer for its account, and proves it with one consented prompt. A failure leaves nothing half-written."
- shipped-in: `60c3ebc41d53`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- The agent registry and the model catalogue are each read from their sources in `catalogues.agents` and `catalogues.models` (delendai.config.json; the ACP registry and models.dev by default), in order. After the sources comes the cache under the user cache `delendai/catalogues/`, then the snapshot shipped in @delendai/core. Each copy records its source URL, fetchedAt, sha256 and ETag.
- At each MCP start and each offer, a source is asked again only with If-None-Match/If-Modified-Since. An unchanged answer costs no download. A source that answers nothing or disappears leaves the cached copy in place.
- The shipped snapshots are the copies fetched 2026-10-21, with their metadata. `bun tools/scripts/catalog/refresh-public-catalogues.script.ts` refreshes them.
- The f00782 cache file `model-catalogue.json` is moved into `catalogues/models.json` on the first read after the upgrade, once, journalled in `catalogues/journal.jsonl`.
- Any agent the registry or a declaration describes is started from its distribution (npx/uvx package with args, or the platform's binary `cmd` and args). It is driven over stdio JSON-RPC: initialize (its capabilities, auth methods, modes and models are recorded), authenticate when it asks, session/new, session/prompt with streamed updates, and cancel. A permission request is answered by delendai's rules (spend asks the person), never auto-approved.
- A spec drives a fake ACP agent through a full prompt, a permission request and a cancel.
- A provider is reached at the catalogue's `api` URL through the family its `npm` field names (OpenAI-compatible, Anthropic, Google). The key is read from the provider's variable at call time and never written anywhere. A family delendai has no adapter for is reported, not guessed.
- Registry agents are found where they are installed: a binary `cmd` on PATH, an npx/uvx package in a global package list (npm, pnpm, bun, pipx, uv), an IDE extension or host config (VS Code, Cursor, Windsurf, VSCodium, JetBrains extensions, on both sides of WSL), . Providers are found by their key variables and local servers by their ports (f00781/f00782).
- An executable on PATH that no catalogue names, but whose `--help` (short deadline, no credentials) speaks ACP or names a model, a provider or a key variable, is offered as a possible agent. The person's answer is kept, so nothing is asked twice.
- `agents[]` in delendai.config.json (or the person's own file) declares an agent with the ACP registry's agent.json fields. A non-ACP agent declares `kind: cli | exec | http | file | mcp` with what reaches it (a command, an executable or script, a URL, an MCP server name) and its probes (login, models, prompt, quota). `providers[]` declares a provider in models.dev's shape. A declaration overrides the catalogue entry of the same id.
- `delendai agents list` shows every agent and where each came from (registry, project, personal, detected). `delendai agents add` writes a declaration from flags, and `delendai agents install <id>` installs a registry agent's binary after a yes, verifying its sha256, and `delendai agents show <id> [--write]` greets an ACP agent at no cost. Nobody edits a file by hand.
- Each agent or provider in use has a page `docs/delendai/models/<id>.md`. It is built from its catalogue entry and its own answers (ACP initialize, its model list), never from text delendai keeps. It says how it is reached, how it logs in, what a prompt may carry, whether it resumes sessions, and the version it was written for; nothing about the machine it was written on. A page is regenerated when that version or the declaration changes, and a person's edit in its marked section survives.
- Given a name, a command, an executable, a file or a URL, the tool first looks it up in both catalogues. When neither has it and it is not ACP, the model Batuta runs on reads the agent's own help or docs and drafts a declaration. Either way the tool shows the declaration and the usage page for the person's yes, writes them, points to the f00782 offer for its account, and proves it with one consented prompt. A failure leaves nothing half-written.
