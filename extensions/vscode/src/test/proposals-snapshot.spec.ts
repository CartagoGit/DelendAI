/**
 * proposals-snapshot.spec.ts — f00097 S2 data layer.
 *
 * Unit-tests the pure projection helpers and the TTL cache of
 * `ProposalsSnapshotSource` with a fake client + injected clock.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import {
	ProposalsSnapshotSource,
	deriveChips,
	projectProposals,
} from '../lib/proposals-snapshot';

describe('projectProposals', () => {
	it('projects well-formed entries and drops unknown fields', () => {
		const { proposals, recoverable } = projectProposals({
			proposals: [
				{
					id: 'f1',
					status: 'ready',
					extra: 'ignored',
					slices: [
						{ sliceId: 'S1', status: 'done', owner: 'a', junk: 1 },
					],
					claimableSliceIds: ['S2'],
				},
			],
		});
		expect(recoverable).toBeUndefined();
		expect(proposals).toEqual([
			{
				id: 'f1',
				status: 'ready',
				slices: [{ sliceId: 'S1', status: 'done', owner: 'a' }],
				claimableSliceIds: ['S2'],
			},
		]);
	});

	it('drops entries missing id/status but keeps the valid ones', () => {
		const { proposals } = projectProposals({
			proposals: [{ status: 'ready' }, { id: 'f2', status: 'done' }],
		});
		expect(proposals.map((p) => p.id)).toEqual(['f2']);
	});

	it('returns a recoverable banner for a non-array payload', () => {
		const { proposals, recoverable } = projectProposals({ nope: true });
		expect(proposals).toEqual([]);
		expect(recoverable?.raw).toContain('nope');
	});

	it('returns a recoverable banner for undefined (tool failure)', () => {
		const { recoverable } = projectProposals(undefined);
		expect(recoverable?.message).toContain('no payload');
	});
});

describe('deriveChips', () => {
	it('prefers state_health for locks and derives crit health', () => {
		const chips = deriveChips({
			compact: { locks: { active: 9 } },
			health: {
				locks: { active: 2 },
				queue: { waiterOrphans: 1 },
				registry: { orphans: 3 },
				healthy: false,
			},
			stale: { count: 4 },
		});
		expect(chips).toEqual({
			locks: 2,
			stale: 4,
			queueBackpressure: true,
			health: 'crit',
		});
	});

	it('reports ok health and falls back to compact locks', () => {
		const chips = deriveChips({
			compact: { locks: { active: 5 } },
			health: { healthy: true },
			stale: { zombies: [{}, {}] },
		});
		expect(chips).toMatchObject({ locks: 5, stale: 2, health: 'ok' });
	});

	it('reports unknown health when nothing is available', () => {
		expect(
			deriveChips({
				compact: undefined,
				health: undefined,
				stale: undefined,
			}),
		).toEqual({
			locks: 0,
			stale: 0,
			queueBackpressure: false,
			health: 'unknown',
		});
	});
});

describe('ProposalsSnapshotSource', () => {
	const source = (now: () => number, onBoard?: () => void) =>
		new ProposalsSnapshotSource({
			now,
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					if (input.name.endsWith('proposal_board')) {
						onBoard?.();
						return {
							structuredContent: {
								proposals: [
									{ id: 'f1', status: 'ready', slices: [] },
								],
							},
						};
					}
					return { structuredContent: {} };
				},
			}),
		});

	it('serves within TTL and refetches after it', async () => {
		let now = 0;
		let calls = 0;
		const s = source(
			() => now,
			() => (calls += 1),
		);
		await s.get();
		now = 10_000;
		await s.get();
		expect(calls).toBe(1);
		now = 40_000;
		await s.get();
		expect(calls).toBe(2);
	});

	it('force and invalidate both refetch', async () => {
		let calls = 0;
		const s = source(
			() => 0,
			() => (calls += 1),
		);
		await s.get();
		await s.get({ force: true });
		s.invalidate();
		await s.get();
		expect(calls).toBe(3);
	});
});
