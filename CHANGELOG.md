# Changelog

All notable changes to `@delendai/core` and its published packages are
documented here. The publishable packages are versioned **in lockstep**: every
promotion from `develop` to `main` is a release, prepared with
`bun run release:prepare --write` from the proposals that reached `done` or
`review` since the last one, and `release-pr-gate` refuses a promotion without
it. Publishing to npm is a separate act: pushing the `vX.Y.Z` tag runs
`release.yml`. While the product is new a release is a minor unless it carries
only fixes, then a patch. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-10-22

### Added

- AUD-CP-012/§54 — Idempotency keys para commits automáticos (f00267)
- `detail: compact | normal | full` transversal (f00271)
- `delendai doctor --deep/--ci/--offline` cubriendo los modos de fallo de la auditoría (f00275)
- Hide LLM attribution from GitHub surface (no co-authors, no AI brands, only CartagoGit) (f00500)
- F1 — Work Event Bus: stream append-only de eventos (sin await, sin LLM) con observadores git / test / tool / agent-lease (f00509)
- F3 — ETA Engine: cálculo puramente estadístico (mediana + p80, sin ML) sobre duración histórica local, con vector de características por hash canónico (f00511)
- F4 — UI Surfaces: delendai work status [--watch], delendai work agents, item de barra de estado en la extensión VS Code y vista intrínseca host-emitted en el chat del agente (f00512)
- Context frugality as an enforced agent property, and automatic compaction of tool output (f00536)
- Forward-sync the release branch back into the integration branch after every promotion (f00538)
- Execution environments: local, Docker, Docker Compose, SSH, Docker Exec (f00541)
- Docker plugin as a tool (autodetected, low-risk) (f00543)
- Resolve what the installed framework version allows, recommends and forbids before an agent writes code (f00547)
- Own the style surface: who may define a selector, and what breaks when it changes (f00548)
- Put the project's contract between an agent and every external capability (f00550)
- The startup forge and journal phases run in a real host (f00643)
- Roadmap versionado que fija el bump por entradas con gates, con timeline SQLite y promocion configurable (f00756)
- Token and coordination cost cut where the 2026-10-07 audit measured it (f00757)
- Identity policy: declare how agents are named in delendai.config.json (f00758)
- one answer to which machine this is, and where its editors keep their files (f00759)
- agents are written once in a host-neutral form, for the hosts this project uses, chosen or detected (f00760)
- a plugin can be written in any language: a published manifest schema, and an MCP server as the runtime (f00761)
- every plugin says whether it can work here, and a doctor proves it without side effects (f00762)
- a delegated task carries only the context it needs, and hands back a receipt, not its transcript (f00763)
- A person's accounts live outside the repository, in a personal layer (f00765)
- One discovery that knows whether an account can work (f00766)
- What an account has left is observed, not assumed (f00767)
- One record of how each model did, and one ranking that reads it (f00768)
- A plan's quota is read from the vendor's own tool before the first hop (f00773)
- A delegated hop carries only the tools its task may use (f00774)
- The accounts a machine's clients are logged in with are offered once (f00775)
- Token ROI measured and model-agnostic: every tool's value is demonstrated with data that does not need to know the model (f00776)
- Identity without a catalogue: who is working is supplied and validated, never guessed from a growing list of model names (f00777)
- The workflow was available and was not used: an agent that writes into the shared checkout instead of its unit is not caught until the commit (f00778)
- One command sets up a person's accounts, with nothing edited by hand (f00779)
- Every plugin ships the skills for its tools, and every host gets them installed (f00780)
- Accounts are found wherever the person has them, and no vendor or model needs to be known in advance (f00781)
- The offer of accounts speaks the person's language, reads like a guide, and names any model from the public catalogue (f00782)
- Batuta learns any AI client: catalogues in layers, clients declared or detected from PATH, IDEs and installs, a usage page per client, and a tool that onboards a new one (f00783)
- Batuta runs its hops on any ACP agent and any catalogue provider: an acp kind, an invoker over the ACP driver, and a roster fed by what is detected (f00784)
- A hop on another vendor carries the delegated task, not a free prompt, under the target model's own budget (f00786)
- Every promotion to main is a versioned release: its version and changelog are prepared on develop, and publishing waits for the owner's tag (f00787)

### Changed

- Migrar el barrel de 288 exports a los subpaths del core que ya existen (r00040)
- CAS optimistic concurrency — revision column on proposals, plans, slices (r00048)
- SQLite storage modes and canonical proposals DB wiring (r00056)

### Fixed

- Tres defectos hacian imposible proyectar este repositorio a SQLite: vocabulario sin normalizar, promocion que exige ok, y PlanRepo.create no idempotente (x00539)
- A green pull request lands itself and the swarm rebases (x00554)
- A review swarm leaves verdicts that can be checked, and loses none (x00835)
- Nothing is left beside the units (x00875)
- An upgrade leaves the project as its configuration says, and nothing else (x00877)
- A multi-model swarm is held to the workflow, whoever its agents are (x00878)
- Main carries no code scanning alert (x00879)
- What a review swarm of eleven agents got wrong, and what let it (x00880)
- What an outside audit found, verified against the code (x00881)
- Nothing is left stuck after a swarm, and one mechanism does each job (x00882)
- A delivery Git cannot name can still be closed, on the record (x00883)
- A change made in the shared checkout by mistake is said at once, and undone without losing it (x00884)
- The first boot sets a project up, a changed configuration brings it in line, and any server name works (x00885)
- What a unit leaves behind is recognised as kept or spent by one reading, everywhere (x00886)
- The model a chat provider serves reaches delendai through a channel the product owns (x00887)
- A consumer project starts clean: what its own setup does is reported for it, and what it cannot change does not degrade it (x00888)
- delendai keeps one home inside its cache directory, the cache sheds what nobody needs, and plugins load lazily unless eager is declared (x00889)
- what the part-by-part review of the project found, fixed at the root (x00890)
- a proposal's wip branch is on the forge after every commit, lives as long as the proposal, and every pull request is cut from it (x00891)
- a proposal's wip branch lives exactly while the proposal is in progress, and what it holds is integrated when it leaves (x00892)
- work a git hook starts runs against the repository it names, not the hook's worktree (x00893)
- what the 2026-10-13 outside review found, verified against develop and fixed at the root (x00894)
- a unit entered again continues its open pull request (x00895)
- a hook's git environment holds only for the hook's own worktree (x00896)
- external-mcps opens an MCP session before calling a tool (x00897)
- a proposal in progress is somebody's unit (x00898)
- the queue keeps the work branch of a proposal in progress (x00899)
- a coverage verdict needs every shard's blob (x00900)
- what the review swarms of 2026-10-14 show the workflow still lets through (x00901)
- delendai in a project that is not delendai runs that project's things (x00902)
- The status counts the units of work, not only file locks (x00903)
- A server started inside a workspace member serves the workspace, and what the old ones left goes (x00904)
- A proposal being reviewed reads in-review, not waiting for review (x00905)
- Work an agent carries in keeps the agent that made it (x00906)
- An approved proposal closes, and one that cannot is seen (x00907)
- Every publication gets its pull request, and every finished unit is published (x00908)
- What the 2026-10-17 audits confirmed: migrations, delegation and the roadmap keep their word (x00909)
- What the hardening review of 2026-10-17 found: confirmations nobody can give, copies nobody checks, and silences (x00910)
- One authority for a work ref's life, one maintainer per workspace, and never on stale code (x00911)
- Every tool page is translated from the English its tool registers (x00912)
- A lazy start imports only the plugins whose configuration it must check (x00913)
- Token budgets measure what reaches the model (x00914)
- What is repeated comes from one place (x00915)
- Every synchronous git read goes through one reader (x00916)
- Worktree GC and the CI reaper read the one rule for a work ref's life (x00917)
- A work plan states the work model it runs under (x00918)
- Agent-facing text names tools by their registered names (x00919)
- The remedy for a stray ref can be followed (x00920)
- A unit starts from the newer of the two integration tips (x00921)
- A review that could not run hands the slice back to the queue (x00922)
- An agent host never takes a chat conversation's model as its own (x00923)
- A finished unit ends while its proposal stays open for others (x00924)
- A person's accounts move once, privately, and with their bindings (x00925)
- A new unit works on a slice its proposal declares (x00926)
- A refused push names the check that refused it (x00927)
- markdown-it, the MCP SDK and vite move to their patched versions (x00928)
- A create unit does not take an id someone holds (x00929)
- Anyone can get the delendai command, and the README's install line works (x00930)
- The offer of accounts says what it is doing, answers fast, and q stops it (x00931)
- The offer shows each client live, asks only about accounts, and its questions explain themselves (x00932)
- A published package cannot declare a range whose lowest version carries a known advisory (x00933)
- An ACP agent's archive is unpacked without a shell, under a name delendai chose (x00934)

### Maintenance

- What was blocked is settled: delivered another way, or waiting for a need (c00530)
- docs/delendai/evidence leaves the repository: run artefacts belong under the cache root with the others (c00532)

### Plans and audits

q00009, q00010, q00014, q00018, q00019, q00020, q00021, q00022, q00026.

## Before 0.2.0 — written under the MCP-Vertex name

What follows was recorded before the rebrand to delendai and was never released
under a version of its own; 0.2.0 above includes it.

### Deprecated
- `@mcp-vertex/core` now re-exports `nodeDynamicImport` through a deprecated
  shim only. Import it from `@mcp-vertex/core/node` instead; the universal
  barrel re-export will be removed in the next minor release.

### Added
- **Agnostic core error collector** (`f00251`): a host-agnostic `IErrorCollector`
  engine in core, wired into the plugin context via `assembleErrorCollector`;
  `@mcp-vertex/logs` and `@mcp-vertex/issues` each register an `IErrorSink`
  adapter so errors surface in the operational log and as issues automatically.
  Skill + knowledge entries included. (13 source files, 5 test files, 167+ tests.)
- **Peer-review loop for slices** (`proposals_proposal_review`): submit a finished
  slice for review (not done yet); a *different* agent approves it (→ done) or
  requests changes with an objection (→ reworkable). Loops until a reviewer has no
  objection; reviewer ≠ implementer is enforced.
- **`notification_await_lock`**: block until a task lock is released (or timeout)
  instead of polling `agent_lock status`.
- **Tool side-effects metadata** (`IToolRegistration.effects`:
  `write`/`spawn`/`network`/`destructive`), surfaced per tool by `overview` and as
  badges on the site's plugin pages, so a host can gate dangerous tools.
- **Persistent metrics snapshots** (`metrics { persist: true }`) for longitudinal
  cost comparison; **lock contention circuit-breaker**
  (`withFileMutex { onContention: 'fail' }` → `LockContentionError`).
- **Workspace path containment** (`resolveWorkspaceContained`) in `search`/`docs`/`deps`;
  **centralized secret redaction** (`redactSecrets` in core) on proposal save;
  **canonical process-group teardown** (`killProcessGroup`).
- **Self-dogfooding** artefacts (`AGENTS.md`, copilot-instructions, agents, `skills/`) +
  `docs/mcp-vertex/ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`.
- **Site**: logo + SVG favicon, 12 languages (real flag SVGs, RTL, i18n build gate),
  live-measured benchmark charts, and a detail page per plugin.
- **CI**: a functional stdio smoke of the compiled CLI + a tarball install e2e.
- **Auto-release on push to `main`** (CI): when the lockstep version is new
  (no `vX.Y.Z` tag yet), the `release` workflow validates, builds, publishes the
  10 packages to npm, tags the commit and opens a GitHub Release with generated
  notes. Cut a release by bumping the version and pushing. Needs `NPM_TOKEN`.
- **GitHub Pages site** (`scripts/build-site.ts` + `pages` workflow): a
  self-contained page generated from the live tool registry — project intro,
  install/`mcp.json` snippets, and every tool grouped by plugin. CI runs it
  `--strict`, so an undocumented tool fails the build (the web can't silently
  drift behind the code).
- **State-migration safety net** (M14): `runMigrations` applies an ordered
  migrator chain to bring a versioned store up to the current version (refuses
  downgrades and incomplete chains), and `migrateJsonFile` reads → migrates →
  backs up the original (`.bak-<ts>`) → writes atomically, with a `dryRun` mode.
  So a future on-disk shape change has a tested, backed-up upgrade path.
- **Command allow/deny policy for `quality`** (M13): `run_quality` executes
  host-configured commands via `spawn`; an optional `commandPolicy`
  (`{ allow?, deny? }`) gates which binaries may run, enforced before any spawn
  (blocked → code 126, never executed). The trust boundary is now documented in
  the plugin README. (The audit's "securecoder bridge" was an undefined artifact
  and is intentionally out of scope — this is the concrete, agnostic piece.)
- **Tool metrics** (M12): an in-process metrics registry instruments every tool
  handler (calls, errors, total/max latency, response bytes) and a
  `<prefix>_metrics` meta-tool reports the snapshot (`reset:true` to zero it).
  Opt-in for programmatic hosts via `IMcpVertexHostConfig.metricsRegistry`; the CLI
  wires it automatically. Quantifies tool cost / token savings.
- **Memory hardening** (M11): `memory_save` auto-redacts high-confidence
  secrets (API keys, tokens, PEM private keys, JWTs, `key=value` assignments)
  before writing and reports `redactedSecrets`; optional `ttlSeconds` gives a
  self-expiring note (expired notes are dropped on read and pruned on next write).
- **Search power-ups** (M11): `search_search` accepts `regex: true` (JS regex)
  and `include`/`exclude` path globs (e.g. `src/**/*.ts`); an invalid regex
  returns a clear tool error.
- **Docs pagination** (M11/H7): `docs_list` accepts `limit`/`offset` and returns
  `{count,total,offset,nextOffset?,truncated}` — agents can page large doc trees.
- **Quality runner coverage** (M10/H4): real-spawn tests for the command
  runner's timeout→SIGKILL (code 124), non-zero exit and spawn-error (code 127)
  branches, plus a `runScope` timed-out-command case.
- **Framework detection** (M11/H6): `rules` now recognises **Next, Remix, Nuxt,
  Astro and Solid** (by dep or config file) *before* the generic react/vue check,
  so a Next app is no longer silently classified as plain `react-ts`. New presets
  reuse the verified base lint/tsconfig and carry framework-specific conventions
  plus the framework's ESLint plugin in `requiredEslintDeps`.
- **Linting** (M9): Biome as the project linter (`bun run lint` → `biome ci`),
  wired into `validate` and a dedicated CI `lint` job. Recommended ruleset with
  two project-deliberate rules disabled (`noNonNullAssertion`, `noExplicitAny`).
  The formatter is intentionally left off for now (no mass reflow).
- **Coverage gate** in CI (`bun run test:coverage`, `@vitest/coverage-v8`) with
  no-regression thresholds.
- **Release automation** (`bun run release`): lockstep version bump across the
  10 packages + `@mcp-vertex/core` peerDependency rewrite, publish in
  dependency order (core first). Dry-run by default; `--write` / `--publish`.
- **Publishable `dist/` build** (`bun run build`): per-package `bun build`
  (Node-runnable ESM) + `tsc --emitDeclarationOnly` (`.d.ts`); the CLI runs
  under plain Node/Deno/bun. CI builds `dist/` and smoke-runs the compiled CLI.
- **`status` meta-tool** backed by a real `IStatusCollector` host seam, plus a
  built-in `mcp-vertex` collector.
- **`--verbose`** assembly diagnostics and **plugin presets**
  (`--preset=minimal|standard|swarm`).
- New plugins **`docs`** (`docs_list` / `docs_read`) and **`deps`**
  (`deps_list` / `deps_check`, offline health — no network/CVE DB).
- Chaos/adversarial coordination tests and a strict end-to-end net that
  validates every read-only tool's `outputSchema` over the real MCP protocol.

### Changed (BREAKING)
- **Internal API naming convention** (`b00238`, Track N / q00006 §50):
  core-only helpers now follow the `*Internal` suffix convention so
  plugins and external consumers cannot accidentally couple to
  them. Migrated three helpers this cycle:
  - `checkPluginDependencies` → `checkPluginDependenciesInternal`
    (old name kept as `@deprecated` re-export for one minor).
  - `formatMissingDependenciesError` →
    `formatMissingDependenciesErrorInternal`
    (old name kept as `@deprecated` re-export for one minor).
  - `normalizePluginRuntime` → `normalizePluginRuntimeInternal`
    (old name kept as `@deprecated` re-export for one minor).
  The new lint
  (`tools/scripts/lint/no-internal-imports.script.ts`)
  blocks future regressions: any consumer outside
  `packages/core/**` that imports a `*Internal` symbol from a core
  entry point, or anything from `@mcp-vertex/core/_internal`, fails
  the lint. No `breaking:` change in core's behavior — the old
  names still work; only the boundary is now explicit.

### Changed (BREAKING)
- `@mcp-vertex/ide` renamed to `@mcp-vertex/ui-extension`. The
  public API (interfaces, panels, dashboard renderer) is byte-
  identical; only the package name and its location changed
  (`apps/ide` → `packages/ui-extension`). Consumers keep working
  for one minor via the legacy `@mcp-vertex/ide` aliases still
  wired in `tsconfig.base.json` and `vitest.shared.ts`.
- `mcp-vertex-vscode` carries `displayName: "@mcp-vertex/extension-vscode"`
  to reflect the rename (`extensions/vscode` → `extensions/vscode`). The
  flat `name: "mcp-vertex-vscode"` is kept because `vsce` rejects
  scoped names with `@` or `/`; the published `.vsix` filename is
  therefore still `mcp-vertex-vscode-<version>.vsix` (see R1 in
  `docs/proposals/ready/f00035-...md`).
- Bun workspaces now include `extensions/*` alongside `apps/*`;
  the `MonorepoGroup` union in `tools/scripts/lib/monorepo-paths.ts`
  was extended with `'extensions'` so all path helpers accept the
  new group.

### Changed
- **Dogfooding worktree isolation**: this repo now enables
  `agentWorktree` in `mcp-vertex.config.json`, and
  `proposals_agent_worktree` creates disposable agent checkouts under the
  resolved cache root (`.cache/mcp-vertex/.worktrees/`) instead of
  cluttering the workspace root.
- **l111 closed: post-closure audit hardening landed.** Five findings
  from the 16-06 master audit, plus two new ones discovered this
  session, are now fixed and pinned by tests: (s1) M45 — `auto_work`
  / `continue_proposal` no longer crash on idle because a local
  `json()` duplicate was setting only `content`, never
  `structuredContent` (both tools now delegate to the shared
  `toolJson` helper); M46 — `docsDir` in `mcp-vertex.config.json`
  points at `docs/` so `<docsDir>/proposals` resolves to the real
  `docs/proposals/` corpus, not the empty `docs/mcp-vertex/proposals/`
  shadow that held 3 abandoned drafts (this was the literal
  "the MCP isn't being applied to our project" symptom). (s2) M25 —
  `walkAllowedFiles` is now a single shared helper in
  `packages/core/src/lib/shared/walk-allowed-files.ts` and both
  `search` and `docs` delegate to it (no duplicated walk logic).
  (s3) M28 — `agent_lock` forwards `onContention: 'fail'` to
  `withFileMutex`, throwing `LockContentionError` instead of
  stealing a live holder's lock. (s4) M32 — three property-based
  specs land: `redact.property.spec.ts` (idempotence, no false
  negatives), `frontmatter-parser.property.spec.ts` (round-trip),
  and `store-concurrency.spec.ts` (the new file): 4 cases pin
  the M32 contract — 32 parallel writers preserve every note,
  16 concurrent upserts to the same title converge to 1 (no
  duplicates), sequential and parallel workloads converge to the
  same id set, and saves+deletes interleaved preserve the
  expected intersection. The memory store spec depends only on
  the public surface (`saveNote`/`removeNote`/`readStore`), no
  `node:fs`/`withFileMutex` imports — DIP, so a future
  SQLite-WAL swap can't silently break the contract.
- **l110 closed: i18n + docs rewrite residuals landed.** The three
  slices l100 deferred are now done — (1) `apps/web/scripts/lib/resolve-i18n-descriptions.ts`
  + `gen-capabilities.ts` integration precompute the 12-language
  `i18n` block for every tool with a catalogue entry, so the SSR
  renderer never pays a runtime `describeTool()` lookup; (2) a
  new `PluginTabs.astro` (with `role="tablist"` / `aria-selected`
  / roving `tabindex`) and an extracted `plugin-tabs-controller.ts`
  (pure module, 9 specs) wire up `Overview · Tools · Configuration
  · Tutorial` tabs in `PluginPage.astro`; (3) the 5 tutorial
  files in 11 languages are committed and the
  `apps/web/scripts/check-tutorials-i18n.ts` gate reports 60 files
  / 0 pending / 100% reviewed. Cached l109 (`auto_work` persistence
  modes) ships in the same window.
- **No synchronous I/O left in `proposals`** (H2, extends M5): migrated the
  residual `*Sync` calls in the proposals tools (`authoring`, `continue-proposal`,
  `compact-status`, `state-tools`), the `swarm/round-context-*` readers, and the
  `agent-lock-engine`/`agent-registry-store` hot paths to `fs/promises` — a tool
  call can no longer block the event loop on a slow/network filesystem.
- **Biome config migrated** (H9): `linter.rules.recommended: true` →
  `preset: "recommended"` (no more deprecation info on every lint).
- **`subscribe` idempotency is now persisted** (`.subscribe-delivered.json`
  sidecar, mutated under a file mutex): a server restart no longer re-delivers
  already-delivered digests (M6).
- Hardened the file mutex against a steal race (ownership token + heartbeat);
  hermetic path resolution (`waitFor.file` resolves against the injected
  workspace root, not the process cwd); removed synchronous I/O from the hot
  `proposals` paths (M1, M5, M7).
- `agentSlot` is project-agnostic (`z.string().min(1)`); the canonical 5-role
  set remains as a documented default, not an enforced enum (M2).
- `plugins/docs` engine moved to `fs/promises` (M4).

### Fixed
- **`done/` closure routing** (f00042 engine wire-up): closing a proposal
  (`proposal_transition → done` and `reconcileFolders`) now lands the
  file under `done/<kind>/` (`done/feats/`, `done/fixes/`,
  `done/refactors/`, `done/audits/`, `done/chores/`, `done/docs/`,
  `done/tests/`, `done/plans/`, `done/resumes/`), matching the convention
  the `filename-linter` was already validating. A new
  `KIND_TO_DONE_SUBFOLDER` glossary + `doneFolderFor(kind)` helper
  centralises the mapping; kinds without a registered sub-folder
  (`legacy`, future kinds) still land at `done/` root. Sweep moves 12
  closed proposals to their correct sub-folder.
- **Blueprint cacheDir drift** (M15/H5): the one-time server blueprint now lands
  under the resolved `cacheDir` (CLI flag → `mcp-vertex.config.json` → default),
  matching the rest of the store; previously a config-only `cacheDir` was ignored
  and the blueprint drifted to `.cache/mcp-vertex`.
- **Scaffold tool response compacted** (H3): `scaffold` emitted a tab-indented
  report as its text content (agent-context tokens); now compact JSON (the typed
  payload still rides in `structuredContent`).
- **CI test flakiness**: the I/O + mutex concurrency tests could exceed the 5s
  default under heavy parallel-suite CPU load; `testTimeout`/`hookTimeout` raised
  to 20s across all packages (a real hang still fails — the wait is just scheduling).
- Double tool-id prefixes (`memory_memory_*` → `memory_*`, `git_git_*` →
  `git_*`) and two `outputSchema` mismatches surfaced by the strict e2e net.
- **`<Tabs variant="plugin" | "pill" | "underline">`** (f00069 S1) replaces the
  deleted `PluginTabs.astro`; `PluginPage.astro` now consumes the new variant
  and the cross-fade controller lives in
  `apps/web/src/components/ui/_tabs-controller.ts` (13/13 specs green).

### Removed
- 36 stray `.d.ts` declaration files accidentally committed inside `src/`
  trees (the build emits declarations to `dist/`); a `.gitignore` rule now
  prevents the recurrence.
- `apps/web/src/components/PluginTabs.astro` (107 lines) — folded into
  `Tabs.astro`'s `plugin` variant; the old tab shape (`role="tablist"` /
  `aria-selected` / `tabindex`) is preserved verbatim by the new
  `.ui-tabs--plugin` selector and verified by `apps/web/tests/ui/tabs-cross-fade.spec.ts`.

## [0.1.0] — unreleased

Initial project-agnostic MCP server core + CLI plugin loader and the nine
first-party plugins (`proposals`, `rules`, `memory`, `git`, `quality`,
`search`, `notification`, `docs`, `deps`). Not yet published to npm.

<!-- Comparison links (Keep a Changelog). Populated as tags are cut. -->
[Unreleased]: https://github.com/CartagoGit/mcp-vertex/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CartagoGit/mcp-vertex/releases/tag/v0.1.0
