import { describe, expect, it } from 'vitest';

import { resolveValidationActivitySnapshot } from '../../../../src/lib/swarm/validation-activity.resolver';

const NOW = '2026-08-30T16:00:00.000Z';

const registryEntry = {
	task_id: 'task-a',
	agent_name: 'agent-a',
	host: 'vscode-copilot' as const,
	model: 'm3',
	adopted: true,
	status: 'active',
	last_seen: NOW,
};

describe('validation activity resolver', () => {
	it('does not treat an ambiguous branch-only worktree as a live actor', () => {
		const snapshot = resolveValidationActivitySnapshot({
			now: NOW,
			staleAfterMinutes: 10,
			current: { taskId: 'task-a', agentName: 'agent-a' },
			registry: { state: 'ok', entries: [registryEntry] },
			locks: { state: 'missing' },
			worktrees: {
				state: 'ok',
				entries: [
					{
						branch: 'agent/copilot-minimax-m3-agent-a-task-a',
						lastSeen: NOW,
					},
				],
			},
		});

		expect(snapshot.summary.activeAgents).toBe(1);
		expect(snapshot.currentActorKey).toBe('task:task-a');
	});

	const snapshotWithWorktrees = (
		entries: readonly Record<string, unknown>[],
	) =>
		resolveValidationActivitySnapshot({
			now: NOW,
			staleAfterMinutes: 10,
			current: { taskId: 'task-a', agentName: 'agent-a' },
			registry: { state: 'ok', entries: [registryEntry] },
			locks: { state: 'missing' },
			worktrees: { state: 'ok', entries },
		});

	it('treats a detached worktree as no evidence, not as corruption', () => {
		const snapshot = snapshotWithWorktrees([
			{ path: '/tmp/candidate-refresh-abc123' },
		]);

		expect(snapshot.state).not.toBe('corrupt');
		expect(snapshot.sourceStates.worktree).toBe('ok');
		expect(snapshot.summary.activeAgents).toBe(1);
	});

	it('still reports a worktree with an invalid lastSeen as corrupt', () => {
		const snapshot = snapshotWithWorktrees([
			{
				branch: 'agent/copilot-minimax-m3-agent-a-task-a',
				lastSeen: 'not-a-date',
			},
		]);

		expect(snapshot.state).toBe('corrupt');
	});

	const OLD = '2026-08-30T10:00:00.000Z';

	it.each([
		[
			'a registry entry without identity',
			{ ...registryEntry, task_id: '' },
		],
		[
			'a registry entry with an invalid last_seen',
			{ ...registryEntry, last_seen: 'nope' },
		],
	])('reports %s as corrupt', (_label, entry) => {
		const snapshot = resolveValidationActivitySnapshot({
			now: NOW,
			registry: { state: 'ok', entries: [entry] },
			locks: { state: 'missing' },
			worktrees: { state: 'missing' },
		});

		expect(snapshot.state).toBe('corrupt');
	});

	it.each([
		[
			'a non-active registry status',
			{ ...registryEntry, status: 'orphan' },
		],
		['an unadopted registry entry', { ...registryEntry, adopted: false }],
		['an old registry heartbeat', { ...registryEntry, last_seen: OLD }],
		['an expired registry lease', { ...registryEntry, lease_until: OLD }],
	])('counts %s as stale, not corrupt', (_label, entry) => {
		const snapshot = resolveValidationActivitySnapshot({
			now: NOW,
			staleAfterMinutes: 10,
			registry: { state: 'ok', entries: [entry] },
			locks: { state: 'missing' },
			worktrees: { state: 'missing' },
		});

		expect(snapshot.state).not.toBe('corrupt');
		expect(snapshot.summary.activeAgents).toBe(0);
	});

	it.each([
		['a lock without task_id and agent', { last_seen: NOW }, 'corrupt'],
		[
			'a lock with an invalid last_seen',
			{ task_id: 't', agent: 'a', last_seen: 'nope' },
			'corrupt',
		],
		['a current lock', { task_id: 't', agent: 'a', last_seen: NOW }, 'ok'],
		['an old lock', { task_id: 't', agent: 'a', last_seen: OLD }, 'ok'],
	])('classifies %s', (_label, lock, expected) => {
		const snapshot = resolveValidationActivitySnapshot({
			now: NOW,
			staleAfterMinutes: 10,
			registry: { state: 'missing' },
			locks: { state: 'ok', entries: [lock] },
			worktrees: { state: 'missing' },
		});

		expect(snapshot.state === 'corrupt').toBe(expected === 'corrupt');
	});

	it('counts a recently seen worktree with a task identity as active', () => {
		const snapshot = snapshotWithWorktrees([
			{
				branch: 'x',
				taskId: 'task-w',
				agentName: 'agent-w',
				lastSeen: NOW,
			},
		]);

		expect(snapshot.summary.activeAgents).toBe(2);
	});

	it('produces the same snapshot id when source entries arrive in another order', () => {
		const second = {
			...registryEntry,
			task_id: 'task-b',
			agent_name: 'agent-b',
		};
		const input = {
			now: NOW,
			registry: {
				state: 'ok' as const,
				entries: [registryEntry, second],
			},
			locks: { state: 'missing' as const },
			worktrees: { state: 'missing' as const },
		};
		const reversed = {
			...input,
			registry: {
				state: 'ok' as const,
				entries: [second, registryEntry],
			},
		};

		expect(resolveValidationActivitySnapshot(input).snapshotId).toBe(
			resolveValidationActivitySnapshot(reversed).snapshotId,
		);
	});
});
