import { describe, expect, it } from 'vitest';

import { scanFile } from './json-entry-collision.script.ts';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const withTemp = async (fn: (dir: string) => Promise<void>): Promise<void> => {
	const dir = await mkdtemp(join(tmpdir(), 'json-entry-collision-'));
	try {
		await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};

describe('json-entry-collision lint', () => {
	it('returns no violations on a well-formed tsconfig.json-style file', async () => {
		await withTemp(async (dir) => {
			const file = join(dir, 'good.json');
			await writeFile(
				file,
				[
					'{',
					'\t"compilerOptions": {',
					'\t\t"paths": {',
					'\t\t\t"@delendai/foo": ["./plugins/foo/src/index.ts"],',
					'\t\t\t"@delendai/bar": ["./plugins/bar/src/index.ts"]',
					'\t\t}',
					'\t}',
					'}',
					'',
				].join('\n'),
				'utf8',
			);
			const result = await scanFile(file, 'good.json');
			expect(result).toEqual([]);
		});
	});

	it('flags ENTRY-COLLISION when two entries share a single physical line', async () => {
		await withTemp(async (dir) => {
			const file = join(dir, 'bad-glued.json');
			await writeFile(
				file,
				[
					'{',
					'\t"compilerOptions": {',
					'\t\t"paths": {',
					// Two entries glued on the same line — the exact 2026-08-31 regression.
					'\t\t\t"@delendai/api/*": ["./plugins/api/src/*"],\t\t"@delendai/github": ["./plugins/github/src/index.ts"],',
					'\t\t\t"@delendai/github/*": ["./plugins/github/src/*"]',
					'\t\t}',
					'\t}',
					'}',
					'',
				].join('\n'),
				'utf8',
			);
			const result = await scanFile(file, 'bad-glued.json');
			const rules = result.map((v) => v.rule);
			expect(rules).toContain('ENTRY-COLLISION');
		});
	});

	it('flags INDENT-DRIFT when a key uses fewer tabs than its siblings', async () => {
		await withTemp(async (dir) => {
			const file = join(dir, 'bad-indent.json');
			await writeFile(
				file,
				[
					'{',
					'\t"compilerOptions": {',
					// Sibling uses 2 tabs.
					'\t\t"mode": "strict",',
					// This key uses 3 tabs while its peers use 2 — drift.
					'\t\t\t"@delendai/stale": ["./plugins/stale/src/index.ts"],',
					'\t\t}',
					'}',
					'',
				].join('\n'),
				'utf8',
			);
			const result = await scanFile(file, 'bad-indent.json');
			const drift = result.filter((v) => v.rule === 'INDENT-DRIFT');
			expect(drift.length).toBeGreaterThan(0);
		});
	});

	it('ignores JSONC-style `//` comments between entries', async () => {
		await withTemp(async (dir) => {
			const file = join(dir, 'jsonc-good.json');
			await writeFile(
				file,
				[
					'{',
					'\t"compilerOptions": {',
					'\t\t"paths": {',
					'\t\t\t"@delendai/foo": ["./plugins/foo/src/index.ts"], // inline',
					'\t\t\t"@delendai/bar": ["./plugins/bar/src/index.ts"]',
					'\t\t}',
					'\t}',
					'}',
					'',
				].join('\n'),
				'utf8',
			);
			const result = await scanFile(file, 'jsonc-good.json');
			expect(result).toEqual([]);
		});
	});
});
