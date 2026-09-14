/** Constants for `./test-zones.script`. */

import type { IZoneRule } from './test-zones.interface';

/**
 * Specs per CI job to aim for.
 *
 * Wall clock is the slowest job, not the total, so the only number that
 * matters is the biggest zone. Measured on this repo a shard of ~195
 * specs takes ~5.5 minutes, of which ~89% is loading modules — so this
 * target is chosen to keep the largest zone at roughly the cost of the
 * 8-way anonymous split it replaces, and buy legibility rather than
 * spend time on it.
 */
export const TARGET_SPECS_PER_JOB = 200;

const under =
	(prefix: string) =>
	(path: string): boolean =>
		path.startsWith(prefix);

/**
 * The zones, in priority order — first match wins.
 *
 * These are places a person can point at, which is the whole purpose:
 * `tests: proposals` failing says where to look, `test-shard 4/8`
 * failing says nothing at all. Membership is by path, so a workspace
 * added tomorrow joins a zone without anyone editing a workflow.
 */
export const ZONE_RULES: readonly IZoneRule[] = [
	{
		id: 'core',
		match: under('packages/core/'),
		paths: () => ['packages/core'],
	},
	{
		id: 'proposals',
		match: under('plugins/proposals/'),
		paths: () => ['plugins/proposals'],
	},
	{
		id: 'plugins',
		match: under('plugins/'),
		paths: (dirs) =>
			dirs.filter(
				(dir) =>
					dir.startsWith('plugins/') && dir !== 'plugins/proposals',
			),
	},
	{
		id: 'packages',
		match: under('packages/'),
		paths: (dirs) =>
			dirs.filter(
				(dir) => dir.startsWith('packages/') && dir !== 'packages/core',
			),
	},
	{
		id: 'apps',
		match: (path) =>
			path.startsWith('apps/') || path.startsWith('extensions/'),
		paths: (dirs) =>
			dirs.filter(
				(dir) =>
					dir.startsWith('apps/') || dir.startsWith('extensions/'),
			),
	},
	{
		// Everything else, which is `tools/` plus the handful of specs
		// that live at the root. A catch-all is deliberate: a spec with
		// no zone must run somewhere, and "nowhere" is the one outcome a
		// test split must never produce.
		//
		// The last two entries are the PROJECT ROOTS, not the directories
		// they sit under, and that is the whole point. `tests` and `docs`
		// stood here, and neither selected a single spec from the project
		// it was meant to reach: vitest matches a positional filter
		// against a path the project can see, and a project that declares
		// its own `root` cannot see `tests/` or `docs/` above it. What
		// they DID select was other workspaces' `tests/e2e/` folders and
		// the `docs` PLUGIN — specs that belong to the `plugins` zone and
		// were therefore running twice.
		//
		// Measured on `develop`: `tests-e2e` (4 specs, 13 tests, the
		// adoption and legacy-migration end-to-end suites) had not run in
		// CI since the zone split. `no-dead-modules` is what noticed —
		// the legacy-workspace fixture those specs are the only callers
		// of showed zero executed functions.
		id: 'tools',
		match: () => true,
		paths: () => [
			'tools',
			'scripts',
			'tests/e2e',
			'docs/delendai/examples/custom-plugin',
		],
		// Measured on develop: 816s against 387s for the next slowest
		// zone — ~2.5x the per-job target. Its specs spawn git, build
		// real repositories and walk the workspace, so the
		// module-loading model that justifies splitting by spec count
		// does not describe them, and counting alone handed this zone
		// ONE job while it needed three. Re-measure rather than nudge.
		costWeight: 2.5,
	},
];
