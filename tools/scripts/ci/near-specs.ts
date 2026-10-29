/**
 * near-specs.ts — the specs nearest a change: each changed spec, the spec
 * named after each changed source, and the specs that import a changed
 * file by its path.
 *
 * The local proof's test step. `vitest --changed` walks the whole import
 * graph, and a change to core reaches nearly every spec through its
 * barrels: 656 s on average for a core change, against 31 s for these.
 * It is fast feedback, not the verdict — the forge runs the reach the
 * zone planner computes, sharded, and is the authority.
 */
import { execFileSync } from 'node:child_process';

/** The sources whose nearest specs are worth running. */
const SOURCE = /^(packages|plugins|tools|extensions|apps)\/.*\.ts$/u;
/** Generated locale leaves: no spec is named after them, and thousands exist. */
const LEAVES = /^apps\/web\/src\/i18n\//u;

/** Whether a changed path is a source the nearest specs are looked up for. */
export const isNearSource = (path: string): boolean =>
	SOURCE.test(path) && !LEAVES.test(path);

const stemOf = (path: string): string =>
	(path.split('/').pop() ?? path).replace(/\.ts$/u, '');

/**
 * The nearest specs, from the changed paths, every tracked spec, and the
 * specs that import a module stem by path. Sorted, without duplicates.
 */
export const nearSpecs = (
	changed: readonly string[],
	specs: readonly string[],
	importersOf: (stem: string) => readonly string[],
): readonly string[] => {
	const out = new Set<string>();
	const byName = new Map<string, string[]>();
	for (const spec of specs) {
		const name = spec.split('/').pop() ?? spec;
		byName.set(name, [...(byName.get(name) ?? []), spec]);
	}
	for (const file of changed.filter(isNearSource)) {
		if (file.endsWith('.spec.ts')) {
			if (specs.includes(file)) out.add(file);
			continue;
		}
		const stem = stemOf(file);
		for (const spec of byName.get(`${stem}.spec.ts`) ?? []) out.add(spec);
		for (const spec of importersOf(stem)) out.add(spec);
	}
	return [...out].sort();
};

const git = (root: string, args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'ignore'],
	}).trim();

const lines = (text: string): string[] =>
	text.split('\n').filter((line) => line.length > 0);

/** The files the branch changed since `base`, deletions left out. */
export const changedSince = (root: string, base: string): readonly string[] =>
	lines(
		git(root, ['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`]),
	);

/** The nearest specs of the branch's change since `base`, read from git. */
export const nearSpecsSince = (root: string, base: string): readonly string[] =>
	nearSpecs(
		changedSince(root, base),
		lines(git(root, ['ls-files', '*.spec.ts'])),
		(stem) => {
			try {
				return lines(
					git(root, [
						'grep',
						'-l',
						'-E',
						`from ['"][^'"]*/${stem.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(\\.ts)?['"]`,
						'--',
						'*.spec.ts',
					]),
				);
			} catch {
				// `git grep` exits 1 when nothing matches.
				return [];
			}
		},
	);
