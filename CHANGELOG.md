# Changelog

All notable changes to `@mcp-vertex/core` and its plugins are documented
here. The 10 packages are versioned **in lockstep** (`bun run release` bumps
them together; see [docs/NPM_PUBLISH.md](docs/NPM_PUBLISH.md)). The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
  `docs/ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`.
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

### Changed
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

### Removed
- 36 stray `.d.ts` declaration files accidentally committed inside `src/`
  trees (the build emits declarations to `dist/`); a `.gitignore` rule now
  prevents the recurrence.

## [0.1.0] — unreleased

Initial project-agnostic MCP server core + CLI plugin loader and the nine
first-party plugins (`proposals`, `rules`, `memory`, `git`, `quality`,
`search`, `notification`, `docs`, `deps`). Not yet published to npm.

<!-- Comparison links (Keep a Changelog). Populated as tags are cut. -->
[Unreleased]: https://github.com/CartagoGit/mcp-vertex/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CartagoGit/mcp-vertex/releases/tag/v0.1.0
