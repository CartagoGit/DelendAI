import { describe, expect, it } from 'vitest';

import { resolveScopedValidationDecision } from '@delendai/quality/lib/services/scoped-validation.resolver';
import type { IScopedValidationActivitySnapshot } from '@delendai/quality/lib/services/scoped-validation.types';

const activity = (consistent: boolean): IScopedValidationActivitySnapshot => ({
	snapshotId: 'snapshot-1',
	consistent,
	currentActorKey: 'task:current',
	sourceStates: {
		registry: 'ok',
		lock: 'ok',
		worktree: 'missing',
	},
	agents: [
		{
			key: 'task:current',
			state: 'active',
			taskId: 'current',
			agentName: 'current-agent',
			identity: null,
			ownedFiles: ['plugins/example/src/index.ts'],
			reason: 'registry heartbeat is current',
		},
		{
			key: 'task:other',
			state: 'active',
			taskId: 'other',
			agentName: 'other-agent',
			identity: null,
			ownedFiles: [],
			reason: 'registry heartbeat is current',
		},
	],
	summary: {
		activeAgents: 2,
		activeTasks: 2,
		activeLocks: 0,
		activeWorktrees: 0,
		evidenceAgeMinutes: 0,
	},
	reasons: consistent ? [] : ['worktree source is missing'],
});

describe('scoped validation decision', () => {
	it('degrades close to scoped when another actor is active and a source is missing', () => {
		const decision = resolveScopedValidationDecision({
			operation: 'close',
			ownedFiles: ['plugins/example/src/index.ts'],
			scopes: {
				all: [{ command: 'bun run validate', expect: 'exit0' }],
				example: [
					{
						command: 'bun run --cwd plugins/example test',
						expect: 'exit0',
					},
				],
			},
			activity: activity(false),
		});

		expect(decision.mode).toBe('scoped');
		expect(decision.resolvedScopes).toEqual(['example']);
	});

	it('requires full close when the current actor is the only active actor', () => {
		const base = activity(true);
		const single: IScopedValidationActivitySnapshot = {
			...base,
			agents: [base.agents[0]!],
			summary: { ...base.summary, activeAgents: 1, activeTasks: 1 },
		};
		const decision = resolveScopedValidationDecision({
			operation: 'close',
			ownedFiles: ['plugins/example/src/index.ts'],
			scopes: { all: [{ command: 'bun run validate', expect: 'exit0' }] },
			activity: single,
		});

		expect(decision.mode).toBe('full');
		expect(decision.resolvedScopes).toEqual(['all']);
	});
});
