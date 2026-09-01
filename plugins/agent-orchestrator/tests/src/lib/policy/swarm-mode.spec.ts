import { describe, it, expect } from 'vitest';

import { SwarmModeAdapter } from '../../../../src/lib/policy/modes/swarm-mode.js';
import type {
	IOrchestratorPolicy,
	ITask,
} from '../../../../src/lib/policy/types.js';

const POLICY: IOrchestratorPolicy = {
	defaultMode: 'swarm',
	defaults: {
		budget: {
			maxTokensOrchestrator: 200_000,
			maxTokensPerSubagent: 25_000,
			timeoutMs: 0,
		},
		rotation: {
			maxIterationsPerSubagent: 2,
			allow: [
				'token-budget-exhausted',
				'schema-violation',
				'repeated-output',
				'error-storm',
			],
		},
	},
};

const baseTask: ITask = {
	id: 't1',
	description: 'Migrate the storage layer.',
	tags: ['swarm'],
};

describe('SwarmModeAdapter', () => {
	const adapter = new SwarmModeAdapter();

	it('accepts when hint is large', () => {
		expect(adapter.accepts({ ...baseTask, hint: 'large' }, POLICY)).toBe(
			true,
		);
	});

	it('accepts when the swarm tag is set', () => {
		expect(adapter.accepts(baseTask, POLICY)).toBe(true);
	});

	it('rejects when neither tag nor large hint is set', () => {
		// baseTask.tags = ["swarm"] ⇒ accepts. Plain task ⇒ reject.
		const plain: ITask = { id: 't2', description: 'small thing', tags: [] };
		expect(adapter.accepts(plain, POLICY)).toBe(false);
	});

	it('plan() produces a 5-step parallel + join + verify shape', () => {
		const plan = adapter.plan(baseTask, POLICY);
		expect(plan.mode).toBe('swarm');
		expect(plan.steps.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
		expect(plan.steps[3]?.kind).toBe('join');
		expect(plan.steps[3]?.dependsOn).toEqual([2, 3]);
		expect(plan.steps[4]?.kind).toBe('verify');
	});
});
