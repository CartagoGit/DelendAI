/**
 * near-specs.ts — the specs a change can affect, for the local proof.
 *
 * `vitest --changed` walks the whole import graph, and a change to core
 * reached nearly every spec through its barrels: 656 s on average. The
 * proof runs the specs the change touched (`test-scope`) and the specs on
 * record reading a changed file, and nothing else, unless `testing.scope`
 * in `delendai.config.json` asks for more: `reach`
 * is the analysis of the forge's test plan, followed by symbol
 * (`affected-specs.service`), plus the specs that read a changed file.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { affectedSpecsSince, repositorySince } from './affected-specs.service';
import { readTestScope, touchedSpecsOf, type ITestScope } from './test-scope';
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
		// `x.e2e.spec.ts` is the heavy tier of `x.spec.ts`: it is near the
		// same source, so moving a spec there keeps the coverage it gave.
		const name = (spec.split('/').pop() ?? spec).replace(
			/\.e2e\.spec\.ts$/u,
			'.spec.ts',
		);
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

/**
 * The specs to run for the branch's change since `base`, read from git, by
 * the project's `testing.scope`: the touched ones by default (`test-scope`),
 * what the change reaches (the forge's analysis, plus the specs that read a
 * changed file) for `reach`, every tracked spec for `all`.
 */
export const nearSpecsSince = (
	root: string,
	base: string,
	scope: ITestScope = readTestScope(root),
): readonly string[] => {
	if (scope === 'reach')
		return [
			...new Set([
				// The same answer the forge's test plan gives: followed by symbol.
				...affectedSpecsSince(root, base),
				...readerSpecs(changedSince(root, base), readMapAt(root)),
			]),
		].sort();
	const { files, changed, paths } = repositorySince(root, base);
	if (scope === 'all')
		return files
			.filter((file) => /\.(?:spec|test)\.tsx?$/u.test(file))
			.sort();
	// A file no spec imports, a proposal say, is reached by the specs on
	// record reading it, and only by them: a review batch runs those.
	return [
		...new Set([
			...touchedSpecsOf(root, changed, files, paths),
			...readerSpecs(changed, readMapAt(root)),
		]),
	].sort();
};
