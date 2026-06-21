---
id: f00030
status: ready
type: proposal
track: docs+plugins/issues+apps/web+extensions/vscode
date: 2026-06-21
kind: feat
title: Cross-project setup — how to wire mcp-vertex (and the issues plugin) into any project
shipped-in: []
related:
    - f00042 # the GitHub issues plugin — this proposal is partly its "consumer-side" docs
    - f00043 # presets page — links to the cross-project setup page
ownership:
    - {
          agent: implementation_runner,
          task: 'S1: docs/CROSS-PROJECT-SETUP.md (canonical cross-project guide) covering install, presets, per-repo config, secrets handling, and the issues plugin GitHub config',
      }
    - {
          agent: implementation_runner,
          task: 'S2: `plugins/issues setup-github` CLI subcommand + `setup_github` MCP tool — interactive first-time setup that writes plugins.issues.options.repo + verifies `gh auth` / GITHUB_TOKEN / anon fallback end-to-end',
      }
    - {
          agent: implementation_runner,
          task: 'S3: apps/web/src/pages/setup.astro — wizard-style page that walks a user from "fresh repo" to "issues plugin working" with copy-pasteable commands + the same GitHub setup flow',
      }
    - {
          agent: implementation_runner,
          task: 'S4: extensions/vscode: command `mcp-vertex.setupGithub` opens a multi-step webview that mirrors setup.astro + i18n for all 12 languages + README addendum',
      }
    - {
          agent: implementation_runner,
          task: 'S5: bun run validate green + cross-project-setup linter (fails if any other doc hardcodes a different install command than the one in the catalog)',
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

# f00044 — Cross-project setup

## goal

Make it **obvious how to set up mcp-vertex in any project** the
user works on — including the GitHub issues plugin from f00042
and the preset selection from f00043 — from four surfaces that
must agree on the same steps:

1. A **canonical markdown guide** at
   `docs/CROSS-PROJECT-SETUP.md` (linked from
   `docs/README-MCP-VERTEX.md`, `docs/IDE-EXTENSION.md`,
   `docs/CROSS-IDE.md`, `docs/PLUGINS-MCP-VERTEX.md`).
2. A **CLI subcommand + MCP tool** (`mcp-vertex setup-github`,
   `issues_setup_github`) that interactively writes the
   `plugins.issues.options.repo` config block and verifies the
   GitHub credential tier (`gh` / token / anon) end-to-end.
3. A **wizard web page** at `apps/web/src/pages/setup.astro`
   that walks the user through the same steps with copy-pasteable
   commands.
4. A **VS Code command** `mcp-vertex.setupGithub` that opens a
   multi-step webview mirroring the wizard.

The MCP-client must **always know how to do this for its user**:
the cross-project setup guide is referenced from the
`start_prompt` skill, so any agent that boots the server gets a
one-line pointer to the right doc page.

## why

The user explicitly raised the onboarding problem: **"we must
have ways to configure this so that whoever uses mcp-vertex
knows how to connect to their GitHub… or if I use the mcp-server
in another of my projects, the mcp-client should know how to do
it."** Three concrete pain points this proposal closes:

1. **No canonical "first run" guide**. Today the install steps
   live in `README.md`, `docs/IDE-EXTENSION.md`, `docs/INSTALL.md`
   (where it exists) and inline in extension commands. A new
   contributor or a new project copy-pastes whatever they find
   first; if those guides drift (and they have, historically —
   see audit a00013), the agent ends up with a broken config.
2. **No "configure the issues plugin for this repo" flow**. Even
   after f00042 ships, the user has to know to:
   - Add `"issues": { "options": { "repo": "<owner>/<name>" } }`
     to `mcp-vertex.config.json`.
   - Make sure `gh auth status` works (or set `GITHUB_TOKEN`).
   - Add `proposals,issues` to `--plugins` or `--preset=full`.
   These 3 steps are spread across 3 documents and 0 tools.
3. **No verification step**. The user runs `mcp-vertex
   --plugins=proposals,issues` and only finds out the auth tier is
   wrong when they invoke `issues_fetch` and get a rate-limit
   error. There's no "are we wired up correctly?" check.

f00044 closes all three with a guided, tool-backed, cross-surface
setup.

## why this design

### One guide, four surfaces

The four surfaces (markdown, CLI, web wizard, VS Code webview)
must all link to `docs/CROSS-PROJECT-SETUP.md` as the canonical
source. The CLI subcommand and the wizard page **do not** copy
the prose — they generate their copy-pasteable commands from the
catalog (f00043) and from a shared `setup-steps.ts` module.

This way the install command changes (e.g. when f00043 adds
`--preset=full`) only need to change in one place.

### Why a CLI subcommand, not just docs

Docs are passive. A first-time user following a guide misses
steps. The `setup-github` subcommand:

1. Detects the current repo (`git remote get-url origin`).
2. Asks the user to confirm `owner/name`.
3. Runs `gh auth status` and reports the tier.
4. Writes the config block atomically (with `writeFileAtomic`
   and the existing `redactSecrets` for the token).
5. Runs `issues_fetch` on a sentinel issue (the last open issue
   on the repo) and reports the result.
6. Prints the exact `mcp-vertex` invocation the user should add
   to their IDE config.

Steps 1, 3, 4, 5, 6 are verifiable; step 2 is the only one that
requires human input. The tool surface is the same set exposed
through MCP (`issues_setup_github`), so a host agent can drive
the setup programmatically.

### Why a wizard page in addition to docs

The docs are the canonical reference. The wizard page is the
**onboarding path** — short, progressive, and copy-pasteable.
It links back to the docs at every step so users can deep-dive
without losing their place.

### Why a VS Code command

For users who never open the website, the command palette entry
is one keystroke away. The webview mirrors the wizard page.

## non-goals

- **No OAuth flow.** We rely on `gh auth` or a user-provided
  `GITHUB_TOKEN` env var. We do not implement GitHub OAuth in
  the server.
- **No global config.** All configuration is per-repo (the
  `mcp-vertex.config.json` in the workspace). Cross-repo config
  is delegated to the user's `~/.config/mcp-vertex/...` (if and
  when that exists — out of scope for f00044).
- **No write-back to GitHub.** Same as f00042.
- **No telemetry** of who set up what.

## architecture

### 5.1 Shared setup module

```
packages/core/src/lib/setup/
├─ setup-steps.ts            (new — ordered list of named steps;
                              each step has { id, title, run,
                              verify, rollback })
├─ setup-steps.spec.ts
├─ setup-types.ts
└─ cross-project-guide.ts    (new — produces the canonical
                              markdown; reads from setup-steps
                              + PRESET_CATALOG from f00043)

plugins/issues/src/lib/
├─ github-setup.ts           (new — gh auth / token detection;
                              reads `gh auth status` exit code
                              and surfaces the tier)
└─ tools/setup-github.tool.ts (new)
```

### 5.2 The 7 steps of `setup-github`

| # | Step | What it does | Verifiable by |
|---|---|---|---|
| 1 | **Detect repo** | `git remote get-url origin` → `https://github.com/<owner>/<name>.git` | matches `^https://github\.com/[^/]+/[^/]+$` |
| 2 | **Confirm owner/name** | Asks user; default = detected | user input |
| 3 | **Pick auth tier** | `gh auth status` exit 0 → `gh`; `GITHUB_TOKEN` set → `rest-authed`; else → `rest-anon (warn: 60/h)` | exit code + env probe |
| 4 | **Write config** | Atomically patch `mcp-vertex.config.json#plugins.issues.options.repo` via `writeFileAtomic` + `redactSecrets` | re-read config and assert |
| 5 | **Verify tier** | Call `issues_fetch` on a sentinel issue (last open issue or the user's own #1) | `tier` field in the response |
| 6 | **Print invocation** | Emit the exact `mcp-vertex --plugins=proposals,issues --preset=full` (or `--plugins=...`) line + the `mcp.json` snippet for the user's IDE | string equality with the catalog |
| 7 | **Mark configured** | Append a one-line `setup_github_completed_at: <iso>` to the config (optional, opt-in) | re-read config |

The steps are atomic; a failure at step N leaves the config in
its pre-N state (no partial writes) and prints the exact
remediation for that step.

### 5.3 Docs surface

- `docs/CROSS-PROJECT-SETUP.md` is the canonical reference. All
  other surfaces link to it.
- `docs/README-MCP-VERTEX.md` adds a "First run in a new project"
  section that links to it.
- `docs/IDE-EXTENSION.md` and `docs/CROSS-IDE.md` each add a
  one-paragraph "configure the issues plugin" callout.
- `docs/PLUGINS-MCP-VERTEX.md` adds the setup command under the
  `issues` entry.

### 5.4 Hard rules

- `packages/core` stays agnostic — `setup-steps.ts` only knows
  about plugin ids and the config file path; no GitHub vocab.
- i18n parity — every visible string on `setup.astro` and the VS
  Code webview has 12 language entries.
- `bun run lint:setup` (new, S5) fails the build if any doc or
  website page lists a preset's plugin set that disagrees with
  `PRESET_CATALOG`.

## slices

### S1 — `docs/CROSS-PROJECT-SETUP.md` (canonical) _(incl. `docs/`)_

- **Status**: ready
- **Files**:
  - `docs/CROSS-PROJECT-SETUP.md` (new)
  - `docs/README-MCP-VERTEX.md` (add "First run" section)
  - `docs/IDE-EXTENSION.md` (add cross-project callout)
  - `docs/CROSS-IDE.md` (add cross-project callout)
  - `docs/PLUGINS-MCP-VERTEX.md` (add issues-plugin setup
    command)
- The guide is structured as the 7 steps in §"The 7 steps of
  `setup-github`" above, plus a "Troubleshooting" section.
- **Gate**: `bun run lint:proposals`, `bun run lint:tools`,
  `bun run lint:markdown` (if it exists; otherwise add).

### S2 — `setup-github` subcommand + MCP tool _(excl. `apps/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `packages/core/src/lib/setup/setup-steps.ts` (new)
  - `packages/core/src/lib/setup/setup-steps.spec.ts` (new)
  - `packages/core/src/lib/setup/cross-project-guide.ts` (new)
  - `packages/core/src/lib/setup/cross-project-guide.spec.ts`
  - `packages/core/src/lib/cli/setup-subcommand.ts` (new — wires
    the subcommand into `assembleCli`)
  - `plugins/issues/src/lib/github-setup.ts` (new)
  - `plugins/issues/src/lib/github-setup.spec.ts` (new)
  - `plugins/issues/src/lib/tools/setup-github.tool.ts` (new)
  - `plugins/issues/src/lib/tools/setup-github.tool.spec.ts`
- The subcommand and the tool share `runSetupGithub(ctx, opts)`
  so the behaviour is identical. The CLI subcommand is a thin
  shell around the tool with stdin/stdout prompts; the tool is
  the underlying primitive.
- **Gate**: `bun run test packages/core plugins/issues` exit 0.

### S3 — `apps/web/src/pages/setup.astro` (wizard) _(incl. `apps/web/`)_

- **Status**: ready
- **Files**:
  - `apps/web/src/pages/setup.astro` (new)
  - `apps/web/src/lib/setup-wizard.ts` (new — pure render
    helper, mirrors `setup-steps.ts` for static rendering)
  - `apps/web/tests/lib/setup-wizard.spec.ts` (new)
  - `apps/web/src/i18n/ui.ts` (12 keys × 12 languages for the
    wizard text)
- The page renders the 7 steps as an ordered list, each with a
  "Copy" button (uses the standard `navigator.clipboard`
  integration already used in `apps/web/src/pages/install.astro`).
- **Gate**: `bun run test apps/web`, `bun run site:strict`,
  `bun run check:i18n:plugins` exit 0.

### S4 — VS Code webview + i18n + README addendum _(incl. `extensions/vscode/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `extensions/vscode/src/commands/setup-github.ts` (new)
  - `extensions/vscode/src/webviews/setup-github.ts` (new —
    multi-step webview mirroring `setup.astro`)
  - `extensions/vscode/src/test/setup-github.spec.ts` (new)
  - `extensions/vscode/src/i18n/strings.ts` (12 keys × 12
    languages)
  - `extensions/vscode/package.json` (register
    `mcp-vertex.setupGithub` command)
- The webview is intentionally minimal: 7 steps, one per screen,
  each with a "Next" / "Back" / "Copy command" pair. State is held
  in the webview itself; closing it forgets the state (no
  persistence beyond what `issues_setup_github` writes to disk).
- **Gate**: `bun run test extensions/vscode`,
  `bun run check:i18n:plugins`, `bun run site:strict` exit 0.

### S5 — Cross-project setup lint _(incl. `tools/`)_

- **Status**: ready
- **Files**:
  - `tools/scripts/lint/no-preset-drift.script.ts` (S5 — extend
    with the cross-project lint, or split into
    `no-setup-drift.script.ts`)
  - `bunfig.toml` / `package.json` (wire `lint:setup`)
- Walks `docs/`, `apps/web/src/pages/`, `extensions/vscode/`
  (markdown + .astro + .ts) and fails if any of them mentions
  a `--preset=NAME` with a plugin list that disagrees with
  `PRESET_CATALOG` (S2 of f00043). The lint is intentionally
  narrow — it only matches `mcp-vertex ... --preset=NAME` or
  `--plugins=A,B,...` patterns that look like a complete spec.
- **Gate**: `bun run lint:setup`, `bun run validate` exit 0.

## acceptance

(Mirrors the `acceptance:` block in the frontmatter. The linter
requires a `## acceptance` body section as the canonical mirror of
the frontmatter block.)

- `bun run type` exit 0.
- `bun run test` exit 0.
- `bun run lint` exit 0.
- `bun run site:strict` exit 0.
- `bun run lint:proposals` exit 0.
- `bun run lint:tools` exit 0.
- `bun run check:i18n:plugins` exit 0.
- `docs/CROSS-PROJECT-SETUP.md` exists, is the canonical
  reference, and is linked from `README-MCP-VERTEX.md`,
  `IDE-EXTENSION.md`, `CROSS-IDE.md`, `PLUGINS-MCP-VERTEX.md`.
- `mcp-vertex setup-github` runs end-to-end on a fresh repo and
  prints the exact invocation the user needs.
- `apps/web` shows `/es/setup` with the 7-step wizard.
- VS Code command palette shows `mcp-vertex.setupGithub` and
  opens the wizard webview.
- All 4 surfaces (markdown, CLI, web wizard, VS Code webview)
  agree on the same steps and the same commands (enforced by
  `bun run lint:setup`).
