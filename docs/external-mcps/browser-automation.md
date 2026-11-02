# Browser automation — Playwright, Chrome DevTools, and friends

> Browser MCPs are the **highest-utility** MCPs after filesystem/git/fetch.
> They give the agent the ability to **see the page** and **interact** with
> it. Pick **at most one** for production use; the others are redundant.

## Top picks

### `@playwright/mcp` (Microsoft) — **TOP RECOMMENDATION**

- **Repo**: <https://github.com/microsoft/playwright-mcp>
- **Stars**: 34.4k
- **Weekly visitors**: 5.5M (highest of any MCP server)
- **Install**: `npx -y @playwright/mcp@latest`
- **What it does**: drives Chromium / Firefox / WebKit via the Playwright
  accessibility tree. The agent sees the page as structured DOM, not pixels.
  This is the **best** choice for code agents: deterministic, fast, no vision
  model needed.

**Key features**:
- LLM-friendly (accessibility tree, no vision model required).
- Deterministic tool application (no screenshot ambiguity).
- `--isolated` mode for ephemeral sessions.
- Browser extension to attach to your existing logged-in browser.
- Optional `--caps=vision,pdf,devtools` extensions.
- Supports `--browser=chrome|firefox|webkit|msedge`.

**When NOT to use it**: if you need **deep Chrome DevTools** features
(memory snapshots, screencast, Lighthouse audits) — use `chrome-devtools-mcp`
instead. Playwright is a higher-level abstraction; DevTools is the raw Chrome
protocol.

### `chrome-devtools-mcp` (ChromeDevTools / Google) — **RUNNER-UP**

- **Repo**: <https://github.com/ChromeDevTools/chrome-devtools-mcp>
- **Stars**: 44.4k
- **Weekly visitors**: 2.5M
- **Install**: `npx -y chrome-devtools-mcp@latest`
- **What it does**: exposes Chrome DevTools via MCP. Includes:
  - Performance trace analysis (with optional CrUX field data).
  - Network request inspection.
  - Console + source-mapped stack traces.
  - Lighthouse audits.
  - Memory heap snapshots + dominator analysis.
  - Screencast (requires ffmpeg).
  - Emulation + device overrides.
  - Chrome extension management.

**When to pick this over Playwright**: when you need performance profiling,
memory leak analysis, Lighthouse scores, or any DevTools-only feature.

### Don't use both unless you have a specific need

They overlap heavily. Both can click buttons, fill forms, navigate. Pick one:

- **Default**: `@playwright/mcp` (cross-browser, smaller, more
  popular).
- **DevTools-specific work**: `chrome-devtools-mcp`.
- **Both, in the same workspace**: only if your agent does both functional
  testing (Playwright) AND perf profiling (DevTools) regularly.

## Other notable browser MCPs

| Server | When to consider |
|---|---|
| `executeautomation/playwright-mcp-server` | Older Playwright MCP — superseded by `@playwright/mcp`. |
| `automata-labs/MCP-Server-Playwright` | Same idea; superseded. |
| `microsoft/playwright-cli` (CLI + SKILLS, not MCP) | Microsoft now recommends the **CLI** for many use cases (token-efficient). Not an MCP. |
| `modelcontextprotocol/server-puppeteer` (archived) | Superseded by `chrome-devtools-mcp`. |
| `browserbase/mcp-server-browserbase` | Browserbase-hosted Chromium (cloud). Use if you need cloud browsers. |
| `apireno/DOMShell` | Maps the accessibility tree as a virtual filesystem (ls, cd, grep). Niche but cool. |
| `co-browser/browser-use-mcp-server` | Older; superseded by Playwright. |
| `browsermcp/mcp` | Local Chrome automation. Similar to Playwright. |
| `agent-infra/mcp-server-browser` | ByteDance UI-TARS — combines MCP + visual model. |
| `webdriverio/mcp` | WebdriverIO wrapper (mobile + browser). Use if you need mobile automation. |
| `kimtth/mcp-aoai-web-browsing` | Azure OpenAI + Playwright minimal impl. Skip. |
| `notdiamond/mcp-notdiamond` | LLM routing + web browsing. Skip. |
| `feedthrough/feedthrough` | In-page debug bridge. Interesting but niche. |
| `Pantheon-Security/chrome-mcp-secure` | Chrome with post-quantum encryption. Paranoid use cases. |
| `openobserve/openobserve-mcp` | OpenObserve log search. |
| `tavily/mcp` | Tavily web search (not browser automation). |

## Cloud browsers

| Server | Provider |
|---|---|
| `browserbase/mcp-server-browserbase` | Browserbase. |
| `steel-dev/steel-mcp` | Steel (cloud browsers). |
| `kernel/browser-mcp` | Kernel. |
| `anchorbrowser/anchor-browser-mcp` | Anchor Browser (cloud, supports hosted + self-hosted). |
| `hyperbrowser/mcp` | Hyperbrowser. |

Use these when you need **ephemeral cloud browsers** with no local install.
For everyday work, `@playwright/mcp` is enough.

## What f00068 needs to update

The original ⭐ curated tier had `@playwright/mcp` and
`chrome-devtools-mcp` indirectly via `browser-automation`. The current
proposal says "browser-automation: Playwright + Puppeteer + Browserbase".
**Drop Puppeteer entirely** — `chrome-devtools-mcp` is its modern
replacement. Keep `@playwright/mcp` as the default.