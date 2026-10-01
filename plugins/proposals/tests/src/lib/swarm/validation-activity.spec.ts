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
