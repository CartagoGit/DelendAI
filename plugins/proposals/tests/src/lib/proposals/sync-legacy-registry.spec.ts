/**
 * sync-legacy-registry.spec.ts — a sync removes the registry's old
 * committed copy beside the proposals, and only a sync allowed to make
 * tracked changes does.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_PATH_LAYOUT } from '@delendai/proposals/lib/contracts/constants/default-path-layout.constant';
import { syncProposalRegistry } from '@delendai/proposals/lib/proposals/sync-proposal-registry';

let root: string;
const legacy = () => join(root, 'docs/delendai/proposals/index.json');

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'sync-legacy-registry-'));
	execFileSync('git', ['init', '-q'], { cwd: root });
	await mkdir(join(root, 'docs/delendai/proposals/ready'), {
		recursive: true,
	});
	await writeFile(
		join(root, 'docs/delendai/proposals/ready/f00001-a.md'),
		'---\nid: f00001\ntitle: "A"\nkind: feat\nstatus: ready\ntype: proposal\ntrack: t\ndate: 2026-10-06\n---\n\n# f00001 — A\n',
	);
	await writeFile(legacy(), '{"proposals":[]}\n');
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe('the registry left beside the proposals', () => {
	it('is kept by an index-only sync, which makes no tracked change', async () => {
		await syncProposalRegistry(
			root,
			DEFAULT_PATH_LAYOUT,
			[],
			undefined,
			undefined,
			undefined,
			true,
		);
		expect(existsSync(legacy())).toBe(true);
	});

	it('is removed by a full sync, and the proposals stay', async () => {
		await syncProposalRegistry(root);
		expect(existsSync(legacy())).toBe(false);
		const index = await syncProposalRegistry(
			root,
			DEFAULT_PATH_LAYOUT,
			[],
			undefined,
			undefined,
			undefined,
			true,
		);
		// The proposal is still listed, wherever the sync filed it.
		expect(index.proposals.map((entry) => entry.id)).toEqual(['f00001']);
	});
});
