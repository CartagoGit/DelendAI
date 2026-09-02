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
   - 8.3 [Codex CLI — custom subagents + workspace AGENTS.md](#83-codex-cli--custom-subagents--workspace-agentsmd)
   - 8.4 [Cursor / Aider / Continue — generic LLM hosts](#84-cursor--aider--continue--generic-llm-hosts)

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
  counts per status, plus lean skill ids. Tool names are NOT repeated
  here — `mcp-vertex_overview { compact: true }` already lists them all,
  grouped by plugin. Measured ~2.3 KB against this repo (was 14 KB
  before the orientation projection).
- `mode: "full"` returns the whole catalog.
- `section: "tools" | "skills" | "proposals"` narrows to one slice.
- `query: "..."` filters by id / name / tag / title.

Do **not** hardcode tool names, skill names, or proposal ids in your
answers. Ask the server every time. Skills/tools/proposals are added
and removed every week; any hardcoded list will be wrong within days.

### Execution path — one call first

For an implementation task, call `mcp-vertex_proposals_auto_work` once. When
its work response includes `claimReady`, claim exactly the returned files with
the supplied lock arguments, implement that atomic slice, validate it, then
close it. The payload is the canonical next action; do not spend extra calls
reconstructing the proposal or slice plan.

### Advanced / compatibility path

Older hosts that do not expose `claimReady`, or a debugging session that needs
to inspect dependencies or contention, can use the existing plan/claim tools
after `auto_work`. This fallback is compatible by design, but it is not the
normal bootstrap path.

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

- **Archived proposals are frozen.** `legacy/closed/<kind>/` is the
  reaper's destination (f00076). Reaped proposals stay indexed (with
  `archived: true` in the registry), keep their `status: done`, and
  **must not** be transitioned, edited, or have their slice statuses
  changed. The `lint:closed-frozen-guard` script enforces this in
  `bun run validate`. Reaper entry point:
  `bun run archive:proposals:reap` (dry-run by default; pass `--apply`
  via the underlying `tools/scripts/lint/reap-legacy-proposals.script.ts`
  to actually move files).

### 4.c Session hygiene — keep host usage intentional

`mcp-vertex` can measure its own payloads and tool activity, but it cannot
inspect a host's private context meter or subscription quota. Treat host
warnings as authoritative and use this portable policy in every project:

- One session is one coherent task. At a completed slice, write the smallest
  handoff/digest needed next; never leave an idle or polling session running.
- With `memory`, check after roughly 25 turns or 8k raw-tail tokens. If it
  triggers, compact and recall the digest instead of carrying raw output.
- At a host warning — or before roughly 100k tokens when it exposes a meter —
  checkpoint and start fresh. Compact related work; clear unrelated work, then
  re-orient and recall only the needed digest.
- If a host pre-compaction advisory says the explicit digest is missing or
  stale, create a semantic checkpoint from the actual work state; never ask a
  hook to invent one from a transcript.
- After two continuous hours, deliberately checkpoint and compact. End
  unattended or idle sessions; use notifications/events instead of waiting.
- Start ordinary single-agent work lean; elevate to collaboration only for
  coordination, locks, notifications, or proposals, avoiding static schemas
  until they are useful.

These are guardrails, not a claim that the server can account for Claude,
Codex, or another host's subscription usage. `usage-tracking` remains useful
for local MCP activity, while the host dashboard remains the source of truth
for host-level limits.

### 4.d Checkpoint advisories (f00156)

When any mcp-vertex tool result carries `checkpointAdvisory` in the result
`_meta` (the protocol metadata channel — never `structuredContent`, which is
schema-validated) with `triggered: true`:

1. Surface `checkpointAdvisory.message` to the user **verbatim**. Do not
   silently consume or paraphrase it.
2. Explain the reason in at most one short sentence.
3. Follow `nextAction` unless the user explicitly asks to continue.
4. Never repeat the same advisory until its `dedupeKey` changes.

Every visible recommendation begins with **At this point, I recommend**.

**Agent-enforced fallback (host-private terminals):** if you run two or more
equivalent validation cycles without a meaningful implementation delta, treat
it as a micro-validation loop and surface the same advisory. That signal is
agent-enforced; server-observed validation is whatever MCP quality/git tools
the server can see. See `docs/mcp-vertex/CHECKPOINT-ADVISORIES.md`.

Preferred fresh-session sequence: coherent boundary → semantic checkpoint →
persist proposal/slice state → release unnecessary locks → new session →
orient → resume from `memory_checkpoint_packet`. Session age by itself must
never hard-block work.

### 4.e Rebaseline with `--update`

When a lint fails because a **baselined historical value** drifted (for example,
an already-closed proposal still cites an old path or an old orphan commit), do
not hand-edit the baseline JSON unless the script explicitly tells you to. First
check whether the lint supports `--update` and re-run the lint through that
entrypoint so the script itself rewrites its canonical baseline format. Manual
edits are the fallback only when no `--update` mode exists.

| Lint / script                                             | `--update` support | Use case                                                                                                                                                      |
| --------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun tools/scripts/lint/proposal-files-exist.script.ts`   | Yes                | Rebaseline known dangling `Files:` references in historical `done/`, `review/` or `in-progress` proposals after an intentional rename or archived path drift. |
| `bun tools/scripts/lint/proposal-cited-commits.script.ts` | Yes                | Rebaseline known orphan commit citations in historical `done/*` proposals when the commit was intentionally rebased away or documented as legacy debt.        |

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

### Cross-plugin configuration compatibility

Plugin options are persistent host configuration, not suggestions. Plugins
may complement one another when they own different effects, but the core
performs a compatibility preflight before any plugin `register()` hook runs.
If enabled plugins claim the same automatic side effect, startup stops with a
diagnostic containing the exact configuration keys, effective values,
precedence, and a JSON patch for `mcp-vertex.config.json`. The core remains
agnostic; each plugin declares only the compatibility rules for its own
interactions.

- `bun run validate` is green (typecheck + lint + tests + drift guards).
- Conventional Commits (`fix:` / `feat:` / `feat!:`) — versioning is
  automatic on `main`. No manual bumps.
- **Work is committed and pushed under the configured author identity.**
  A finished task ends with its changes committed (Conventional Commit)
  and pushed — via the git write tools when the host enabled them, or the
  proposals persist step otherwise. The author is resolved centrally, so
  never ask the user whose name to use and never leave completed work
  uncommitted waiting for a reminder.

- **Delegated agents follow the configured workspace policy.** With
  `agentWorktree: false` (the repository default), agents edit the configured
  checkout, normally `develop`; `commit-policy` owns the automatic commit and
  push after each completed slice. With `agentWorktree: true`,
  `proposals_delegate` creates the branch and worktree before claiming files
  and returns both `worktree.path` and `cwd`; the host must launch or continue
  the delegated agent in that directory. The host must never infer a different
  workspace policy from a tool handoff.
- Touched a tool? Kept its `outputSchema`. Added a tool? Added its
  output to the catalog generator (if it isn't picked up automatically).
- Persisted state? Routed through `withFileMutex` + `writeFileAtomic`.
- Wrote a secret through a durable store? Ran it through `redactSecrets`.

## 6. Invariants you must not break

- **The dogfooding host is a one-shot process.** Keep `.vscode/mcp.json` and
  `.mcp.json` pointed at the repo-local host with
  `bun tools/scripts/host/host-server.script.ts` and the appropriate workspace
  argument. A restarted host must be started explicitly so each session has
  one composition root and one resource registration set. The
  `lint:self-host-dogfood` gate must remain green.
- Core stays agnostic. No project vocabulary (role enums, model names,
  folder names) inside `packages/core`. Plugins receive everything
  resolved through `IMcpPluginContext`.
- No `process.cwd()` in engines. Paths come from `ctx.workspace` /
  `corePaths` / injected options.
- Async I/O only in hot paths. `*Sync` is boot-time only.
- Workspace-scoped path inputs are contained via `resolveWorkspaceContained`.
- Token budget is a protected invariant. `overview` (compact) +
  `auto_work` stay under their measured budgets.
- **Every agent MUST hold an active lock claim (`agent_lock`) for the files it edits.** The validation gate enforces this via `lint:agent-claims`, and commits/pushes violating this will be rejected by git hooks. (x00080) The claim check itself is a lefthook-installed TypeScript hook (`tools/scripts/hooks/pre-commit.ts`), not a raw `.sh` git hook template — every hook in this repo is TypeScript, per rule #10 below.
  - **`develop` is the shared snapshot journal; `main` is the release boundary.**
    With `agentWorktree: false` (the repository default), agents work in the
    shared checkout. The commit policy serializes `stage → commit → push`, so
    concurrent agents can leave frequent, visible, reversible snapshots on
    `develop`. Agents must not create a WIP branch merely to isolate those
    snapshots. `main` remains protected and is promoted only through a pull
    request after the configured quality checks. When `agentWorktree: true` is
    explicitly enabled, isolated agent branches and worktrees are appropriate;
    that is a separate operating mode from the shared snapshot journal.
- **No orphaned branches or stashes — always reconcile (this repo).**
  Before closing any work or session, run `bun run reclaim:orphans` and
  reconcile every listed orphan: merge-if-valuable into `develop`
  (fixing discrepancies/bugs until 100% functional) or delete-if-not.
  `bun run reclaim:orphans --apply` deletes only lossless branches
  (`ahead === 0`); stashes and unique-commit branches are never
  auto-deleted. This is a repo-level policy, not a plugin behaviour.
- Every public tool declares an `outputSchema`. `catchall` is documented,
  not default.
- **No hardcoded lists of skills / tools / proposal ids in any host
  file, agent answer, or generated fragment.** The server is the only
  source. If you find yourself wanting to list them, **stop** and call
  `mcp-vertex_agent_catalog` instead.
- **Code quality is a non-negotiable default.** In this project and in
  any project that uses `mcp-vertex`, every design, code change, file
  or folder name, proposal, slice and answer must reflect, by default
  and without reminder, SOLID (SRP, OCP, LSP, ISP, DIP), Clean Code
  (intention-revealing names, small single-purpose functions, comments
  only when they explain *why*, no swallowed errors, no dead code, no
  magic numbers, no commented-out branches), reusable code (narrow
  interfaces, registries over long `switch`/`if-else` chains,
  dependency injection, no painful duplication, shared helpers) and
  general best practices (tests for non-trivial logic, validation at
  I/O edges, low coupling, high cohesion, strict types, declared
  dependencies). The only acceptable escapes are (a) the user
  explicitly asks for a relaxation in the request ("quick and dirty",
  "skip refactoring now", etc.) or (b) the project's own binding
  instructions force it (legacy compatibility, externally-pinned
  contracts, mandatory upstream style). When an escape applies, state
  it explicitly in the response so the relaxation stays auditable.
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
  If the shell still gets stuck on that "búfer alternativo" symptom,
  do not retry the same `mode: "sync"` call — follow the shell-fallback
  ladder in
  [`docs/mcp-vertex/skills/shell-fallback/SKILL.md`](skills/shell-fallback/SKILL.md)
  (`withShellFallback` from `@mcp-vertex/core/public`: re-issue as
  `mode: "async"` and poll, then fall back to file tools).

## 7. Repo-level rules (only when the host reads `AGENTS.md`)

If the host you are running in reads a workspace-root `AGENTS.md`, read
[`REPO-RULES.md`](REPO-RULES.md) for the canonical repo-level content
(monorepo layout, commands, hard rules, conventions, tooling posture,
proposal ID prefixes, plugin/audit checklists, root layout policy).
That file is the canonical version for `@mcp-vertex/core` itself;
downstream projects adapt it to their own monorepo shape.

Hosts that do **not** read a workspace-root `AGENTS.md` (most standalone
MCP clients) never need `REPO-RULES.md` — nothing in the rest of this
bootstrap (§§1-6, 8) depends on it, so skip it entirely and save the
tokens (a00086: this section used to inline all of that content here,
~10.6 KB read into every session regardless of whether the host even
consults `AGENTS.md`).

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
- **Rotate before the danger zone.** At the host's context warning (or about
  100k tokens when Claude exposes the meter), checkpoint with the memory
  digest, then start a fresh session. Use `/compact` only to continue related
  work; use `/clear` before unrelated work. Do not leave an idle Claude Code
  session running in the background; a continuous session beyond two hours
  needs an intentional checkpoint, and one approaching many hours should end.

### 8.3 Codex CLI — custom subagents + workspace AGENTS.md

Codex CLI reads the workspace-root `AGENTS.md` (shared with Copilot
Chat — no per-host duplication) and recognises **custom subagents**
defined as `.codex/agents/<name>.md`. The scaffolder emits one file
per role (`orchestrator`, `proposal-guardian`, `implementation-runner`,
`delivery-verifier`, `technical-investigator`) whenever it runs in any
mode (`create_project { kind: "host" }`, `mcpv init`, or
`mcpv init:default`). Do not delete them — the orchestrator subagent
becomes invisible to Codex without them, even though `AGENTS.md` is
present.

Frontmatter contract for `.codex/agents/<name>.md`:

- `name` — kebab-case (e.g. `orchestrator`, `proposal-guardian`).
- `description` — single-line, describes when to invoke. The
  scaffolder's wording is: "Root orchestrator for <project>. The real
  contract lives in the mcp-vertex MCP server — use for any
  non-trivial change (more than 3 tool calls, multiple files, or
  repeated MCP reads)."
- No `tools:` field is emitted — Codex inherits every tool available
  to subagents in the session. Inventing a per-host vocabulary
  mapping would trade one inaccuracy for another.

The MCP server config is in `.codex/config.toml` and is generated by
`mcpv init` (or hand-authored). It launches the repo-local mcp-vertex
host (`bun tools/scripts/host/host-server.script.ts`). Codex CLI's
custom-agent feature treats a subagent file as a named, invocable
prompt template — the body is free-form Markdown after the closing
`---`.

### 8.4 Cursor / Aider / Continue — generic LLM hosts

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


## Architecture decisions

Durable architecture decisions live as ADRs in `docs/mcp-vertex/adr/`,
not only in commit messages. This section indexes the ones worth a
newcomer's attention before they re-litigate a closed decision.

- [ADR 0007 — `@mcp-vertex/core/contracts` (subpath) vs a separate package](adr/0007-core-contracts-subpath-vs-package.md)

## Quantitative facts

<!-- mcp-vertex:begin quantitative -->
```
Generated at: 2026-09-02T01:38:31.796Z

Plugins: 56
Tools: 241
Test specs: 527 (≈4305 cases)
Workspaces: 6 packages, 2 apps, 1 extensions, 4 tooling workspace(s).
Proposals: 556 on disk (ready=49, in-progress=2, done=505)
```
<!-- mcp-vertex:end quantitative -->
