/**
 * engine-containment.spec.ts — the docs engine lists and reads inside
 * the workspace, and refuses anything whose real location is outside it.
 *
 * Both `listDocs` (a caller-supplied root) and `readDoc` (a
 * caller-supplied path) resolved their input lexically. That is a string
 * comparison, so `workspace/linked/secret.md` passed while `linked`
 * pointed at another tree — handing back documents from outside the
 * workspace entirely. Physical containment resolves the real path first.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listDocs, readDoc } from '../../../../src/lib/services/engine';

describe('docs engine workspace containment', () => {
	let parent = '';
	let workspace = '';
	let outside = '';

	beforeEach(async () => {
		parent = await mkdtemp(join(tmpdir(), 'docs-containment-'));
		workspace = join(parent, 'workspace');
		outside = join(parent, 'outside');
		await mkdir(join(workspace, 'docs'), { recursive: true });
		await mkdir(outside, { recursive: true });
		await writeFile(
			join(workspace, 'docs', 'inside.md'),
			'# Inside\n',
			'utf8',
		);
		await writeFile(join(outside, 'secret.md'), '# Secret\n', 'utf8');
	});

	afterEach(async () => {
		await rm(parent, { recursive: true, force: true });
	});

	it('lists a doc that really is inside the workspace', async () => {
		const report = await listDocs(workspace, { roots: ['docs'] });

		expect(report.docs.map((doc) => doc.path)).toContain('docs/inside.md');
	});

	it('reads a doc that really is inside the workspace', async () => {
		const doc = await readDoc(workspace, 'docs/inside.md');

		expect(doc.found).toBe(true);
		expect(doc.content).toContain('Inside');
	});

	it('lists nothing through a root symlinked out of the workspace', async () => {
		await symlink(outside, join(workspace, 'linked'), 'dir');

		// The roots go in `options.roots`; passing a bare array leaves
		// `roots` undefined and silently falls back to DEFAULT_DOC_ROOTS,
		// which would list the workspace's own docs and prove nothing.
		const report = await listDocs(workspace, { roots: ['linked'] });

		// `outside/secret.md` would have been listed.
		expect(report.docs).toEqual([]);
	});

	it('reads nothing through a path symlinked out of the workspace', async () => {
		await symlink(outside, join(workspace, 'linked'), 'dir');

		const doc = await readDoc(workspace, 'linked/secret.md');

		expect(doc.found).toBe(false);
		expect(doc.content).toBe('');
	});

	it('refuses a root that traverses out of the workspace', async () => {
		const report = await listDocs(workspace, { roots: ['../outside'] });

		expect(report.docs).toEqual([]);
		expect(report.diagnostic).toContain('rejected');
	});
});
