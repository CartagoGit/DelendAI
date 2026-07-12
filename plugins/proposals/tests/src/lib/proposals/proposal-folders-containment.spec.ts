import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { syncProposalRegistry } from '@mcp-vertex/proposals/lib/proposals/sync-proposal-registry';
import { collectRoundContextSnapshot } from '@mcp-vertex/proposals/lib/swarm/round-context-sources';

describe('custom proposal folder containment', () => {
	let root: string | undefined;

	afterEach(async () => {
		if (root !== undefined)
			await rm(root, { recursive: true, force: true });
	});

	it('rejects traversal in registry sync and live round-context scans', async () => {
		root = await mkdtemp(join(tmpdir(), 'proposal-folders-'));

		await expect(
			syncProposalRegistry(root, undefined, ['../../outside']),
		).rejects.toThrow('escapes proposalsDir');
		await expect(
			collectRoundContextSnapshot(root, undefined, ['../../outside']),
		).rejects.toThrow('escapes proposalsDir');
	});

	it('rejects absolute custom folders', async () => {
		root = await mkdtemp(join(tmpdir(), 'proposal-folders-'));
		await expect(
			syncProposalRegistry(root, undefined, [tmpdir()]),
		).rejects.toThrow('escapes proposalsDir');
	});
});
