import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
});
