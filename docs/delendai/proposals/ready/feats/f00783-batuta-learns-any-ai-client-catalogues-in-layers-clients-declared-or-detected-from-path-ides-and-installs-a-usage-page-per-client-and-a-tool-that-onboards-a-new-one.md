---
id: f00783
title: "Batuta learns any AI client: catalogues in layers, clients declared or detected from PATH, IDEs and installs, a usage page per client, and a tool that onboards a new one"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-10-21
---

# f00783 — Batuta learns any AI client: catalogues in layers, clients declared or detected from PATH, IDEs and installs, a usage page per client, and a tool that onboards a new one

## goal

No AI client, model or provider is known only because delendai's code lists it. The public model catalogue comes from configurable sources in layers, ending in a dated snapshot shipped with delendai. A client can be declared in delendai.config.json by kind (cli, extension, exec, http, file, mcp) with the command or file that reaches it, and is otherwise detected from PATH, the IDEs and hosts installed, package managers and gateway configs. Each client gets a generated usage page under docs/delendai/models/, and a Batuta tool onboards a new client end to end: it reads the client's own help, writes its config entry and usage page, offers its account and proves it with one hop.

## why

The owner, 2026-10-21, on f00782: 'eso de cualquier modelo o proveedor es algo que hardcodeas aquí; si en un futuro aparecen nuevos, Batuta se queda en la mierda'. f00782 names providers and models from models.dev, with no vendor in code, but: (1) models.dev is the only source and a single URL; if it disappears only the last cached copy remains, and a fresh install has none; (2) the AI clients are a fixed list of 8 (KNOWN_CLIENTS) and the plan tools a list of one (PLAN_TOOLS: mmx), so a new client CLI, an IDE extension or a gateway is not seen unless someone writes a `clients` entry by hand; (3) how to drive each client (login check, model list, prompt, quota) lives in code, not in a page an agent or a person can read and correct. The owner asked for several sources (config, PATH, IDE/hosts, a manual declaration of kind and command, the model itself reading the client's docs) and a Batuta tool that makes a project able to use a new model.

## non-goals

- Running a client unattended before the person adds its account and turns automation on (f00775 rules stand).
- Reading any credential value: every source reads names, manifests and help text only.
- Replacing f00782: this builds on its catalogue reader and its offer of accounts.

## slices

- global_gate: type

### S1 — Catalogues in layers, ending in a dated snapshot
- **Status**: pending
- **Files**: `packages/core/data/model-catalogue.snapshot.json`, `tools/scripts/catalog/refresh-model-catalogue-snapshot.script.ts`, `packages/core/src/lib/shared/model-catalogue-sources.service.ts`, `packages/core/src/lib/migrate/model-catalogue-cache.migration.ts`
- **Gate**: type
- acceptance:
  - "The catalogue is read from the sources in `models.catalogues` (delendai.config.json; models.dev by default) in order, then the cache under the user cache `delendai/models/`, then the snapshot shipped in @delendai/core. Each copy carries its metadata: source URL, fetchedAt, sha256, ETag."
  - "At each MCP start and each offer, a source is asked again only with If-None-Match/If-Modified-Since; an unchanged answer costs no download, and a source that answers nothing or disappears leaves the cached copy in place."
  - "The shipped snapshot is the compact catalogue fetched 2026-10-21 with its metadata; `bun tools/scripts/catalog/refresh-model-catalogue-snapshot.script.ts` refreshes it and its date."
  - "The f00782 cache file `model-catalogue.json` is moved to `delendai/models/` by a start-up migration, journalled."

### S2 — Clients declared by kind, with the command or file that reaches them
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/constants/model-client-schema.constant.ts`, `packages/core/src/lib/shared/configured-clients.service.ts`, `packages/cli/src/commands/models.command.ts`
- **Gate**: type
- acceptance:
  - "`models.clients[]` in delendai.config.json (or the person's own file) declares a client with `kind` (cli | extension | exec | http | file | mcp), what reaches it (a command, an executable or script path, a URL, an MCP server name), and optional probes: login status, model list, prompt, quota. A declared client is discovered like a built-in one and overrides it."
  - "`delendai models add` writes a declaration from flags or from questions, `delendai models list` shows every client and where it came from (built-in, declared, detected); nobody edits the file by hand."

### S3 — Clients found on PATH
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/path-client-discovery.service.ts`
- **Gate**: type
- acceptance:
  - "Executables on PATH whose name matches a catalogue provider or model family, or whose `--help` (run with a short deadline, never with credentials) names a model, a provider or an API key variable, are offered as possible clients; the person's answer is kept so nothing is asked twice."

### S4 — Clients found in IDEs and hosts
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/ide-client-discovery.service.ts`
- **Gate**: type
- acceptance:
  - "The extensions of VS Code, Cursor, Windsurf, VSCodium and JetBrains IDEs, and the hosts' own configs (Copilot, Claude, Codex, Gemini, Continue, Cline...) are read by manifest: an extension whose manifest names a catalogue provider, a model, or an AI/LLM category is offered with kind `extension`; MCP servers declared in a host are offered with kind `mcp`."

### S5 — Clients found in installs and gateway configs
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/installed-client-discovery.service.ts`
- **Gate**: type
- acceptance:
  - "Global packages (npm -g, pnpm, bun, pipx, uv tool, brew, cargo), container images (docker/podman: ollama, vllm, llama.cpp...) and gateway configs (LiteLLM, OpenRouter-style YAML/JSON) are read by name only, matched against the catalogue, and offered like the other sources."

### S6 — A usage page per client, generated
- **Status**: pending
- **Files**: `docs/delendai/models/README.md`, `packages/core/src/lib/shared/model-usage-doc.service.ts`
- **Gate**: type
- acceptance:
  - "Each known client has a page `docs/delendai/models/<client>.md`: its kind, how it is reached, how login, the model list, a prompt and the quota are asked, which models and accounts it serves, and the client version it was written for. Pages are regenerated when the client's version or declaration changes; a person's edit in the marked section survives regeneration."

### S7 — A Batuta tool that onboards a new client
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/tools/model-onboard.tool.ts`
- **Gate**: type
- acceptance:
  - "Given a name, a command, an executable, a file or a URL, the tool has the model Batuta runs on read the client's own help or docs, drafts its declaration and usage page, shows them for the person's yes, writes them, offers its account through the f00782 offer, and proves the client with one consented hop; a failure leaves nothing half-written."

## acceptance

- The catalogue is read from the sources in `models.catalogues` (delendai.config.json; models.dev by default) in order, then the cache under the user cache `delendai/models/`, then the snapshot shipped in @delendai/core. Each copy carries its metadata: source URL, fetchedAt, sha256, ETag.
- At each MCP start and each offer, a source is asked again only with If-None-Match/If-Modified-Since; an unchanged answer costs no download, and a source that answers nothing or disappears leaves the cached copy in place.
- The shipped snapshot is the compact catalogue fetched 2026-10-21 with its metadata; `bun tools/scripts/catalog/refresh-model-catalogue-snapshot.script.ts` refreshes it and its date.
- The f00782 cache file `model-catalogue.json` is moved to `delendai/models/` by a start-up migration, journalled.
- `models.clients[]` in delendai.config.json (or the person's own file) declares a client with `kind` (cli | extension | exec | http | file | mcp), what reaches it (a command, an executable or script path, a URL, an MCP server name), and optional probes: login status, model list, prompt, quota. A declared client is discovered like a built-in one and overrides it.
- `delendai models add` writes a declaration from flags or from questions, `delendai models list` shows every client and where it came from (built-in, declared, detected); nobody edits the file by hand.
- Executables on PATH whose name matches a catalogue provider or model family, or whose `--help` (run with a short deadline, never with credentials) names a model, a provider or an API key variable, are offered as possible clients; the person's answer is kept so nothing is asked twice.
- The extensions of VS Code, Cursor, Windsurf, VSCodium and JetBrains IDEs, and the hosts' own configs (Copilot, Claude, Codex, Gemini, Continue, Cline...) are read by manifest: an extension whose manifest names a catalogue provider, a model, or an AI/LLM category is offered with kind `extension`; MCP servers declared in a host are offered with kind `mcp`.
- Global packages (npm -g, pnpm, bun, pipx, uv tool, brew, cargo), container images (docker/podman: ollama, vllm, llama.cpp...) and gateway configs (LiteLLM, OpenRouter-style YAML/JSON) are read by name only, matched against the catalogue, and offered like the other sources.
- Each known client has a page `docs/delendai/models/<client>.md`: its kind, how it is reached, how login, the model list, a prompt and the quota are asked, which models and accounts it serves, and the client version it was written for. Pages are regenerated when the client's version or declaration changes; a person's edit in the marked section survives regeneration.
- Given a name, a command, an executable, a file or a URL, the tool has the model Batuta runs on read the client's own help or docs, drafts its declaration and usage page, shows them for the person's yes, writes them, offers its account through the f00782 offer, and proves the client with one consented hop; a failure leaves nothing half-written.
