# Utilities — fetch, search, npm, PyPI, dev tools, miscellaneous

> These are the catch-all servers that don't fit neatly into another
> category. Most are useful in narrow contexts.

## Web fetching & search

| Server | Notes |
|---|---|
| `@modelcontextprotocol/server-fetch` (Anthropic) | **Wire.** Web → markdown for LLM consumption. ~213k weekly visitors. |
| `brave/brave-search-mcp-server` (official Brave) | **Wire if you want web search.** Replaces the archived `@modelcontextprotocol/server-brave-search`. |
| `tavily/mcp` | Tavily (web search optimized for AI). |
| `perplexity-ask` | Perplexity API. |
| `exa-mcp` (exa.ai) | Exa search. |
| `kagi-mcp` (community) | Kagi search. |
| `firecrawl-mcp-server` (official Mendable) | Firecrawl scraping. |
| `agentql/mcp-server` | AgentQL scraping. |
| `firecrawl-mcp-server` (alt) | Same. |
| `oxylabs/oxylabs-mcp` | Oxylabs scraping. |
| `brightdata-mcp` | Bright Data (Docker official). |
| `jina-mcp-tools` | Jina AI. |

## Package managers

| Server | Notes |
|---|---|
| `mcp-npm` | npm registry queries. |
| `mcp-pypi` | PyPI queries. |
| `mcp-cargo` | Cargo. |
| `mcp-homebrew` | Homebrew. |
| `mcp-winget` | winget. |
| `mcp-scoop` | Scoop. |
| `mcp-chocolatey` | Chocolatey. |
| `mcp-apt` | apt. |
| `mcp-dnf` | dnf. |
| `mcp-pacman` | pacman. |

## Documentation access

| Server | Notes |
|---|---|
| `@upstash/context7-mcp` | **Wire.** Version-pinned docs for any library. 58.1k★. |
| `mcp-devdocs` | DevDocs.io. |
| `mcp-package-version` ([sammcj](https://github.com/sammcj/mcp-package-version)) | Latest stable package versions. |
| `mcp-godoc` | Go package docs. |
| `mcp-rust-docs` | Rust crate docs. |
| `mcp-python-docs` | Python standard library docs. |
| `swift-patterns-mcp` | Swift/SwiftUI best practices. |
| `mcp-aws-docs` | AWS documentation. |
| `mcp-vercel-ai-docs` | Vercel AI SDK docs. |
| `mcp-shadcn-ui` | shadcn/ui docs. |

## File utilities

| Server | Notes |
|---|---|
| `desktop-commander` | File/process/exec. ~100k+ weekly. |
| `marker-pdf` | PDF → markdown conversion. |
| `markitdown` (Microsoft) | Same. |
| `pandoc-mcp` | Document format conversion. |
| `markdownify-mcp` | Various → markdown. |
| `excel-mcp-server` | Excel manipulation. |
| `pdf-card-mcp` | PDF → card-based HTML reader. |
| `playbook-mcp` | Various utilities. |

## Dev utilities

| Server | Notes |
|---|---|
| `devutils-mcp` | Base64, UUID, hash, JWT decode, cron, JSON, regex. |
| `mcp-server-devutils` | Same. |
| `mcp-bytesmith` | Encoding + cryptography helpers. |
| `mcp-abacus` | Type-faithful calculator (IEEE-754 + rational). |
| `mcp-time` | Time / timezone. |
| `mcp-uuid` | UUID generation. |
| `mcp-base64` | Base64 encoding. |
| `mcp-cron` | Cron parsing. |
| `mcp-json-formatter` | JSON formatting/validation. |
| `mcp-regex` | Regex testing. |
| `mcp-password` | Secure password generation. |

## Domain tools

| Server | Notes |
|---|---|
| `cert-manager-mcp-server` | Kubernetes cert-manager. |
| `dash-mcp-server` | Dash (macOS API docs). |
| `swift-patterns-mcp` | Swift/SwiftUI patterns. |
| `apple-mail-mcp` | macOS Apple Mail. |
| `apple-reminders-mcp` | macOS Reminders. |
| `apple-shortcuts-mcp` | macOS Shortcuts. |
| `spotify-mcp` | Spotify. |
| `apple-music-mcp` | Apple Music. |
| `discord-bridge` | Discord. |
| `vrchat-mcp` | VRChat. |
| `unity-mcp` (community) | Unity editor. |
| `godot-mcp` | Godot. |
| `unreal-engine-mcp` (community) | Unreal. |
| `docker-mcp-server` | Docker. |
| `mcp-server-macos` | macOS system. |
| `local-mcp` | macOS native apps. |
| `alacritty-mcp` / `wezterm-mcp` | Terminal emulators. |

## What f00068 needs to update

The 🟡 discoverable tier should keep these utilities. The only utility
worth promoting to curated is **`@upstash/context7-mcp`** — it's the most
universally useful server in the entire catalog. Everything else is
opt-in per workspace.