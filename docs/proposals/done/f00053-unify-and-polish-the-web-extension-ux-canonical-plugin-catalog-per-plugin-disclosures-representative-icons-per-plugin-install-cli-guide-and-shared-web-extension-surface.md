---
id: f00053
status: done
type: proposal
kind: feat
title: Unify and polish the web + extension UX — canonical plugin catalog, per-plugin disclosures, representative icons, per-plugin install, CLI guide, and shared web↔extension surface
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

## why

The two surfaces mcp-vertex ships — the docs site and the IDE extension —
each re-author the same copy (plugin descriptions, brand strings, install
commands) and present it inconsistently: plugin descriptions fall back
through three different code paths, the /plugins index only links away
instead of showing what a plugin contains, several plugins share or lack a
representative icon in the extension tree, the per-plugin install snippet was
hardcoded and inaccurate, there was no CLI guide at all, and the extension
could not surface the docs/API from inside the IDE. The result is harder to
understand than it should be and costly to keep in sync. This proposal makes
the per-plugin metadata, the brand copy, and the icon identity each have ONE
source of truth that both surfaces consume, and fills the missing docs (CLI
guide, in-IDE docs/API), so the project reads coherently everywhere without
writing anything twice.

## non-goals

- No redesign of the overall site layout or the extension dashboard beyond
  the plugin/UX surfaces named above.
- No new runtime dependency on a translation service; localized copy stays in
  the existing i18n files, the canonical catalog provides the English base.
- No move of the shared strings into a brand-new package; the host-agnostic
  `packages/ui-extension` is reused as the shared home.
- No change to the MCP tool surface, the server, or any plugin's behaviour —
  this is documentation, UI, and shared-data work only.

## Slices

- global_gate: type

### S1 — Canonical per-plugin catalog (single source of truth: purpose, category, capabilities, install) consumed by web + extension
- **Files**: apps/web/src/data/plugin-catalog.ts
- **Files**: apps/web/src/data/plugin-catalog.spec.ts
- **Gate**: type
- acceptance:
  - "A single host-agnostic module exposes, per plugin slug: a 1-2 sentence purpose, a category, the contributed capability counts (tools/prompts/resources from capabilities.json), and an install descriptor — with NO mcp-vertex-only hardcoding that a third-party host couldn't reuse."
  - "Purpose text has a deterministic resolution order documented in one place (canonical entry > i18n override > first-tool description), replacing the scattered fallbacks in PluginsSection."
  - "A spec asserts every loaded plugin (the 16 under plugins/) has a canonical entry with a non-empty, plugin-specific purpose (not the generic 'Plugin: <slug>')."
- **Status**: done
- note: "Module at apps/web/src/data/plugin-catalog.ts; spec at apps/web/tests/data/plugin-catalog.spec.ts (the apps-web vitest project only discovers tests/** and scripts/__tests__/**, not src/**). 9 specs pass; typecheck green. Exposes PLUGIN_CATALOG (16 entries), PLUGIN_SLUGS, capabilityCountFor/capabilityToolsFor (derived from capabilities.json), and resolvePluginPurpose with the documented resolution order (canonical > i18n override > first-tool > generic)."

### S2 — Plugins index: expandable per-plugin disclosure listing its tools/prompts/resources + explanation
- **Files**: apps/web/src/components/PluginsSection.astro
- **Files**: apps/web/src/components/PluginDisclosure.astro
- **Files**: apps/web/src/styles/components/_plugin-disclosure.scss
- **DependsOn**: [S1]
- **Gate**: type
- acceptance:
  - "Each plugin card on /plugins can expand (native <details>/disclosure, keyboard-accessible) to reveal the plugin's explanation and the exact list of tools (and prompts/resources if any) it contributes, sourced from the S1 catalog."
  - "Collapsed state matches today's card; expanded state lists capabilities by name with their one-line descriptions."
  - "No raw i18n keys leak; the component reads purpose/capabilities only through the S1 catalog."
- **Status**: done
- note: "New PluginDisclosure.astro (native <details>, keyboard-accessible) + _plugin-disclosure.scss (registered in styles.scss). PluginsSection now iterates the 16 catalog plugins (PLUGIN_SLUGS) and reads purpose/tools only via the S1 catalog. Collapsed = former card look; expanded lists each contributed tool by name + description. Scope note: the grid now shows the 16 real loadable plugins (the core/cli/client/ui-extension packages, which are not plugins, are no longer listed here). astro build green (1719 pages); stylelint green."

### S3 — Distinct, representative plugin icons across web cards and the extension tool tree
- **Files**: apps/web/public/logos/
- **Files**: extensions/vscode/src/host/plugin-icons.ts
- **Files**: extensions/vscode/src/test/plugin-icons.spec.ts
- **DependsOn**: [S1]
- **Gate**: type
- acceptance:
  - "Every one of the 16 plugins has a distinct SVG that visually represents what it does (no two plugins share a glyph; none fall back to text in the extension tool tree)."
  - "The extension resolves a plugin/tool icon for every namespace via a single mapping module; a spec asserts there is no missing or duplicated icon for the shipped plugin set."
  - "Web cards and the extension use the same canonical icon identity per plugin (one source of truth for which glyph means which plugin)."
- **Status**: done
- note: "New extensions/vscode/src/host/plugin-icons.ts is the single source mapping all 16 plugins to DISTINCT, semantically representative codicon ids (+ a real default for non-plugin namespaces, so the tree never falls back to text). Wired through tool-tree-node.ts (serverNode/pluginNode/toolNode set iconId) and the generic getTreeItem adapter (iconId → vscode.ThemeIcon). plugin-icons.spec.ts asserts completeness + distinctness (6 specs). Extension tests (72) + typecheck + biome green. The web /logos/plugin-<slug>.svg set (16, all present + distinct) carries the same per-plugin identity; physically sharing the slug/identity list across web+extension is deferred to S7's shared layer."

### S4 — Per-plugin install instructions in the same matrix shape as the core install
- **Files**: apps/web/src/data/plugin-install.ts
- **Files**: apps/web/src/data/plugin-install.spec.ts
- **Files**: apps/web/src/components/PluginInstall.astro
- **DependsOn**: [S1]
- **Gate**: type
- acceptance:
  - "For each plugin, the page shows how to load just that plugin (e.g. --plugins=<slug>) across the same package managers/IDEs as install.ts, in the same order and visual structure."
  - "The install snippets are derived from the canonical PACKAGE/SERVER_NAME constants in install.ts (no duplicated package name literals)."
  - "A spec asserts every plugin has a valid install descriptor and that the package-manager set matches install.ts."
- **Status**: done
- note: "New plugin-install.ts DERIVES per-plugin run commands (`--plugins=<slug>`) from the canonical packageManagers/ideTargets matrix + PACKAGE/SERVER_NAME (no duplicated literals). New PluginInstall.astro renders them in the same order/structure as the core install; wired into PluginPage.astro's install tab, replacing the previous hardcoded+inaccurate `bun add <pkg>` snippet. plugin-install.spec (4) asserts every plugin's PM set matches install.ts and every command loads exactly that plugin. typecheck + astro build (1719 pages) green."

### S5 — First-class CLI usage guide page
- **Files**: apps/web/src/pages/cli.astro
- **Files**: apps/web/src/pages/[lang]/cli.astro
- **Files**: apps/web/src/data/cli-guide.ts
- **Files**: apps/web/src/data/cli-guide.spec.ts
- **Gate**: type
- acceptance:
  - "A dedicated, navigable CLI guide page documents the mcpv / @mcp-vertex/core CLI: the global flags, the command groups, and the common workflows, driven by a DATA module (open/closed: adding a command is a data entry)."
  - "The page is reachable from the site nav and exists for every supported language route like the other pages."
  - "A spec asserts the CLI guide data covers the documented command groups and has no empty sections."
- **Status**: done
- note: "New cli-guide.ts DATA module (global flags, command groups, workflows); plugin command groups DERIVED from the S1 catalog (DRY). New /cli.astro + /[lang]/cli.astro (data-driven; +12 pages). Reachable from SiteNav via a literal 'CLI' nav entry (same pattern as the existing 'API' entry — no i18n churn). cli-guide.spec (5) asserts every plugin + core + doctor has a command group and no empty sections. typecheck, check:i18n, astro build (1731 pages) green."

### S6 — Surface docs/API from inside the extension (reuse canonical content)
- **Files**: extensions/vscode/src/commands/open-docs-api.ts
- **Files**: extensions/vscode/src/test/open-docs-api.spec.ts
- **DependsOn**: [S1]
- **Gate**: type
- acceptance:
  - "A VS Code command lets the user open the documentation / how-to-use surface (the docs site and/or an in-IDE panel) from the extension, reusing the canonical plugin catalog / CLI guide content rather than re-authoring it."
  - "The command is registered through the existing runtime-handle/track() seam so it is disposed on deactivate."
  - "A spec asserts the command is registered and resolves a non-empty docs target."
- **Status**: done
- note: "New mcp-vertex.openDocsApi command (open-docs-api.ts): a quick-pick of the canonical doc destinations (Guide, the S5 CLI guide, the S2 Plugins index, Tools, API) that opens the chosen one in a webview, reusing EmbedService validation like openDocs — content deep-links into the canonical pages, not re-authored. Registered through the track() seam in extension.ts (disposed on deactivate) and declared in package.json. open-docs-api.spec (7) asserts registration + non-empty validated targets + deep-linking; smoke command count bumped 17→18. Extension tests (78), typecheck, biome green."

### S7 — Shared text/strings layer so web and packages/ui-extension stop duplicating UI copy
- **Files**: packages/ui-extension/src/strings/shared-ui-strings.ts
- **Files**: packages/ui-extension/src/strings/shared-ui-strings.spec.ts
- **Gate**: type
- acceptance:
  - "Brand/UI copy used by BOTH the web and the extension shell lives in one host-agnostic module (pure TS, no astro/web or vscode imports) and is consumed by both."
  - "A spec asserts the shared strings module has no host-specific import and exposes the keys both surfaces need."
  - "At least the duplicated brand/tagline/nav strings identified between apps/web and packages/ui-extension are de-duplicated through this module."
- **Status**: done
- note: "New packages/ui-extension/src/strings/shared-ui-strings.ts holds the brand/UI copy (productName, brandName, serverName, taglines, repoUrl, docsUrl + BRAND_TOKENS), exported from the public barrel so both surfaces consume it (apps/web imports @mcp-vertex/ui-extension/public; the extension already does). shared-ui-strings.spec (2) enforces the PURITY contract (zero imports — no vscode/astro/web-alias/node) + key presence. Concrete de-dup: the extension's openDocsApi docs URL now derives from SHARED_UI_STRINGS.docsUrl. Follow-up: migrate apps/web's i18n brand literals to consume it (needs adding the ui-extension dep to apps/web). typecheck + 179 ui-extension/extension tests green."

## acceptance

- `bun run validate` is green after every slice (typecheck, lint, scss, i18n, tests).
- The per-plugin metadata, the brand copy, and the icon identity each have ONE source of truth consumed by both the web and the extension.
- The /plugins index, the per-plugin install, the CLI guide page, and the in-IDE docs/API command are all live and tested.
