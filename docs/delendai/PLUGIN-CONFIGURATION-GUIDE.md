# Plugin configuration guide — delendai for LLMs

> **Source of truth: the server.** This guide does **not** enumerate the full list
> of plugins or tools (it changes every week). To know what is loaded right now,
> always ask the server — never a list copied from a previous session:
>
> - `delendai_overview { compact: true }` — active plugins and tools.
> - `delendai_agent_catalog { mode: "compact" }` — actionable catalog
>   (proposals, skills, counts) without repeating the tool list.
> - `delendai_plugin_search` — search for plugins.
> - `delendai_init_config` — derives a recommended config from the real project.

## 1. Mental model

- The **core** is project-agnostic: it knows nothing of git, rules, or proposals.
  All domain capability lives in **plugins**.
- A plugin is loaded via one of these paths (precedence: flag > config > preset):
  1. **Preset** — `--preset=minimal`, `lean`, `standard`, `swarm`, `full`,
     `vertex`, or a stack pack (`web-app`, `backend-api`, `cli-tool`).
  2. **Explicit list** — `--plugins=<a>,<b>,<c>` (or `--exclude-plugins=<x>`).
  3. **Project config** — `plugins.<id>` in `delendai.config.json`
     (options, `prefix`, `enabled`, `origin`).
- `delendai.config.json` is the **project authority**: it fixes options per
  plugin and can enable/disable entries; the preset/flag only decides what
  gets loaded. The schema (`$schema`) validates the config strictly.

## 2. First time in a new project

1. `delendai_overview { compact: true }` — orient yourself: what is loaded.
2. `delendai_init_config { write: false }` — see the recommended config
   (preset + plugins + rationale); `write: true` persists it without clobbering an
   existing valid config (`overwrite: true` only to replace on purpose).
3. Adjust as needed with the examples in §3.
4. Leave the host instruction file (`AGENTS.md`, `CLAUDE.md`,
   `.github/copilot-instructions.md`, Cursor/Aider/…) as a **pointer** to
   `AGENT-BOOTSTRAP.md` (§7/§8) — do not copy rules into the host.

## 3. Configuration by need

### 3.1 Commit and push on behalf of the author

The `git` plugin exposes write tools as **opt-in**:

- `plugins.git.options.allowWrite: true` registers `_commit` and `_push`
  (write effect). Without this, only the read-only tools exist
  (`status`, `changed`, `diff`, `log`, `blame`, `show`, `worktree`).
- `commitAuthor` (root level) fixes who signs the commits:
  - `mode: "git"` (default) — uses the repo's `git config user.name/email`.
    Signs with your identity without touching anything.
  - `mode: "named"` — fixed `humanName` + `humanEmail` (+ `modelName`),
    portable across machines: `"Name (model)" <email>`.
  - `mode: "agent"` / `"bot"` — attributed to the agent, not the person.

```jsonc
{
	"commitAuthor": { "mode": "git" },
	"plugins": {
		"git": { "options": { "allowWrite": true, "allowForge": true } }
	}
}
```

Bootstrap §5 (*Definition of done*) requires committing and pushing at the end of
each task, under the configured identity. The author is resolved **centrally**
in the core, so the agent does not ask whose name it is and never leaves
finished work uncommitted.

### 3.1 Global agent policy

The root `core` section contains the core's own configuration. Its
`core.agentPolicy` block defines the work mode and engineering principles that
the core includes in the canonical bootstrap prompt. Every host consuming
that prompt receives the same effective policy:

```jsonc
{
  "core": {
    "agentPolicy": {
      "autonomous": true,
      "principles": [
        "Apply SOLID architecture where it improves ownership and changeability.",
        "Use good engineering practices and keep the code clear and maintainable.",
        "Reuse existing code and abstractions before introducing duplication.",
        "Keep naming, files, and folders homogeneous with the surrounding project."
      ]
    }
  }
}
```

If `core` or `core.agentPolicy` is omitted, the core uses those same values by
default. Each configured field only replaces its default: for example,
`{"core":{"agentPolicy":{"autonomous":false}}}` preserves the four
principles and asks the agent not to run autonomous work without confirmation.
Projects can define their own principles under `principles`; they must
describe project rules, not depend on a specific plugin.

### 3.2 Clean code, SOLID, maintainable code and reuse

This is already the **non-negotiable default** (bootstrap §6). The plugins that
materialize and verify it:

- `rules` — lint/type presets per framework + area detection + enforcement mode
  (`strict` | `mixed` | `none` | `proposal`). The project's own linter/tsconfig
  **always wins**.
- `quality` — resolves which validation commands to run per scope.
- `conventions` — classifies paths into canonical roles and reports drift of
  file conventions.
- `test-convention` — canonical test layout (`*.spec.ts` placed and named correctly).

In a non-monorepo project, narrow the roots to its actual shape:

```jsonc
{
	"plugins": {
		"conventions": { "options": { "roots": ["src", "lib"] } },
		"rules": { "options": { "mode": "strict" } }
	}
}
```

There is no need to remind each agent: invariant §6 already requires it, and
`rules_get_rules` / `rules_check_rules` / `rules_apply_rules` verify it.

### 3.3 Folder architecture, naming, and files

- `conventions_check` reports drift against the canonical conventions profile
  (`FILE-CONVENTIONS.md`); `conventions_classify` classifies loose paths.
  Adjust `roots` to the project's real shape.
- Naming follows the bootstrap §6 contract: `IFoo` interfaces, one barrel
  per package (`src/public/index.ts`), colocated specs. For the delendai
  monorepo, `REPO-RULES.md` §12 spells out those rules; an adopting project
  adapts that block to its own monorepo shape.

## 4. Rules for not breaking anything

- Do not hardcode a full list of plugins/tools/skills in host files:
  ask the server.
- Each plugin validates its options with its `OptionsSchema`; a mistyped option
  is rejected at startup (not silently ignored).
- The project's config wins over default presets: do not fight
  your own linter/tsconfig.

## 5. Where the truth lives

- `AGENT-BOOTSTRAP.md` — universal agent rules (Definition of done,
  invariants, host appendices).
- `CROSS-PROJECT-SETUP.md` — first boot + presets + GitHub auth.
- `PLUGINS-DELENDAI.md` — how a plugin is **authorized** (if you create one).
- `README-DELENDAI.md` — CLI flags and presets.
- `FILE-CONVENTIONS.md` — canonical file-conventions profile.
