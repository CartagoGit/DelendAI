import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFsDirReader } from '../../../../src/lib/services/fs-dir-reader.service';
import { scanConventions } from '../../../../src/lib/services/conventions-scan.service';

describe('createFsDirReader workspace containment', async () => {
	let parent = '';
	let workspace = '';
	let outside = '';

	beforeEach(async () => {
		parent = await mkdtemp(join(tmpdir(), 'conventions-reader-'));
		workspace = join(parent, 'workspace');
		outside = join(parent, 'outside');
		await mkdir(join(workspace, 'src'), { recursive: true });
		await mkdir(outside, { recursive: true });
		await writeFile(join(workspace, 'src', 'inside.tool.ts'), 'export {};');
		await writeFile(join(outside, 'secret.tool.ts'), 'export {};');
	});

	afterEach(async () => {
		await rm(parent, { recursive: true, force: true });
	});

	it('scans a valid workspace-relative root', async () => {
		const reader = await createFsDirReader(workspace);
		const result = await scanConventions(reader, ['src']);
		expect(result.total).toBe(1);
		expect(result.counts.tool).toBe(1);
	});

	it('does not scan a caller root that traverses outside the workspace', async () => {
		const reader = await createFsDirReader(workspace);
		const result = await scanConventions(reader, ['../outside']);
		expect(result.total).toBe(0);
	});

	it('does not scan an absolute root supplied by caller or config', async () => {
		const reader = await createFsDirReader(workspace);
		const result = await scanConventions(reader, [outside]);
		expect(result.total).toBe(0);
	});

	/**
	 * The gap the lexical check could not see. `workspace/linked` is a
	 * path that never leaves the workspace as a STRING, so the string
	 * comparison accepted it — while the directory it names is somewhere
	 * else entirely. Physical containment resolves the real path first.
	 */
	it('does not scan through a symlink that leaves the workspace', async () => {
		await symlink(outside, join(workspace, 'linked'), 'dir');

		const reader = await createFsDirReader(workspace);
		const result = await scanConventions(reader, ['linked']);

		// `outside/secret.tool.ts` would have counted as a tool.
		expect(result.total).toBe(0);
	});
});
