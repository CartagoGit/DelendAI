---
id: f00084
status: ready
type: proposal
track: cli+bootstrap+onboarding
date: 2026-06-29
kind: feat
title: `bunx @mcp-vertex/core init` — interactive workspace bootstrap CLI
shipped-in: []
recan: []
related:
    - f00081 # namespace-aware client services (cli consumes resolved prefix)
    - a00045 # audit post-merge that exposed the bootstrap gap
ownership:
    - { agent: proposal_guardian,    task: 'S1: define `IInitAnswers` Zod schema in `packages/cli/src/commands/init/init-answers.schema.ts`; cover preset, plugins, host-instructions centralization and migration offer' }
    - { agent: implementation_runner, task: 'S2: implement `init` command in `packages/cli/src/commands/init/init.command.ts`; interactive prompts via `@inquirer/prompts`; idempotent file writes through `withFileMutex` + `writeFileAtomic`' }
    - { agent: implementation_runner, task: 'S3: `.github/agents/mcp-vertex-*.agent.md` generator from the live catalog (proposal-guardian, technical-investigator, implementation-runner, delivery-verifier, orchestrator)' }
    - { agent: implementation_runner, task: 'S4: host-instructions centralizer — copy the `host-hints/*.generated.md` fragments into `.github/copilot-instructions.md`, `CLAUDE.md`, `AGENTS.md` with overwrite or merge mode' }
    - { agent: implementation_runner, task: 'S5: optional post-init auto-migration — when `proposals` is enabled and `migrateFromLegacy=true`, invoke `proposals_create_proposal` with a templated migration title and slice skeleton' }
    - { agent: delivery_verifier,    task: 'S6: end-to-end test against a tmp directory; verify the resulting `.vscode/mcp.json` + `mcp-vertex.config.json` + `.github/agents/*.md` make `mcp-vertex_overview { compact: true }` load clean' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test,      expect: exit0 }
    - { command: bun run validate,  expect: exit0 }
    - { command: bun run cli -- init --help, expect: exit0 }
---

# f00084 — `bunx @mcp-vertex/core init` — interactive workspace bootstrap

## goal

Ship a single command, `bunx @mcp-vertex/core init`, that turns an empty (or
existing) project into a fully wired **mcp-vertex workspace** in under five
minutes, with zero manual file editing. The command asks one well-formed question
at a time, defaults to sane choices, refuses unknown plugin ids, and produces a
self-consistent bundle:

1. A **`mcp-vertex.config.json`** that lists the chosen preset, the chosen
   plugins and their per-plugin `options` after prompting.
2. A **`.vscode/mcp.json`** (or the matching file for the active host) with the
   canonical launch shape, `--workspace=${workspaceFolder}` and `--preset=<resolved>`.
3. A **`docs/mcp-vertex/skills/`** folder populated with the core skills the user
   accepts (versioned copy, not a symlink — so the workspace is self-contained).
4. **`.github/agents/mcp-vertex-<role>.agent.md`** files generated from the live
   `agent-catalog.generated.json`, so the dropdown is enriched the moment the
   host reloads.
5. **Host-instructions centralization** — the canonical host-hints fragments
   (`copilot-instructions.generated.md`, `claude.generated.md`,
   `agents.generated.md`) copied into the project and referenced from
   `.github/copilot-instructions.md`, `CLAUDE.md` and `AGENTS.md`. The user
   chooses **append** (default — safe) or **overwrite**.
6. An **optional auto-migration offer** — if the user accepts the `proposals`
   plugin (default `true`), `init` offers to scaffold the first migration
   proposal as `f00001-migrate-legacy-<scope>.md` with templated slices.

The CLI works equally well against the **published** `@mcp-vertex/core` package
or a **local checkout** (the user can point at
`/home/cartago/_proyectos/propios/mcp-vertex/tools/scripts/host/host-server.script.ts`
when the npm package is not yet available — no behavioral difference).

## why

Today, wiring mcp-vertex into a fresh project is a nine-step manual ritual:

```text
1. mkdir docs/mcp-vertex/proposals
2. mkdir docs/mcp-vertex/skills
3. mkdir .github/agents
4. write mcp-vertex.config.json by hand
5. write .vscode/mcp.json by hand
6. cp -r <core>/skills/* docs/mcp-vertex/skills/
7. cp <core>/host-hints/* .github/
8. write .github/agents/mcp-vertex-*.agent.md by hand
9. bun run catalog:generate (only available in the mcp-vertex repo)
```

The user has to **know the canonical launch shape**, the **plugin preset
boundaries** (`full ⊇ swarm ⊇ standard ⊇ minimal`), and the **host-hints
injection contract**. None of this is automatic.

Audit `a00045 H8` already flagged that onboarding requires "deep familiarity
with the canonical docs" — that is a defect, not a feature. The fix is a single
interactive command that codifies the ritual, defaults to safe choices, and
refuses to proceed until every required answer is collected.

`f00083` closes that gap. The same effort that today takes nine steps becomes
one command with one well-formed question per logical decision.

## why this design

### Why an interactive CLI and not just a config template

A template file is not enough because the user has to make **load-bearing
decisions** that cannot be inferred:

- **Which preset.** Inferred only if the project is a known monorepo shape.
- **Which extra plugins.** Unknown until the user declares (e.g. `audit` is
  opt-in per repo, `issues` is host-only).
- **Whether to centralize host instructions.** Affects `.github/copilot-instructions.md`,
  `CLAUDE.md`, `AGENTS.md` — destructive if `overwrite` is selected.
- **Whether to scaffold the first migration proposal.** Default `true`, but
  the user must confirm because it creates a new file.

These decisions are best made through **conversational prompts with
sane defaults** that the user can skip with Enter. The CLI rejects unknown
plugin ids against `PRESET_CATALOG` (slice S1) before writing anything.

### Why `@inquirer/prompts` and not raw `process.stdin`

The CLI already uses `@inquirer/prompts` elsewhere in the repo (check
`packages/cli/src/lib/prompt.ts` if it exists, otherwise the proposal adds it
as a dependency). Raw stdin breaks on TTY-less environments, multi-byte input
and validation. `@inquirer/prompts` is the lightest dependency that gives us
typed answers with built-in validation hooks.

### Why each plugin gets a follow-up "add another?" prompt

The user explicitly asked for it: "por cada plugin que pongamos nos pregunta
si queremos otro plugin, si es que el plugin existe, solo cancela con un n o
no". This matches the canonical preset membership table — a user picking
`audit` typically also wants `quality`, etc. — and prevents the user from
forgetting a plugin mid-flow.

### Why the migration offer is its own step

Adding the `proposals` plugin **does not** automatically migrate the project.
Migration is a separate decision because:

- It touches the project deeply (new files under `docs/mcp-vertex/proposals/`).
- The user might want to bootstrap the workspace **before** starting migration
  (e.g. dry-run the configuration first).
- Default `true` but the user can decline with `n`.

## non-goals

- **Network calls during `init`.** No `npm install`, no `git clone`, no remote
  fetch. The CLI writes local files only.
- **Auto-publishing.** `init` does not push, commit, or open PRs.
- **Modifying existing config beyond what the user opted into.** If a file
  already exists, `init` asks **append vs overwrite** for host-instructions
  and refuses for `mcp-vertex.config.json` unless `--force` is passed.
- **Cross-host launch-shape generation.** Today `init` writes
  `.vscode/mcp.json` only (covers VS Code / Cursor / Antigravity). Claude Code
  and Codex adapters are a follow-up proposal (out of scope).
- **Symlinking skills from the core repo.** Skills are copied so the workspace
  is self-contained and survives `node_modules` cleanup.

## architecture

```
packages/cli/src/commands/init/
  init.command.ts                    # NEW: command registration + entrypoint
  init-answers.schema.ts             # NEW: Zod schema for collected answers
  init-prompts.ts                    # NEW: @inquirer/prompts wrapper
  init-writers.ts                    # NEW: idempotent file writers (atomic + mutex)
  init-render.ts                     # NEW: render .vscode/mcp.json, .agent.md, host-instructions
  init-migrate-offer.ts              # NEW: post-init proposals_create_proposal templating
  init.spec.ts                       # NEW: end-to-end test (tmpdir → bundle)

packages/cli/src/lib/
  preset-catalog.ts                  # REUSE: validate plugin ids against PRESET_CATALOG
  workspace-detect.ts                # NEW: detect project root, IDE, existing config

tools/scripts/cli/
  init-bin.sh                        # NEW: smoke script for the published bin
```

The CLI **does not import the MCP server.** `init` runs **before** the server
is started. It uses `PRESET_CATALOG` from `packages/core` directly, which is
already a published dependency.

The CLI **does not write to `.cache/mcp-vertex/`.** All artefacts live in the
workspace (the cache stays for runtime state).

## slices

### S1 — `IInitAnswers` Zod schema (closed surface)

- **Files**: [packages/cli/src/commands/init/init-answers.schema.ts](packages/cli/src/commands/init/init-answers.schema.ts)
- **Status**: ready
- **Gate**: bun run typecheck

```typescript
import { z } from 'zod';

export const InitPluginId = z.string().refine(
  (id) => PRESET_KIND.includes(id as never) || id === 'audit',
  { message: 'Plugin id must be in PRESET_CATALOG or "audit" (opt-in)' },
);

export const InitAnswers = z.object({
  preset: z.enum(['minimal', 'standard', 'swarm', 'full']).default('swarm'),
  extraPlugins: z.array(InitPluginId).default([]),
  excludedPlugins: z.array(InitPluginId).default([]),
  hostInstructions: z.enum(['append', 'overwrite', 'skip']).default('append'),
  copyCoreSkills: z.boolean().default(true),
  generateAgentMd: z.boolean().default(true),
  migrateFromLegacy: z.boolean().default(true),
  force: z.boolean().default(false),
  workspaceRoot: z.string().default(process.cwd()),
});

export type IInitAnswers = z.infer<typeof InitAnswers>;
```

The schema refuses unknown plugin ids **at the boundary**, before any file is
written. The CLI never tries to load a plugin that is not in `PRESET_CATALOG`.

### S2 — `init` command + interactive prompts

- **Files**: [packages/cli/src/commands/init/init.command.ts](packages/cli/src/commands/init/init.command.ts),
  [packages/cli/src/commands/init/init-prompts.ts](packages/cli/src/commands/init/init-prompts.ts)
- **Status**: ready
- **Gate**: bun run typecheck

The command registers as `init` (single-token) in `commands/registry.ts`.
Internally:

1. Detect workspace root (`.git/`, `.vscode/`, `package.json` heuristics).
2. Detect host (VS Code / Cursor / Antigravity from `.vscode/`).
3. Prompt for preset (default `swarm`).
4. Prompt for extra plugins, one at a time: "Add plugin? (leave blank to
   finish)". Reject unknown ids against `PRESET_CATALOG`.
5. Prompt for plugin exclusions (only show plugins in the resolved set).
6. Prompt for host-instructions mode (`append` / `overwrite` / `skip`).
7. Prompt for skills copy (`yes` / `no`, default yes).
8. Prompt for `.agent.md` generation (`yes` / `no`, default yes).
9. Prompt for migration offer (only if `proposals` is in the resolved set).
10. Render bundle (S2 calls S3/S4/S5/S6).

```typescript
import { defineCommand } from '../../contracts/interfaces/cli-command.interface';

export const initCommand = defineCommand({
  name: 'init',
  description: 'Interactive workspace bootstrap for mcp-vertex.',
  run: async (args, ctx) => {
    const answers = await collectInitAnswers(ctx);
    const rendered = renderInitBundle(answers);
    await writeInitBundle(rendered, answers);
    return { data: { ok: true, summary: rendered.summary } };
  },
});
```

### S3 — `.github/agents/mcp-vertex-<role>.agent.md` generator

- **Files**: [packages/cli/src/commands/init/init-render.ts](packages/cli/src/commands/init/init-render.ts)
- **Status**: ready
- **Gate**: bun run typecheck

Reads `docs/mcp-vertex/agent-catalog.generated.json` (regenerated on the fly
if missing via `bun run catalog:generate`) and produces one `.agent.md` per
role. Skeleton:

````markdown
---
name: mcp-vertex-<role>
description: <catalog entry description>
tools: [<tool-ids>]
---

<body from catalog entry>
````

Roles emitted by default: `orchestrator`, `proposal-guardian`,
`technical-investigator`, `implementation-runner`, `delivery-verifier`. The
generator skips a role if its `.agent.md` already exists unless
`answers.force === true`.

### S4 — Host-instructions centralizer

- **Files**: [packages/cli/src/commands/init/init-render.ts](packages/cli/src/commands/init/init-render.ts)
- **Status**: ready
- **Gate**: bun run typecheck

For each active host fragment:

```text
docs/mcp-vertex/host-hints/copilot-instructions.generated.md
  → .github/copilot-instructions.md (append or overwrite)
docs/mcp-vertex/host-hints/agents.generated.md
  → AGENTS.md (append or overwrite)
docs/mcp-vertex/host-hints/claude.generated.md
  → CLAUDE.md (append or overwrite)
```

Append mode prepends a `<!-- mcp-vertex:begin -->` / `<!-- mcp-vertex:end -->`
block so future `init` runs are idempotent.

### S5 — Optional post-init auto-migration

- **Files**: [packages/cli/src/commands/init/init-migrate-offer.ts](packages/cli/src/commands/init/init-migrate-offer.ts)
- **Status**: ready
- **Gate**: bun run typecheck

If `answers.migrateFromLegacy === true` and `proposals` is in the resolved set:

1. Render `docs/mcp-vertex/proposals/ready/f00001-migrate-legacy-<scope>.md`
   from a template (frontmatter valid, kind `feat`, scope derived from
   workspace detection).
2. Insert two initial slices:
   - **S1**: `analyze_project` snapshot of the current workspace.
   - **S2**: `plan_mcp_project` blueprint for migrating the legacy
     `mcp-server` (if detected) into a plugin or host.
3. Print a follow-up: `Run \`mcp-vertex_proposals_auto_work\` to start the
   migration.`

If `proposals` is NOT in the resolved set, this step is skipped silently.

### S6 — End-to-end spec

- **Files**: [packages/cli/src/commands/init/init.spec.ts](packages/cli/src/commands/init/init.spec.ts)
- **Status**: ready
- **Gate**: bun run test

```typescript
it('produces a self-consistent bundle in an empty tmpdir', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpv-init-'));
  const answers = makeAnswers({ workspaceRoot: tmp });
  const rendered = renderInitBundle(answers);
  await writeInitBundle(rendered, answers);

  // Verify the resulting workspace makes mcp-vertex_overview load clean.
  const proc = Bun.spawn(
    ['bun', HOST_SERVER_SCRIPT, `--workspace=${tmp}`, '--preset=swarm'],
    { stderr: 'pipe' },
  );
  await proc.exited;
  expect(proc.exitCode).toBe(0);
});
```

The spec boots the **actual** `host-server.script.ts` against the bundle and
asserts that `mcp-vertex_overview { compact: true }` returns
`pluginDiagnostic.loaded.length >= 13` (i.e. swarm loads).

## acceptance

- `bun run validate` is green.
- `bun run cli -- init --help` exits 0 with the help text.
- `bun run cli -- init --dry-run` writes nothing and prints the planned bundle.
- The end-to-end spec passes for `minimal`, `standard`, `swarm`, `full`.
- `init` rejects unknown plugin ids before writing.
- `init --force` overwrites `mcp-vertex.config.json` without prompting.

## risks

- **Destructive overwrite.** If the user picks `overwrite` for host-instructions
  and already has custom rules in `CLAUDE.md`, those are replaced. Mitigation:
  the prompt requires explicit confirmation; `append` is the default.
- **`@inquirer/prompts` dependency.** Adds ~30 KB to the CLI bundle. Mitigation:
  dynamic import (`await import('@inquirer/prompts')`) only when `init` runs.
- **Catalog drift.** If `agent-catalog.generated.json` is stale when `init`
  runs, the generated `.agent.md` files reference tools that do not exist.
  Mitigation: S3 invokes `bun run catalog:generate` first; if generation
  fails, S3 exits with a typed error and writes nothing.

## appendix A — using `init` from another project (no npm, no install there)

**Rule:** the destination project (e.g. `azur-lx`) **must not be
touched** by `init`. Nothing is added to its `package.json`,
`bunfig.toml`, `node_modules` or any other file. The CLI lives in
`/home/cartago/_proyectos/propios/mcp-vertex` and is invoked from
outside; only the bundle it emits lands inside the target project.

Three call shapes satisfy the rule. All three produce an identical
bundle; the only difference is convenience and iteration speed.

### A.1 — direct script invocation (zero install, zero build)

The CLI is `packages/cli/src/index.ts`. From the destination
project, run it with `bun` and pass the absolute path explicitly:

```bash
# 1. cd into the project you want to bootstrap
cd /home/cartago/_proyectos/propios/azur-lx

# 2. invoke init through the local repo
bun /home/cartago/_proyectos/propios/mcp-vertex/packages/cli/src/index.ts init --dry-run
bun /home/cartago/_proyectos/propios/mcp-vertex/packages/cli/src/index.ts init --force
```

Pros: zero install, zero build, no env. The destination project
is completely untouched before, during and after the call.
Cons: long path; every invocation pays the parser boot.

### A.2 — pre-built bin on `PATH` (one-time build, short command)

Build the package once, then symlink the dist into a `PATH`
directory in your home:

```bash
# 1. build the dist (one-time, in the mcp-vertex repo)
cd /home/cartago/_proyectos/propios/mcp-vertex
bun run build           # produces packages/cli/dist/index.js

# 2. symlink the bin into ~/.local/bin (in your HOME, not the project)
ln -sf /home/cartago/_proyectos/propios/mcp-vertex/packages/cli/dist/index.js \
       ~/.local/bin/mcpv

# 3. invoke from any destination project
cd /home/cartago/_proyectos/propios/azur-lx
mcpv init --dry-run
mcpv init --force
```

Pros: short command; works in any shell. Cons: requires the
`mcp-vertex` repo to stay at the same absolute path; if you move it,
re-create the symlinks.

### A.3 — skip the build with `bun --bun` (fastest iteration)

If you are iterating on the init command itself, skip the `build`
step entirely. `bun --bun` forces Bun to use itself as the runtime
(no node fallback) and parses the TypeScript on the fly:

```bash
cd /home/cartago/_proyectos/propios/azur-lx
bun --bun /home/cartago/_proyectos/propios/mcp-vertex/packages/cli/src/index.ts init --dry-run
```

Pros: no build, immediate feedback on changes to the CLI source.
Cons: every invocation re-parses the TS.

### A.4 — `.vscode/mcp.json` boot shape (the only file that lands)

`init` writes exactly **one** file inside the destination project
that points back to the mcp-vertex repo: `.vscode/mcp.json`. The
`command` is `bun` and the first `args` entry is the absolute path
to the local `host-server.script.ts`:

```jsonc
// /home/cartago/_proyectos/propios/azur-lx/.vscode/mcp.json
{
  "servers": {
    "mcp-vertex": {
      "type": "stdio",
      "command": "bun",
      "args": [
        "/home/cartago/_proyectos/propios/mcp-vertex/tools/scripts/host/host-server.script.ts",
        "--workspace=${workspaceFolder}",
        "--config=${workspaceFolder}/mcp-vertex.config.json",
        "--preset=swarm"
      ]
    }
  }
}
```

When the package is eventually published to npm, the diff is two
lines: `command` becomes `bunx` and the `args` array drops the
absolute script path:

```jsonc
{
  "servers": {
    "mcp-vertex": {
      "type": "stdio",
      "command": "bunx",
      "args": ["@mcp-vertex/core", "--workspace=${workspaceFolder}", "--preset=swarm"]
    }
  }
}
```

### A.5 — verification

Whichever install shape you use, sanity-check the wiring before
trusting the bundle:

```bash
# 1. confirm the CLI is callable
mcpv --version                     # or `bun .../index.ts --version`

# 2. confirm the server boots in the project
cd /home/cartago/_proyectos/propios/azur-lx
mcpv init --dry-run                # prints the planned bundle, writes nothing
mcpv init --force                  # writes the bundle

# 3. confirm the host can load it
# (in VS Code) Ctrl+Shift+P → "MCP: Restart Server" on mcp-vertex
# then in the chat:
mcp-vertex_overview { compact: true }
# expect pluginDiagnostic.loaded.length >= 13 (swarm)
```

If `pluginDiagnostic.loaded` is empty, the most common cause is that
`--workspace` resolved to a different directory than expected — see
`docs/mcp-vertex/CROSS-PROJECT-SETUP.md` § "Quick parity check".