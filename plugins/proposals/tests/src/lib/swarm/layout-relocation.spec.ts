import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { syncProposalRegistry } from '@mcp-vertex/proposals/lib/proposals/sync-proposal-registry';
import { collectRoundContextSnapshot } from '@mcp-vertex/proposals/lib/swarm/round-context';
import { buildSwarmPaths } from '@mcp-vertex/proposals/lib/contracts/constants/default-path-layout.constant';

/**
 * F3: a relocated store (different `--cacheDir` / `--docsDir`) must stay
 * coherent end to end. The engines bake DEFAULT_PATH_LAYOUT only as a
 * default; when the plugin derives a layout from the core's resolved
 * roots, both the proposal index sync and the round-context snapshot
 * read/write under that layout — not under `.cache` / `docs`.
 */
describe('F3 — engines honor a relocated path layout', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'layout-reloc-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const writeFileEnsured = (abs: string, body: string): void => {
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	it('syncProposalRegistry writes the index under the custom docs root', async () => {
		const layout = buildSwarmPaths('.cache/relocated', 'docs/relocated');
		writeFileEnsured(
			join(root, layout.proposalsDir, 'p01-demo.md'),
			['---', 'id: p01', 'type: feature', 'status: pending', '---', '# Demo'].join(
				'\n'
			)
		);

		const result = await syncProposalRegistry(root, layout);

		// Index lands under the relocated docs root, NOT under docs/proposals.
		expect(result.indexPath).toBe(join(root, layout.proposalIndexFile));
		expect(existsSync(join(root, 'docs/mcp-vertex/proposals/index.json'))).toBe(false);
		const index = JSON.parse(
			readFileSync(join(root, layout.proposalIndexFile), 'utf8')
		);
		expect(index.proposals.map((p: { id: string }) => p.id)).toContain('p01');
	});

	it('collectRoundContextSnapshot reads the lock under the custom cache root', async () => {
		const layout = buildSwarmPaths('.cache/relocated', 'docs/relocated');
		writeFileEnsured(
			join(root, layout.lockFile),
			JSON.stringify({
				in_flight: [
					{
						task_id: 't1',
						agent: 'falcon',
						ownership: ['src/a.ts'],
						last_seen: new Date().toISOString(),
					},
				],
			})
		);

		const snapshot = await collectRoundContextSnapshot(root, layout);

		expect(snapshot.activeLocks.map((l) => l.taskId)).toContain('t1');
	});

	it('defaults to DEFAULT_PATH_LAYOUT when no layout is passed (legacy host back-compat)', async () => {
		writeFileEnsured(
			join(root, 'docs/mcp-vertex/proposals/p02-default.md'),
			['---', 'id: p02', 'type: feature', 'status: pending', '---', '# Def'].join(
				'\n'
			)
		);

		const result = await syncProposalRegistry(root);

		expect(result.indexPath).toBe(join(root, 'docs/mcp-vertex/proposals/index.json'));
	});
});
