---
id: f00042
status: ready
type: proposal
track: plugins/issues+docs
date: 2026-06-21
kind: feat
title: GitHub issues plugin — ingest, analyse and (optionally) promote to a proposal
shipped-in: []
related:
    - f00015 # logs plugin — same shape (host-only, not in swarm preset)
    - f00026 # observability v3 — same "host-side tool with rich UI surface" pattern
ownership:
    - {
          agent: implementation_runner,
          task: 'S1: plugin skeleton (package.json/tsconfig/vitest + src/index.ts + src/public/index.ts + README) with dependsOn: ["proposals"]',
      }
    - {
          agent: implementation_runner,
          task: 'S2: GitHub client (gh CLI wrapper + REST API fallback) + issue-scaffold builder + frontmatter serializer/deserializer',
      }
    - {
          agent: implementation_runner,
          task: 'S3: 4 tools (issues_list / issues_fetch / issues_ingest / issues_analyze / issues_resolve) with outputSchemas',
      }
    - {
          agent: implementation_runner,
          task: 'S4: docs (plugins/issues/README.md + docs/proposals/retired/issues/README.md) + plugin enabled in mcp-vertex.config.json preset',
      }
globalGate: lint
acceptance:
    - { command: bun run type, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run site:strict, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: bun run lint:tools, expect: exit0 }
    - { command: bun run check:i18n:plugins, expect: exit0 }
---

# f00042 — GitHub issues plugin

## goal

Bring GitHub issues into the same file-based proposal workflow the
rest of the repo already uses, **without** teaching the MCP server
how to talk to an LLM. The plugin is a host-side, single-user tool:

1. Fetch a GitHub issue (title, body, comments, author, labels,
   linked PRs) using `gh` CLI when available, falling back to the
   REST API when a `GITHUB_TOKEN` env var is set, and to anonymous
   public REST as a last resort (rate-limited to 60/h).
2. Persist every analysed issue as a durable scaffold file under
   `docs/proposals/retired/issues/github#<n>-<slug>.md` so the
   original thread is recoverable offline.
3. Run a **mechanical pre-analysis** inside the server (label
   heuristics, body length, cross-references to repo paths) and
   return a structured suggestion (`kind`, `confidence`,
   `rationale`, draft markdown). The **decision** to promote to a
   proposal is taken by the host's LLM (Copilot in this workspace)
   using a downstream `proposals_create_proposal` call.
4. Once a decision is made (promote / dismiss / split), the host
   calls `issues_resolve` which mutates the scaffold's frontmatter
   (`resolution: promoted | promoted-multiple | dismissed`,
   `proposals: [ids…]`, `dismiss_reason: …`) — leaving a single
   source of truth that the user can quote back on GitHub.

## why

`f00026` and `f00022` made the IDE a real cockpit for someone using
the extension day-to-day. The user then asked for the missing piece:
**"when somebody opens a GitHub issue, can the MCP server itself
ingest it, decide whether it warrants a proposal, and route it?"**

The answer is yes, but with three constraints:

1. **The server is not an LLM.** It must not embed a model client.
   The "smart" step (deciding kind, drafting the proposal) stays
   with the host that owns the LLM. This preserves the core
   invariant ("core stays agnostic") and avoids leaking API keys
   into a long-running process.
2. **The plugin must be opt-in.** Almost nobody wants a GitHub
   tool loaded into their editor. It ships as a separate plugin
   (`plugins/issues`), excluded from the `swarm` preset, and the
   user has to add it explicitly to `mcp-vertex.config.json#plugins`.
3. **Every analysed issue must leave a trace** — even dismissed
   ones — so that answering the GitHub user is one `cat` away.
   This is why the scaffold lives under `retired/issues/` and not
   `ready/` or `done/`: the *analysis* is the outcome, regardless
   of whether it promoted to a proposal.

## why this design

### Hard dependency on `proposals`

**`@mcp-vertex/issues` cannot run without `@mcp-vertex/proposals`.**

This is not a soft coupling — every single tool in this plugin
mutates or reads a file under `docs/proposals/retired/issues/`,
which is part of the `proposals` plugin's managed namespace
(`<docsDir>/proposals/**`). Without `proposals` loaded:

- The `proposals_*` tool surface (`proposals_create_proposal`,
  `proposals_sync_proposals`, `proposals_auto_work`…) does not
  exist, so the host's "decide → create → resolve" loop is
  impossible to express.
- The scaffold directory is not created/owned by anyone; we would
  have to either duplicate the `proposals` directory layout
  primitives (breaks AGENTS.md invariant: no plugin may depend on
  another plugin's filesystem contract) or re-derive them by
  reading `docs/proposals/index.json` (chicken-and-egg: that file
  is itself produced by `proposals_sync_proposals`).

The contract is enforced at **three layers**:

| Layer | Where | What happens if `proposals` is missing |
|---|---|---|
| **Declaration** | `plugins/issues/src/index.ts` → `definePlugin({ dependsOn: ['proposals'] })` | The plugin advertises its dependency in its public surface. |
| **Loader** | `packages/core/src/lib/plugins/load-plugins.ts` | Boot fails with `plugin "issues" requires "proposals" (not in load set)`. Exit code ≠ 0 — no partial registration, no silent degradation. |
| **Docs** | `apps/web/src/pages/plugins.astro`, `apps/web/src/pages/presets.astro` (f00043), `extensions/vscode/src/embeds/plugin-help.ts`, `docs/PLUGINS-MCP-VERTEX.md` | The plugin page renders a yellow "requires `proposals`" badge that links to the install snippet. The presets table shows `issues` ONLY under the "full" / "personal" preset, never under `swarm`. The VS Code plugin-help embed shows the same warning before the user enables the plugin. |

### Documentation requirements (must be visible everywhere)

Every user-facing surface that lists or installs this plugin must
carry the dependency notice **in the same screen**, not behind a
second click:

1. **`plugins/issues/README.md`** — first paragraph states the
   dependency, shows the install command (`mcp-vertex
   --plugins=proposals,issues`) and the
   `mcp-vertex.config.json` snippet.
2. **`docs/PLUGINS-MCP-VERTEX.md`** — add `issues` under a new
   "Personal / host-only plugins" section with the dependency callout.
3. **`apps/web/src/pages/plugins.astro`** — the `issues` card shows
   a `requires: proposals` chip.
4. **`apps/web/src/pages/presets.astro`** (added in f00043) — the
   `full` preset row explicitly mentions that `issues` rides on
   `proposals` (the cell content links to both plugin pages).
5. **`extensions/vscode/src/embeds/plugin-help.ts`** — when the
   user types `mcp-vertex.issues`, the help panel renders the
   dependency notice plus the same install snippet.
6. **`plugins/issues/src/lib/tools/*.tool.ts`** — every tool's
   `description` (the field shown in the MCP tools list) starts
   with `"REQUIRES proposals plugin. "` so a host/agent that
   introspects the tool list sees the requirement even before
   invoking it.

### Why "soft coupling" was rejected

A softer fallback (issues works without proposals, just writes
into a different folder) was considered and **rejected** because:

- It splits the "issue lifecycle" across two namespaces with no
  link between them — the whole point of f00042 is that an
  analysed issue lives next to the proposals it produces.
- It breaks the `proposals` plugin's `sync_proposals` invariant
  (every file under `docs/proposals/**` is owned by that plugin's
  scaffold linter).
- It would force the user to remember "two folders that look
  similar but aren't" — a recipe for drift.

## non-goals

- **No LLM client inside the server.** No OpenAI / Anthropic / Ollama
  SDK in `plugins/issues`. The "analyse" tool returns structured
  data; the host does the language reasoning.
- **No automatic proposal creation.** `issues_analyze` only drafts.
  Creating the proposal is a separate `proposals_create_proposal`
  call the host makes after showing the draft.
- **No swarm / multi-agent orchestration.** This plugin does not
  register `auto_work` / `task_queue` / `agent_lock` — it's a
  personal productivity tool, not a coordination primitive. (Same
  shape as `plugins/logs` / `plugins/web-fetch`.)
- **No write-back to GitHub.** We do **not** comment on, close, or
  label issues. The scaffold is for the user's own consumption and
  may be copy-pasted into a manual reply.
- **No webhooks / polling.** `gh api` / REST fetch only on demand.
- **No multi-repo.** Single hardcoded `owner/repo` from
  `mcp-vertex.config.json#plugins.issues.options.repo` (default
  derived from `git remote get-url origin`).

## architecture

### 3.1 Data flow

```
                ┌────────────────────────┐
                │ User opens GitHub      │
                │ issue #123             │
                └──────────┬─────────────┘
                           │ user pastes / picks a number
                           ▼
                ┌────────────────────────┐
                │ Host (Copilot LLM)     │
                │ issues_fetch(123)      │──┐
                │ issues_ingest(123)     │  │ MCP JSON-RPC
                │ issues_analyze(123)    │  │
                │ [promote|dismiss]      │  │
                └──────────┬─────────────┘  │
                           │ draft          │
                           ▼                │
              Host decides via LLM          │
                           │                │
       ┌───────────────────┴───────────────┐│
       │ if promote:                       ││
       │   proposals_create_proposal(...)  ││
       │   issues_resolve(123,             ││
       │     {resolution: 'promoted',      ││
       │      proposalIds: ['f00043']})    ││
       │ else:                             ││
       │   issues_resolve(123,             ││
       │     {resolution: 'dismissed',     ││
       │      dismissReason: 'duplicate'}) ││
       └───────────────────┬───────────────┘│
                           │                │
                           ▼                ▼
                ┌────────────────────────┐
                │ plugins/issues         │
                │ - github-client.ts     │
                │ - issue-scaffold.ts    │
                │ - 4 MCP tools          │
                └──────────┬─────────────┘
                           │ file I/O
                           ▼
                docs/proposals/retired/issues/
                  github#123-the-title-slug.md
```

### 3.2 Hard rules (preserved from AGENTS.md)

- `packages/core` stays agnostic — no `gh`/`octokit` import.
- `plugins/issues` depends on `@mcp-vertex/core` only at the
  package level. At the **plugin level**, it declares
  `dependsOn: ['proposals']` and refuses to register without it.
- `plugins/issues` declares `dependsOn: ['proposals']` at the
  plugin-definition level. The plugin loader MUST refuse to
  register the `issues` plugin if `proposals` is not in the load
  set. **This is D1 from the design chat** and becomes a new
  capability of `IMcpPlugin.dependsOn` (check if the field already
  exists; if not, a small additive S1 patch to `packages/core`).
- All persisted files use `withFileMutex` + `writeFileAtomic`
  (durability primitive from core).
- All user text (issue body, comments) runs through `redactSecrets`
  before being written to disk — same contract as `plugins/memory`.
- Every tool declares an `outputSchema`; error envelopes use
  `toolError` from the core.
- Every tool's `description` starts with
  `"REQUIRES proposals plugin. "` so the requirement is visible in
  the host's tool list and in the VS Code plugin-help embed.
- The plugin is **not** listed in the `swarm` preset. Users opt in
  by editing `mcp-vertex.config.json` and adding
  `proposals,issues` to `--plugins`.

### 3.3 New `IMcpPlugin` capability (if needed)

Read `packages/core/src/lib/plugins/plugin-contract.ts` first. If
`dependsOn` already exists in the contract, this proposal only
*uses* it. If it doesn't exist, S1 adds it as an additive optional
field, plus a loader-level check that emits a clear error like
`plugin "issues" requires "proposals" (not in load set)` and exits
the boot instead of silently registering a broken tool.

The check is one-pass and ordered: for every loaded plugin whose
`dependsOn` names a plugin id that is **not** in the load set,
emit a structured error entry `{ plugin, missing: string[] }`,
collect them, and if any are present, refuse to register the whole
batch with a single combined error message. This means the user
sees **all** missing dependencies in one go (not one per retry).

### 3.4 GitHub client strategy (deterministic precedence)

For each tool call that needs GitHub data:

1. **Try `gh`** (`Bun.spawnSync(['gh', 'api', ...])`). Honors the
   user's `gh auth login` and 5000/h rate limit. Preferred path.
2. **Else try `GITHUB_TOKEN` env** via plain HTTPS fetch to
   `api.github.com`. 5000/h rate limit.
3. **Else anonymous HTTPS fetch**. 60/h rate limit; tool warns the
   caller when this fallback is used.

Each call captures which tier was used in the response so the user
knows why a fetch was slow or rate-limited.

## slices

Each slice ends green (`bun run validate`), ships a Conventional
Commit, and updates this proposal's `shipped-in` list in
`index.json`.

### S1 — Plugin skeleton + `dependsOn` contract _(excl. `apps/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `plugins/issues/package.json`
  - `plugins/issues/tsconfig.json`
  - `plugins/issues/vitest.config.ts`
  - `plugins/issues/README.md`
  - `plugins/issues/src/index.ts`
  - `plugins/issues/src/public/index.ts`
  - `plugins/issues/src/lib/contracts/issue.types.ts`
  - `plugins/issues/src/lib/contracts/index.ts`
  - `plugins/issues/tests/index.spec.ts` (dependsOn enforced)
- Plugin name: `@mcp-vertex/issues`. `peerDependencies` includes
  `@mcp-vertex/core`. No `dependencies` beyond `zod` and
  `@modelcontextprotocol/sdk` (same as every other plugin).
- `src/index.ts` exports `definePlugin({ name: 'issues',
  dependsOn: ['proposals'], optionsSchema: …, register(ctx) { … } })`.
- `src/public/index.ts` re-exports the public surface: types only.
  No `dependsOn` contract surfaced (it's a loader concern).
- `tests/index.spec.ts` boots a fake loader with
  `{ proposals: false, issues: true }` and asserts the load fails
  with the expected error. Same test with `{ proposals: true,
  issues: true }` asserts the plugin loads and registers the 4 tool
  ids (smoke test, even before the implementations exist).
- If `dependsOn` is not yet in the core contract: add an additive
  `dependsOn?: readonly string[]` field to `IMcpPlugin` plus a
  loader-side enforcement loop. Tests on the core side.
- **Gate**: `bun run test plugins/issues packages/core` exit 0.

### S2 — GitHub client + scaffold builder _(excl. `apps/`)_

- **Status**: ready
- **Files**:
  - `plugins/issues/src/lib/github-client.ts`
  - `plugins/issues/src/lib/github-client.spec.ts`
  - `plugins/issues/src/lib/issue-scaffold.ts`
  - `plugins/issues/src/lib/issue-scaffold.spec.ts`
  - `plugins/issues/src/lib/frontmatter.ts`
  - `plugins/issues/src/lib/frontmatter.spec.ts`
- `github-client.ts`:
  - `fetchIssue(number): Promise<IGithubIssueDetail>` —
    label-aware (uses `labels.name`, `state`, `user.login`,
    `comments_url` to fan-out).
  - `listIssues(opts): Promise<readonly IGithubIssueSummary[]>`.
  - Internal helper `tryGh()` / `tryRestAuthed()` /
    `tryRestAnon()` — returns `{ data, tier }` so the tool can
    surface "tier: gh" vs "tier: rest-authed" vs
    "tier: rest-anon (60/h rate limit, please `gh auth login`)".
  - All fetch calls go through `Bun.fetch` (no octokit
    dependency).
- `issue-scaffold.ts`:
  - `buildScaffold(issueDetail): IIssueScaffold` — returns the
    typed object: `{ frontmatter, body }`.
  - `serializeScaffold(scaffold): string` — emits the canonical
    markdown with frontmatter.
  - `parseScaffold(file): IIssueScaffold` — parses an existing
    file for `issues_resolve` updates.
  - File name builder: `slugify(title)` + collision guard
    (`github#123-<slug>.md`; if exists, append `-<hash4>` from
    `SHA-256(number)[:4]`).
- `frontmatter.ts`:
  - Pure YAML serializer/deserializer for the well-known keys
    (`source`, `source_id`, `source_url`, `source_author`,
    `ingested_at`, `status`, `resolution`, `proposals`,
    `dismiss_reason`, `comments`). Uses the same conventions as
    `plugins/proposals/src/lib/proposals/frontmatter-parser.ts` —
    if there's an exported helper, reuse it; if not, write a tiny
    one with comments handled by YAML's `#`-prefix.
- **Gate**: `bun run test plugins/issues` exit 0; coverage on
  the 3 modules ≥ 85%.

### S3 — The 4 MCP tools _(excl. `apps/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `plugins/issues/src/lib/tools/list-issues.tool.ts`
  - `plugins/issues/src/lib/tools/list-issues.tool.spec.ts`
  - `plugins/issues/src/lib/tools/fetch-issue.tool.ts`
  - `plugins/issues/src/lib/tools/fetch-issue.tool.spec.ts`
  - `plugins/issues/src/lib/tools/ingest-issue.tool.ts`
  - `plugins/issues/src/lib/tools/ingest-issue.tool.spec.ts`
  - `plugins/issues/src/lib/tools/analyze-issue.tool.ts`
  - `plugins/issues/src/lib/tools/analyze-issue.tool.spec.ts`
  - `plugins/issues/src/lib/tools/resolve-issue.tool.ts`
  - `plugins/issues/src/lib/tools/resolve-issue.tool.spec.ts`
  - `plugins/issues/src/lib/tools/index.ts`
- All namespaced under `issues_*` (e.g. `issues_fetch`). Each
  declares an `outputSchema`.
- The 5 tools (one more than the design chat, because `list` is
  cheap and useful for "show me everything labelled bug"):
  - `issues_list` — input `{ state?: 'open'|'closed'|'all', labels?: string[], limit?: number }`. Output `{ issues: IGithubIssueSummary[], tier: 'gh'|'rest-authed'|'rest-anon' }`.
  - `issues_fetch` — input `{ number }`. Output `{ issue: IGithubIssueDetail, comments: readonly IGithubComment[] }`.
  - `issues_ingest` — input `{ number, force?: boolean }`. Writes `docs/proposals/retired/issues/github#<n>-<slug>.md` with `status: ingested, resolution: pending, proposals: []`. Idempotent: if file exists and `force: false`, returns the existing path without rewriting. Output `{ filePath, scaffold: IIssueScaffoldRef, alreadyExisted: boolean }`.
  - `issues_analyze` — input `{ number }`. Loads the scaffold (or auto-ingests if absent), runs the mechanical pre-analysis (labels → `kind` hint, body-length → `confidence` ceiling, presence of `repro steps` → `kind: fix`, presence of `would be nice if` → `kind: feat`, multi-domain body → suggestion to split). Output `{ draft: { kind: 'fix'|'feat'|'refactor'|'chore'|'spike'|'dismiss', confidence: number, rationale: string, bodyMarkdown: string, suggestedSlices?: readonly { title: string, files: readonly string[] }[] }, sourceFile: string }`. **Does not** create a proposal.
  - `issues_resolve` — input `{ number, resolution: 'promoted'|'promoted-multiple'|'dismissed', proposalIds?: readonly string[], dismissReason?: string }`. Mutates the scaffold's frontmatter with `withFileMutex` + `writeFileAtomic`. If `resolution: dismissed`, requires `dismissReason`. Output `{ filePath, scaffold: IIssueScaffoldRef }`.
- The plugin's `register(ctx)` reads `ctx.options.repo`
  (`'owner/name'`), `ctx.options.scaffoldDir`
  (`'docs/proposals/retired/issues'` default) and wires the 5
  tools via `buildIssuesToolRegistrations({ namespacePrefix,
  repo, scaffoldDirAbs, repoRoot, githubClient })`.
- Tests inject a fake `IGithubClient` and a tmp dir; no real
  network calls.
- **Gate**: `bun run test plugins/issues` exit 0.

### S4 — Docs + config wiring _(incl. `docs/`, excl. `apps/`)_

- **Status**: ready
- **Files**:
  - `plugins/issues/README.md` (full)
  - `docs/proposals/retired/issues/README.md` (the canonical
    shape + lifecycle)
  - `mcp-vertex.config.json` — add `"issues": { "options":
    { "repo": "<owner>/<name>" } }` to `plugins` so the user can
    see how to enable it (NOT loaded by default).
  - `apps/web/src/i18n/ui.ts` — translation keys
    `plugin.issues.description`, `plugin.issues.requires`,
    `plugin.issues.installSnippet` + 12 language entries (ar, de,
    en, es, fr, hi, it, ja, pt, th, vi, zh) so the docs site picks
    up the new plugin. (Gate is `bun run check:i18n:plugins`.)
  - `apps/web/src/pages/plugins.astro` — the `issues` card renders
    a `requires: proposals` chip and links to the `proposals`
    plugin page.
  - `docs/PLUGINS-MCP-VERTEX.md` — add `issues` under a new
    "Personal / host-only plugins" section with the dependency
    callout (sibling of `logs`, `web-fetch`).
  - `extensions/vscode/src/embeds/plugin-help.ts` — when the user
    types `mcp-vertex.issues`, the help panel shows the dependency
    notice + install snippet before the user enables it.
- Plugin README documents:
  - The opt-in rationale.
  - The **hard dependency on `proposals`** (top-of-file, with the
    install command and the `mcp-vertex.config.json` snippet).
  - The 5 tools with input/output examples; every tool's
    description begins with `"REQUIRES proposals plugin. "`.
  - A complete walkthrough: "user opens issue #123 → `issues_fetch`
    → `issues_ingest` → host (Copilot) drafts a kind+title+body →
    `proposals_create_proposal(...)` → `issues_resolve(promoted,
    ['f00043'])` → reply on GitHub by quoting the scaffold's
    `resolution` + `proposals` frontmatter."
  - **No automatic proposal creation** — explicitly called out.
  - **Not in the `swarm` preset** — explicitly called out, with a
    pointer to the `full`/`personal` preset (defined in f00043).
- **Gate**: `bun run site:strict`, `bun run check:i18n:plugins`,
  `bun run lint:proposals`, `bun run lint:tools` all exit 0.

## acceptance

(Mirrors the `acceptance:` block in the frontmatter. The linter
requires a `## acceptance` body section as the canonical mirror of
the frontmatter block.)

- `bun run type` exit 0.
- `bun run test` exit 0.
- `bun run lint` exit 0.
- `bun run site:strict` exit 0.
- `bun run lint:proposals` exit 0 (no warnings on f00042).
- `bun run lint:tools` exit 0.
- `bun run check:i18n:plugins` exit 0.
- Plugin loads cleanly via `mcp-vertex --plugins=proposals,issues`.
- Plugin loader refuses `issues` without `proposals` with a clear
  error.
- All 5 tools return typed JSON (no catchalls); their
  `outputSchema` matches the actual payload.
- An end-to-end manual smoke: issue #1 of the user's repo
  ingested → analyzed → proposed → resolved → reply drafted by
  quoting the scaffold's frontmatter.
- No new secrets, no LLM client, no swarm tools, no write-back to
  GitHub.
- README in `plugins/issues` and `docs/proposals/retired/issues`
  are coherent and self-contained.
- **Dependency on `proposals` is visible at every user-facing
  surface**:
  - `mcp-vertex --plugins=issues` (without `proposals`) exits
    non-zero with the combined missing-dependency error.
  - `apps/web` `plugins.astro` and `presets.astro` (f00043) show
    `requires: proposals` for the `issues` card.
  - `extensions/vscode` plugin-help embed shows the same warning
    before the user enables `issues`.
  - Every `issues_*` tool description starts with
    `"REQUIRES proposals plugin. "`.
  - `docs/PLUGINS-MCP-VERTEX.md` lists `issues` under a
    "Personal / host-only" section with the dependency callout.
- `plugins/issues` does **not** appear in the `swarm` preset; it
  appears in the `full`/`personal` preset only (defined in
  f00043).
