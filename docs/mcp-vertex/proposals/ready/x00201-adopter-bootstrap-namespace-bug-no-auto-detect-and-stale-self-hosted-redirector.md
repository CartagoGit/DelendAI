---
id: x00201
kind: fix
title: "Adopter bootstrap is unusable: wrong MCP server namespace in generated agents, no existing-install detection, and a stale self-hosted redirector"
status: ready
type: proposal
track: scaffold+init+adopter-experience+self-hosting+postman-exporter
date: 2026-08-01
related:
    - x00200 # closed 3 postman-exporter gaps; left the namespace bug + auto-detect as explicit non-goals
    - f00031 # single-orchestrator redirector contract this proposal hardens
    - x00166 # vertex preset drift fix that made init:default bring the orchestrator by default
---

# x00201 — Adopter bootstrap is unusable: wrong MCP server namespace in generated agents, no existing-install detection, and a stale self-hosted redirector

## Goal

Close the three gaps x00200 explicitly deferred as non-goals — no automatic
detection of an existing mcp-vertex install, no reconciliation between a
project's real MCP server name and the tool namespace baked into generated
agent files, and no per-plugin agent generation — starting with the first
two (the third stays out of scope, see Non-goals), and harden the f00031
single-orchestrator redirector contract so it fails loudly instead of
silently when it regresses (it just did, on this very branch, undetected by
any gate). Together these make "an LLM adopts mcp-vertex in an arbitrary
project — greenfield, an existing guest install, or a stale/broken one —
and it just works" actually true, instead of requiring a human who already
knows the internals to hand-hold the adopting agent through flags it has no
way to know it needs.

## Why

User-reported 2026-08-01, grounded in postman-exporter as the empirical
adopter testbed mcp-vertex keeps in this workspace specifically to verify
its own onboarding claims:

1. **Namespace bug.** Every generated Copilot/Claude/Codex agent file
   (`scaffoldAgentFile` / `scaffoldClaudeAgentFile` / `scaffoldCodexAgentFile`
   in `packages/core/src/lib/scaffold/scaffold-host.ts`) hardcodes the MCP
   tool namespace as `mcp-project-${namespacePrefix}`. That is correct only
   for the greenfield path, where the scaffolder also creates the
   `libs/mcp-project/` server registered under exactly that name. In guest
   mode (`existingMcpVertex: true`, x00200 S2 — the mode a project like
   postman-exporter uses because it already wires mcp-vertex via its own
   `mcp-vertex.config.json` + `plugins/`), the scaffolder skips creating that
   server and instead should reference whatever the project ALREADY
   registered — which is routinely just `mcp-vertex` (see this very repo's
   own `.mcp.json`: `{"mcpServers": {"mcp-vertex": {...}}}`), not
   `mcp-project-<prefix>`. Every generated agent's first tool call
   (`mcp-project-<prefix>/<prefix>_overview`) therefore addresses a server
   that does not exist. x00200 filed this explicitly as a non-goal
   ("No namespace ↔ host-server-name reconciliation... tool names in agent
   bodies are wrong"); this proposal closes it.
2. **No auto-detection.** `existingMcpVertex` must be known and passed by
   the caller. Nothing in `<prefix>_scaffold` / `mcpv init` /
   `create_project` inspects the target workspace to notice it already has
   a working (or partially working, or stale) mcp-vertex wiring. An
   adopting LLM that doesn't already know this flag exists — which is the
   normal case, since nothing tells it to look — gets the greenfield
   `libs/mcp-project/` bootstrap by default, which x00200 documented as
   overwriting a working `.vscode/mcp.json`. This is precisely the
   "peleándome para configurar cada proyecto" friction: the tool knows how
   to do the right thing but only if a human already knows to ask for it.
3. **The redirector contract regressed, undetected.** f00031 (done,
   2026-06-21) made `.github/agents/mcp-vertex.agent.md` the single
   canonical "redirector" so the Copilot agent picker shows exactly one
   `mcp-vertex` entry and nothing else duplicates the orchestrator. Commit
   271c7cf5 (x00200, unpushed until this branch's stabilization pass)
   deleted that file as an apparent side effect of unrelated scaffold work.
   `bun run validate` never caught it: `agent-redirector-contract.script.ts`
   only inspects files that exist on disk — it has no way to fail on an
   absence. A contract that silently stops being enforced the moment its
   one enforcing file disappears is not a contract an adopter (or this repo
   itself) can rely on.

## Non-goals

- **No per-plugin bounded agents** (e.g. a `postman_exporter_builder`
  agent). Same reasoning x00200 already gave: generating plugin-specific
  agents means inspecting `mcp-vertex.config.json → plugins` and emitting
  one orchestrator per plugin — a larger semantic move, left for a future
  proposal if postman-exporter (or another adopter) keeps hitting it.
- **Not reopening `.claude/agents/mcp-vertex-orchestrator.md` vs `.cc.md`**
  (f00031 S2). Verified empirically in this session: Claude Code's own
  subagent discovery lists `mcp-vertex-orchestrator` as an invocable
  subagent right now, with the file at the plain `.md` path — proof the
  current naming is load-bearing for Claude Code's native delegation.
  Renaming it to `.cc.md` to remove one duplicate row from VS Code
  Copilot's separate agent picker would trade a working cross-host feature
  for a cosmetic de-duplication on a different host. Left as-is.
- **Not fixing the `agentWorktree: false` vs 19 existing local `agent/*`
  branches drift** in `mcp-vertex.config.json` / `agent-branch-naming`
  lint. Real, pre-existing, orthogonal to adopter bootstrap — a candidate
  follow-up, not part of this proposal's scope.
- **No new top-level CLI command.** "One call adopts or repairs" is
  delivered by making the EXISTING entry points
  (`<prefix>_scaffold` / `mcpv init` / `create_project`) auto-detect
  correctly by default, not by inventing a fourth entry point to choose
  between.

## Slices

### S1 — Fix the namespace ↔ host-server-name bug
- **Status**: ready
- Add `mcpServerName?: string` to `IScaffoldHostOptions`, defaulting to
  today's `mcp-project-${namespacePrefix}` (byte-identical output for every
  existing greenfield caller/test). Replace every hardcoded
  `mcp-project-${prefix}` literal in `scaffoldAgentFile`,
  `scaffoldClaudeAgentFile`, `scaffoldCodexAgentFile`, and
  `scaffoldInstructionsFile` with `options.mcpServerName ?? \`mcp-project-${prefix}\``.
  Wire the field through `SCAFFOLD_INPUT_SCHEMA` (`scaffold-tool.ts`) and
  the CLI init render path (`init-render.service.ts`) so both surfaces can
  receive an explicit server name.
- **Files**: `packages/core/src/lib/scaffold/scaffold-host.ts`,
  `packages/core/src/lib/scaffold/scaffold-tool.ts`,
  `packages/cli/src/lib/init/init-render.service.ts`, plus their specs.
- **Gate**: type+test.
- **Acceptance**: a scaffold call with `mcpServerName: 'mcp-vertex'` emits
  agent files whose tool references read `mcp-vertex/mcp-vertex_overview`,
  not `mcp-project-mcp-vertex/mcp-vertex_overview`; omitting the option
  reproduces today's greenfield output exactly (regression-pinned by
  existing scaffold-host.spec.ts assertions).

### S2 — Auto-detect an existing install instead of requiring a caller to know the flags
- **Status**: ready
- New pure detector (`detectExistingMcpVertexInstall` or similar) that,
  given a workspace root, inspects `mcp-vertex.config.json` presence and
  `.vscode/mcp.json` / `.mcp.json` server entries for a launch shape
  matching mcp-vertex (`mcpv __serve`, `@mcp-vertex/cli`, or a repo-local
  `host-server.script.ts` / `host-server.ts` argument), and returns
  `{ existingMcpVertex: boolean; mcpServerName?: string }`. Wire it as the
  default resolution in `<prefix>_scaffold` and `mcpv init` /
  `init:default`: an explicit `existingMcpVertex` / `mcpServerName` from
  the caller always wins (never silently override an explicit choice);
  absent input falls back to detection instead of the hardcoded
  greenfield default.
- **Files**: new detector module under
  `packages/core/src/lib/scaffold/` (or `install/`, matching existing
  boot-time-sync exemption paths), wiring in `scaffold-tool.ts` and the
  `mcpv init` command, plus specs — including one fixture shaped like
  postman-exporter's actual layout (`mcp-vertex.config.json` + `plugins/`
  + a `.vscode/mcp.json` naming the server `mcp-vertex`).
- **Gate**: type+test.
- **Acceptance**: running the scaffold/init path against a postman-exporter
  -shaped fixture with no explicit flags auto-detects
  `existingMcpVertex: true` and `mcpServerName: 'mcp-vertex'`; running it
  against an empty directory still defaults to greenfield, unchanged.

### S3 — Harden the redirector contract so a missing file fails, not just a malformed one
- **Status**: ready
- Extend `agent-redirector-contract.script.ts` (and its spec) so that,
  when a project declares a canonical redirector name (this repo:
  `mcp-vertex`), the check FAILS (not warns) if
  `.github/agents/<name>.agent.md` is absent — closing the exact blind
  spot that let 271c7cf5 delete it unnoticed. Also assert every bounded
  subagent (`name:` in `SUBAGENT_SLOTS`) has `user-invocable: false` in
  its frontmatter, matching what `scaffoldAgentFile` already emits for new
  adopters (`scaffold-host.ts` line ~276) but this repo's own
  hand-authored `.github/agents/mcp-vertex-*.agent.md` files never picked
  up (all four currently say `user-invocable: true`).
- Re-sync this repo's own `.github/agents/*.agent.md` to the corrected
  `user-invocable: false` shape, and add the `.codex/agents/*.md` files
  x00200 added scaffolding support for but this repo — being unpushed —
  never generated for itself, using S1's `mcpServerName: 'mcp-vertex'` so
  the dogfooded files are namespace-correct too.
- **Files**: `tools/scripts/lint/agent-redirector-contract.script.ts` (+
  spec), `.github/agents/mcp-vertex-*.agent.md` (4 files), new
  `.codex/agents/*.md` (5 files).
- **Gate**: type+test; the redirector-contract script run live against
  this repo's post-slice `.github/agents/` and `.claude/agents/`.
- **Acceptance**: deleting `.github/agents/mcp-vertex.agent.md` locally
  and re-running the lint fails loudly with a specific "missing redirector"
  message; all four bounded subagents read `user-invocable: false`;
  `.codex/agents/` has all 5 files.

### S4 — Empirical end-to-end verification + docs
- **Status**: ready
- Verify S1–S3 against a scratch copy shaped like postman-exporter's real
  topology (never writing into the actual `postman-exporter` checkout,
  per the working agreement that repo stays read-only/reference-only for
  this proposal) — run the scaffold/init path with no explicit flags and
  confirm the generated agent files resolve tool calls against the
  project's real server name on the first try. Update
  `AGENT-BOOTSTRAP.md` / `EXTENSION-AUTHORING.md` to state that
  `existingMcpVertex` / `mcpServerName` are now auto-detected defaults, not
  required manual input, and to drop guidance that implied a caller must
  already know them.
- **Files**: `docs/mcp-vertex/AGENT-BOOTSTRAP.md`,
  `docs/mcp-vertex/EXTENSION-AUTHORING.md`, verification transcript
  captured in this proposal's closing notes.
- **Gate**: `bun run validate` green; verification log attached to this
  proposal before it moves to `done/`.

## Acceptance

- Guest-mode scaffolding emits agent files whose tool references resolve
  against the project's REAL registered MCP server name — verified against
  a postman-exporter-shaped fixture, not just asserted in a unit test.
- Adopting mcp-vertex into a project with any prior mcp-vertex wiring
  (correct, partial, or stale) no longer requires the caller to already
  know to pass `existingMcpVertex: true` / the right server name —
  auto-detected by default; an explicit override still wins.
- `agent-redirector-contract` fails when a project's canonical redirector
  file is missing, and fails when a bounded subagent lacks
  `user-invocable: false`.
- mcp-vertex's own `.github/agents/`, `.claude/agents/`, `.codex/agents/`
  match what its current scaffolder would generate for itself (dogfood
  parity), including the Codex format x00200 added.
- `bun run validate` is green; every slice's empirical claim is backed by
  a real command transcript, not an assertion alone.

## Risks

- `scaffold-host.ts` backs the most-adopted entry points in the project
  (`mcpv init`, `init:default`, `create_project`); mitigated by keeping
  every new default byte-identical to today's greenfield output and only
  changing behaviour once auto-detection positively finds a prior install.
- Making the redirector-contract check fail (not warn) on a missing file
  is a stricter gate than before; mitigated by scoping the new failure
  mode to only fire for a project that has declared a canonical redirector
  name in the first place — a project that never adopted the pattern sees
  no new failures.
