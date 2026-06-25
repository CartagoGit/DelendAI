# External MCP servers — research dossier

> **Purpose:** a curated, opinionated map of the external MCP server ecosystem
> that an `mcp-vertex` workspace might want to consume through the
> `external-mcps` plugin (see
> [`f00068-external-mcps-plugin-paused.md`](../mcp-vertex/proposals/paused/f00068-external-mcps-plugin-paused.md)).
>
> Each file in this directory documents one slice of the ecosystem with
> **verified** package names, maintainer reputation, last-update signals, and a
> candid recommendation on whether the package is worth wiring up.

## Ecosystem size (June 2026)

| Source | Catalog size | Source quality | URL |
|---|---|---|---|
| **glama.ai** | ~48,655 servers | Aggregated + quality-graded | <https://glama.ai/mcp/servers> |
| **pulse.mcp.com** | ~19,502 servers | Curated, daily-updated | <https://www.pulsemcp.com/servers> |
| **mcp.so** | ~22,812 servers | Community-submitted | <https://mcp.so/> |
| **hub.docker.com/mcp** | Curated subset (hundreds) | Docker-verified, containerized | <https://hub.docker.com/mcp> |
| **registry.modelcontextprotocol.io** | Official registry | Anthropic-canonical | <https://registry.modelcontextprotocol.io/> |
| **github.com/punkpeye/awesome-mcp-servers** | 89.8k★ curated list | Community PRs, lightly vetted | <https://github.com/punkpeye/awesome-mcp-servers> |

The **official Anthropic reference servers** (formerly in
`github.com/modelcontextprotocol/servers`) have been split into:

- `github.com/modelcontextprotocol/servers` — kept as a reference list.
- `github.com/modelcontextprotocol/servers-archived` — many community
  integrations now archived (Slack, Postgres, GitHub, Puppeteer, etc.).

This is important: **most of the servers the original f00068 proposal named
(e.g. `@modelcontextprotocol/server-puppeteer`) are now archived and not
maintained by Anthropic.** Several have been forked by the original platform
owners (e.g. Slack → `zencoderai/slack-mcp-server`). This dossier is the source
of truth for which servers actually live where.

## How to read this dossier

Each category file follows the same shape:

1. **Official Anthropic servers** (when applicable) — first, because they are the
   only ones with a maintenance commitment.
2. **Verified community servers** — direct links to live GitHub repos with last
   commit date.
3. **Listed-but-unverified** — names that appear in catalogs but for which I
   could not find a current canonical repo. Treat as "may be abandoned".
4. **Recommendation** — concise verdict on whether to wire it into mcp-vertex.

Files:

- [`overview.md`](./overview.md) — executive summary + the 10 servers we recommend
  to seed the ⭐ curated tier.
- [`official-anthropic.md`](./official-anthropic.md) — the 7 current reference
  servers + the 10 archived ones with their current forks.
- [`frameworks.md`](./frameworks.md) — frontend / backend framework servers
  (Angular, React, Vue, Svelte, NestJS, Django, Rails, etc.).
- [`languages-lsps.md`](./languages-lsps.md) — language servers and LSP wrappers.
- [`databases.md`](./databases.md) — SQL, NoSQL, vector, time-series, search.
- [`cloud-devops.md`](./cloud-devops.md) — AWS, GCP, Azure, K8s, Terraform.
- [`observability.md`](./observability.md) — Sentry, Datadog, Grafana, OTel.
- [`productivity.md`](./productivity.md) — Slack, Notion, Linear, Jira, GitHub,
  GitLab.
- [`browser-automation.md`](./browser-automation.md) — Playwright, Chrome
  DevTools, Puppeteer, Browserbase.
- [`ai-ml-data.md`](./ai-ml-data.md) — HuggingFace, Ollama, OpenAI, vector DBs.
- [`utilities.md`](./utilities.md) — npm, PyPI, fetch, search, dev utils.
- [`quality-and-red-flags.md`](./quality-and-red-flags.md) — how we score a
  server, red flags to avoid, dependency-confusion and typosquatting notes.

## Methodology

- **Primary sources verified live**: each "official" or "verified community"
  entry links to the actual repo and was visited on 2026-06-26.
- **Stars / downloads as a soft signal**, not a verdict. A 40k★ server with no
  commit in 9 months is worse than a 1k★ server with a commit this week.
- **npm pin verified**: every npm package is checked for last publish date
  (via the repo or npm view, where available).
- **Pinned version required**: a server is "ready to wire" only if the
  maintainer publishes versions we can pin. `@latest` is a hard fail.