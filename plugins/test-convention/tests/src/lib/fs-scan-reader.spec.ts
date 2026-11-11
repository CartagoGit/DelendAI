/**
 * fs-scan-reader.spec.ts — the scan reader lists and reads inside the
 * root, and refuses anything whose real location is outside it.
 *
 * Both of its entry points resolved paths lexically, which is a string
 * comparison that cannot see a symlink: `root/linked` stays inside the
 * root as text while naming a directory somewhere else. Physical
 * containment resolves the real path before either the listing or the
 * read happens.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFsScanReader } from '../../../src/fs-scan-reader';

describe('createFsScanReader containment', () => {
	let parent = '';
	let root = '';
	let outside = '';

	beforeEach(async () => {
		parent = await mkdtemp(join(tmpdir(), 'scan-reader-'));
		root = join(parent, 'root');
		outside = join(parent, 'outside');
		await mkdir(join(root, 'src'), { recursive: true });
		await mkdir(outside, { recursive: true });
		await writeFile(join(root, 'src', 'inside.ts'), 'export {};', 'utf8');
		await writeFile(join(outside, 'secret.ts'), 'export {};', 'utf8');
	});

	afterEach(async () => {
		await rm(parent, { recursive: true, force: true });
	});

	it('lists a directory that really is inside the root', async () => {
		const entries = await createFsScanReader(root).list('src');

		expect(entries.map((entry) => entry.name)).toContain('inside.ts');
	});

	it('reads a file that really is inside the root', async () => {
		const content =
			await createFsScanReader(root).readFile('src/inside.ts');

		expect(content).toContain('export {}');
	});

	it('lists nothing through a symlink that leaves the root', async () => {
		await symlink(outside, join(root, 'linked'), 'dir');

		const entries = await createFsScanReader(root).list('linked');

		// `outside/secret.ts` would have been listed.
		expect(entries).toEqual([]);
	});

	it('reads nothing through a symlink that leaves the root', async () => {
		await symlink(outside, join(root, 'linked'), 'dir');

		const content =
			await createFsScanReader(root).readFile('linked/secret.ts');

		expect(content).toBeUndefined();
	});

	it('refuses a path that traverses out of the root', async () => {
		expect(await createFsScanReader(root).list('../outside')).toEqual([]);
	});
});
