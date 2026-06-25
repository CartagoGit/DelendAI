# Official Anthropic reference servers

> **Critical update vs. proposal f00068:** the canonical Anthropic MCP server
> repository (`github.com/modelcontextprotocol/servers`) no longer hosts
> community-maintained integrations. As of 2024, Anthropic archived most of
> them into `servers-archived` and now publishes just **7 reference servers**
> for protocol/SDK demonstration. The archived ones have been forked by the
> original platform owners or by community maintainers.

Source verified: <https://github.com/modelcontextprotocol/servers> + the
archived repository, on 2026-06-26.

## Current reference servers (7)

These are the only ones Anthropic actively maintains. Listed in the README's
"🌟 Reference Servers" section.

| # | Server | npm package | Purpose | Weekly visitors (pulse.mcp.com) |
|---|---|---|---|---|
| 1 | **Everything** | `@modelcontextprotocol/server-everything` | Reference / test server with prompts, resources, and tools. Not for production. |
| 2 | **Fetch** | `@modelcontextprotocol/server-fetch` | Web content fetching and conversion to markdown for LLM consumption. | ~213k |
| 3 | **Filesystem** | `@modelcontextprotocol/server-filesystem` | Secure file operations with configurable access controls. | ~239k |
| 4 | **Git** | `mcp-server-git` (Python via uvx) | Read, search, and manipulate Git repositories. | ~194k |
| 5 | **Memory** | `@modelcontextprotocol/server-memory` | Knowledge graph-based persistent memory system. | n/a |
| 6 | **Sequential Thinking** | `@modelcontextprotocol/server-sequentialthinking` | Dynamic and reflective problem-solving through thought sequences. | ~82k |
| 7 | **Time** | `@modelcontextprotocol/server-time` | Time and timezone conversion capabilities. | ~100k |

**Install pattern** (from the official README):

```jsonc
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"]
    },
    "git": {
      "command": "uvx",
      "args": ["mcp-server-git", "--repository", "path/to/git/repo"]
    }
  }
}
```

For Windows: wrap `npx` with `cmd /c` and prepend `/c` to the args.

## Archived servers (10)

These were reference servers maintained by Anthropic until they were archived
into [`servers-archived`](https://github.com/modelcontextprotocol/servers-archived).
Several have been **re-homed** to the original platform owners — the table
below lists both the archived location and the current canonical repo.

| Server | Archive location | Current canonical home | Status |
|---|---|---|---|
| **AWS KB Retrieval** | `servers-archived/src/aws-kb-retrieval-server` | (no replacement) | Use `awslabs/mcp` AWS KB tool instead. |
| **Brave Search** | `servers-archived/src/brave-search` | **moved to** [`brave/brave-search-mcp-server`](https://github.com/brave/brave-search-mcp-server) | Official replacement; available on npm as `@brave/brave-search-mcp-server`. ~100k+ weekly visitors on Docker Hub. |
| **EverArt** | `servers-archived/src/everart` | (no replacement) | AI image generation — use any of the ~30 image-gen servers in the catalog. |
| **GitHub** | `servers-archived/src/github` | **moved to** [`github/github-mcp-server`](https://github.com/github/github-mcp-server) (official) | 121k weekly visitors — the de facto standard. |
| **GitLab** | `servers-archived/src/gitlab` | **moved to** [`zereight/gitlab-mcp-server`](https://github.com/zereight/gitlab-mcp-server) (community fork, 107k weekly) | The Anthropic version is unmaintained; community fork is the canonical one. |
| **Google Drive** | `servers-archived/src/gdrive` | (no replacement) | Use Drive-specific community servers; flag manually. |
| **Google Maps** | `servers-archived/src/google-maps` | (no replacement) | Use Amap Maps, Baidu Map, or general geocoding MCPs. |
| **PostgreSQL** | `servers-archived/src/postgres` | (no replacement) | Use the reference schema but consider `crystaldba/postgres-mcp` for richer tooling. 77k weekly visitors. |
| **Puppeteer** | `servers-archived/src/puppeteer` | (no replacement) | Use **`chrome-devtools-mcp`** instead — it's the modern, Chrome-team-maintained successor with 44.4k★ and 2.5M weekly visitors. |
| **Redis** | `servers-archived/src/redis` | **moved to** [`redis/mcp-redis`](https://github.com/redis/mcp-redis) (official Redis) | The official Redis-maintained MCP. |
| **Sentry** | `servers-archived/src/sentry` | (no replacement; community forks exist) | Use `tgeselle/bugsnag-mcp` if you need an error-tracking MCP. |
| **Slack** | `servers-archived/src/slack` | **moved to** [`zencoderai/slack-mcp-server`](https://github.com/zencoderai/slack-mcp-server) | The Anthropic version is dead; this is the active fork. |
| **SQLite** | `servers-archived/src/sqlite` | (no replacement) | Use `modelcontextprotocol/server-sqlite` if you need read-only; or `jparkerweb/mcp-sqlite` for richer features. |

## Important nuance

The **archived** label is Anthropic saying "we don't actively maintain this
anymore, but the code is here for reference". It does **NOT** mean the server
is bad or unusable — many of them are fine, especially the ones that were
re-homed to the platform owners (GitHub → GitHub, Redis → Redis, etc.).

When you wire one up, follow the chain: **find the current canonical repo →
check its last commit → pin a version → run `bun run validate`**.

## What this means for proposal f00068

The f00068 curated tier (⭐) listed `@modelcontextprotocol/server-slack`,
`@modelcontextprotocol/server-github`, `@modelcontextprotocol/server-postgres`,
`@modelcontextprotocol/server-sqlite`, `@modelcontextprotocol/server-puppeteer`
as Anthropic official. **Only `postgres` and `sqlite` are still Anthropic
maintained as reference servers.** The rest have moved — the curated tier
must be updated to:

- `filesystem`, `git`, `fetch`, `memory`, `sequentialthinking`, `time` —
  Anthropic reference.
- `github` → use `github/github-mcp-server`.
- `slack` → use `zencoderai/slack-mcp-server`.
- `redis` → use `redis/mcp-redis`.
- `puppeteer` → **drop**, use `chrome-devtools-mcp` (modern Chrome-team one)
  OR `@playwright/mcp` (Microsoft, 34.4k★, 5.5M weekly visitors).