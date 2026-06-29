# Universal agent bootstrap — `@mcp-vertex/core`

> **This file is the only place agent rules live.** Every host instruction file
> (`.github/copilot-instructions.md`, `CLAUDE.md`, `AGENTS.md`, anything
> written for Cursor / Aider / Continue / Codex / generic LLM tooling) is a
> **pointer** to this file. They contain zero narrative of their own; they
> just say "follow this bootstrap" and optionally pick one of the host
> appendices at the bottom. Editing this file updates every host at once.

The server (`mcp-vertex_overview`, `mcp-vertex_agent_catalog`,
`mcp-vertex_agent_bootstrap` prompt) is the **only** source of truth for
what is loaded. The agent must **always** ask the server instead of
guessing from a list, hardcoded id, or copy-pasted previous session.

---

## Table of contents

1. [Orient first — one cheap call](#1-orient-first--one-cheap-call)
2. [Route work — ask the server](#2-route-work--ask-the-server)
3. [Bootstrap prompt — insert when the host supports it](#3-bootstrap-prompt--insert-when-the-host-supports-it)
4. [Workflow loop](#4-workflow-loop)
5. [Definition of done](#5-definition-of-done)
6. [Invariants you must not break](#6-invariants-you-must-not-break)
7. [Repo-level rules (only when the host reads `AGENTS.md`)](#7-repo-level-rules-only-when-the-host-reads-agentsmd)
8. [Host appendices](#8-host-appendices)
   - 8.1 [Copilot Chat — close-marker contract](#81-copilot-chat--close-marker-contract)
   - 8.2 [Claude Code — keep the main thread cheap](#82-claude-code--keep-the-main-thread-cheap)
   - 8.3 [Cursor / Aider / Continue — generic LLM hosts](#83-cursor--aider--continue--generic-llm-hosts)

---

## 1. Orient first — one cheap call

When the `mcp-vertex` server is connected, call:

````text
mcp-vertex_overview { compact: true }
````

That single call returns the full picture of what is loaded (plugins,
tools, host info, recommended next action). **Do not** crawl the
filesystem, list the repo root, or enumerate `packages/`, `plugins/`,
or `extensions/` to rediscover what the server already told you.

## 2. Route work — ask the server

Whenever a task involves routing to a tool, a skill, or an actionable
proposal, call:

````text
mcp-vertex_agent_catalog { mode: "compact" }
````

- `mode: "compact"` (default) returns the actionable proposal list plus
  counts per status, plus the first skills/tools pages. Stays under the
  measured 1 300-byte token budget.
- `mode: "full"` returns the whole catalog.
- `section: "tools" | "skills" | "proposals"` narrows to one slice.
- `query: "..."` filters by id / name / tag / title.

Do **not** hardcode tool names, skill names, or proposal ids in your
answers. Ask the server every time. Skills/tools/proposals are added
and removed every week; any hardcoded list will be wrong within days.

## 3. Bootstrap prompt — insert when the host supports it

The server exposes a bootstrap prompt (`mcp-vertex_agent_bootstrap`) that
composes the canonical starter invocation. If your host surfaces MCP
prompts (Copilot slash, Claude slash, Cursor at-suggestion, etc.),
**use it**. It always reflects the live server state.

If your host does not surface prompts, the first two calls above are
the equivalent and equally cheap.

## 4. Workflow loop

- **Delegate non-trivial work.** For any real change to `packages/core`,
  a plugin, the build/release scripts, `apps/web`, or the VS Code
  extension, use the `mcp-vertex-orchestrator` subagent (or the agent
  the host registers as orchestrator). The orchestrator owns the
  proposal state machine, locks, drift guards, and recovery from
  `stop: true`.
- **Don't poll.** When you need a lock another agent holds, wait for
  the `lock-released` notification (notification plugin). When
  `auto_work` returns `stop: true`, recover by calling
  `proposals_continue_proposal { mode: "auto" }` or by reading
  `proposals_compact_status` — do NOT re-call `auto_work` until you
  have made progress (a slice closed, a lock released, a file edited).
- **Re-read discipline.** Do not re-read a file whose digest hasn't
  changed. `round_context` and the docs tools expose digests for exactly
  this. Re-reading unchanged content is the #1 token waste.

### 4.b Coexistence with parallel work (c00012)

This workspace is shared. Other agents, CI bots, and humans commit
constantly. An agent that flinches every time `git status` shows a new
entry is an agent that burns tokens, drops slices, and produces nothing.
When you observe a change in the working tree, the index, or the active
branch that **is not yours**, apply the five-point rule:

1. **Do not panic.** The change is not a bug, not an attack, not
   necessarily directed at your slice. It is normal background activity.
2. **Do not redo the work.** If you wrote a file 30 seconds ago and it
   now shows different content, assume the new content is intentional.
   Read what is there *now*, not what you remember writing.
3. **Read the commit.** A `git log -1` (or `git diff HEAD~1 -- <path>`)
   explains what happened in one low-token call. If the commit covers
   your intent, **accept it and proceed**. If it conflicts, do a
   surgical follow-up — not a re-plan.
4. **Do not widen scope.** "Making progress" by claiming adjacent
   files because your slice got disrupted is the same anti-pattern as
   taking a non-disjoint slice while another agent holds the lock.
   Either wait, take a different truly disjoint slice, or close the
   current slice with the honest note "blocked by external change".
5. **Trust `git diff` over memory.** The working tree is the source of
   truth. What you *think* you wrote is, at best, a hypothesis.

Canonical micro-pattern when `git status --porcelain` shows something
you did not write:

```text
git log -1 -- <path>          # what changed?
git diff HEAD~1 -- <path>     # full diff if needed
# accept and proceed, OR surgical follow-up. NEVER re-plan.
```

This covers peer agents on the same branch, CI dep bumps that touch
`bun.lock`, human typo fixes in unrelated proposals,
`proposals_sync_proposals` regenerating an index file, the worktree's
own hooks (lefthook, biome --write) rewriting a file on commit, and
stale worktrees that share the same `.git` dir. In every case, **keep
working on your slice**. The proposals plugin's multi-agent skill
restates the rule for swarm context.

## 5. Definition of done

- `bun run validate` is green (typecheck + lint + tests + drift guards).
- Conventional Commits (`fix:` / `feat:` / `feat!:`) — versioning is
  automatic on `main`. No manual bumps.
- Touched a tool? Kept its `outputSchema`. Added a tool? Added its
  output to the catalog generator (if it isn't picked up automatically).
- Persisted state? Routed through `withFileMutex` + `writeFileAtomic`.
- Wrote a secret through a durable store? Ran it through `redactSecrets`.

## 6. Invariants you must not break

- Core stays agnostic. No project vocabulary (role enums, model names,
  folder names) inside `packages/core`. Plugins receive everything
  resolved through `IMcpPluginContext`.
- No `process.cwd()` in engines. Paths come from `ctx.workspace` /
  `corePaths` / injected options.
- Async I/O only in hot paths. `*Sync` is boot-time only.
- Workspace-scoped path inputs are contained via `resolveWorkspaceContained`.
- Token budget is a protected invariant. `overview` (compact) +
  `auto_work` stay under their measured budgets.
- **Every agent MUST hold an active lock claim (`agent_lock`) for the files it edits.** The validation gate enforces this via `lint:agent-claims`, and commits/pushes violating this will be rejected by git hooks.
- Every public tool declares an `outputSchema`. `catchall` is documented,
  not default.
- **No hardcoded lists of skills / tools / proposal ids in any host
  file, agent answer, or generated fragment.** The server is the only
  source. If you find yourself wanting to list them, **stop** and call
  `mcp-vertex_agent_catalog` instead.
- **Agents and tools invoke shell through `bash`, never `zsh` or
  `sh`.** The user keeps `zsh` for their own sessions (Powerlevel10k,
  oh-my-zsh, completions, prompt). Any agent-driven shell call —
  direct `run_in_terminal`, subagent shell, CI bridge, MCP tool
  handler that shells out — must launch `/bin/bash -c '<cmd>'` (or
  `bash --noprofile --norc -c '<cmd>'` for stricter isolation).
  Reasons: p10k instant prompt opens the alternate screen buffer
  during zsh init, which silently breaks wrappers that detect TTY
  state and report "El comando abrió el búfer alternativo" instead of
  returning stdout. `sh` is not a stable target either: it is `dash`
  on Debian/Ubuntu/WSL, `ash` on Alpine, and old `bash` on macOS, so
  agents would have to second-guess which shell dialect they are in on
  every invocation. Bash has no init scripts by default, never touches
  the TTY layout, and supports the POSIX-plus-extensions syntax agents
  generate by reflex. This rule applies to every host (Copilot,
  Claude Code, Cursor, Aider, subagents, swarm runners).

## 7. Repo-level rules (only when the host reads `AGENTS.md`)

If the host you are running in reads a workspace-root `AGENTS.md`, that
file should be a single pointer to this bootstrap plus a short list of
repo-specific inviolable conventions. Below is the canonical content
for `@mcp-vertex/core` itself; downstream projects adapt it to their
own monorepo shape.

### What this repo is

A Bun monorepo:

- `packages/core` — the agnostic runtime: tool registry, plugin loader,
  bootstrap, scaffold, metrics, shared filesystem primitives
  (`withFileMutex`, `writeFileAtomic`, `quarantineCorruptFile`,
  `resolveWorkspaceContained`, `redactSecrets`). **No domain logic lives
  here.**
- `packages/client` — stdio client + service layer used by every host
  extension.
- `packages/ui-extension` — host-agnostic UI shell.
- `plugins/*` — opt-in capabilities (one plugin per namespace). Each owns
  its own namespace, lifecycle, and durable state.
- `extensions/vscode` — VS Code host implementation. The only file under
  `extensions/` that may import `vscode`.
- `apps/web` — Astro product/docs site, generated from the **live** tool
  registry.
- `docs/mcp-vertex/examples/*` — adoption examples (minimal host, custom
  plugin, swarm).
- `scripts/*` — build, release, type/schema generation.
- `docs/mcp-vertex/agent-catalog.generated.json` — checked-in snapshot of
  the unified discovery surface (tools + skills + proposals). Hosts that
  need a stable route to this surface read it directly.

### Commands (the only ones you need)

| Task | Command |
|---|---|
| Full gate (typecheck + lint + tests) | `bun run validate` |
| Tests only | `bun run test` (`bun run test:coverage` for thresholds) |
| Build publishable `dist/` for all packages | `bun run build` |
| Regenerate the typed tool SDK | `bun run types:generate` |
| Regenerate the config JSON Schema | `bun run config:schema` |
| Build the docs site | `bun run site` (`site:strict` fails on undocumented tools) |
| Regenerate the agent-catalog artifact + host hints | `bun run catalog:generate` (check: `bun run catalog:check` + `bun run catalog:hints:check`) |
| Cut a release (CI does this on push to `main`) | `bun run release` |

### Repo-level hard rules

1. The core stays agnostic. Never import a plugin from `packages/core`,
   never put a host/project vocabulary (role enums, model names, folder
   names) into the core. Plugins receive everything resolved through
   `IMcpPluginContext`.
2. No `process.cwd()` in engines. Paths come from `ctx.workspace` /
   `corePaths` / injected options.
3. Async I/O only in hot paths. Sync filesystem calls are allowed only
   at boot (CLI arg parse, config-file load, WSL detection). Per-call
   paths must `await readFile`. For sync interfaces that cannot be
   widened without rippling the core contract, use a short-TTL in-memory
   cache populated by the async read path.
4. Durable writes go through the primitives. Persisted state uses
   `withFileMutex` + `writeFileAtomic`; corrupt ≠ empty
   (`quarantineCorruptFile`).
5. Workspace-scoped path inputs must be contained. Use
   `resolveWorkspaceContained` for any `roots`/`manifest`/path option.
6. Secrets never get persisted. Durable stores (memory, proposals) run
   user text through `redactSecrets` before writing.
7. Token budget is a protected invariant. `overview` (compact) +
   `auto_work` stay under their measured budgets.
8. Every public tool declares an `outputSchema`. `catchall` is
   documented, not default.
9. i18n is complete or it doesn't ship. Any web copy change must add
   ALL languages; `apps/web/scripts/check-i18n.ts` fails the build
   otherwise.
10. `tools/` and `scripts/` are TypeScript-exclusive. No
    `.py`/`.sh`/`.bash`/`.zsh`/`.pl`/`.rb`/`.pyc` inside them.
11. Host files point at this bootstrap, never enumerate content.
    `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, anything
    written for Cursor/Aider/Continue/etc. **include** this file by
    reference and add only the repo-/host-specific rules the server
    cannot enforce (see § 8 below).

### Repo-level conventions

- Conventional Commits. Versioning is derived from commit type on push
  to `main` (`fix:` → patch, `feat:` → minor, `feat!:` /
  `BREAKING CHANGE:` → major). No manual version bumps; no commit-back
  loop.
- Swarm proposals workflow. If a proposals task needs more than 3 tool
  calls, touches multiple files, or requires repeated MCP reads, delegate
  it instead of keeping it on the main thread. With 2+ agents in the
  same repo, each agent uses its own `agent_worktree` **only when the
  host has enabled `agentWorktree`/`--agent-worktree`** (default off;
  the tool returns a structured `ok: false` error when disabled),
  otherwise commit to the active branch; on claim conflict, wait for
  `lock-released` or `await_lock` instead of polling;
  `proposals_sync_proposals` runs only after the last open slice of
  that proposal is closed.
- `auto_work` ↔ loop detector ↔ idle-streak. Calling `auto_work` three
  times in a row is NOT a loop; it's the orchestrator polling for work.
  The detector is wired into `auto_work` but disabled by default for
  `proposals_auto_work`. Recovery from `stop: true`: call
  `proposals_continue_proposal { mode: "auto" }` directly (or read the
  cascade yourself with `proposals_compact_status`). Do NOT re-call
  `auto_work` until you have made progress.
- One barrel per package (`src/public/index.ts`); internals live in
  `src/lib`.
- Interfaces are `I`-prefixed; match the surrounding file's idiom.
- Tests colocate as `*.spec.ts`; protocol behaviour gets an e2e with a
  real in-memory MCP server.

### Proposal ID prefixes

| Prefix | Meaning | Notes |
|---|---|---|
| `f` | feat | New feature work (`kind: feat`). |
| `x` | fix | Bug fix work (`kind: fix`). |
| `r` | refactor | Behaviour-preserving refactor work (`kind: refactor`). |
| `c` | chore | Build / lint / CI / maintenance work (`kind: chore`). |
| `d` | docs | Docs-only work (`kind: docs`). |
| `t` | test | Tests-only work (`kind: test`). |
| `l` | legacy | Pre-f00016 `pNNN` proposals migrated into the legacy tier. |
| `a` | audit | Audit-finding lifecycle (`kind: audit`). |
| `n` | note | Resume / note records kept as permanent history. |

### When you touch a plugin / add a tool

- Add/keep its `outputSchema`; run `bun run types:generate` if the surface
  changed.
- Update the plugin README and, if user-visible on the site, add the
  translation keys for **every** language in `apps/web/src/i18n/ui.ts`.
- New persisted state → mutex + atomic write + a corruption test.

### When you run an audit

Always read the audit playbook skill first (use `mcp-vertex_agent_catalog`
to find its current path). Audits in this repo are not shell-only
exercises — the LLM must read the actual source code exhaustively
(every plugin, every engine, every extension, tools, scripts, test specs,
skills) and produce findings backed by real file references and code
snippets.

### Repo root layout (keep it ordered)

The root is intentionally minimal. Before adding a file to it, check:

- The cache is ALWAYS the root cache — never per-folder. There is
  exactly one cache root: the workspace root `.cache/`. Resolve the
  cache path through the single source of truth — `DEFAULT_CORE_PATHS.cacheDir`
  in the engine, or `cacheRoot()`/`CACHE_DIR_REL` from
  `tools/scripts/lib/monorepo-paths.ts` in tooling — never a hardcoded
  folder-relative `.cache`. `bun run lint:cache` FAILS if any `.cache`
  appears outside the root.
- Relocatable tool configs live in `config/`. A tool config moves to
  `config/` only if (a) the tool accepts an explicit config path AND
  (b) the VS Code editor integration is unaffected.
- External agent/IDE configs may use `config/external/<tool>/` as the
  canonical source only when the tool's root auto-discovery keeps
  working via a tested stub, include, symlink, or explicit path. Do not
  move `.github/`, `.vscode/`, `.cursor/`, `.claude/`, `.codex/`,
  `.continue/`, `.mcp.json`, `.aider.conf.yml`, or `.cursorrules`
  blindly.
- Config files that STAY at root are the ones their tool/editor
  auto-discovers there — the standard, expected JS/TS monorepo layout:
  `package.json`, `bun.lock`, `bunfig.toml`, `.gitignore`,
  `tsconfig*.json`, `biome.json`, `vitest.config.ts`/`vitest.shared.ts`,
  `stylelint.config.mjs`, `lefthook.yml`, `mcp-vertex.config.json`.
- Community-health docs live in `.github/` (`CONTRIBUTING.md`,
  `SECURITY.md`) — GitHub discovers them there. `README.md`, `LICENSE`,
  `CHANGELOG.md`, `AGENTS.md`, `CLAUDE.md` stay at root by convention.
- A new root file must justify itself against the above; otherwise it
  belongs in `.github/`, `docs/mcp-vertex/`, `tools/`, `config/`, or
  under `.cache/`.

## 8. Host appendices

These are the only places host-specific rules live. **All host
instruction files just point at this file and pick the appendix that
applies.** When a rule changes, it changes here once — every host picks
it up on its next read.

### 8.1 Copilot Chat — close-marker contract

The `@mcp-vertex/status-marker` plugin is loaded in this workspace
(`mcp-vertex_overview` reports it; its `ping` tool answers). The plugin
is agent-driven today: the core does **not** yet have an `onAfterRespond`
hook, so the model is responsible for closing every response with
exactly one line from the canonical 8-state table.

**Mandatory behaviour for every response, with no exceptions:**

1. Pick the state that best describes the turn's outcome (`HECHO` when
   work is complete and nothing pending; `CAP` when handing off
   mid-turn; `RE-PIVOT` when the cascade changed direction;
   `CHECKPOINT-REQUIRED` when handing off to the orchestrator;
   `REPAIR-NEEDED` when the verifier asked for repair; `BLOQUEADO` on a
   hard blocker; `SIN PROPUESTAS LIBRES` when the catalog only has
   claimed work; `SIN PROPUESTA DE NINGUN TIPO` when nothing is
   executable at all).
2. Call `<prefix>_close { state, reason? }` (prefix is `status-marker` —
   confirm via `mcp-vertex_overview`). Never hand-format the line.
3. Paste the returned `line` as the **literal last line** of the
   response. No prose after it — not even whitespace-then-text. The
   line must be ≤ 120 chars (the helper truncates with `…` if needed).
4. Five states require a `reason`: `CAP`, `RE-PIVOT`,
   `CHECKPOINT-REQUIRED`, `REPAIR-NEEDED`, `BLOQUEADO`. Omitting it
   makes the helper insert the literal `<reason-missing>` token — that
   is **not** a valid response.
5. If unsure whether a draft response is compliant, run
   `<prefix>_validate { text: <full draft> }` first and check `ok`.

**Bilingual rendering toggle.** The close marker supports two
bracket-text locales: `'es'` (default — `[HECHO]`, `[CAP]`, …,
byte-identical to legacy) and `'en'` (shorter English tokens —
`[DONE]`, `[HANDOFF]`, `[REPIVOT]`, `[CHECKPOINT]`, `[REPAIR]`,
`[BLOCKED]`, `[NO_FREE_PROPOSALS]`, `[NO_WORK]`). Pass `locale: "en"`
to `<prefix>_close` (or to `formatCloseMarker` directly) to switch.
The validator and the 8-state semantics are unchanged — only the
bracket text differs; pick whichever locale matches the host's UI.
The detailed contract lives in the status-marker skill (use
`mcp-vertex_agent_catalog` to find its current path).

### 8.2 Claude Code — keep the main thread cheap

This repo's MCP host (`scripts/host-server.ts`) runs `--preset=swarm`,
which loads the active plugin preset. Tool *results* stay in context
for the rest of the session, so how you call these tools matters:

- **Delegate non-trivial work.** For any real change to `packages/core`,
  a plugin, the build/release scripts, or `apps/web`, use the
  `mcp-vertex-orchestrator` subagent instead of driving `proposals_*`
  tools directly from the main thread. As an operational threshold,
  treat a task as non-trivial once it needs more than 3 tool calls,
  touches multiple files, or needs repeated MCP reads to complete. It
  knows the working loop, the invariants, and the multi-agent
  coordination primitives.
- **Prefer compact tools when orienting directly.** Use
  `mcp-vertex_overview` with `compact: true`, `proposals_auto_work`,
  and `proposals_compact_status` over verbose equivalents
  (`proposal_board`, full `state_health` dumps) unless you specifically
  need the verbose detail.
- **Prefer distilled recall over re-reading.** If a fact should survive
  beyond the current slice, recall it from durable memory; if it is
  only useful right now, keep it transient and compact it away when the
  task changes.
- **`/compact` between unrelated tasks.** Once a slice/proposal is
  closed and before starting unrelated work, compact — don't carry its
  tool output forward for the rest of the session.

### 8.3 Cursor / Aider / Continue — generic LLM hosts

These hosts typically read a workspace-root `AGENTS.md` (Cursor, Aider)
or have their own config file. Use the same single-pointer pattern:

- Place an `AGENTS.md` (or the host's equivalent config file) at the
  workspace root whose entire content is:

  ````text
  # Agent instructions

  Follow [`docs/mcp-vertex/AGENT-BOOTSTRAP.md`](docs/mcp-vertex/AGENT-BOOTSTRAP.md)
  — that file is the only source of agent rules. The server
  (`mcp-vertex_overview`, `mcp-vertex_agent_catalog`) is the only source
  of truth for what is loaded. Do not enumerate tools, skills, or
  proposal ids in your answers.
  ````

- That's it. No other content. When the bootstrap changes, the host
  picks it up on the next session.