# Overview — the 10 servers we recommend seeding the ⭐ curated tier

> This is the executive summary. Each entry links to its category file for
> deeper context. Every server here was verified on 2026-06-26.

## Top 10 recommendations (the ⭐ seed for `external-mcps.options.servers`)

| # | Server | Source | Why it's in the top 10 |
|---|---|---|---|
| 1 | `@modelcontextprotocol/server-filesystem` | Anthropic official | Secure file ops with explicit scope. ~239k weekly visitors (pulse.mcp.com). |
| 2 | `@modelcontextprotocol/server-git` | Anthropic official | Read/search/manipulate git repos. The only Git-MCP you actually need. |
| 3 | `@modelcontextprotocol/server-fetch` | Anthropic official | Web → markdown for LLM consumption. ~213k weekly visitors. |
| 4 | `@modelcontextprotocol/server-postgres` | Anthropic official | Read-only PG with schema inspection. ~77k weekly visitors. |
| 5 | `@modelcontextprotocol/server-sqlite` | Anthropic official | SQLite with analysis features. |
| 6 | `@playwright/mcp` | Microsoft official | Browser automation via accessibility tree (no vision model needed). 34.4k★, 5.5M weekly visitors. |
| 7 | `chrome-devtools-mcp` | ChromeDevTools (Google) | Performance, network, memory, screencast. 44.4k★, 2.5M weekly visitors. |
| 8 | `@upstash/context7-mcp` | Upstash (community, top tier) | Up-to-date library docs in the prompt. Solves "hallucinated API". 58.1k★. |
| 9 | `mcp-language-server` (isaacphi) | Community (top tier) | One LSP wrapper, 30+ languages via generic LSP. |
| 10 | `mcp-server-docker` (ckreiling) | Community | Docker container lifecycle from the agent. |

These 10 cover ~80% of daily needs: read/write files, search code, browse docs,
query DBs, run a browser. The other ~360 servers in the discoverable tier are
opt-in for specific projects.

## Three health signals we look at

| Signal | What it tells us | Example |
|---|---|---|
| **Commit recency** | Is the maintainer still alive? | `< 30 days` = healthy; `> 180 days` = suspect. |
| **Stars + downloads** | Is the community using it? | `> 10k weekly visitors` = canonical for its niche. |
| **Open issues vs PRs** | Is the maintainer responsive? | `issues > 5 × closed` = backlog fire. |

## What this dossier deliberately does NOT recommend

- **Servers with `@latest` only** — we always require pinned versions.
- **Servers whose GitHub repo is unreachable or 404** (this caught several
  Angular servers; see [`frameworks.md`](./frameworks.md)).
- **Servers that duplicate functionality already in mcp-vertex native tools**
  (e.g. don't wire `mcp-fs` if `fs_read` covers your use case).
- **Servers with no commits in 12+ months** unless they're official reference
  servers that are intentionally stable.

## What's missing (next research pass)

- **iOS / Android mobile tooling**: `idb`, `mobile-mcp`, `agent-device` exist but
  need dedicated testing.
- **Game engines**: Unity / Unreal — interesting but niche for this repo.
- **Embedded**: Modbus, OPC UA, ESP-IDF — interesting for IoT workspaces.
- **Specific region / gov-data MCPs**: e.g. `EGRUL` (RU), `NHI` (TW), `Census` (US),
  `IBGE` (BR), `CNB` (CZ), `DART` (KR), `Eastmoney` (CN A-shares). These are real
  and useful but outside the "everyday" scope.

## Update cadence

This dossier was generated on **2026-06-26**. Servers come and go fast in this
ecosystem — anything not re-verified in 90 days should be re-checked before
being declared safe to wire up.