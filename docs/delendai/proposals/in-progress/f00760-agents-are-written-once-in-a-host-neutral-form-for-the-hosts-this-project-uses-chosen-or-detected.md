---
id: f00760
title: "agents are written once in a host-neutral form, for the hosts this project uses, chosen or detected"
kind: feat
status: in-progress
type: proposal
track: general
date: 2026-10-13
last-transition-id: 504a266c-4cb4-4439-ae76-a11eafc68da6
last-correlation-id: 504a266c-4cb4-4439-ae76-a11eafc68da6
last-transition-from: review
last-transition-at: 2026-10-14T15:46:56.990Z
shipped-in:
  - "ba4e95c31"
---

# f00760 — agents are written once in a host-neutral form, for the hosts this project uses, chosen or detected

## goal

delendai's agents are declared once, in a form no host owns, and rendered for exactly the hosts this project uses: the ones its configuration names, or, when it names none, the ones detected in it. Init writes no structure for a host nobody uses. A new host (Cursor, Windsurf, OpenCode, Gemini CLI, Continue, a terminal agent, or one that does not exist yet) is one registry entry that every writer picks up.

## why

Extracted from f00542 S6 (which stays paused), and shaped by the owner on 2026-10-13: "init should detect which host we are using, or add the structure for one, or let us configure which ones we want, so the project is not filled with every case — Cursor, Windsurf, OpenCode, terminal, whatever — not only Codex, Claude and Copilot; the agents themselves should be agnostic for any project."

What the code does today:

1. **Agents are written for three hosts, always.** `packages/cli/src/commands/init/init.command.ts` manages `.github/agents`, `.claude/agents` and `.codex/agents` in every project, used or not. A project that only uses Cursor gets three folders it never reads, and no agents in the form Cursor reads.
2. **Five lists of hosts, disagreeing.** `install/ide-targets.ts` (MCP configuration for VS Code, Cursor, Windsurf, Claude Code, Claude Desktop, Antigravity and Zed, with detection and `--target`), `bootstrap/agent-config-rules.ts` (instruction files), `surface/host-mode-profiles.constant.ts`, the init catalog, and `scaffold/plugin-agents.service.ts`. A plugin's agent role (`agentRoles`) is written for Copilot and Claude only, never for Codex. The grant reconciler knows only `.github/agents`.
3. **No way to choose.** The configuration has no setting naming the hosts a project uses. The MCP install detects them, but the agent writers do not ask the detection.
4. **Agents are host-shaped at the source.** Each writer renders its own front matter (`tools: [...]`, `user-invocable`) inline, so a host's format is spread through the code that writes it.

## non-goals

- Generating editor extensions, JetBrains plugins or Neovim bindings (f00542 S6 as written).
- Shipping a renderer for a host before its agent format is documented. The registry marks it as instructions-only until then.

## slices

- global_gate: type

### S1 — One host registry, many hosts

- **Status**: done
- **Files**:
  - `packages/core/src/lib/contracts/constants/agent-hosts.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/agent-host.interface.ts`
  - `packages/core/src/cli.ts`
- **Gate**: type
- acceptance:
  - One declaration per host (`AGENT_HOSTS`) gives where its agent files go and in which format, its instructions file, and the evidence that it is in use (paths in the project, variables in the environment).
  - It covers Copilot, Claude Code, Codex CLI, OpenCode, Cursor, Windsurf, Gemini CLI, Continue and the terminal agents that read `AGENTS.md`. A host whose agent format is not known gets instructions only.
- shipped-in: `b90125c462c3`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ba4e95c31, validate exit 0, tests 11/11; acceptance 2/2: (1) One constant, and each entry carries all three things the criterion names: `agents: { dir, suffix, format }` (e.g. claude → `.claude/agents`/`.md`/`claude`; co… (2) All nine are declared, in the criterion's own order: copilot, claude, codex, opencode, cursor, windsurf, gemini, continue, agents-md — the last carrying `evide… — Delivered by b90125c46 ("feat(hosts): init, the scaffold and the grant reconciler write agents through …"), which carries 1 of the 3 declared files; the merge ba4e95c31 (PR #1069) carries all 3. Gate `type`. This slice's whole claim is "one declaration per host", so I counted hosts and checked that each entry actually carries the three things the criterion lists rather than just an id. packages/core/src/lib/contracts/constants/agent-hosts.constant.ts declares all NINE in the criterion's own order — copilot, claude, codex, opencode, cursor, windsurf, gemini, continue, agents-md — the last one being the terminal agents that read `AGENTS.md` (`evidence: { paths: ['AGENTS.md'] }`). Every entry has the agent destination AND format as one object (`claude` → `{ dir: '.claude/agents', suffix: '.md', format: 'claude' }`, `codex` → `.codex/agents`, `opencode` → `.opencode/agent`), the host's instructions file (11 `instructions` occurrences; copilot → `.github/copilot-instructions.md`), and `evidence: { paths, env }` — so "the evidence that it is in use" is data in the same entry rather than a separate detection routine that could drift. codex's entry is the shape that proves both halves are real: `{ paths: ['.codex'], env: ['CODEX_HOME'] }`, a project path and an environment variable. ACC1's fallback for an unknown agent format is structural rather than a special case: those hosts simply have no `agents` key, so they resolve to their instructions entry alone, which is "instructions only" by construction instead of by a branch someone could later remove. The file's own header states the discipline the criterion asks for: 'Adding a host is an entry here; every writer reads it.' Evidence 11/11 is `bunx vitest run --root packages/core tests/src/lib/hosts`.

### S2 — The project chooses its hosts; detection fills in when it does not

- **Status**: done
- **Files**:
  - `packages/core/src/lib/hosts/project-hosts.service.ts`
  - `packages/core/src/lib/hosts/declared-hosts.helper.ts`
  - `packages/core/src/lib/plugins/config-file-schema.ts`
  - `packages/core/src/lib/plugins/load-config-file.ts`
  - `packages/core/schema/delendai.config.schema.json`
  - `packages/cli/src/commands/init/init.command.ts`
  - `packages/cli/src/commands/init/init-default.command.ts`
  - `packages/cli/src/contracts/interfaces/init.interface.ts`
  - `packages/cli/src/lib/init/init-answers.schema.ts`
  - `packages/core/tests/src/lib/hosts/project-hosts.service.spec.ts`
  - `packages/cli/src/commands/init/init-hosts-flag.spec.ts`
- **Gate**: type
- acceptance:
  - `hosts` in `delendai.config.json` (or `DELENDAI_HOSTS` for one run) names the hosts the project uses. Absent, they are the ones its tree and environment show.
  - `init --hosts=<a,b>` writes that choice into the configuration. Without it, init writes agents for the hosts found and for the ones it configures the server for (`.vscode/mcp.json`, `.mcp.json`): Copilot and Claude Code. Codex, OpenCode and the rest only when declared or shown.
  - No agent is written for a host outside the set. Which editors get an MCP entry stays decided by the install targets (`--target`), as before.
- shipped-in: `b90125c462c3`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ba4e95c31, validate exit 0, tests 11/11; acceptance 3/3: (1) All three paths have their own passing test in project-hosts.service.spec.ts: 'takes the declared hosts, the environment over the configuration' (the one-run o… (2) Pinned by 'scaffolds agents only for the hosts named' — the write is scoped to the named set, which is what makes the rest of the criterion true by consequence… (3) The negative is the substance of 'scaffolds agents only for the hosts named' — the test asserts absence, not just presence. The independence of the MCP-entry d… — Delivered by b90125c46 (9 of 11 declared files); the merge ba4e95c31 (PR #1069) carries all 11. Gate `type`. ACC0 names three resolution paths and I looked for a test per path rather than one happy-path test, because a resolver that only honours the config key would pass a single test and still be wrong two thirds of the time. All three exist in project-hosts.service.spec.ts: 'takes the declared hosts, the environment over the configuration' (the one-run override wins over the file), 'reads the hosts a configuration declares, and nothing from a missing or odd one' (an absent or malformed value yields nothing instead of a guess — the failure mode that would silently activate the wrong hosts), and 'finds the hosts the tree and the environment show, and none in an empty project' (detection when nothing is declared, including the empty case so detection cannot manufacture hosts). ACC1: 'scaffolds agents only for the hosts named' is the whole clause — `--hosts=<a,b>` persists the choice, and without it the write covers the detected hosts plus the two the server is configured for. ACC2's first half is the same test read as a negative: it asserts that no agent appears for a host outside the set, which is the clause that would be easiest to satisfy by accident once init also writes agents for MCP targets. The second half is independence — which editors get an MCP entry stays with `--target` — and the adapter specs keep that separate ('always emits the full declared MCP baseline before optional actions', 'does not invent unavailable native integrations'), so widening the agent set does not silently widen the MCP configuration. Evidence 11/11 is `bunx vitest run --root packages/core tests/src/lib/hosts`.

### S3 — Agents are declared once and rendered per host

- **Status**: done
- **Files**:
  - `packages/core/src/lib/hosts/agent-renderers.helper.ts`
  - `packages/core/src/lib/scaffold/plugin-agents.service.ts`
  - `packages/core/src/lib/scaffold/plugin-agents-report.ts`
  - `packages/core/src/lib/scaffold/agent-grant-reconcile.service.ts`
  - `packages/core/src/lib/scaffold/scaffold-host.ts`
  - `packages/core/src/lib/scaffold/scaffold-tool.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/cli/src/lib/init/init-render.service.ts`
  - `packages/core/tests/src/lib/scaffold/plugin-agents.service.spec.ts`
  - `packages/cli/src/lib/init/init-render.service.spec.ts`
- **Gate**: type
- acceptance:
  - delendai's catalog agents and every plugin's `agentRoles` are one host-neutral description (name, description, instructions, entry point, server tool set); each host's renderer turns it into that host's file and front matter (Copilot tool grants and picker visibility, OpenCode `mode`).
  - init, the plugin agent writer and the scaffold write through the registry for the project's hosts; a contributed role reaches every one of them, and the grant reconciler reads the Copilot folder from the registry, the one format that grants by server.
- shipped-in: `b90125c462c3`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ba4e95c31, validate exit 0, tests 11/11; acceptance 2/2: (1) One neutral type, one renderer, host-specific output. agent-renderers.helper.ts:50-59 `renderAgentFor(host, agent: IHostNeutralAgent)` builds the path from the… (2) All three writers consume the one entry point `renderAgentForHosts`, so a contributed role reaches all of them by construction: packages/cli/src/lib/init/init-… — Delivered by b90125c46 (PR #1069's commit) and merged as ba4e95c31, carrying all 10 declared files. Gate `type`. This slice's claim is "one description, many renderers", so I checked that there is genuinely ONE neutral shape and that the per-host differences live in a renderer rather than being re-derived by each writer. agent-renderers.helper.ts:50-59 is the whole mechanism: `renderAgentFor(host, agent: IHostNeutralAgent)` takes the neutral record and produces `{ path: `${host.agents.dir}/${agent.name}${host.agents.suffix}`, content: `${HEADERS[host.agents.format](agent)}\n\n${agent.instructions.trim()}\n` }` — path from the host's own declaration, body from a per-format header plus the shared instructions. The two examples the criterion names are literally in HEADERS: copilot emits `tools: [read, search, edit, execute, todo, ${agent.entryPoint ? 'agent, ' : ''}${agent.serverToolSet}/*]`, which is the server-tool-set grant AND the picker visibility (an entry point gets `agent,`, a delegated role does not), and opencode emits `mode: ${agent.entryPoint ? 'primary' : 'subagent'}` — the same `entryPoint` field driving two different hosts' semantics, which is what "written once in a host-neutral form" has to mean in practice. Pinned by 'renders one agent per host that reads agent files, in its format'. ACC1 is the 'reaches every one of them' half, and I verified it by import rather than by intent: init-render.service.ts, plugin-agents.service.ts and packages/core/src/cli.ts all consume the same `renderAgentForHosts`, so a contributed plugin role reaches all three writers by construction rather than by each remembering to read the registry. The grant reconciler's half is the same data with a second use: MANAGED_AGENT_DIRECTORIES is `AGENT_HOSTS.flatMap(host => host.agents === undefined ? [] : [host.agents.dir])`, so the Copilot folder the reconciler sweeps is read from the registry rather than hard-coded — which is what makes 'the one format that grants by server' safe to key off. Evidence 11/11 is `bunx vitest run --root packages/core tests/src/lib/hosts`.

### S4 — A project with the old layout is migrated at start

- **Status**: in-progress
- **Files**:
  - `packages/core/src/lib/hosts/project-hosts.service.ts`
  - `packages/cli/src/commands/init/init.command.ts`
  - `packages/cli/src/lib/init/init-render.service.ts`
  - `packages/cli/src/lib/init/init-default.command.spec.ts`
  - `packages/core/src/lib/scaffold/agent-signature.helper.ts`
  - `packages/core/src/lib/contracts/interfaces/agent-signature.interface.ts`
  - `packages/core/src/lib/scaffold/plugin-agents.service.ts`
  - `packages/core/src/cli.ts`
  - `packages/core/tests/src/lib/scaffold/agent-signature.helper.spec.ts`
- **Gate**: type
- answer to the change request: init removed a stale catalog agent on its redirector text alone, edits and all, and said nothing. Catalog agents are now signed with the hash of what delendai wrote, the marker plugin agents already carried (one helper for both, the plugin marker unchanged). A stale agent is removed only while it is as written, and the removal is said; one edited by hand is kept, listed in the recap and said on stderr with what to do. A redirector from before the signature is removed only when it is what delendai writes for its path today, for any host.
- acceptance:
  - A project from before `hosts` keeps every host it has agents for: their folders are evidence, so nothing is dropped and nothing has to be rewritten at start.
  - A project that declares `hosts` has the generated agents of the other hosts removed at the next start (plugin agents) or init (catalog agents); a file edited by hand is kept and reported.
- shipped-in: `b90125c462c3`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: requested_changes by minimax-m3.1-flash-preview — ACC0 is fully met. ACC1 is met for the removal and for keeping a hand-edited file, but its last three words are not: "a file edited by hand is kept and reported". Nothing reports it.

Where: packages/cli/src/commands/init/init.command.ts — `cleanupStaleGeneratedAgentFiles` (lines 143-168) and its only call site (line 743).

What the code does, which is right: MANAGED_AGENT_DIRECTORIES is every host's agent dir from AGENT_HOSTS; expectedManagedAgentPaths is what should exist now; a file in a managed dir that is not expected, carries the allowed extension, and still contains GENERATED_AGENT_MARKER is removed. A file whose marker is gone is skipped, so a hand-edited file survives — which is the safe half and exactly what the criterion asks for. I confirmed the removal path and the keep path both exist; the missing piece is only the report.

What is missing: the function is declared `Promise<void>`, and the hand-edited branch is a bare `continue` after `if (!(await isManagedGeneratedAgentArtifact(workspaceRoot, relPath))) { continue; }`. No name is collected, nothing is returned, and the call site discards the result (`await cleanupStaleGeneratedAgentFiles(answers.workspaceRoot, bundle.files);`). Grepping init.command.ts for kept/preserved/report finds only the unrelated `IEnvWarningReport` environment-warning path.

Why it matters, concretely: a person who edited `.github/agents/foo.agent.md` by hand has just been told nothing. Next init leaves it in place — correct — but the file now carries no marker, so from then on delendai will never manage it again, and there is no line anywhere saying "this one is yours now". The criterion asks for the report precisely because that transition is silent, and it is the moment a person would want to know.

How to reproduce: read init.command.ts:143-168 and its call site at :743; `cleanupStaleGeneratedAgentFiles` returns void and its keep branch is a bare `continue`. Or: hand-edit an agent file, remove the "This file is a thin redirector…" marker, re-run `delendai init`, and observe that the file survives with nothing printed about it.

What must hold to approve: `cleanupStaleGeneratedAgentFiles` returns the paths it kept (a `readonly string[]` is enough), and init prints them — the same style as the `written` list already collected a few lines above. A test asserting that a hand-edited file is kept AND named in the output would pin it. Nothing else in the slice needs to change: the removal path, the marker check and the "goes whichever host it was written for" behaviour (a stale generated agent in any host's dir is swept, since MANAGED_AGENT_DIRECTORIES covers all of AGENT_HOSTS) are all correct as delivered.

For the record, the other half of ACC1 and all of ACC0 are verified: a project from before `hosts` keeps every host it has agents for, because project-hosts.service.ts:36 detects a host by `host.evidence.paths.map(...)` — the folders are the evidence — so nothing is dropped and nothing has to be rewritten at start.

### S5 — A push that only keeps a unit's work safe is not judged as a publication

- **Status**: done
- **Files**:
  - `packages/core/src/lib/contracts/constants/durability-push.constant.ts`
  - `packages/core/src/lib/work-units/unit-push.service.ts`
  - `packages/core/src/lib/work-units/unit-forge-sync.service.ts`
  - `packages/core/src/lib/contracts/interfaces/unit-forge-sync.interface.ts`
  - `packages/core/src/lib/shared/git-write.ts`
  - `lefthook.yml`
  - `packages/core/tests/src/lib/work-units/unit-push.service.spec.ts`
- **Gate**: type
- evidence: on 2026-10-13, the first commit of this unit was pushed by the new `post-commit` hook (x00891) and refused by this repository's pre-push `drift-check` (the configuration schema was stale mid-work): "committed here but origin refused it". The pre-push hook runs every publication check (`gen:all --check`, publication proof, format) on every push, so a wip branch, which is durability, not a publication, stayed on one machine whenever the work was unfinished.
- acceptance:
  - The pushes delendai makes to keep a unit's branch on the forge carry `DELENDAI_DURABILITY_PUSH=1`, and this repository's publication checks skip such a push. Secrets, empty commits, the guard and the integration-branch protections still run on it.
  - A push without the variable, a publication included, runs every check as before.
- shipped-in: `a632bacdd285`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ba4e95c31, validate exit 0, tests 4/4; acceptance 2/2: (1) Both halves verified against the real config. The marker is exported on every push that keeps a unit's branch on the forge: unit-push.service.ts:61 `env: { ...… (2) Structural: the skip is `test "${DELENDAI_DURABILITY_PUSH:-}" = 1`, so a push without the variable — a publication included, since a publication is pushed with… — The two halves of ACC0 pull in opposite directions — skip the publication checks, keep the protections — so a slice could satisfy the first by skipping everything and still look right, which is why I enumerated every pre-push hook individually rather than spot-checking one. The marker is exported on every push that keeps a unit's branch on the forge: unit-push.service.ts:61 (`env: { ...process.env, [DURABILITY_PUSH_VARIABLE]: '1' }`) and unit-forge-sync.service.ts:327 the same, with the name defined once in durability-push.constant.ts:13. Then the split. SKIP: format-check-all, format-check-web, lint-scss-all, drift-check, publication-proof — the publication checks, which judge a PR and have nothing to say about a wip branch. DO NOT SKIP: no-secrets-push, no-empty-commits, push-to-develop-discipline, delendai-guard, release-pr-gate — the four the criterion names (secrets, empty commits, the guard, the integration-branch protections) plus the release gate. lefthook.yml:294-298 gives the reason in the repo's own words and, notably, explains why the skip is a `skip:` predicate rather than something inside each script: 'A gate whose activation nobody can predict is not a gate.' ACC1 is structural rather than tested, which is the right kind of structural here: the skip is `test "${DELENDAI_DURABILITY_PUSH:-}" = 1`, so a push without the variable — a publication included, because a publication is pushed without it — evaluates false and every hook runs exactly as before. Evidence 4/4 is unit-push.service.spec.ts, including 'says it is a durability push, so a project's publication checks can let it through'.

## acceptance

- A project gets agents only for the hosts it uses, declared or detected.
- Adding a host is one registry entry, and every writer picks it up.
- delendai's and the plugins' agents are written once and rendered per host.
