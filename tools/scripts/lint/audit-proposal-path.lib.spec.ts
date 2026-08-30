import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { assertNoLegacyAuditDirectory } from './audit-proposal-path.lib';

describe('audit proposal path guard', () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots
				.splice(0)
				.map((root) => rm(root, { recursive: true, force: true })),
		);
	});

	it('accepts a workspace without the legacy audit directory', async () => {
		const root = await mkdtemp(join(tmpdir(), 'audit-path-guard-'));
		roots.push(root);

		await expect(
			assertNoLegacyAuditDirectory(root),
		).resolves.toBeUndefined();
	});

	it('rejects the legacy audit directory', async () => {
		const root = await mkdtemp(join(tmpdir(), 'audit-path-guard-'));
		roots.push(root);
		await mkdir(join(root, 'docs/mcp-vertex/audits'), { recursive: true });

		await expect(assertNoLegacyAuditDirectory(root)).rejects.toThrow(
			'legacy audit directory',
		);
	});
});
