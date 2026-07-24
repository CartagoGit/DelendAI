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

describe('scanConventions', async () => {
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
		expect(res.counts.helper).toBe(1); // helper.ts now classified as `helper` (was `other` before f00037 S-helper)
		expect(res.unmatched).toEqual([]);
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

	it('scans with a non-TS profile: python extensions, roles and skip dirs (f00113 S5)', async () => {
		const { PYTHON_PROFILE } = await import(
			'../../../../src/lib/profiles/python.profile'
		);
		const reader = memoryReader({
			pkg: [
				file('__init__.py'),
				file('service.py'),
				file('ignored.ts'), // wrong extension for this profile
				dir('tests'),
				dir('__pycache__'),
			],
			'pkg/tests': [file('test_service.py')],
			'pkg/__pycache__': [file('service.cpython-312.py')],
		});
		const res = await scanConventions(reader, ['pkg'], PYTHON_PROFILE);
		expect(res.total).toBe(3);
		expect(res.counts['package-marker']).toBe(1);
		expect(res.counts.module).toBe(1);
		expect(res.counts.test).toBe(1);
		expect(res.unmatched).toEqual([]);
	});
});

describe('scanConventions — zero-scan self-diagnosis (a00064)', async () => {
	/** A reader that throws for dirs missing from the tree (fs-like). */
	const strictReader = (
		tree: Record<string, readonly IDirEntry[]>,
	): IDirReader => ({
		async list(relDir) {
			const entries = tree[relDir];
			if (entries === undefined)
				throw new Error(`ENOENT: ${relDir || '.'}`);
			return entries;
		},
	});

	it('reports roots whose own listing failed as missingRoots', async () => {
		const reader = strictReader({
			src: [file('a.service.ts')],
		});
		const res = await scanConventions(reader, [
			'src',
			'packages',
			'plugins',
		]);
		expect(res.total).toBe(1);
		expect(res.missingRoots).toEqual(['packages', 'plugins']);
	});

	it('missingRoots is empty when every root lists fine', async () => {
		const reader = strictReader({ src: [file('a.service.ts')] });
		const res = await scanConventions(reader, ['src']);
		expect(res.missingRoots).toEqual([]);
	});
});
