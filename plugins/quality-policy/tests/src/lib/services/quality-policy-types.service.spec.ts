/**
 * quality-policy-types.service.spec.ts — the type policy is read from
 * every workspace package's tsconfig, and a package that differs from the
 * root is named.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildTypesEntry } from '../../../../src/lib/services/quality-policy-types.service';

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0))
		await rm(root, { recursive: true, force: true });
});

const write = async (path: string, body: unknown): Promise<void> => {
	await mkdir(join(path, '..'), { recursive: true });
	await writeFile(path, JSON.stringify(body));
};

describe('buildTypesEntry', () => {
	it('names the workspace packages whose tsconfig is not as strict as the root', async () => {
		const root = await mkdtemp(join(tmpdir(), 'quality-types-'));
		roots.push(root);
		await write(join(root, 'package.json'), { workspaces: ['packages/*'] });
		await write(join(root, 'tsconfig.json'), {
			compilerOptions: { strict: true },
		});
		await write(join(root, 'packages', 'strict', 'tsconfig.json'), {
			extends: '../../tsconfig.json',
		});
		await write(join(root, 'packages', 'loose', 'tsconfig.json'), {
			compilerOptions: { strict: false },
		});
		const entry = await buildTypesEntry(root);
		expect(entry.strict).toBe(true);
		expect(entry.tsconfigAreas).toEqual([
			{ path: 'packages/loose/tsconfig.json', strict: false },
		]);
		expect(entry.summary).toContain('3 tsconfig(s) read');
		expect(entry.summary).toContain('packages/loose/tsconfig.json');
	});

	it('says every package follows the root when none differs', async () => {
		const root = await mkdtemp(join(tmpdir(), 'quality-types-'));
		roots.push(root);
		await write(join(root, 'package.json'), { workspaces: ['packages/*'] });
		await write(join(root, 'tsconfig.json'), {
			compilerOptions: { strict: true },
		});
		await write(join(root, 'packages', 'a', 'tsconfig.json'), {
			extends: '../../tsconfig.json',
		});
		const entry = await buildTypesEntry(root);
		expect(entry.tsconfigAreas).toBeUndefined();
		expect(entry.summary).toContain('every package follows the root');
	});
});
