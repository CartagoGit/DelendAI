/**
 * Specs for the workspace scan engine (f00037 S3). Drives
 * `scanConventions` through an in-memory `IDirReader` so the walk,
 * skip-dirs, role aggregation and unmatched-sorting are verified with
 * zero filesystem I/O.
 */
import { describe, expect, it } from 'vitest';

import {
	scanConventions,
	type IDirEntry,
	type IDirReader,
} from '../../../../src/lib/services/conventions-scan.service';

/** Build an in-memory reader from a flat `dir -> entries` map. */
const memoryReader = (
	tree: Record<string, readonly IDirEntry[]>,
): IDirReader => ({
	async list(relDir) {
		return tree[relDir] ?? [];
	},
});

const dir = (name: string): IDirEntry => ({ name, isDirectory: true });
const file = (name: string): IDirEntry => ({ name, isDirectory: false });

describe('scanConventions', () => {
	it('classifies a small tree and aggregates per-role counts', async () => {
		const reader = memoryReader({
			pkg: [dir('src')],
			'pkg/src': [dir('lib'), file('index.ts')],
			'pkg/src/lib': [
				file('a.tool.ts'),
				file('b.service.ts'),
				file('helper.ts'),
				file('notes.md'),
			],
		});

		const res = await scanConventions(reader, ['pkg']);
		expect(res.total).toBe(4); // 4 .ts files; notes.md ignored
		expect(res.counts.tool).toBe(1);
		expect(res.counts.service).toBe(1);
		expect(res.counts.barrel).toBe(1); // pkg/src/index.ts
		expect(res.counts.other).toBe(1); // helper.ts
		expect(res.unmatched).toEqual(['pkg/src/lib/helper.ts']);
	});

	it('skips node_modules, dist, .git, .cache and build', async () => {
		const reader = memoryReader({
			pkg: [
				dir('node_modules'),
				dir('dist'),
				dir('.git'),
				dir('build'),
				dir('src'),
			],
			'pkg/node_modules': [file('evil.ts')],
			'pkg/dist': [file('out.ts')],
			'pkg/src': [file('real.tool.ts')],
		});
		const res = await scanConventions(reader, ['pkg']);
		expect(res.total).toBe(1);
		expect(res.counts.tool).toBe(1);
	});

	it('returns a sorted unmatched list', async () => {
		const reader = memoryReader({
			pkg: [
				file('z-helper.ts'),
				file('a-helper.ts'),
				file('m-helper.ts'),
			],
		});
		const res = await scanConventions(reader, ['pkg']);
		expect(res.unmatched).toEqual([
			'pkg/a-helper.ts',
			'pkg/m-helper.ts',
			'pkg/z-helper.ts',
		]);
	});

	it('tolerates an unreadable directory (rejected list)', async () => {
		const reader: IDirReader = {
			async list(relDir) {
				if (relDir === 'pkg/secret') throw new Error('EACCES');
				if (relDir === 'pkg')
					return [dir('secret'), file('ok.tool.ts')];
				return [];
			},
		};
		const res = await scanConventions(reader, ['pkg']);
		// The unreadable subdir is skipped; the rest still classified.
		expect(res.counts.tool).toBe(1);
	});
});
