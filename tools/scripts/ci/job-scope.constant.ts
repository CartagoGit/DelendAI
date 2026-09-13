/** Constants for `./job-scope.script`. */

import type { IJobScope } from './job-scope.interface';

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
	{
		job: 'lint-biome',
		touches: 'always',
		because:
			'formatting and lint rules apply to every file in the repo, including the ones a docs-only change touches.',
	},
	{
		job: 'lint-architecture',
		touches: 'always',
		because:
			'the architecture lints read the whole source tree; a rule broken in one package is reported from wherever it is run.',
	},
	{
		job: 'lint-presets',
		touches: 'always',
		because:
			'the preset and release-surface checks compare the whole catalog against the whole tree, and the catalog changes when a proposal moves.',
	},
	{
		job: 'lint-docs',
		touches: 'always',
		because:
			'docs, skills and host-instruction lints span docs/, plugins/ skills and apps/web together.',
	},
	{
		job: 'lint-security',
		touches: 'always',
		because:
			'a cleartext secret or a stray tracked artifact can arrive in any file, which is the entire point of the gate.',
	},
	{
		job: 'lint-governance',
		touches: 'always',
		because:
			'proposal integrity is a property of the whole proposal set, not of the files one change touched.',
	},
	{
		job: 'typecheck',
		touches: 'always',
		because:
			'a type error surfaces in the file that CONSUMES the change, which is by definition not one of the changed files.',
	},
	{
		job: 'plan-scope',
		touches: 'always',
		because:
			'it is the job that decides what everything else may skip; skipping IT would leave every gate excused by an empty plan.',
	},
	{
		job: 'plan-tests',
		touches: 'always',
		because:
			'it decides what the test jobs are; skipping it leaves them with no matrix at all.',
	},
	{
		job: 'tests-zone',
		touches: 'always',
		because:
			'the zones themselves already filter to what the change can reach — filtering the filter would drop the run that decides.',
	},
	{
		job: 'tests',
		touches: 'always',
		because:
			'the coverage verdict for a change is exactly what must not be skipped on the change that lowers it.',
	},
	{
		job: 'quality-gate',
		touches: 'always',
		because: 'it runs the configured quality scopes over the repository.',
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
		job: 'develop-protection-live',
		touches: 'always',
		because:
			'it reads the live branch rule, which drifts without a commit.',
	},
	{
		job: 'generated-artifacts-check',
		touches: 'always',
		because:
			'a generated artifact goes stale because of its INPUTS, and those inputs are spread across proposals, plugins and packages.',
	},
	{
		job: 'manifests-check',
		touches: 'always',
		because: 'plugin manifests are derived from every plugin at once.',
	},
	{
		job: 'metrics-gate',
		touches: 'always',
		because:
			'it compares a snapshot of the whole build against a baseline; a subset snapshot is not comparable to it.',
	},

	// The bounded ones. Each is a single build or suite whose command
	// line names what it reads.
	{
		job: 'site',
		touches: ['apps/web/', 'package.json', 'bun.lock'],
		because:
			'it runs `bun run site`, an astro build of apps/web. The data the site embeds is CHECKED IN under apps/web/src/data, and `generated-artifacts-check` — which always runs — is what catches those going stale.',
	},
	{
		job: 'sqlite-cutover-ready',
		touches: [
			'packages/state-sqlite/',
			'packages/proposals-sqlite/',
			'plugins/proposals/',
			'plugins/database/',
			'docs/delendai/proposals/',
			'package.json',
			'bun.lock',
		],
		because:
			'it runs the bun-only SQLite suite and the cutover gate, which reads the SQLite packages and the proposal statuses that declare the cutover slices.',
	},
	{
		job: 'delendai-rebuild-digest',
		touches: ['package.json', 'bun.lock', 'packages/', 'plugins/'],
		because:
			'it verifies install parity, which only a manifest or a lockfile can change.',
	},
	{
		job: 'pack-smoke',
		touches: [
			'packages/',
			'plugins/',
			'apps/shared/',
			'tsconfig.base.json',
			'package.json',
			'bun.lock',
		],
		because:
			'it builds dist and installs the tarball; nothing outside the publishable source and its build configuration can change what is in it.',
	},
	{
		job: 'build-clean',
		touches: [
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
