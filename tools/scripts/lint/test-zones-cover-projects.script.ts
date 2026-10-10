#!/usr/bin/env bun
/**
 * test-zones-cover-projects.script.ts — every vitest project runs in
 * some CI zone, or the gate says which one does not.
 *
 * ## The failure this exists to make impossible
 *
 * The zone matrix passes each zone's `paths` to vitest as positional
 * filters. Vitest matches a filter against a path the PROJECT can see,
 * and a project that declares its own `root` cannot see the directory
 * above it. So `tests` — meant to reach the repository's end-to-end
 * project at `tests/e2e` — selected nothing from it, and `docs` selected
 * the `docs` PLUGIN instead of the example project under
 * `docs/delendai/examples/`.
 *
 * Measured on `develop`: `tests-e2e` (4 specs, 13 tests, the adoption
 * and legacy-migration end-to-end suites) had not run in CI since the
 * zone split landed, and nothing said so. The suite was green because
 * the specs never ran — the most expensive kind of green there is.
 * `no-dead-modules` is what eventually noticed, one step removed: the
 * fixture those specs are the only callers of showed zero executed
 * functions, which reads like dead code rather than like a hole in CI.
 *
 * This asks the question directly instead: for every project the root
 * vitest config lists, is there a zone whose declared paths select it?
 *
 * Exit codes:
 *   0 — every project is reachable from some zone.
 *   1 — at least one is not (or the configuration could not be read).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { ZONE_RULES } from '../ci/test-zones.constant';

const REPO_ROOT = process.cwd();

const SKIP_DIRS = new Set([
	'node_modules',
	'dist',
	'build',
	'coverage',
	'.git',
	'.cache',
]);

export interface IProjectCoverage {
	readonly project: string;
	readonly zone: string | undefined;
}

/**
 * The project directories on disk, which is what the root config's
 * globs resolve to. Read rather than listed, so a project added
 * tomorrow is judged without anyone editing this file.
 */
export const vitestProjectDirs = (
	root: string,
	read: (dir: string) => readonly string[] = (dir) =>
		readdirSync(dir, { withFileTypes: true })
			.filter((entry) => !SKIP_DIRS.has(entry.name))
			.map((entry) =>
				entry.isDirectory() ? `${entry.name}/` : entry.name,
			),
): readonly string[] => {
	const found: string[] = [];
	const walk = (dir: string): void => {
		let entries: readonly string[];
		try {
			entries = read(dir);
		} catch {
			return;
		}
		if (entries.includes('vitest.config.ts') && dir !== root) {
			found.push(relative(root, dir).split('\\').join('/'));
		}
		for (const entry of entries) {
			if (!entry.endsWith('/')) continue;
			walk(join(dir, entry.slice(0, -1)));
		}
	};
	walk(root);
	return found.sort((left, right) => left.localeCompare(right));
};

/**
 * Whether a zone path selects a project.
 *
 * A filter reaches a project when it names the project's own directory
 * or an ancestor of it that the project can still see — which, for a
 * project with its own `root`, means the filter must name the project
 * root itself or a path inside it. Naming a directory ABOVE the root is
 * exactly the mistake this gate exists to catch, so it does not count.
 */
export const zonePathSelects = (
	zonePath: string,
	projectDir: string,
): boolean => zonePath === projectDir || zonePath.startsWith(`${projectDir}/`);

export const coverageOfProjects = (
	projects: readonly string[],
	workspaceDirs: readonly string[],
	rules = ZONE_RULES,
): readonly IProjectCoverage[] =>
	projects.map((project) => ({
		project,
		zone: rules.find((rule) =>
			rule
				.paths(workspaceDirs)
				.some((zonePath) => zonePathSelects(zonePath, project)),
		)?.id,
	}));

export const formatReport = (rows: readonly IProjectCoverage[]): string => {
	const orphans = rows.filter((row) => row.zone === undefined);
	if (orphans.length === 0) {
		return `✓ test-zones-cover-projects: ${String(rows.length)} vitest project(s), every one selected by a zone.`;
	}
	return [
		`✖ test-zones-cover-projects: ${String(orphans.length)} vitest project(s) no zone selects:`,
		'',
		...orphans.map((row) => `  ${row.project}`),
		'',
		'  A project no zone selects does not run in CI, and its suite is',
		'  green because nothing executed it. Add its ROOT to a zone\u2019s',
		'  `paths` in tools/scripts/ci/test-zones.constant.ts — the root',
		'  itself, not the directory above it: vitest matches a filter',
		'  against a path the project can see.',
	].join('\n');
};

const workspaceDirs = (root: string): readonly string[] => {
	const out: string[] = [];
	for (const top of ['packages', 'plugins', 'apps', 'extensions']) {
		let entries: readonly import('node:fs').Dirent[];
		try {
			entries = readdirSync(join(root, top), { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.isDirectory()) out.push(`${top}/${entry.name}`);
		}
	}
	return out;
};

export const main = (): number => {
	const projects = vitestProjectDirs(REPO_ROOT);
	const rows = coverageOfProjects(projects, workspaceDirs(REPO_ROOT));
	const report = formatReport(rows);
	console.log(report);
	return rows.some((row) => row.zone === undefined) ? 1 : 0;
};

if (import.meta.main) {
	void readFileSync;
	process.exit(main());
}
