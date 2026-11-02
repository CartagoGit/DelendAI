import { describe, it, expect } from 'vitest';

import {
	assertStepsValid,
	LinearModeAdapter,
} from '../../../../src/lib/policy/modes/linear-mode.js';
import type {
	IOrchestratorPolicy,
	ITask,
} from '../../../../src/lib/policy/types.js';

const POLICY: IOrchestratorPolicy = {
	defaultMode: 'linear',
	defaults: {
		budget: {
			maxTokensOrchestrator: 100_000,
			maxTokensPerSubagent: 10_000,
			timeoutMs: 0,
		},
		rotation: {
			maxIterationsPerSubagent: 3,
			allow: ['error-storm', 'repeated-output'],
		},
	},
};

const baseTask: ITask = {
	id: 't1',
	description: 'Refactor the cache layer.',
	tags: ['refactor'],
};

describe('LinearModeAdapter', () => {
	const adapter = new LinearModeAdapter();

	it("accepts a refactor task that isn't huge", () => {
		expect(adapter.accepts(baseTask, POLICY)).toBe(true);
	});

	it('rejects a large hint (swarm territory)', () => {
		expect(adapter.accepts({ ...baseTask, hint: 'large' }, POLICY)).toBe(
			false,
		);
	});

	it('rejects an explicit swarm tag', () => {
		expect(adapter.accepts({ ...baseTask, tags: ['swarm'] }, POLICY)).toBe(
			false,
		);
	});

	it('plan() produces ordered scout → implementer → verify steps', () => {
		const plan = adapter.plan(baseTask, POLICY);
		expect(plan.mode).toBe('linear');
		expect(plan.steps.map((s) => s.order)).toEqual([1, 2, 3]);
		expect(plan.steps[0]?.subagentRole).toBe('scout');
		expect(plan.steps[1]?.subagentRole).toBe('implementer');
		expect(plan.steps[1]?.dependsOn).toEqual([1]);
		expect(plan.steps[2]?.kind).toBe('verify');
		expect(plan.steps[2]?.dependsOn).toEqual([2]);
		expect(plan.budget).toEqual(POLICY.defaults.budget);
		expect(plan.rotation).toEqual(POLICY.defaults.rotation);
	});
});

describe('assertStepsValid', () => {
	it('accepts a strictly increasing sequence', () => {
		expect(() =>
			assertStepsValid([
				{
					order: 1,
					kind: 'spawn',
					instruction: 'a',
					subagentRole: 'scout',
				},
				{
					order: 2,
					kind: 'spawn',
					instruction: 'b',
					subagentRole: 'implementer',
					dependsOn: [1],
				},
			]),
		).not.toThrow();
	});

	it('rejects duplicate orders', () => {
		expect(() =>
			assertStepsValid([
				{
					order: 1,
					kind: 'spawn',
					instruction: 'a',
					subagentRole: 'scout',
				},
				{
					order: 1,
					kind: 'spawn',
					instruction: 'b',
					subagentRole: 'implementer',
				},
			]),
		).toThrow(/strictly increasing/);
	});

	it('rejects backward dependency', () => {
		expect(() =>
			assertStepsValid([
				{
					order: 2,
					kind: 'spawn',
					instruction: 'a',
					subagentRole: 'scout',
					dependsOn: [3],
				},
				{
					order: 1,
					kind: 'spawn',
					instruction: 'b',
					subagentRole: 'scout',
				},
			]),
		).toThrow(/not strictly earlier/);
	});

	it('rejects unknown subagent role', () => {
		expect(() =>
			assertStepsValid([
				{
					order: 1,
					kind: 'spawn',
					instruction: 'a',
					subagentRole: 'fake' as unknown as 'scout',
				},
			]),
		).toThrow(/Unknown subagent role/);
	});
});
