import { describe, expect, it } from 'vitest';

import { deriveAgentSessions } from '../../../../src/lib/agents/derive-agent-sessions.service';
import type {
	IAgentSessionDerivationInput,
	IAgentSessionLockSnapshot,
	IAgentSessionProposalSummary,
	IAgentSessionWorktreeSnapshot,
} from '../../../../src/lib/contracts/interfaces/agent-session.interface';

const proposal = (
	value: Partial<IAgentSessionProposalSummary> &
		Pick<IAgentSessionProposalSummary, 'id' | 'status' | 'track' | 'type'>,
): IAgentSessionProposalSummary => value;

const lock = (
	value: Partial<IAgentSessionLockSnapshot> &
		Pick<
			IAgentSessionLockSnapshot,
			'task_id' | 'agent' | 'ownership' | 'started_at' | 'last_seen'
		>,
): IAgentSessionLockSnapshot => value;

const worktree = (
	value: Partial<IAgentSessionWorktreeSnapshot> &
		Pick<
			IAgentSessionWorktreeSnapshot,
			'path' | 'head' | 'detached' | 'locked'
		>,
): IAgentSessionWorktreeSnapshot => value;

const derive = (input: Partial<IAgentSessionDerivationInput> = {}) =>
	deriveAgentSessions({
		worktrees: input.worktrees ?? [],
		locks: input.locks ?? [],
		proposals: input.proposals ?? [],
	});

describe('deriveAgentSessions', () => {
	it('joins a legacy agent worktree with its lock and proposal', () => {
		const sessions = derive({
			worktrees: [
				worktree({
					path: '/repo/.worktrees/falcon',
					head: 'abc123',
					branch: 'agent/falcon',
					detached: false,
					locked: false,
				}),
			],
			locks: [
				lock({
					task_id: 'f00277-S1',
					agent: 'falcon',
					ownership: ['packages/core/a.ts', 'packages/core/a.ts'],
					started_at: '2026-08-31T10:00:00.000Z',
					last_seen: '2026-08-31T10:03:00.000Z',
				}),
			],
			proposals: [
				proposal({
					id: 'f00277',
					kind: 'feat',
					status: 'in-progress',
					track: 'trust',
					type: 'proposal',
				}),
			],
		});

		expect(sessions).toEqual([
			{
				id: 'falcon:f00277-S1',
				agent: 'falcon',
				taskId: 'f00277-S1',
				proposal: {
					id: 'f00277',
					kind: 'feat',
					status: 'in-progress',
					track: 'trust',
					type: 'proposal',
				},
				worktree: '/repo/.worktrees/falcon',
				branch: 'agent/falcon',
				currentCommit: 'abc123',
				status: 'in-progress',
				lastActivity: '2026-08-31T10:03:00.000Z',
				modifiedFiles: ['packages/core/a.ts'],
				detached: false,
				locked: false,
			},
		]);
	});

	it('matches the canonical composite agent branch to its lock by agent and task id', () => {
		const sessions = derive({
			worktrees: [
				worktree({
					path: '/repo/.worktrees/falcon',
					head: 'def456',
					branch: 'agent/copilot-gpt-5-4-falcon-f00277-s1',
					detached: false,
					locked: true,
				}),
			],
			locks: [
				lock({
					task_id: 'f00277-S1',
					agent: 'falcon',
					ownership: ['packages/core/a.ts', 'packages/core/b.ts'],
					started_at: '2026-08-31T10:00:00.000Z',
					last_seen: '2026-08-31T10:05:00.000Z',
				}),
			],
			proposals: [
				proposal({
					id: 'f00277',
					status: 'ready',
					track: 'trust',
					type: 'proposal',
				}),
			],
		});

		expect(sessions).toHaveLength(1);
		expect(sessions[0]).toMatchObject({
			agent: 'falcon',
			taskId: 'f00277-S1',
			worktree: '/repo/.worktrees/falcon',
			branch: 'agent/copilot-gpt-5-4-falcon-f00277-s1',
			currentCommit: 'def456',
			modifiedFiles: ['packages/core/a.ts', 'packages/core/b.ts'],
			locked: true,
		});
	});

	it('keeps lock-only sessions and emits unmatched agent worktrees as standalone sessions', () => {
		const sessions = derive({
			worktrees: [
				worktree({
					path: '/repo',
					head: 'base123',
					branch: 'develop',
					detached: false,
					locked: false,
				}),
				worktree({
					path: '/repo/.worktrees/orion',
					head: 'ghi789',
					branch: 'agent/orion',
					detached: false,
					locked: false,
				}),
			],
			locks: [
				lock({
					task_id: 'f00278-S2',
					agent: 'lyra',
					ownership: ['packages/core/c.ts'],
					started_at: '2026-08-31T10:00:00.000Z',
					last_seen: '2026-08-31T10:07:00.000Z',
				}),
			],
			proposals: [
				proposal({
					id: 'f00278',
					status: 'blocked',
					track: 'trust',
					type: 'proposal',
				}),
			],
		});

		expect(sessions).toEqual([
			{
				id: 'lyra:f00278-S2',
				agent: 'lyra',
				taskId: 'f00278-S2',
				proposal: {
					id: 'f00278',
					status: 'blocked',
					track: 'trust',
					type: 'proposal',
				},
				status: 'blocked',
				lastActivity: '2026-08-31T10:07:00.000Z',
				modifiedFiles: ['packages/core/c.ts'],
			},
			{
				id: 'orion:agent/orion',
				agent: 'orion',
				worktree: '/repo/.worktrees/orion',
				branch: 'agent/orion',
				currentCommit: 'ghi789',
				modifiedFiles: [],
				detached: false,
				locked: false,
			},
		]);
	});
});
