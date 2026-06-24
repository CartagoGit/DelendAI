---
id: f00053
status: ready
type: proposal
track: apps/web+extensions/vscode+packages/ui-extension+docs+i18n+ux
date: 2026-06-24
---

# f00053 — Unify and polish the web + extension UX: canonical plugin catalog, per-plugin disclosures, representative icons, per-plugin install, CLI guide, and shared web↔extension surface

## Goal

Make mcp-vertex genuinely easy to understand and visually coherent across BOTH surfaces it ships (the docs site `apps/web` and the IDE extensions, today `extensions/vscode` via the host-agnostic `packages/ui-extension` shell), without writing the same thing twice. The MCP must stay project- and host-agnostic: nothing added here may hardcode mcp-vertex-only assumptions that a third-party host couldn't reuse.

Concretely close these gaps the maintainer identified:
1. A single CANONICAL source of per-plugin metadata — a one-paragraph "what this plugin does" explanation, its category, its capability summary, and its install snippet — consumed by web AND the extension so copy is written once and reused (today descriptions are scattered: i18n `plugin.<slug>`, a first-tool-description fallback, and `Plugin: <slug>` as last resort).
2. The /plugins index should let a reader EXPAND each plugin to see exactly what it contains (its tools, prompts, resources) plus a clear explanation — not just a card linking away.
3. Every plugin needs a DISTINCT, semantically representative icon in both the web cards and the extension tool tree/dashboard (some currently look generic, are not representative, or fall back to text in the extension).
4. Each plugin needs its own install instructions, in the SAME structure/order as the core install matrix (`apps/web/src/data/install.ts`): how to load just that plugin with each package manager + where the config goes.
5. A first-class CLI usage guide (how to drive the `mcpv`/`@mcp-vertex/core` CLI) as a dedicated, navigable page.
6. The extension should be able to surface the documentation/API (open the docs site / show how to use the project) from inside the IDE, reusing the same canonical content.
7. A shared text/strings layer so web and `packages/ui-extension` stop duplicating UI copy and brand strings.

Architecture: SOLID + DRY. The canonical plugin catalog (S1) is the dependency-inverted single source of truth that every other slice consumes; UI components are open/closed (adding a plugin or a language adds DATA, not control flow); the shared surface lives in a host-agnostic module so the extension imports it with no web/astro dependency. Each slice ships with tests and keeps `bun run validate` green.

## Slices

- global_gate: type

### S1 — Canonical per-plugin catalog (single source of truth: purpose, category, capabilities, install) consumed by web + extension
- files: apps/web/src/data/plugin-catalog.ts
- files: apps/web/src/data/plugin-catalog.spec.ts
- gate: type
- acceptance:
  - "A single host-agnostic module exposes, per plugin slug: a 1-2 sentence purpose, a category, the contributed capability counts (tools/prompts/resources from capabilities.json), and an install descriptor — with NO mcp-vertex-only hardcoding that a third-party host couldn't reuse."
  - "Purpose text has a deterministic resolution order documented in one place (canonical entry > i18n override > first-tool description), replacing the scattered fallbacks in PluginsSection."
  - "A spec asserts every loaded plugin (the 16 under plugins/) has a canonical entry with a non-empty, plugin-specific purpose (not the generic 'Plugin: <slug>')."
- status: done
- note: "Module at apps/web/src/data/plugin-catalog.ts; spec at apps/web/tests/data/plugin-catalog.spec.ts (the apps-web vitest project only discovers tests/** and scripts/__tests__/**, not src/**). 9 specs pass; typecheck green. Exposes PLUGIN_CATALOG (16 entries), PLUGIN_SLUGS, capabilityCountFor/capabilityToolsFor (derived from capabilities.json), and resolvePluginPurpose with the documented resolution order (canonical > i18n override > first-tool > generic)."

### S2 — Plugins index: expandable per-plugin disclosure listing its tools/prompts/resources + explanation
- files: apps/web/src/components/PluginsSection.astro
- files: apps/web/src/components/PluginDisclosure.astro
- files: apps/web/src/styles/components/_plugin-disclosure.scss
- depends_on: [S1]
- gate: type
- acceptance:
  - "Each plugin card on /plugins can expand (native <details>/disclosure, keyboard-accessible) to reveal the plugin's explanation and the exact list of tools (and prompts/resources if any) it contributes, sourced from the S1 catalog."
  - "Collapsed state matches today's card; expanded state lists capabilities by name with their one-line descriptions."
  - "No raw i18n keys leak; the component reads purpose/capabilities only through the S1 catalog."
- status: done
- note: "New PluginDisclosure.astro (native <details>, keyboard-accessible) + _plugin-disclosure.scss (registered in styles.scss). PluginsSection now iterates the 16 catalog plugins (PLUGIN_SLUGS) and reads purpose/tools only via the S1 catalog. Collapsed = former card look; expanded lists each contributed tool by name + description. Scope note: the grid now shows the 16 real loadable plugins (the core/cli/client/ui-extension packages, which are not plugins, are no longer listed here). astro build green (1719 pages); stylelint green."

### S3 — Distinct, representative plugin icons across web cards and the extension tool tree
- files: apps/web/public/logos/
- files: extensions/vscode/src/host/plugin-icons.ts
- files: extensions/vscode/src/test/plugin-icons.spec.ts
- depends_on: [S1]
- gate: type
- acceptance:
  - "Every one of the 16 plugins has a distinct SVG that visually represents what it does (no two plugins share a glyph; none fall back to text in the extension tool tree)."
  - "The extension resolves a plugin/tool icon for every namespace via a single mapping module; a spec asserts there is no missing or duplicated icon for the shipped plugin set."
  - "Web cards and the extension use the same canonical icon identity per plugin (one source of truth for which glyph means which plugin)."
- status: done
- note: "New extensions/vscode/src/host/plugin-icons.ts is the single source mapping all 16 plugins to DISTINCT, semantically representative codicon ids (+ a real default for non-plugin namespaces, so the tree never falls back to text). Wired through tool-tree-node.ts (serverNode/pluginNode/toolNode set iconId) and the generic getTreeItem adapter (iconId → vscode.ThemeIcon). plugin-icons.spec.ts asserts completeness + distinctness (6 specs). Extension tests (72) + typecheck + biome green. The web /logos/plugin-<slug>.svg set (16, all present + distinct) carries the same per-plugin identity; physically sharing the slug/identity list across web+extension is deferred to S7's shared layer."

### S4 — Per-plugin install instructions in the same matrix shape as the core install
- files: apps/web/src/data/plugin-install.ts
- files: apps/web/src/data/plugin-install.spec.ts
- files: apps/web/src/components/PluginInstall.astro
- depends_on: [S1]
- gate: type
- acceptance:
  - "For each plugin, the page shows how to load just that plugin (e.g. --plugins=<slug>) across the same package managers/IDEs as install.ts, in the same order and visual structure."
  - "The install snippets are derived from the canonical PACKAGE/SERVER_NAME constants in install.ts (no duplicated package name literals)."
  - "A spec asserts every plugin has a valid install descriptor and that the package-manager set matches install.ts."
- status: done
- note: "New plugin-install.ts DERIVES per-plugin run commands (`--plugins=<slug>`) from the canonical packageManagers/ideTargets matrix + PACKAGE/SERVER_NAME (no duplicated literals). New PluginInstall.astro renders them in the same order/structure as the core install; wired into PluginPage.astro's install tab, replacing the previous hardcoded+inaccurate `bun add <pkg>` snippet. plugin-install.spec (4) asserts every plugin's PM set matches install.ts and every command loads exactly that plugin. typecheck + astro build (1719 pages) green."

### S5 — First-class CLI usage guide page
- files: apps/web/src/pages/cli.astro
- files: apps/web/src/pages/[lang]/cli.astro
- files: apps/web/src/data/cli-guide.ts
- files: apps/web/src/data/cli-guide.spec.ts
- gate: type
- acceptance:
  - "A dedicated, navigable CLI guide page documents the mcpv / @mcp-vertex/core CLI: the global flags, the command groups, and the common workflows, driven by a DATA module (open/closed: adding a command is a data entry)."
  - "The page is reachable from the site nav and exists for every supported language route like the other pages."
  - "A spec asserts the CLI guide data covers the documented command groups and has no empty sections."
- status: pending

### S6 — Surface docs/API from inside the extension (reuse canonical content)
- files: extensions/vscode/src/commands/open-docs-api.ts
- files: extensions/vscode/src/test/open-docs-api.spec.ts
- depends_on: [S1]
- gate: type
- acceptance:
  - "A VS Code command lets the user open the documentation / how-to-use surface (the docs site and/or an in-IDE panel) from the extension, reusing the canonical plugin catalog / CLI guide content rather than re-authoring it."
  - "The command is registered through the existing runtime-handle/track() seam so it is disposed on deactivate."
  - "A spec asserts the command is registered and resolves a non-empty docs target."
- status: pending

### S7 — Shared text/strings layer so web and packages/ui-extension stop duplicating UI copy
- files: packages/ui-extension/src/strings/shared-ui-strings.ts
- files: packages/ui-extension/src/strings/shared-ui-strings.spec.ts
- gate: type
- acceptance:
  - "Brand/UI copy used by BOTH the web and the extension shell lives in one host-agnostic module (pure TS, no astro/web or vscode imports) and is consumed by both."
  - "A spec asserts the shared strings module has no host-specific import and exposes the keys both surfaces need."
  - "At least the duplicated brand/tagline/nav strings identified between apps/web and packages/ui-extension are de-duplicated through this module."
- status: pending
