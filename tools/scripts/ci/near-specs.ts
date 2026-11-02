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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ZONE_READ_MAP_PATH } from './test-zones.constant';
import type { IZoneReadMap } from './test-zones.interface';
import { parseZoneReadMap, readersOf } from './zone-reads';

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
	sourceImportersOf?: (stem: string) => readonly string[],
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
		const direct = [
			...(byName.get(`${stem}.spec.ts`) ?? []),
			...importersOf(stem),
		];
		// A file no spec reaches directly (generated data, say) is reached
		// through the sources that import it; without them its coverage
		// reads 0% for a file nothing near was asked to run.
		const near =
			direct.length > 0
				? direct
				: (sourceImportersOf?.(stem) ?? []).flatMap((source) => {
						const name = stemOf(source);
						return [
							...(byName.get(`${name}.spec.ts`) ?? []),
							...importersOf(name),
						];
					});
		for (const spec of near) out.add(spec);
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

const readMapAt = (root: string): IZoneReadMap | undefined => {
	try {
		return parseZoneReadMap(
			readFileSync(join(root, ZONE_READ_MAP_PATH), 'utf8'),
		);
	} catch {
		// No map: only the nearest specs run; the forge still runs the readers.
		return undefined;
	}
};

/** The files of `pattern` that import a module stem by path. */
const importersIn = (
	root: string,
	stem: string,
	pattern: string,
): readonly string[] => {
	try {
		return lines(
			git(root, [
				'grep',
				'-l',
				'-E',
				`from ['"][^'"]*/${stem.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(\\.ts)?['"]`,
				'--',
				pattern,
			]),
		);
	} catch {
		// `git grep` exits 1 when nothing matches.
		return [];
	}
};

/**
 * The specs the read map records reading a changed file. A spec that reads
 * a file from disk imports nothing the nearest specs can find: the published
 * token figures failed on the forge, after a proof that never ran their spec.
 */
export const readerSpecs = (
	changed: readonly string[],
	map: IZoneReadMap | undefined,
): readonly string[] =>
	[
		...readersOf(
			changed.map((path) => ({ path, listing: false })),
			map,
		).values(),
	]
		.flat()
		.sort();

/** The nearest specs of the branch's change since `base`, read from git. */
export const nearSpecsSince = (root: string, base: string): readonly string[] =>
	[
		...new Set([
			...nearSpecs(
				changedSince(root, base),
				lines(git(root, ['ls-files', '*.spec.ts'])),
				(stem) => importersIn(root, stem, '*.spec.ts'),
				(stem) =>
					importersIn(root, stem, '*.ts').filter(
						(file) => !file.endsWith('.spec.ts'),
					),
			),
			...readerSpecs(changedSince(root, base), readMapAt(root)),
		]),
	].sort();
