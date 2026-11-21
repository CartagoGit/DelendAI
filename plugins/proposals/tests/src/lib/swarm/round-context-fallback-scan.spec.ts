/**
 * round-context-fallback-scan.spec.ts — with no index, the round context
 * finds proposals in the folders they live in and counts both spellings
 * of in-progress.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectRoundContextSnapshot } from '../../../../src/lib/swarm/round-context-sources';

let root = '';

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'round-fallback-'));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const proposal = (folder: string, id: string, status: string): void => {
	const dir = join(root, 'docs/delendai/proposals', folder);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${id}-work.md`),
		`---\nid: ${id}\nstatus: ${status}\n---\n# ${id}\n`,
	);
};

describe('the round context without an index', () => {
	it('finds proposals in the status and kind folders, and counts both in-progress spellings', async () => {
		proposal('in-progress', 'x00001', 'in-progress');
		proposal('in-progress', 'x00002', 'in_progress');
		proposal('ready/fixes', 'x00003', 'ready');
		proposal('done/fixes', 'x00004', 'done');

		const snapshot = await collectRoundContextSnapshot(root);

		expect(snapshot.proposalPortfolio).toMatchObject({
			strategy: 'fallback-scan',
			activeCount: 3,
			inProgressCount: 2,
		});
	});
});
