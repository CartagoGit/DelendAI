# Quality scoring & red flags — how to evaluate an external MCP server

> Every server in this dossier was filtered through the same rubric. This
> file documents the rubric and the most common pitfalls.

## The 5-signal rubric

| Signal | Healthy | Suspect | Hard fail |
|---|---|---|---|
| **Commit recency** | Last commit < 30 days | 30–180 days | > 180 days |
| **Stars / weekly visitors** | > 10k weekly | 1k–10k | < 100 |
| **Issues vs closed ratio** | open < closed / 2 | closed / 2 < open < closed | open > closed × 2 |
| **Pinned version** | npm/pypi publishes semver | `@latest` only | No version pinning at all |
| **Maintainer identity** | Real org or named maintainer | Single anonymous user | Anonymous + `*-mcp` / `mcp-*` generic name |

A server that fails **2+ hard-fails** should not be wired up by default.

## Red flag patterns

### 1. Generic names without a maintainer identity

```
mcp-foo
foo-mcp
my-cool-mcp-server
universal-mcp-thingy
```

vs. healthy:

```
github/github-mcp-server        # hosted by GitHub org
microsoft/playwright-mcp         # hosted by Microsoft
redis/mcp-redis                  # hosted by Redis
hashicorp/terraform-mcp-server  # hosted by HashiCorp
```

### 2. `@latest` only

If a server's only install instruction is `npx -y some-name@latest`, **don't
wire it**. You need to pin a version to make supply-chain attacks traceable.
The f00068 proposal enforces mandatory pinning via Zod; this is why.

### 3. README that says "Reference implementation"

Reference implementations are valid as tests but **not for production**. The
official Anthropic `Everything` server is explicitly marked "not for
production". Don't include it in the curated tier.

### 4. No outputSchema

Every tool the agent will call needs a typed `outputSchema`. Servers without
it (especially the older community ones from 2024-early 2025) require the
agent to free-form parse strings — error-prone and slow.

### 5. Claims of "universal" or "supports everything"

`universal-mcp-thingy` claims to be the one MCP to rule them all. In
practice, these projects try to wrap too much and end up doing nothing well.
The mcp-vertex `external-mcps` plugin should NOT adopt any universal-claim
server without manual code review.

### 6. Names that look like the official one but aren't

The ecosystem has **typosquatted** and **impersonator** packages. Examples:

- `@modelcontextprotocol/server-fetch` (official) vs
  `model-context-protocol-fetch` (impersonator, missing dot).
- `github-mcp` (community) vs `github/github-mcp-server` (official).

Always cross-check the GitHub repo URL from the npm page before installing.
The npm `repository.url` field must match a repo owned by the claimed
maintainer.

### 7. Servers that read every file in the workspace

Some "filesystem" MCPs silently glob-read your whole workspace to "build an
index". This is a privacy disaster. The Anthropic official
`@modelcontextprotocol/server-filesystem` takes an explicit root path; if a
"filesystem" MCP doesn't, suspect it.

## Supply chain risks

### npm `npx` executes on install

`npx -y some-package` downloads and runs the package immediately. The `-y`
flag bypasses the confirmation prompt. This means:

- A typosquatted package gets **executed** before you see it.
- The package's `postinstall` script runs with your user permissions.

Mitigations:
- **Always pin the version** (`@playwright/mcp@0.0.76`, not `@latest`).
- **Use `--ignore-scripts`** if you install manually.
- **Run `bunx --no-install`** when possible.
- **Audit the package**: `npm view <pkg> scripts` shows `preinstall`/`postinstall`.

### pypi `uvx` is similar

`uvx` runs the package in an isolated venv. Safer than `npx -y` because
there's no auto-install, but you still need to pin: `uvx mcp-server-git@1.2.3`.

## How f00068 already mitigates this

Proposal f00068 §"Security review" already mandates:

- **Mandatory version pin** via Zod schema (`IServerEntry.version`).
- **`resolveWorkspaceContained`** middleware (path containment).
- **`redactSecrets`** middleware (output redaction).
- **Human ack** for every LLM-initiated activation.
- **Rate limit** on the live-search tier.

The dossier in this folder complements those mitigations with **curation**:
instead of trusting the LLM to pick from a wild-west catalog, the curated
tier is pre-vetted by the repo, so the most dangerous decisions are made
upfront by humans.

## When to file a new red flag

If you evaluate a server against this rubric and it fails 2+ signals,
**add it to the failures list at the bottom of this file** so future agents
don't waste time on it. Include:

- The repo URL.
- The failure signals you observed.
- The date of evaluation.

### Failures observed (working list)

| Server | Date | Failure |
|---|---|---|
| `cyanheads/angular-mcp-server` | 2026-06-26 | 404 — repo gone. |
| `darioz-ms/angular-mcp` | 2026-06-26 | 404 — repo gone. |
| `Microcks/angular-mcp` | 2026-06-26 | 404 — repo gone. |
| `modelcontextprotocol/server-puppeteer` | 2026-06-26 | Archived by Anthropic; use `chrome-devtools-mcp` instead. |
| `modelcontextprotocol/server-slack` | 2026-06-26 | Archived; use `zencoderai/slack-mcp-server`. |
| `modelcontextprotocol/server-github` | 2026-06-26 | Archived; use `github/github-mcp-server` (official). |
| `modelcontextprotocol/server-gitlab` | 2026-06-26 | Archived; use `zereight/gitlab-mcp-server`. |
| `modelcontextprotocol/server-brave-search` | 2026-06-26 | Archived; use `brave/brave-search-mcp-server` (official). |
| `modelcontextprotocol/server-redis` | 2026-06-26 | Archived; use `redis/mcp-redis` (official). |

## Re-evaluation cadence

Re-run the rubric every **90 days** for curated tier entries. The MCP
ecosystem moves fast: a server with 30k★ today may be abandoned in 6
months. The next pass is due 2026-09-26.

## Final note

The single best protection against the supply-chain risk of the MCP
ecosystem is **pinned, curated, opt-in**. The f00068 plugin's three-tier
model + the dossier in this folder implement exactly that. Anything outside
that model should be treated with suspicion until proven otherwise.