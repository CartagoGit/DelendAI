/**
 * proposal-board-provider.spec.ts — f00097 S2.
 *
 * Pins the evolved `ProposalBoardProvider`: header chips, status-group roots
 * built from the snapshot, proposal leaves that route to
 * `delendai.openProposal`, filters that narrow WITHOUT refetching, and a
 * recoverable banner (never a crash) for malformed board payloads.
 */
import { describe, expect, it, vi } from 'vitest';

import { McpStdioClient } from '@delendai/client';

import {
	ProposalBoardProvider,
	type IProposalNode,
} from '../providers/proposal-board-provider';

interface IStubTools {
	readonly board?: unknown;
	readonly compact?: unknown;
	readonly health?: unknown;
	readonly stale?: unknown;
}

const clientFor = (tools: IStubTools, onCall?: (name: string) => void) =>
	McpStdioClient.fromTransport({
		async callTool(input) {
			onCall?.(input.name);
			const suffix = input.name.replace(/^delendai_/, '');
			const map: Record<string, unknown> = {
				proposals_proposal_board: tools.board ?? { proposals: [] },
				proposals_compact_status: tools.compact ?? {},
				proposals_state_health: tools.health ?? {},
				proposals_proposal_stale_list: tools.stale ?? {},
			};
			return { structuredContent: map[suffix] ?? {} };
		},
	});

const board = {
	proposals: [
		{ id: 'f3', status: 'done', slices: [] },
		{ id: 'f1', status: 'ready', slices: [] },
		{
			id: 'f2',
			status: 'in-progress',
			slices: [{ sliceId: 'S1', status: 'done', owner: null }],
			claimableSliceIds: ['S2'],
		},
	],
};

const groups = (nodes: readonly IProposalNode[]) =>
	nodes.filter((n) => n.nodeType === 'group');
const chips = (nodes: readonly IProposalNode[]) =>
	nodes.filter((n) => n.nodeType === 'chip');

describe('ProposalBoardProvider (f00097 S2)', () => {
	it('renders four header chips derived from the aux tools', async () => {
		const provider = new ProposalBoardProvider(
			clientFor({
				board,
				health: {
					locks: { active: 2 },
					queue: { waiterOrphans: 1 },
					registry: { orphans: 0 },
					healthy: false,
				},
				stale: { ok: true, count: 3 },
			}),
		);

		const chipNodes = chips(await provider.getChildren());
		expect(chipNodes.map((n) => n.label)).toEqual([
			'Locks (2)',
			'Stale (3)',
			'Queue (backpressure)',
			'Health (crit)',
		]);
	});

	it('groups proposals by status in canonical order', async () => {
		const provider = new ProposalBoardProvider(clientFor({ board }));
		const roots = await provider.getChildren();
		expect(groups(roots).map((n) => n.label)).toEqual([
			'Ready',
			'In progress',
			'Done',
		]);

		const inProgress = groups(roots).find((n) => n.label === 'In progress');
		const leaves = await provider.getChildren(inProgress);
		expect(leaves).toHaveLength(1);
		expect(leaves[0]).toMatchObject({
			label: 'f2',
			description: 'in-progress • 1 slices',
			tooltip: '1 claimable slices',
			command: { command: 'delendai.openProposal', arguments: ['f2'] },
		});
	});

	it('text filter narrows leaves without refetching the snapshot', async () => {
		let boardCalls = 0;
		const provider = new ProposalBoardProvider(
			clientFor({ board }, (name) => {
				if (name.endsWith('proposal_board')) boardCalls += 1;
			}),
		);

		await provider.getChildren(); // first fetch
		provider.setFilters({ text: 'f2' });
		const roots = await provider.getChildren();
		expect(groups(roots).map((n) => n.label)).toEqual(['In progress']);
		expect(boardCalls).toBe(1); // filter change did NOT refetch
	});

	it('refresh() invalidates the cache and refetches', async () => {
		let boardCalls = 0;
		const provider = new ProposalBoardProvider(
			clientFor({ board }, (name) => {
				if (name.endsWith('proposal_board')) boardCalls += 1;
			}),
		);
		await provider.getChildren();
		provider.refresh();
		await provider.getChildren();
		expect(boardCalls).toBe(2);
	});

	it('persists filters through the filter store', async () => {
		const store = { value: {} as Record<string, unknown> };
		const filterStore = {
			read: () => store.value,
			write: (f: Record<string, unknown>) => {
				store.value = f;
			},
		};
		const provider = new ProposalBoardProvider(clientFor({ board }), {
			filterStore,
		});
		provider.setFilters({ status: 'ready' });
		expect(store.value).toEqual({ status: 'ready' });

		// A fresh provider re-reads the persisted filter.
		const revived = new ProposalBoardProvider(clientFor({ board }), {
			filterStore,
		});
		expect(revived.getFilters()).toEqual({ status: 'ready' });
	});

	it('surfaces a recoverable banner for a malformed board payload', async () => {
		const provider = new ProposalBoardProvider(
			clientFor({ board: { nope: true } }),
		);
		const roots = await provider.getChildren();
		const banner = roots.find((n) => n.nodeType === 'banner');
		expect(banner).toBeDefined();
		expect(banner?.command?.command).toBe('delendai.proposals.copyError');
		expect(banner?.command?.arguments?.[0]).toContain('nope');
		// Still no crash and no groups.
		expect(groups(roots)).toHaveLength(0);
	});

	it('renders the board even when every aux tool call fails', async () => {
		const provider = new ProposalBoardProvider(
			McpStdioClient.fromTransport({
				async callTool(input) {
					if (input.name.endsWith('proposal_board')) {
						return { structuredContent: board };
					}
					return { isError: true, content: [{ text: 'boom' }] };
				},
			}),
		);
		const roots = await provider.getChildren();
		expect(chips(roots).map((n) => n.label)).toEqual([
			'Locks (0)',
			'Stale (0)',
			'Queue (clear)',
			'Health (unknown)',
		]);
		expect(groups(roots)).toHaveLength(3);
	});

	it('never refetches within the TTL window', async () => {
		let now = 1_000;
		let boardCalls = 0;
		const provider = new ProposalBoardProvider(
			clientFor({ board }, (name) => {
				if (name.endsWith('proposal_board')) boardCalls += 1;
			}),
			{ ttlMs: 30_000, now: () => now },
		);
		await provider.getChildren();
		now += 10_000; // within TTL
		await provider.getChildren();
		expect(boardCalls).toBe(1);
		now += 25_000; // now past TTL
		await provider.getChildren();
		expect(boardCalls).toBe(2);
	});

	it('fires the change listener on refresh', async () => {
		const provider = new ProposalBoardProvider(clientFor({ board }));
		const listener = vi.fn();
		provider.onDidChangeTreeData(listener);
		provider.refresh();
		expect(listener).toHaveBeenCalledTimes(1);
	});
});
