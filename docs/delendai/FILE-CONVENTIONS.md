# File conventions

> Companion to `AGENTS.md` and the `f00037` proposal. Canonical reference
> for the suffix + folder layout used by every TypeScript surface in
> the `@delendai/core` monorepo (packages, plugins, extensions,
> apps, examples, tools). Downstream consumers can opt in to the same
> rules through the `delendai conventions check --profile=typescript`
> command (see `f00037` S3).

## Why this exists

Naming must be mechanical. If `foo.service.ts` means service everywhere,
agents and humans can navigate by extension alone — no need to open the
file to guess its role. The convention removes a whole class of
"where does this go?" decisions and keeps the lint rules small.

The convention is **language-aware**: TypeScript gets a strict profile,
non-TS consumer projects are detected and left untouched unless the
user explicitly selects a compatible profile.

### Runtime scratch (f00080)

For artefacts a plugin or agent creates in order to *do something and
then throw away* (a runnable script the harness executes once, a JSON
blob the agent parses and then deletes, a sidecar a CLI tool expects
for one call), there is exactly one canonical home:
`<pluginCacheDir>/exec/`. Resolve it through `resolveExecPath(ctx, name)`
(or `withEphemeralExec(ctx, name, fn)` for the write → run → unlink
shape), exported from `@delendai/core/public`. Do **not** reach for
`os.tmpdir()` or hand-roll a `.verify-tmp/` next to the script that
created it — the `check-ephemeral-paths` lint will fail the slice, and
the artefact will be stranded outside the cache the next session cannot
find. Test fixtures and CLI tooling under `tools/scripts/` are exempt
because they run once and exit.

### Source code never lives in `.cache/delendai/` (f00081)

The cache root is for engine state, not for agent-authored code. Real
driver scripts, slice helpers, and one-shot tooling live under
`tools/scripts/` (versioned, linted by `biome` + `lint:tools`,
named after the proposal or slice they serve). If an agent writes a
script under `.cache/delendai/<weird>/`, it almost always means
the shell `cwd` was wrong or the convention was unknown — the
`check-stray-cache-files` lint catches it on the next
`bun run validate`, and the fix is to move the file to
`tools/scripts/` (real code) or delete it (one-shot). The cache
layout itself is documented in `AGENTS.md` rule #13.

### No executable files at the repo root (f00082)

The repo root is reserved for **19 whitelisted files** (AGENTS.md,
CLAUDE.md, CHANGELOG.md, LICENSE, README.md, package.json, biome.json,
bunfig.toml, bun.lock, lefthook.yml, delendai.config.json,
stylelint.config.mjs, tsconfig.base.json, tsconfig.json,
vitest.config.ts, vitest.shared.ts, .gitignore, .mcp.json).
None of them has an executable extension — a file like `-la`
(output of `ls -la`), `probe.sh`, `tmp.py`, or `experiment.ts` at
the root is almost always an agent whose shell mis-redirection
landed in the wrong place. The `check-stray-cache-files` lint
(extended by f00082) also walks the repo root and fails on any
executable-extension file, plus any extensionless file other than
`LICENSE`. The fix is `rm` it (or move it to `tools/scripts/` if
it is a real script).

## The table

The suffix is **singular** (it describes the file role). The folder is
**plural** (it groups many contracts).

| Role | Folder | Suffix | Example |
|---|---|---|---|
| Interfaces / exported structural types | `contracts/interfaces/` | `*.interface.ts` | `tool-descriptor.interface.ts` |
| Constants (durable, frozen, shared) | `contracts/constants/` | `*.constant.ts` | `proposal-glossary.constant.ts` |
| Services (stateful business logic) | `services/` | `*.service.ts` | `search-service.ts` |
| MCP tools | `tools/` | `*.tool.ts` | `git-commit.tool.ts` |
| Registries (collections + lookup) | `registries/` or `registry/` | `*.registry.ts` | `tool-registry.ts` |
| Registration glue (wires deps) | `register/` or local feature folder | `*.register.ts` | `plugin.register.ts` |
| Factories (constructors + DI graphs) | `factories/` | `*.factory.ts` | `client-factory.ts` |
| Builders (fluent / step-wise construction) | `builders/` | `*.builder.ts` | `query-builder.ts` |
| Generated outputs | `generated/` | documented generator-owned suffix | `api.generated.ts` |
| Public barrels | `public/` | `index.ts` (no role suffix) | `src/public/index.ts` |

### Hyphen vs dot

**Always dot, never hyphen.** The repository used to mix
`-service.ts`, `-tool.ts`, etc. Hyphens collide with package
boundaries (`delendai-tool.ts`) and break glob deduplication. Every
file with a role carries exactly one dot between the basename and the
role suffix.

### Co-location rules

- A `*.service.ts` may live next to its `*.types.ts` companions if the
  service is small and feature-scoped; the type companion keeps the
  bare `*.types.ts` form and is *not* classified as `interface` (it is
  feature-private glue).
- A `*.tool.ts` MUST live under a `tools/` folder, even when there is
  only one tool in the package.
- A `*.interface.ts` and a `*.constant.ts` MUST live under the
  matching `contracts/` subfolder. No top-level `*.interface.ts`.

### Exceptions (do not rename)

These categories are exempt from the role-suffix rule:

1. **Public barrels** — `src/public/index.ts` and the `src/index.ts`
   entrypoint. They exist to re-export the package surface; carrying a
   role suffix would mislead callers into importing from a non-public
   path.
2. **Generated outputs** — anything under `generated/` or matching the
   `*.generated.ts` shape. The owner is the generator, not a human.
3. **Type companions** — `*.types.ts` (plural). These are feature-private
   structural helpers, not contracts. They do not move into
   `contracts/interfaces/`.
4. **Test files** — `*.spec.ts` and `*.e2e.spec.ts`. Test suffix wins
   over role suffix when both would apply.
5. **Configuration** — `*.config.ts`, `package.json`, `tsconfig.json`.
   These are read by tooling; renaming them breaks the tooling.
6. **Editor host files** — `.github/agents/<role>.agent.md`,
   `.claude/agents/<role>.md`, `.codex/agents/<role>.md`, `.cursor/...`,
   `.continue/...`, `.aider.conf.yml`, `.cursorrules`. These names are
   dictated by the **editors** that read them, not by the role-suffix
   rule. Moving or renaming them silently breaks the editor's
   subagent discovery. Only the scaffolder (`scaffoldAgentFile`,
   `scaffoldClaudeAgentFile`, `scaffoldCodexAgentFile`) emits them.

## The classifier

`tools/scripts/lint/file-conventions.ts` exports a pure
`classifyPath(relPath)` that maps any repo-relative path to one of:

```
'interface' | 'constant' | 'service' | 'tool' | 'registry'
| 'register' | 'factory' | 'builder' | 'generated' | 'test'
| 'config' | 'script' | 'command' | 'provider' | 'view'
| 'component' | 'page' | 'i18n' | 'data' | 'dev' | 'webview'
| 'transport' | 'bootstrap' | 'swarm' | 'proposal' | 'agent'
| 'dashboard' | 'framework' | 'shared' | 'cli' | 'host'
| 'toolbar' | 'cascade' | 'install' | 'metric' | 'migration'
| 'scaffold' | 'setup' | 'knowledge' | 'lock' | 'project'
| 'skill' | 'workspace' | 'entry' | 'plugin' | 'app-lib'
| 'setting' | 'test-support' | 'issue' | 'marker' | 'convention'
| 'type' | 'barrel' | 'other'
```

The classifier is the single source of truth — both this document and
the lint script derive their tables from it. Adding a new role means
adding one entry to the rules array; nothing else.

## SOLID rationale

- **Single responsibility** — the classifier only maps paths to roles;
  the lint script only walks the tree and prints findings.
- **Open/closed** — new roles are added by appending a rule; no edit
  to the classifier core.
- **Liskov** — every rule satisfies the same `IRoleRule` contract and
  is interchangeable in the rule chain.
- **Interface segregation** — `IRoleRule` only requires
  `match(path): boolean` and a `name`. No god-objects.
- **Dependency inversion** — the script depends on the abstract
  classifier + rule list; both can be replaced in tests with fakes.

## Migration order

Drift will be reported in **report mode** until the per-package
migrations land (S4–S6). After S7 the linter becomes strict for
non-generated files. Migration slices use `git mv` and run the local
package tests before promoting to `bun run validate`.

### Report-mode lint (S2)

The classifier is wired as a non-failing baseline lint:

```bash
bun run lint:file-conventions   # report mode: counts unmatched files, exits 0
```

It runs `file-conventions.script.ts --report`, which counts the files
the classifier currently maps to `'other'` (no canonical suffix/folder)
without failing the build — so the convention is visible and tracked
before the migrations rename anything.

**Baseline (2026-06-22):** 485 unmatched `.ts`/`.tsx` files. That number
is the migration backlog S4–S6 will burn down; S7 then flips the lint to
strict (exit 1 on any non-generated drift) so the baseline can never
regress once it reaches zero. Re-run the command above any time to see
the current count.

## See also

- `AGENTS.md` — repo-wide invariants and the `*.script.ts` tooling rule.
- `f00037` proposal — the canonical source of truth for this convention.
- `f00020` (`docs/delendai/proposals/ready/f00020-skills-and-tools-coverage.md`)
  — the broader skills + tools coverage work that depends on this
  naming being stable.

## Editor host subagent files (Copilot Chat, Claude Code, Codex CLI)

The scaffolder (`packages/core/src/lib/scaffold/scaffold-host.ts`)
emits one subagent file per editor that recognises its own format.
The paths and frontmatter keys are dictated by the **editors**, not
by this convention — renaming or moving any of them silently breaks
the editor's subagent discovery and the `delendai-orchestrator`
becomes invisible to that host.

| Editor       | Path                                | Generator                        | Min. frontmatter                  |
| ------------ | ----------------------------------- | -------------------------------- | --------------------------------- |
| GitHub Copilot | `.github/agents/<role>.agent.md`  | `scaffoldAgentFile`              | `name`, `description`, `tools`, `user-invocable`, `display-name`, `icon`, `model` |
| Claude Code  | `.claude/agents/<role>.md`          | `scaffoldClaudeAgentFile`        | `name` (kebab-case), `description` |
| Codex CLI    | `.codex/agents/<role>.md`          | `scaffoldCodexAgentFile`         | `name` (kebab-case), `description` |
| Cursor       | `.cursor/<role>.mdc`               | (not scaffolded; manual)         | follows `.mdc` shape              |
| Aider        | `.aider.conf.yml` + `AGENTS.md`    | (not scaffolded; manual)         | YAML keys, repo-wide              |

`subagent name` convention: the **role** slot is `orchestrator`,
`proposal_guardian`, `implementation_runner`, `delivery_verifier`,
`technical_investigator`. The orchestrator emits these as snake_case
in the Copilot variant (it is a YAML key) and kebab-case in the Claude
and Codex variants (their `name` field requires kebab). The
scaffolder converts via the existing `kebab()` helper, never by hand.

The Claude and Codex files deliberately omit a `tools:` field — the
Copilot variant's tool vocabulary (`read`, `search`, `edit`,
`mcp-project-<prefix>/*`, …) does not map to those editors' own tool
names. Omitting `tools:` inherits every tool available to subagents
in the session, which is the closest honest equivalent to the Copilot
file's broad `[read, search, edit, execute, todo, agent, …]` grant.
Inventing a per-editor vocabulary mapping would trade one inaccuracy
for another (proven live in the proposal that added Claude support:
see `docs/delendai/proposals/done/fixes/x00160-...md`).

The Codex CLI custom-subagent format is intentionally **minimal**
(`name` + `description` + free-form body) — same shape as the Claude
file but no optional `model` field. Codex CLI's documented custom-agent
contract treats `name` + `description` as the only required keys.

## Shared design + i18n package (f00047)

`apps/shared/` is the single source of truth for design tokens,
themes, brand assets, and the i18n contract consumed by every
host extension and the docs site. The package is `private: true`
and not published.

```
apps/shared/
├── package.json           @delendai/shared
├── src/
│   ├── public/index.ts    barrel
│   ├── styles/
│   │   ├── _tokens.scss   --delendai-radius, --delendai-gap, --delendai-s-1..6, --delendai-transition-*
│   │   ├── _themes.scss   5 palettes + --delendai-brand-blue/purple (canonical hex)
│   │   ├── _index.scss    forwarder
│   │   └── styles.scss
│   ├── i18n/
│   │   ├── shared.ts      Lang, ILangDict, helpers
│   │   ├── index.ts       dictsByLang
│   │   └── langs/<code>.ts × 12
│   └── ...
├── brand/                 logo.svg, logo-mono.svg (source of truth)
└── README.md
```

The docs site (`apps/web/`) consumes `@delendai/shared` via its
`astro.config.mjs#vite.resolve.alias` (f00047 S6) and uses
`renderDropdown` from `@delendai/shared` for the `More` nav.
The VS Code extension consumes it via the
`extensions/vscode/src/host/vscode-host-adapter.ts` (S4). Brand
assets are regenerated by `bun run sync:brand-assets`.
