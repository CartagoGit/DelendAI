import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = join(import.meta.dirname, '../../../../src/lib');

/**
 * The modules that may open the registry file themselves: the reader
 * every other module goes through, and the ones that write the file or
 * compare it with the projection.
 */
const OWNERS: ReadonlySet<string> = new Set([
	'proposals/index-reader.ts',
	'proposals/sync-proposal-registry.ts',
	'services/projection-parity.ts',
	'services/projection-refresh.ts',
]);

/** A read of the index path that does not go through the reader. */
const DIRECT_READS: readonly RegExp[] = [
	/readJsonOrNull(?:<[^;]{0,300}?>)?\(\s*[\w.?]*indexPath/u,
	/\.read(?:Text|File|FileSync)?\(\s*[\w.?]*indexPath/u,
	/basename\(\s*[\w.?]*indexPath/u,
	/readFile(?:Sync)?\(\s*[\w.?]*indexPath/u,
];

const sourcesUnder = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourcesUnder(path);
		return entry.name.endsWith('.ts') ? [path] : [];
	});

describe('the proposal index has one reader', () => {
	it('no module opens the registry file on its own', () => {
		const offenders = sourcesUnder(SOURCE_ROOT)
			.map((path) => relative(SOURCE_ROOT, path))
			.filter((file) => !OWNERS.has(file))
			.filter((file) => {
				const text = readFileSync(join(SOURCE_ROOT, file), 'utf8');
				return DIRECT_READS.some((pattern) => pattern.test(text));
			});

		// A module that reads the file by itself answers with what a registry
		// last recorded, not with what the markdown says: `readProposalIndex`
		// is the way in.
		expect(offenders).toEqual([]);
	});

	it('finds something to measure', () => {
		expect(sourcesUnder(SOURCE_ROOT).length).toBeGreaterThan(OWNERS.size);
		for (const owner of OWNERS) {
			expect(() =>
				readFileSync(join(SOURCE_ROOT, owner), 'utf8'),
			).not.toThrow();
		}
	});
});
