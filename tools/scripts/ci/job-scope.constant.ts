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
 * The entry files a published package exposes: what a consumer imports.
 * The packaging jobs run for a change to one only when the names it exports
 * moved (`IJobScope.surface`); the modules behind it are judged by the
 * typecheck and the tests.
 */
export const PUBLIC_ENTRY_FILES =
	/^(packages|plugins|extensions)\/[^/]+\/src\/(index|cli|public\/index|runtime\/index|contracts\/index|plugin\/index)\.ts$/u;

/** A manifest anywhere, the lockfile and the compiler configuration. */
const BUILD_INPUTS = /(^|\/)package\.json$|^bun\.lock$|^tsconfig/u;

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
			'measured: its 47 lints read every top-level entry and several list the tree with git ls-files.',
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
			'measured: the secret and privacy lints read every top-level entry; a cleartext secret can arrive in any file, Markdown included.',
	},
	{
		job: 'lint-governance',
		touches: 'always',
		code: 'scripts',
		because:
			'measured: its proposal, branch and agent lints read every top-level entry and judge refs that change without a file changing.',
	},
	{
		// One runner and one setup for the static checks that used to be a job
		// each. Every member keeps its entry above and gates its own steps in
		// ci.yml; the job runs when any of them does.
		job: 'static-checks',
		touches: [],
		group: [
			'lint-biome',
			'manifests-check',
			'lint-architecture',
			'lint-docs',
			'lint-presets',
			'lint-security',
			'lint-governance',
			'generated-artifacts-check',
		],
		because:
			'it is the runner of the eight static checks that used to run one per job; its verdict is theirs, so it runs when any of them can be affected.',
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
			'bookkeeping: it decides what every other job may skip, so skipping it would excuse every gate with an empty plan.',
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
			'unmeasured: it runs the lint steps no other job runs over the whole tree, and a trace of its reads did not complete.',
	},
	{
		job: 'delendai-validate',
		touches: 'always',
		because:
			'bookkeeping: it IS the required check, and a skipped aggregate is an unmergeable pull request with nothing red on it.',
	},
	{
		job: 'ref-lifecycle',
		touches: [
			'.github/',
			'tools/scripts/lint/ref-lifecycle-guard.script.ts',
			'tools/scripts/lint/namespace-ruleset-guard.script.ts',
			'tools/scripts/governance/',
			'tools/scripts/git/',
			'tools/scripts/forge/',
			'packages/core/src/lib/development-policy/',
			'packages/core/src/lib/startup-reconciler/',
			'packages/core/src/lib/work-units/',
			'packages/core/src/lib/contracts/constants/repository-identity.constant.ts',
			'delendai.config.json',
			'package.json',
			'bun.lock',
		],
		because:
			'it classifies the refs on the forge and checks its namespace ruleset, which no pull request changes; only the guards, the policy they resolve and the workflow that runs them can change its verdict, and every push still runs it.',
	},
	{
		job: 'scan-the-integration-branch',
		touches: 'always',
		because:
			'bookkeeping: it only runs on the integration branch, where it starts the code scanning a merge made with the workflow token does not.',
	},
	{
		job: 'develop-protection-live',
		touches: [
			'.github/',
			'tools/scripts/lint/branch-protection-guard.script.ts',
			'tools/scripts/lib/repo-root.ts',
			'tools/scripts/governance/',
			'delendai.config.json',
		],
		because:
			'it reads the live branch rule, which belongs to the repository and not to a candidate (it reports not-applicable on a pull request); only the guard, the policy it compares with and its workflow can change it, and every push to develop still runs it.',
	},
	{
		job: 'generated-artifacts-check',
		touches: 'always',
		because:
			'whole repository: the generators read every top-level entry, and an artifact goes stale because of any of its inputs.',
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
		touches: [
			'packages/',
			'plugins/',
			'apps/',
			'extensions/',
			'tools/scripts/compile/',
			'tools/scripts/metrics/',
			'tsconfig',
			'bunfig.toml',
			'package.json',
			'bun.lock',
		],
		because:
			'it compares a snapshot of the build with a baseline, so it reads what the build reads (the source trees, the build and metrics scripts, the compiler configuration); tests, docs and the other scripts are not in the snapshot.',
	},

	// The bounded ones. Each is a single build or suite whose command
	// line names what it reads.
	{
		job: 'site',
		surface: PUBLIC_ENTRY_FILES,
		touches: [
			'apps/web/',
			'tools/docs-api/',
			'tools/scripts/compile/',
			'tools/scripts/astro/',
			'tools/scripts/verify/site-pages-verify.script.ts',
			'tsconfig.base.json',
			'package.json',
			'bun.lock',
		],
		matches: new RegExp(
			`${BUILD_INPUTS.source}|^apps/web/|^tools/(scripts/(compile|astro)/|docs-api/)|^tools/scripts/verify/site-pages-verify\\.script\\.ts$`,
			'u',
		),
		lists: ['packages/', 'plugins/', 'extensions/'],
		because:
			'it runs `bun run site`, an astro build of apps/web that bundles `@delendai/cli`, `@delendai/core`, `@delendai/proposals` and the UI extension through their entry files: a change that moves the names an entry exports, a file added or removed in them, a manifest or the build scripts can break it; a change inside a module behind an entry is judged by the typecheck and the tests, and `generated-artifacts-check` catches the embedded data going stale.',
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
		matches: new RegExp(
			`${BUILD_INPUTS.source}|^tools/scripts/ci/rebuild-digest\\.script\\.ts$`,
			'u',
		),
		touches: ['package.json', 'bun.lock'],
		because:
			'it verifies install parity, which only a manifest, the lockfile or its own script can change; no source file reaches it.',
	},
	{
		job: 'pack-smoke',
		surface: PUBLIC_ENTRY_FILES,
		// What can change what a tarball holds or whether it installs: a
		// manifest, the lockfile, the build configuration and scripts and
		// init. The entry files that are the export surface count when the
		// names they export moved; a change inside an existing module cannot
		// change a tarball, and typecheck compiles it.
		matches: new RegExp(
			`${BUILD_INPUTS.source}|^tools/scripts/(compile/|smoke/|verify/external-install-smoke\\.script\\.ts$|publish/workspace-deps\\.ts$)|^packages/cli/src/(lib|commands)/init/|^apps/shared/`,
			'u',
		),
		touches: [
			'tools/scripts/compile/',
			'tools/scripts/smoke/',
			'tools/scripts/verify/external-install-smoke.script.ts',
			'tools/scripts/publish/workspace-deps.ts',
			'apps/shared/',
			'tsconfig.base.json',
			'package.json',
			'bun.lock',
		],
		lists: ['packages/', 'plugins/'],
		because:
			'it builds dist, installs the tarballs and drives an external project through install, init and the MCP handshake; only a moved export surface, a file added or removed in a package, its build configuration and init can change that.',
	},
	{
		job: 'build-clean',
		surface: PUBLIC_ENTRY_FILES,
		matches: new RegExp(
			`${BUILD_INPUTS.source}|^tools/scripts/(compile|build)/`,
			'u',
		),
		touches: [
			'tools/scripts/compile/',
			'tools/scripts/build/',
			'tsconfig.base.json',
			'package.json',
			'bun.lock',
		],
		lists: ['packages/', 'plugins/', 'apps/', 'extensions/'],
		because:
			'it builds from an empty output tree; the build configuration, the build scripts, a file added or removed under a source tree and a moved export surface reach it, and a change inside a module is compiled by the typecheck.',
	},
	{
		job: 'verify-runtime',
		surface: PUBLIC_ENTRY_FILES,
		matches: new RegExp(
			`${BUILD_INPUTS.source}|^tools/scripts/(verify|scaffold|host)/|^plugins/[^/]+/(plugin|manifest)[^/]*$`,
			'u',
		),
		touches: [
			'tools/scripts/verify/',
			'tools/scripts/scaffold/',
			'tools/scripts/host/',
			'package.json',
			'bun.lock',
		],
		lists: ['packages/', 'plugins/'],
		because:
			'it verifies tools, plugin wiring, caches, scaffolds and host capability packs; the moved export surface of a package, a plugin or manifest file, a file added or removed and the scripts that check them reach it, and the tests cover a change inside a module.',
	},
	{
		job: 'tokens-budget-real',
		touches: [
			'packages/core/',
			'plugins/',
			// The text a preset loads and the budget file it is compared with;
			// not the proposals, which no preset serves.
			'docs/delendai/AGENT-BOOTSTRAP.md',
			'docs/delendai/TOKEN-BUDGETS.md',
			'docs/delendai/skills/',
			'docs/delendai/host-appendices/',
			'docs/delendai/host-hints/',
			'docs/delendai/generated/',
			'docs/delendai/plugins/',
			'docs/delendai/surface/',
			'package.json',
		],
		because:
			'preset token budgets are computed from the prompts, skills and catalog text those trees hold; a proposal under docs/delendai/proposals/ is served to no preset.',
	},
];
