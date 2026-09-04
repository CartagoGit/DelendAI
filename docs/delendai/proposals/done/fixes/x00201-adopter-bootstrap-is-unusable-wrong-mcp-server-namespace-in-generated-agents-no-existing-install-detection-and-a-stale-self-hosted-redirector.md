---
id: x00201
kind: fix
title: "Adopter bootstrap is unusable: wrong MCP server namespace in generated agents, no existing-install detection, and a stale self-hosted redirector"
status: done
type: proposal
track: scaffold+init+adopter-experience+self-hosting+postman-exporter
date: 2026-08-01
shipped-in:
    - 819b95ab # S1+S2 — real MCP server name resolution + existing-install auto-detect
    - e08d363a # S3 — redirector contract hardening + dogfood re-sync (Copilot/Claude/Codex)
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
- **Status**: done
- **Implementation**: added `mcpServerName?: string` to
  `IScaffoldHostOptions`, defaulting to `mcp-project-${namespacePrefix}`
  (byte-identical output for every existing greenfield caller/test —
  verified by a dedicated regression test). Replaced the hardcoded
  `mcp-project-${prefix}` literal in `scaffoldAgentFile` (the Copilot
  `tools:` grant and the "the agent contract lives in" prose) and
  `scaffoldInstructionsFile` with `resolveMcpServerName(options)`.
  `scaffoldClaudeAgentFile` / `scaffoldCodexAgentFile` never referenced a
  server name to begin with (Claude Code / Codex CLI call tools by bare
  name, no `<server>/<tool>` qualification) — confirmed by grep, no
  changes needed there. Wired `mcpServerName` through
  `SCAFFOLD_INPUT_SCHEMA` (`scaffold-tool.ts`).
- **`packages/cli/src/lib/init/init-render.service.ts` needed no change**:
  its agent-tool list (`init-catalog.constant.ts`) already prefixes tools
  as `${namespacePrefix}_<tool>` with no server-name literal at all —
  verified this bug does not exist on the `mcpv init` code path (a
  separate implementation from `scaffold-host.ts`; see this proposal's
  Notes for the "two parallel scaffolders" finding this surfaced).
- **Files**: `packages/core/src/lib/scaffold/scaffold-host.ts`,
  `packages/core/src/lib/scaffold/scaffold-tool.ts`,
  `packages/core/tests/src/lib/scaffold/scaffold-host.spec.ts` (2 new
  tests).
- **Gate**: type+test.
- **Acceptance**: `scaffoldAgentFile({ ...HOST, mcpServerName: 'mcp-vertex' }, 'orchestrator')`
  emits `mcp-vertex/*` and `mcp-vertex/acme_overview`, never
  `mcp-project-acme`; omitting the option reproduces the exact
  `mcp-project-acme/*` output every existing test already pinned.

### S2 — Auto-detect an existing install instead of requiring a caller to know the flags
- **Status**: done
- **Implementation**: new `packages/core/src/lib/scaffold/detect-existing-install.ts`
  — `findMcpVertexServerName` (pure: parses a `.vscode/mcp.json`
  `{servers:{...}}` or `.mcp.json` `{mcpServers:{...}}` shape, matches a
  server whose command/args contain `@mcp-vertex/cli`, `mcpv`,
  `host-server.script.ts`, or `host-server.ts`) and
  `detectExistingMcpVertexInstall` (async: checks `mcp-vertex.config.json`
  presence + reads both editor config candidates). `resolveHostScaffoldDefaults`
  wires the two together with the "explicit caller value always wins"
  rule and is the single call `buildScaffoldReport` makes — kept the
  resolution out of `scaffold-tool.ts` entirely (SRP; also kept that file
  under the 400 LOC solid-compliance ceiling instead of just absorbing a
  bigger overage into the baseline).
- **Files**: `packages/core/src/lib/scaffold/detect-existing-install.ts`
  (new), `packages/core/src/lib/scaffold/scaffold-tool.ts` (wiring),
  `packages/core/src/public/index.ts` (exports),
  `packages/core/tests/src/lib/scaffold/detect-existing-install.spec.ts`
  (new — 12 cases, including a fixture that reproduces postman-exporter's
  real `.vscode/mcp.json` shape verbatim: an `mcp-vertex` server alongside
  an unrelated `filesystem` server).
- **Gate**: type+test.
- **Acceptance**: `detectExistingMcpVertexInstall` against the
  postman-exporter-shaped fixture returns
  `{ existingMcpVertex: true, mcpServerName: 'mcp-vertex' }`; against an
  empty workspace returns `{ existingMcpVertex: false }`; an explicit
  `args.existingMcpVertex` / `args.mcpServerName` on `buildScaffoldReport`
  is never overridden by detection.

### S3 — Harden the redirector contract so a missing file fails, not just a malformed one
- **Status**: done
- **Implementation**: `agent-redirector-contract.script.ts` gained two new
  finding kinds — `missing-redirector` (new
  `checkCanonicalRedirectorPresent`, called once against the
  `.github/agents/` listing: fails when `mcp-vertex.agent.md` specifically
  is absent) and `subagent-user-invocable-not-false` (extended
  `checkGithubAgentFile`'s existing `isBoundedSubagent` branch to also
  require `user-invocable: false`). A new `isFatalFinding(kind)` splits
  findings into `fatal` (these two kinds — `process.exit(1)`) vs
  `advisory` (every pre-existing kind, unchanged "warn but never block"
  behaviour) so this hardening does not retroactively tighten unrelated,
  unaudited findings elsewhere. `checkClaudeAgentFile` was deliberately
  left untouched (no bounded-subagent exemption added there) — see Notes.
- Re-synced this repo's own dogfood files: all four
  `.github/agents/mcp-vertex-*.agent.md` now say `user-invocable: false`
  and reference `mcp-vertex/*` / `mcp-vertex/mcp-vertex_overview` (was
  `mcp-project-mcp-vertex`, wrong per S1). All five `.claude/agents/mcp-vertex-*.md`
  bodies were rewritten from stale, hardcoded tool names that no longer
  exist (`fs_write`, `proposal_adopt`, bare `auto_work` /
  `compact_status` / `proposal_board`, `quality_run_quality`,
  `proposal_review` — none namespaced, several referencing tools renamed
  or removed by later refactors) to the canonical short redirector body
  (f00031's "Contract change" template): call `mcp-vertex_overview`,
  follow `recommendedNextAction`, never hardcode a tool name that will
  rot. Added the 5 `.codex/agents/mcp-vertex-*.md` files x00200 added
  scaffolding support for but this repo never generated for itself
  (`.codex/config.toml` already existed and already used the `mcp-vertex`
  server key, so no config change was needed — only the agent files were
  missing).
- **Files**: `tools/scripts/lint/agent-redirector-contract.script.ts` (+
  spec, 6 new test cases), `.github/agents/mcp-vertex-*.agent.md` (4
  files), `.claude/agents/mcp-vertex-*.md` (5 files, orchestrator
  included), new `.codex/agents/mcp-vertex-*.md` (5 files).
- **Gate**: type+test (20 total redirector-contract cases, all pass);
  `bun run lint:agents` run live against this repo's post-slice state.
- **Acceptance**: `checkGithubAgentFile` fails
  `subagent-user-invocable-not-false` on a fixture pinned from the
  ACTUAL pre-fix file content (proved the check would have caught the
  real drift); `checkCanonicalRedirectorPresent` fails
  `missing-redirector` when `mcp-vertex.agent.md` is absent from the
  listing (the exact 271c7cf5 scenario) and is silent once present;
  `bun run lint:agents` is clean against the repaired repo state.

### S4 — Empirical end-to-end verification + docs
- **Status**: done
- **Implementation**: built a scratch fixture at
  `<scratchpad>/postman-exporter-fixture/` reproducing postman-exporter's
  REAL `.vscode/mcp.json` (an `mcp-vertex` server launched via
  `host-server.script.ts`, alongside an unrelated `filesystem` server)
  and `mcp-vertex.config.json` verbatim (structural shape only, read from
  the real project — never written into it). Ran `buildScaffoldReport`
  against it with NO explicit `existingMcpVertex` / `mcpServerName`, for
  both `kind: 'agent'` and `kind: 'host'`, plus an explicit-override case
  and a greenfield (empty workspace) control. Updated
  `EXTENSION-AUTHORING.md`'s `existingMcpVertex` section with a new
  paragraph documenting that both fields are now auto-detected defaults
  and explaining what `mcpServerName` is for and why the greenfield
  default is wrong for almost every guest-mode project.
  `AGENT-BOOTSTRAP.md` was not touched — it stays a lean pointer file per
  its own stated purpose, and it never described these scaffolder-level
  flags to begin with; `EXTENSION-AUTHORING.md` is the correct, existing
  home for this detail.
- **Files**: `docs/mcp-vertex/EXTENSION-AUTHORING.md`, verification
  transcript below.
- **Gate**: `bun run validate` green (see this proposal's Verification
  log); the scratch fixture and verify script were deleted after
  capturing the transcript (one-shot, not checked in).
- **Verification log** (dry-run, `kind: 'agent'`, no explicit flags,
  against the postman-exporter-shaped fixture):

  ```
  references real server key "mcp-vertex/*": true
  does NOT reference the wrong greenfield key "mcp-project-postman-exporter": true
  ```

  (`kind: 'host'`, no explicit flags, same fixture):

  ```
  skipped libs/mcp-project/src/server.ts (guest mode auto-detected): true
  skipped .vscode/mcp.json overwrite (guest mode auto-detected): true
  copilot-instructions.md references the real server: true
  ```

  (explicit override + greenfield control):

  ```
  explicit mcpServerName honoured over detection: true
  greenfield still defaults to mcp-project-<prefix>: true
  ```

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

## Notes

- **`checkClaudeAgentFile` was not extended with a bounded-subagent
  exemption.** `checkGithubAgentFile` accepts two shapes (pure redirector,
  or a bounded subagent with the Copilot-adapter disclaimer); its Claude
  counterpart only ever accepted the pure-redirector shape, and an
  existing pinned test (`agent-redirector-contract.script.spec.ts`
  — "warns when name starts with mcp-vertex but body is not the
  redirector shape") explicitly expects `mcp-vertex-orchestrator` to stay
  in that stricter shape. Rather than risk that pinned behaviour by adding
  a second exemption path under time pressure, S3 rewrote all five
  `.claude/agents/mcp-vertex-*.md` bodies (orchestrator included) to fit
  the existing pure-redirector shape (≤12 prose lines, no numbered
  workflow) — which also fully closes the actual bug (stale hardcoded
  tool names) without touching the lint's Claude-side logic at all. A
  richer Claude "Compact lane" format, if wanted later, is a separate,
  reviewable follow-up.
- **Two parallel scaffolders exist, only one had the namespace bug.**
  S1's investigation found that `mcpv init` (`packages/cli/src/lib/init/`)
  and `create_project` / `<prefix>_scaffold`
  (`packages/core/src/lib/scaffold/scaffold-host.ts`) are two independent
  implementations that both generate agent files — `mcpv init` reads a
  live catalog (or a locale-keyed fallback) and prefixes bare tool names
  with `${namespacePrefix}_`, never referencing a server key at all;
  `scaffold-host.ts` grants a `<server>/*` wildcard in the Copilot
  `tools:` field, which is what needed to know the real server name. Only
  the second had this proposal's bug. Unifying the two into one
  implementation would remove this exact category of "which code path has
  which bug" risk going forward, but is a bigger, separate refactor — not
  undertaken here to keep this proposal's diff reviewable, filed as a
  candidate follow-up.
