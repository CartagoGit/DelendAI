/**
 * proposal-folders-injection.spec.ts
 *
 * M5: host folder policy (e.g. `paused/demos`) is injected via
 * `extraFolders`, not baked into mcp-core. By default the generic
 * proposal-model subtrees are scanned; a host adds its own.
 */

import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { syncProposalRegistry } from '@mcp-vertex/proposals/lib/proposals/sync-proposal-registry';
import { buildSwarmPaths } from '@mcp-vertex/proposals/lib/contracts/constants/default-path-layout.constant';

describe('M5 — injectable proposal folders (paused/demos no longer baked in)', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'proposal-folders-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const layout = () => buildSwarmPaths('.cache/mcp-core', 'docs/mcp-core');

	const writeProposal = (abs: string, id: string): void => {
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(
			abs,
			['---', `id: ${id}`, 'type: feature', 'status: pending', '---', '# X'].join(
				'\n'
			),
			'utf8'
		);
	};

	const indexIds = (l: ReturnType<typeof layout>): string[] => {
		const index = JSON.parse(
			readFileSync(join(root, l.proposalIndexFile), 'utf8')
		) as { proposals: Array<{ id: string }> };
		return index.proposals.map((p) => p.id);
	};

	it('does NOT scan paused/demos by default (no host vocabulary baked in)', async () => {
		const l = layout();
		writeProposal(join(root, l.proposalsDir, 'paused/demos/p99-demo.md'), 'p99');

		await syncProposalRegistry(root, l);

		expect(indexIds(l)).not.toContain('p99');
	});

	it('scans an injected extra folder (paused/demos)', async () => {
		const l = layout();
		writeProposal(join(root, l.proposalsDir, 'paused/demos/p99-demo.md'), 'p99');

		await syncProposalRegistry(root, l, ['paused/demos']);

		expect(indexIds(l)).toContain('p99');
	});

	it('still scans the generic subtrees regardless of extraFolders', async () => {
		const l = layout();
		writeProposal(join(root, l.proposalsDir, 'p01-root.md'), 'p01');
		writeProposal(join(root, l.proposalsDir, 'fixes/f01-fix.md'), 'f01');

		await syncProposalRegistry(root, l, ['paused/demos']);

		const ids = indexIds(l);
		expect(ids).toContain('p01');
		expect(ids).toContain('f01');
	});

	it('accepts multiple injected host folders', async () => {
		const l = layout();
		writeProposal(join(root, l.proposalsDir, 'paused/demos/p99-demo.md'), 'p99');
		writeProposal(join(root, l.proposalsDir, 'experiments/p98-exp.md'), 'p98');

		await syncProposalRegistry(root, l, ['paused/demos', 'experiments']);

		const ids = indexIds(l);
		expect(ids).toContain('p99');
		expect(ids).toContain('p98');
	});
});
