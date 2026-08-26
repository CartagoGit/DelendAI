import { describe, it, expect } from 'vitest';

import { SingleModeAdapter } from '../../../../src/lib/policy/modes/single-mode.js';
import type {
	IOrchestratorPolicy,
	ITask,
} from '../../../../src/lib/policy/types.js';

const POLICY: IOrchestratorPolicy = {
	defaultMode: 'single',
	defaults: {
		budget: {
			maxTokensOrchestrator: 50_000,
			maxTokensPerSubagent: 10_000,
			timeoutMs: 0,
		},
		rotation: { maxIterationsPerSubagent: 1, allow: ['error-storm'] },
	},
};

const baseTask: ITask = {
	id: 't1',
	description: 'Fix the typo in README.md.',
	tags: [],
};

describe('SingleModeAdapter', () => {
	const adapter = new SingleModeAdapter();

	it('accepts a trivial hint', () => {
		expect(adapter.accepts({ ...baseTask, hint: 'trivial' }, POLICY)).toBe(
			true,
		);
	});

	it('accepts a short description with no complex tags', () => {
		expect(adapter.accepts(baseTask, POLICY)).toBe(true);
	});

	it('rejects when description is over budget', () => {
		expect(
			adapter.accepts(
				{ ...baseTask, description: 'x'.repeat(300) },
				POLICY,
			),
		).toBe(false);
	});

	it('rejects when a complex tag is present', () => {
		expect(
			adapter.accepts({ ...baseTask, tags: ['refactor'] }, POLICY),
		).toBe(false);
	});

	it('rejects when hint is large', () => {
		expect(adapter.accepts({ ...baseTask, hint: 'large' }, POLICY)).toBe(
			false,
		);
	});

	it('plan() always returns one orchestrate step; verify only when budget allows', () => {
		const plan = adapter.plan(baseTask, POLICY);
		expect(plan.mode).toBe('single');
		expect(plan.steps[0]?.kind).toBe('orchestrate');
		expect(plan.steps[0]?.instruction).toBe(baseTask.description);
		// 50_000 ≥ 20_000 → a verify step is appended
		expect(plan.steps).toHaveLength(2);
		expect(plan.steps[1]?.kind).toBe('verify');
		expect(plan.steps[1]?.dependsOn).toEqual([1]);
	});

	it('plan() omits the verify step when budget is too tight', () => {
		const tight = {
			...POLICY,
			defaults: {
				...POLICY.defaults,
				budget: {
					...POLICY.defaults.budget,
					maxTokensOrchestrator: 5_000,
				},
			},
		};
		const plan = adapter.plan(baseTask, tight);
		expect(plan.steps).toHaveLength(1);
	});
});
