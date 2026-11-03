---
id: f00803
title: "The presets are packs of today's plugins, by purpose"
kind: feat
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-02
---

# f00803 — The presets are packs of today's plugins, by purpose

## goal

Replace the nine presets, made before most plugins existed, with packs by purpose (minimal, solo, team-pr, swarm, audit, docs-web, everything, dogfood) whose members, dependencies and measured token cost are checked, with a migration for existing configurations and a lighter init default.

## why

The presets were written when a third of today's plugins did not exist. The owner asked for them to be redone; this is the analysis and the plan.

### Analysis (measured 2026-11-03 from preset-metadata.generated.ts and TOKEN-BUDGETS.md, measuredAt 2026-11-01)

Sources: packages/core/src/lib/plugins/preset-catalog.ts (PRESET_KIND, PRESET_SEEDS), contracts/constants/preset-roles.constant.ts, contracts/constants/preset-metadata.generated.ts, packages/core/src/lib/plugins/pack-defaults-overlay.ts, packages/cli/src/lib/init/init-answers.schema.ts and init-prompts.service.ts, docs/delendai/TOKEN-BUDGETS.md. Cost = native tools/list bytes (tokens ~ bytes/4); the managed runtime surface is 7 tools / 1,584 tokens for every preset, so native is the comparable baseline.

#### 1. Presets (9) and resolved size

| Preset | Role | Plugins | Tools | Native bytes | Cold-start tokens | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| minimal | orientation | 2 (git, search) | 42 | 47,122 schema | 11,781 | chain root |
| lean | habitual-work | 4 (+memory, docs) | 55 | 55,494 | 13,874 | independent |
| standard | adaptive-task-aware | 18 | 113 | 104,828 | 26,207 | over warning (132,000 B list, 9,500 B max plugin) |
| swarm | multi-agent | 26 | 154 | 127,895 | 31,974 | progressiveDisclosure |
| full | diagnostic | 38 | 185 | 152,644 | 38,161 | progressiveDisclosure |
| dogfood | delendai-dogfood | 37 | 237 | 263,363 | 65,841 | independent; over warning 320,000 B |
| web-app | stack-pack-web | 17 | 103 | 90,620 | 22,655 | independent |
| backend-api | stack-pack-backend | 16 | 102 | 89,221 | 22,306 | independent |
| cli-tool | stack-pack-cli | 7 | 62 | 62,715 | 15,679 | independent |

The 31 core tools cost 49,656 B in every preset: 86% of minimal, 15% of dogfood. Plugins add only 7.8 KB to minimal.

#### 2. Plugin inventory (60 directories) with native cost where the dashboard measures it

Tools / tools-list bytes (from the marginal dashboard); "-" = not measured (no tools registered through the dashboard, or private).

| Plugin | Role | Depends on (plugins) | Env / network / forge | Tools | Bytes | In presets |
| --- | --- | --- | --- | --- | --- | --- |
| git | read-only git orientation | forge (declared) | none | 8 | 4,611 | minimal, lean, dogfood, 3 stacks |
| search | workspace text search | state | none | 3 | 3,233 | every preset |
| memory | project notes | - | none | 9 | 8,202 | lean up |
| docs | catalogue/read repo markdown | - | none | 4 | 2,949 | lean up |
| i18n | locale key hygiene | - | none | 2 | 2,577 | standard up |
| rules | lint/type presets | - | none | 3 | 5,634 | standard up |
| quality | validation gate runner | - | runs project commands | 6 | 3,627 | standard up |
| refactor | AST navigation/rename | - | none | 6 | 6,270 | standard up |
| deps | dependency inventory | - | offline | 5 | 5,261 | standard up |
| test-policy | tdd/free/none policy | - | none | 2 | 1,861 | standard up |
| database | DB introspection/query | - | DATABASE_URL | 5 | 3,927 | standard up |
| container | docker/kubectl inspection | - | docker/kubectl on PATH | 11 | 8,663 | standard up |
| diagram | mermaid dependency graph | database, proposals | none | 4 | 3,277 | standard up |
| env | env file validation | - | none | 2 | 3,480 | standard up |
| skills-pack | bundled skills | - | none | 0 | 0 | standard up |
| prompts-pack | six MCP prompts | - | none | 0 | 0 | standard up |
| error-reporting | auto-report delendai errors to GitHub | commit-policy | network (GitHub) | 2 | 1,403 | standard up |
| auto-agent-selector | discover reachable LLMs/agents | - | CLIs on PATH, API keys | 5 | 6,881 | standard up |
| agent-orchestrator | linear/delegated workflow policy | context-compiler, state, context-for-change | none | 5 | 10,998 | standard, swarm, full, dogfood (listed 4 times) |
| proposals | proposal state machine | state, proposals-sqlite, error-reporting, logs, quality, agent-orchestrator | CI/GITHUB env | 50 (4 with progressive disclosure) | 79,943 (5,026) | swarm up |
| notification | lock-release push | - | none | 2 | 1,872 | swarm up |
| completion | task-done notifier | state | none | 3 | 2,431 | swarm up |
| logs | redacted event log | - | none | 9 | 7,303 | swarm up |
| status-marker | mandatory close marker | - | none | 3 | 2,043 | swarm, web-app, dogfood |
| test-convention | test rules | - | none | 3 | 3,232 | swarm up, web-app, backend-api |
| conventions | file-convention profile | - | none | 5 | 5,164 | swarm up |
| forge | GitHub/GitLab PRs, comments, CI via gh/glab | - | forge CLI, authenticated, network | 11 | 4,710 | swarm, full, dogfood |
| web-fetch | allow-listed URL fetch | - | network | 1 | 928 | full, web-app |
| issues | GitHub issue ingest/promote | - | GITHUB_TOKEN, network | 1 (10 files) | 822 | full |
| api | OpenAPI requests, mocks | web-fetch | network | 3 | 3,832 | full |
| github | GitHub read-only provider | contracts, remote-provider-core | network, token | 0 | 0 | full |
| gitlab | GitLab read-only provider | contracts, remote-provider-core | network, token | 0 | 0 | full |
| remote-provider-core | shared provider foundation | contracts | network client | 0 | 0 | full |
| prompt-eval | benchmark prompts across providers | auto-agent-selector, orchestrator-runner | spends provider quota | 2 | 2,514 | full |
| audit-orchestrator | implement audit plans | agent-orchestrator | none | 2 | 1,660 | full |
| browser | Playwright inspection | - | Playwright, local browser | 8 | 5,945 | full |
| cache | cache eviction rules | - | none | 2 | 2,057 | full |
| external-mcps | compose third-party MCP servers | conventions, framework-knowledge, style-convention | spawns external servers | 8 | 9,394 | full |
| observability | Sentry/Datadog reads | web-fetch | SENTRY_AUTH_TOKEN, DATADOG_API_KEY, network | 5 | 5,734 | full |
| adaptive-optimizer | candidate scoring | auto-agent-selector, auto-plugin-selector, perf, prompt-eval, proposals, usage-tracking | none | 3 | 7,739 | dogfood only |
| audit | multi-model audit plan/consolidate/run | deps, security | provider network on audit_run | 5 | 11,568 | dogfood only |
| auto-plugin-selector | recommend plugin set | auto-agent-selector | none | 1 | 3,726 | dogfood only |
| commit-policy | commit identity, cadence, audit trail | - | git identity env | 8 | 11,615 | dogfood only |
| context-for-change | task-oriented context | conventions, docs, git, memory, refactor, search, test-policy | none | 1 | 1,034 | dogfood only |
| impact-analysis | impact and test selection | git, refactor, search, test-policy | none | 2 | 1,904 | dogfood only |
| link-check | markdown link integrity | - | none | 1 | 1,722 | dogfood only |
| orchestrator-runner | route a task to a provider | contracts, state, execution-env | provider CLIs, spends quota | 13 | 36,062 | dogfood only |
| perf | bundle budgets | - | none | 3 | 3,668 | dogfood, cli-tool |
| project-health | health aggregator | deps, quality, security, tech-debt | none | 1 | 1,373 | dogfood only |
| project-kpis | KPI snapshots | project-health, usage-tracking | none | 1 | 4,093 | dogfood only |
| quality-policy | unified quality surface | conventions, quality, rules, test-convention, test-policy | none | 2 | 1,101 | dogfood only |
| security | secrets/dependency/static scan | contracts, deps, web-fetch | network for advisories | 4 | 5,697 | dogfood only |
| tech-debt | debt marker scan | - | none | 1 | 1,778 | dogfood only |
| usage-tracking | tool usage log | contracts, state | none | 3 | 1,870 | dogfood only |
| execution-env | local/docker/remote command envs | - | docker | - | - | NO PRESET (dependency of orchestrator-runner) |
| framework-knowledge | installed framework version facts | - | none | - | - | NO PRESET (dependency of external-mcps) |
| style-convention | selector/style ownership | - | none | - | - | NO PRESET (dependency of external-mcps) |
| self-learning | opt-in per-project learning store | - | none | - | - | NO PRESET |
| changelog | semver/changelog from commits | - | private | - | - | NO PRESET (deliberate, private) |
| roadmap | versioned roadmap | changelog, state | private | - | - | NO PRESET (private) |
| issues-triage | internal triage bot | proposals | private, GitHub | - | - | NO PRESET (private) |

#### 3. Findings

1. Plugins no preset includes: execution-env, framework-knowledge, style-convention, self-learning (public, loadable) plus changelog, roadmap, issues-triage (private, deliberately excluded). Three of the four public ones are dependencies of plugins that presets do include (execution-env of orchestrator-runner, framework-knowledge and style-convention of external-mcps), so a preset containing the parent does not resolve its dependency chain. No preset names a plugin that does not exist (checked: every member id resolves to plugins/<id>).
2. The chain is no longer a chain. full does not contain dogfood and dogfood does not contain full. Only in dogfood: adaptive-optimizer, audit, auto-plugin-selector, commit-policy, context-for-change, impact-analysis, link-check, orchestrator-runner, perf, project-health, project-kpis, quality-policy, security, tech-debt, usage-tracking. Only in full: api, audit-orchestrator, browser, cache, database, external-mcps, github, gitlab, issues, observability, prompt-eval, prompts-pack, refactor, remote-provider-core, skills-pack, web-fetch. So `full` ("diagnostic") has no security, audit, commit-policy, perf or project-health, yet carries 8 network or credential plugins.
3. Wrong default. `init` (init-answers.schema.ts `preset: z.enum(PRESET_KIND).default('dogfood')`) installs dogfood: 37 plugins, 237 tools, 263,363 B, 65,841 cold-start tokens, over its warning ceiling, including proposals with 50 tools (79,943 B), orchestrator-runner (13 tools, 36,062 B, spends provider quota) and commit-policy. The interactive prompt marks swarm "(recommended)" and dogfood "(recommended for your own projects)" at the same time, and the full label still reads "swarm + web-fetch + issues" while full now has 38 plugins. docs/delendai/CROSS-PROJECT-SETUP.md says the same stale thing.
4. Cost no longer matches purpose. minimal "orientation" costs 11,781 tokens of which 86% is core, so the preset ladder differs by plugin cost only marginally at the low end. lean (habitual work) has no quality gate or rules. standard ("adaptive-task-aware") is the only preset over the list warning and carries database and container (19 tools) for projects with neither, and 3 agent-routing plugins for single-agent use. swarm has no commit-policy, security or usage-tracking, but includes 8 convention plugins. cli-tool omits quality, rules and refactor while including perf. web-app lists status-marker and test-convention that backend-api lacks.
5. Overlaps and duplicates: agent-orchestrator is declared in standard, swarm, full and dogfood deltas (harmless through dedupe, but noise that hides which preset owns it). The three stack packs share 13 of 16-17 members with standard; they differ only in the overlay options in pack-defaults-overlay.ts (search weights, quality topActions, env strict). dogfood is a project-specific snapshot (preset-drift compares it with the repo's delendai.config.json) yet is the init default for strangers. Aliases: only `vertex` maps to `dogfood`.
6. Unmeasured surfaces: github, gitlab, remote-provider-core, skills-pack, prompts-pack and execution-env show 0 tools in the dashboard; their cost is prompts/skills/config, not tools, so the budget model underreports what a pack costs to a host.
7. Persistence: init renders the preset expanded into the `plugins` map of delendai.config.json (init-render.service.ts via resolvePresetMembers); the preset id is not stored there. The id survives only in `--preset` serve arguments (.mcp.json / mcp.json launch args), in docs, and in adoption-assessment results. Existing configs therefore keep working verbatim if a preset id is renamed; the migration risk is the launch arguments and scripts that pass `--preset=<id>`, and users who rely on a preset to grow with the catalog (they do not: the map is frozen at init).

#### 4. Proposed packs by purpose

Costs are summed from the marginal dashboard (31 core tools / 49,656 B + plugin bytes, proposals counted with progressive disclosure at 5,026 B). They must be regenerated by preset-metadata.script.ts when the packs land; treat as estimates.

| Pack | For whom | Plugins | Tools | Native bytes | ~Tokens |
| --- | --- | --- | --- | --- | --- |
| minimal | try-out, read-only orientation, tiny context | git, search | 42 | 57,500 | 14.4k |
| solo | one developer, one agent, day-to-day coding (the init default) | git, search, memory, docs, quality, rules, deps, test-policy, env, refactor | 79 | 94,784 | 23.7k |
| team-pr | a team on pull requests with commit and test conventions | solo + forge, commit-policy, conventions, test-convention, security, status-marker, error-reporting | 115 | 128,648 | 32.2k |
| swarm | several agents sharing a checkout | git, search, memory, docs, quality, test-policy, proposals, agent-orchestrator, auto-agent-selector, notification, completion, logs, status-marker, forge, commit-policy, conventions, test-convention, usage-tracking | 124 | 137,284 | 34.3k |
| audit | read-only review and audit runs | git, search, docs, audit, security, deps, tech-debt, link-check, project-health, impact-analysis, quality, test-policy, logs | 82 | 102,543 | 25.6k |
| docs-web | documentation and web sites | git, search, memory, docs, i18n, link-check, diagram, web-fetch, env | 65 | 80,635 | 20.2k |
| everything (renamed full) | diagnostics, all published plugins | every public plugin (adds execution-env, framework-knowledge, style-convention, self-learning) | measured at S1 | measured at S1 | measured at S1 |
| dogfood | delendai's own repo only | snapshot of delendai.config.json; hidden from init choices unless the repo has that config | 237 | 263,363 | 65.8k |

Stack packs (web-app, backend-api, cli-tool) become overlays: a purpose pack plus a stack tag (container+database for backend-api, i18n+web-fetch for web-app, perf for cli-tool) with the existing option overlays, instead of three more independent member lists.

Rules for the new catalog: every pack lists the dependencies of each member (a lint resolves declared plugin dependencies and fails on a missing one); no network or credential plugin (api, issues, observability, github, gitlab, browser, external-mcps, prompt-eval) in any pack but everything and explicit extras; provider-spending plugins (orchestrator-runner, prompt-eval, adaptive-optimizer) only by explicit extra; each pack declares a token ceiling checked by the existing budget gate; preset-drift keeps checking dogfood against delendai.config.json.

#### 5. Migration (every layout change ships its migration)

- Existing delendai.config.json: no rewrite needed for the plugin map; the preset id is not stored. A start-up migration records `preset` provenance only if absent, journalled, and never edits a plugin map the user changed.
- Launch arguments: `--preset=minimal|lean|standard|swarm|full|dogfood|web-app|backend-api|cli-tool` keep resolving through the same alias table that already maps `vertex` to `dogfood`: lean -> solo, standard -> solo plus the old standard extras reported as a notice, full -> everything, stack packs -> purpose pack plus stack overlay. Each alias hit prints the deprecation line already used for vertex and names the exact replacement.
- Doctor: a check lists configs whose plugin map equals a retired preset's old membership and says which new pack matches, without changing anything.
- init: default changes from dogfood to solo (non-interactive `--yes` and the prompt); the prompt labels and init-default help text are generated from the catalog instead of hand-written; `init:default` for a repo that has delendai.config.json keeps offering dogfood.
- Docs, web /es/presets table, TOKEN-BUDGETS.md, preset-metadata.generated.ts, managed-lazy-catalog.generated.ts and the generated agent files are regenerated (gen:all, tokens:dashboard:generate, preset-metadata.script.ts).

#### Risks

Removing presets breaks scripts that pass the old ids; the alias window and notice cover it. Changing the init default changes what new adopters get, which is the intent but needs the owner's confirmation. The new costs above are sums, not measurements, until S1 regenerates metadata.

## non-goals

- Changing what any plugin does or how its tools are described.
- Removing or unpublishing plugins.
- Changing this repository's own `dogfood` configuration, which stays as declared.
- Touching private plugins (changelog, roadmap, issues-triage).

## slices

- global_gate: none

### S1 — The new catalogue
- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/preset-catalog.ts`, `packages/core/src/lib/contracts/constants/preset-roles.constant.ts`, `packages/core/src/lib/plugins/pack-defaults-overlay.ts`, `packages/core/src/lib/contracts/constants/preset-metadata.generated.ts`, `packages/core/tests/src/lib/plugins/preset-catalog.spec.ts`
- **Gate**: none
- acceptance:
  - "PRESET_KIND lists minimal, solo, team-pr, swarm, audit, docs-web, everything and dogfood, each with a role and a purpose"
  - "every pack member's declared plugin dependencies are in the pack (lint fails otherwise)"
  - "preset-metadata.generated.ts is regenerated and every pack's measured cost is written into the proposal notes or docs"
  - "the stack packs are overlays on a purpose pack"

### S2 — Migration of existing configurations
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/plugins/preset-migration.ts`, `packages/core/tests/src/lib/plugins/preset-migration.spec.ts`
- **Gate**: none
- acceptance:
  - "each retired preset id resolves to its replacement with a deprecation notice naming it (alias table in the catalogue from S1, resolution and notice in preset-migration.ts)"
  - "a start-up migration is journalled and never edits a plugin map the user changed"
  - "doctor reports configs whose plugin map equals a retired preset and names the matching pack"

### S3 — init default and docs
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/cli/src/lib/init/init-answers.schema.ts`, `packages/cli/src/lib/init/init-prompts.service.ts`, `packages/cli/src/lib/init/init-default-help.service.ts`, `docs/delendai/CROSS-PROJECT-SETUP.md`, `docs/delendai/TOKEN-BUDGETS.md`
- **Gate**: none
- acceptance:
  - "init defaults to solo and its prompt labels are generated from the catalog"
  - "docs and the web presets table match the new catalogue"

## acceptance

- PRESET_KIND lists minimal, solo, team-pr, swarm, audit, docs-web, everything and dogfood, each with a role and a purpose
- every pack member's declared plugin dependencies are in the pack (lint fails otherwise)
- preset-metadata.generated.ts is regenerated and every pack's measured cost is written into the proposal notes or docs
- the stack packs are overlays on a purpose pack
- each retired preset id resolves to its replacement with a deprecation notice naming it (alias table in the catalogue from S1, resolution and notice in preset-migration.ts)
- a start-up migration is journalled and never edits a plugin map the user changed
- doctor reports configs whose plugin map equals a retired preset and names the matching pack
- init defaults to solo and its prompt labels are generated from the catalog
- docs and the web presets table match the new catalogue
