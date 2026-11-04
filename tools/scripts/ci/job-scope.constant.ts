/** Constants for `./job-scope.script`. */

import type { IJobScope } from './job-scope.interface';

/**
 * Everything that can change what `tsc` concludes or what a test does.
 *
 * Used by `typecheck` and the three test jobs, which move together: a
 * coverage verdict computed over a suite that did not run is the
 * "gate passes over an empty scan root" failure, so they are scoped
 * identically and skip as a set or not at all.
 *
 * Deliberately generous, per the asymmetry above — it names every
 * directory that can hold a `.ts` file and every root file that can
 * change how one is compiled or run. What it leaves out is only what
 * cannot reach a compiler or a test runner at all: `docs/`, `.github/`,
 * `config/`, `.vscode/` and the root markdown. Measured before this
 * existed: a change touching one proposal markdown file ran 20 of the 25
 * jobs, including the whole test matrix, for about 30 machine-minutes.
 */
export const SOURCE_PREFIXES = [
	'packages/',
	'plugins/',
	'apps/',
	'extensions/',
	'tools/',
	'tests/',
	'scripts/',
	'package.json',
	'bun.lock',
	'bunfig.toml',
	'tsconfig',
	'vitest.',
	'biome.json',
	'delendai.config.json',
] as const;

/**
 * Which files each CI job's verdict can depend on.
 *
 * THE ASYMMETRY THAT GOVERNS THIS FILE: a job that runs when it did not
 * need to costs a few minutes. A job that is skipped when it did need to
 * run is a regression nobody looked for, shipped with a green tick on
 * it. So every bound here is deliberately wider than the job's strict
 * inputs, `always` is the default for anything whose inputs are not
 * obvious from its command line, and `lint:job-scope` fails when a job
 * exists in the workflow without an entry — the failure mode of
 * forgetting is MORE checking, never less.
 *
 * The narrow entries are the ones whose command is a single bounded
 * build or suite. Everything else verifies a property of the whole
 * repository and says so.
 */
export const JOB_SCOPES: readonly IJobScope[] = [
	// The lint families. What each reads was measured on 2026-11-04 by
	// tracing every file each of its commands opened (strace over the job's
	// script, as `ci.yml` runs it), less the modules its own scripts import:
	// those are followed by symbol instead (`code: 'scripts'`), so a lint that
	// imports a core barrel does not run for every core change. A family whose
	// measured reads span every tracked top-level entry stays `always`, and
	// says so. Re-measure when a lint joins a family: its reads are not here
	// until then.
	{
		job: 'lint-biome',
		docs: 'skip', // Biome formats and lints code and JSON, not Markdown.
		touches: [
			'apps/',
			'extensions/',
			'packages/',
			'plugins/',
			'tools/',
			'biome.json',
			'stylelint.config.mjs',
			'.gitignore',
			'bunfig.toml',
			'tsconfig',
			'package.json',
			'bun.lock',
		],
		lists: ['apps/', 'extensions/', 'packages/', 'plugins/', 'tools/'],
		code: 'scripts',
		because:
			'measured: Biome, stylelint and the config and i18n checks read the five source trees, biome.json, stylelint.config.mjs, .gitignore and the root manifests; bun.lock decides the Biome version. Nothing under docs/, .github/ or the host folders. Biome judges each changed file alone (biome-baseline.script.ts).',
	},
	{
		job: 'lint-architecture',
		touches: 'always',
		code: 'scripts',
		because:
			'measured: its 47 lints together read files under every tracked top-level entry, and several list the whole tree with git ls-files. The ones that judge files one by one judge the changed files.',
	},
	{
		job: 'lint-presets',
		touches: [
			'.agents/',
			'.claude/',
			'.codex/',
			'.cursor/',
			'.github/',
			'.mcp.json',
			'.vscode/',
			'apps/',
			'config/',
			'docs/',
			'extensions/',
			'packages/',
			'plugins/',
			'scripts/',
			'tests/',
			'tools/',
			'biome.json',
			'bunfig.toml',
			'delendai.config.json',
			'stylelint.config.mjs',
			'tsconfig',
			'vitest.',
			'package.json',
			'bun.lock',
		],
		// git ls-files over every *.json and *.jsonc: an added one anywhere.
		lists: [''],
		code: 'scripts',
		because:
			'measured: the preset, catalog and release-surface checks read the source trees, docs/, the host folders and the root configuration, and list every JSON file; not the root prose (README, AGENTS, CHANGELOG, CLAUDE, LICENSE), .gitattributes, .mailmap, bin/ or lefthook.yml.',
	},
	{
		job: 'lint-docs',
		touches: [
			'.agents/',
			'.claude/',
			'.codex/',
			'.github/',
			'.gitattributes',
			'.mailmap',
			'.mcp.json',
			'.vscode/',
			'AGENTS.md',
			'CHANGELOG.md',
			'CLAUDE.md',
			'README.md',
			'apps/',
			'config/',
			'docs/',
			'extensions/',
			'packages/',
			'plugins/',
			'scripts/',
			'tests/',
			'tools/',
			'bunfig.toml',
			'delendai.config.json',
			'tsconfig.base.json',
			'tsconfig.json',
			'vitest.',
			'package.json',
			'bun.lock',
		],
		lists: [
			'.agents/',
			'.claude/',
			'.codex/',
			'.github/',
			'apps/',
			'bin/',
			'config/',
			'docs/',
			'extensions/',
			'packages/',
			'plugins/',
			'scripts/',
			'tests/',
			'tools/',
		],
		code: 'scripts',
		because:
			'measured: the docs, content, skills, web and host-instruction lints read docs/, the root prose, the host folders and the source trees (tool descriptions, skills, the site); not biome.json, lefthook.yml, LICENSE, .gitignore, bin/ or .cursor/.',
	},
	{
		job: 'lint-security',
		touches: 'always',
		code: 'scripts',
		because:
			'measured: the secret, privacy and hygiene lints read files under every tracked top-level entry and list the whole tree; a cleartext secret can arrive in any file. On a pull request the secret scan reads the diff, and the per-file lints judge the changed files.',
	},
	{
		job: 'lint-governance',
		touches: 'always',
		code: 'scripts',
		because:
			'measured: the proposal, branch and agent lints read files under every tracked top-level entry, and they judge refs and commits that change without a file changing.',
	},
	{
		job: 'typecheck',
		touches: SOURCE_PREFIXES,
		because:
			'a type error surfaces in the file that CONSUMES the change, so the bound is every directory that can hold a .ts file and every root file that changes how one compiles — not the changed files themselves. A change that touches none of them cannot move what tsc concludes.',
	},
	{
		job: 'plan-scope',
		touches: 'always',
		because:
			'it is the job that decides what everything else may skip; skipping IT would leave every gate excused by an empty plan.',
	},
	{
		job: 'plan-tests',
		touches: SOURCE_PREFIXES,
		because:
			'it decides what the test jobs are, so it skips only when they do — on a change that touches no source at all.',
	},
	{
		job: 'tests-zone',
		touches: SOURCE_PREFIXES,
		because:
			'the zones already filter to what the change can reach, so this bound only answers the prior question: whether there is any source for a zone to reach. Filtering further would drop the run that decides.',
	},
	{
		job: 'tests',
		touches: SOURCE_PREFIXES,
		because:
			'the coverage verdict is exactly what must not be skipped on a change that lowers it — and a change touching no source lowers nothing. It shares the bound with tests-zone deliberately: a coverage verdict computed over a suite that did not run is a gate passing over an empty scan root.',
	},
	{
		job: 'quality-gate',
		touches: 'always',
		because:
			'it runs the configured quality scopes over the repository; the 2026-11-04 trace of its run did not complete, so what it reads is not measured and nothing is skipped.',
	},
	{
		job: 'delendai-validate',
		touches: 'always',
		because:
			'it IS the required check; a skipped aggregate is an unmergeable pull request with nothing red on it.',
	},
	{
		job: 'ref-lifecycle',
		touches: 'always',
		because:
			'it judges the refs on the forge, which change without any file changing.',
	},
	{
		job: 'release-the-queue',
		touches: 'always',
		because:
			'it wakes the queue after a green certification of the integration branch, which no file change describes.',
	},
	{
		job: 'wake-the-queue',
		touches: 'always',
		because:
			'it wakes the queue when a publication goes green, which no file change describes.',
	},
	{
		job: 'develop-protection-live',
		touches: 'always',
		because:
			'it reads the live branch rule, which drifts without a commit.',
	},
	{
		job: 'generated-artifacts-check',
		touches: 'always',
		because:
			'measured: the generators read files under every tracked top-level entry; a generated artifact goes stale because of its inputs, spread across proposals, plugins and packages.',
	},
	{
		job: 'manifests-check',
		touches: [
			'packages/',
			'plugins/',
			// What `generate:from-manifests --check` compares its output with.
			'docs/delendai/generated/',
			'docs/delendai/plugins/auto-generated/',
			'bunfig.toml',
			'tsconfig',
			'package.json',
			'bun.lock',
		],
		lists: ['packages/', 'plugins/', 'tools/'],
		code: 'scripts',
		because:
			'measured: plugin manifests are derived from the packages and plugins, and checked against the generated manifest pages under docs/delendai. It used to skip every Markdown-only change, which left a hand edit to a generated page unchecked here.',
	},
	{
		job: 'metrics-gate',
		docs: 'skip', // no Markdown reaches the build it measures.
		touches: 'always',
		because:
			'it compares a snapshot of the whole build against a baseline; a subset snapshot is not comparable to it.',
	},

	// The bounded ones. Each is a single build or suite whose command
	// line names what it reads.
	{
		job: 'site',
		touches: [
			'apps/web/',
			'packages/',
			'plugins/',
			'extensions/',
			'tools/scripts/',
			'package.json',
			'bun.lock',
		],
		because:
			'it runs `bun run site`, an astro build of apps/web that BUNDLES source from outside it: `@delendai/cli` (its command registry, and through it every plugin), `@delendai/core`, `@delendai/proposals`, the UI extension and tools/scripts. A change there can break the build without touching apps/web — x00712 did, and develop stayed red (x00726). The data the site embeds is checked in under apps/web/src/data; `generated-artifacts-check`, which always runs, catches it going stale.',
	},
	{
		job: 'sqlite-cutover-ready',
		touches: [
			'packages/state-sqlite/',
			'packages/state/',
			'tools/scripts/state/',
			'packages/proposals-sqlite/',
			'packages/sqlite/',
			'plugins/proposals/',
			'plugins/database/',
			'package.json',
			'bun.lock',
		],
		because:
			'it runs the bun-only SQLite suite, the cutover gate over the SQLite packages and their fixtures, and the driver parity sampler, which compares the in-memory driver (packages/state) with the SQLite one. The one spec that reads the real proposal tree also runs in lint-governance on every change, so a proposal edit alone does not need this job; every pull request edits a proposal, and this job ran on all of them.',
	},
	{
		job: 'delendai-rebuild-digest',
		touches: ['package.json', 'bun.lock', 'packages/', 'plugins/'],
		because:
			'it verifies install parity, which only a manifest or a lockfile can change.',
	},
	{
		job: 'pack-smoke',
		// What can change what a tarball holds or whether it installs: a
		// manifest, the lockfile, the build configuration and scripts, and
		// the entry files that are the export surface. A change inside an
		// existing module cannot, and typecheck compiles it.
		matches:
			/(^|\/)package\.json$|^bun\.lock$|^tsconfig|^tools\/scripts\/(compile\/|smoke\/pack\.script\.ts$|verify\/external-install-smoke\.script\.ts$|publish\/workspace-deps\.ts$)|^packages\/cli\/src\/(lib|commands)\/init\/|^apps\/shared\/|^(packages|plugins)\/[^/]+\/src\/(index|cli|public\/index|runtime\/index|contracts\/index|plugin\/index)\.ts$/u,
		touches: [
			// The scripts it runs: a change to how dist is built or packed
			// is a change to what the tarball holds.
			'tools/scripts/compile/',
			'tools/scripts/smoke/pack.script.ts',
			'tools/scripts/verify/external-install-smoke.script.ts',
			'tools/scripts/publish/workspace-deps.ts',
			'packages/',
			'plugins/',
			'apps/shared/',
			'tsconfig.base.json',
			'package.json',
			'bun.lock',
		],
		because:
			'it builds dist, installs the tarballs and drives an external project through install, init and the MCP handshake; nothing outside the publishable source, its build configuration and init can change that.',
	},
	{
		job: 'build-clean',
		touches: [
			// The scripts it runs, build and build-clean among them.
			'tools/scripts/compile/',
			'packages/',
			'plugins/',
			'apps/',
			'extensions/',
			'tsconfig.base.json',
			'package.json',
			'bun.lock',
		],
		because:
			'it builds from an empty output tree; only source and build configuration reach it.',
	},
	{
		job: 'verify-runtime',
		touches: [
			'packages/',
			'plugins/',
			'tools/scripts/',
			'package.json',
			'bun.lock',
		],
		because:
			'it verifies tools, plugin wiring, caches, scaffolds and host capability packs — all of which live in the runtime source and the scripts that check it.',
	},
	{
		job: 'tokens-budget-real',
		touches: [
			'packages/core/',
			'plugins/',
			'docs/delendai/',
			'package.json',
		],
		because:
			'preset token budgets are computed from the prompts, skills and catalog text those trees hold.',
	},
];
