import { describe, it, expect } from 'vitest';

import { BudgetTracker } from '../../../../src/lib/budget/budget-tracker.js';
import {
	type IProgressEvidence,
	NO_EVIDENCE,
} from '../../../../src/lib/rotation/progress-evidence.js';
import type { IBudgetPolicy } from '../../../../src/lib/policy/types.js';

const POLICY: IBudgetPolicy = {
	maxTokensOrchestrator: 1000,
	maxTokensPerSubagent: 400,
	timeoutMs: 0,
};

const PROGRESS: IProgressEvidence = { ...NO_EVIDENCE, stateChanged: true };

describe('BudgetTracker', () => {
	it('[<200ms] accumulates orchestrator tokens', () => {
		const t = new BudgetTracker(POLICY);
		t.recordOrchestrator(300);
		t.recordOrchestrator(400);
		expect(t.snapshot().consumedOrchestrator).toBe(700);
		expect(t.snapshot().steps).toBe(2);
	});

	it('[<200ms] accumulates subagent tokens per id', () => {
		const t = new BudgetTracker(POLICY);
		t.recordSubagent('a', 100);
		t.recordSubagent('a', 50);
		t.recordSubagent('b', 200);
		expect(t.snapshot().consumedSubagents.get('a')).toBe(150);
		expect(t.snapshot().consumedSubagents.get('b')).toBe(200);
	});

	it('[<200ms] flags orchestrator exhausted', () => {
		const t = new BudgetTracker(POLICY);
		t.recordOrchestrator(1001);
		expect(t.orchestratorExhausted()).toBe(true);
	});

	it('[<200ms] flags subagent exhausted', () => {
		const t = new BudgetTracker(POLICY);
		t.recordSubagent('a', 500);
		expect(t.subagentExhausted('a')).toBe(true);
		expect(t.subagentExhausted('b')).toBe(false);
	});

	it('[<200ms] treats 0 cap as unlimited', () => {
		const t = new BudgetTracker({ ...POLICY, maxTokensOrchestrator: 0 });
		t.recordOrchestrator(10_000_000);
		expect(t.orchestratorExhausted()).toBe(false);
	});

	it('[<200ms] rejects negative tokens', () => {
		const t = new BudgetTracker(POLICY);
		expect(() => t.recordOrchestrator(-1)).toThrow(RangeError);
		expect(() => t.recordSubagent('x', -1)).toThrow(RangeError);
	});

	it('[<200ms] rejects an empty subagentId', () => {
		const t = new BudgetTracker(POLICY);
		expect(() => t.recordSubagent('', 10)).toThrow(RangeError);
	});

	it('[<200ms] treats a 0 per-subagent cap as unlimited', () => {
		const t = new BudgetTracker({ ...POLICY, maxTokensPerSubagent: 0 });
		t.recordSubagent('a', 10_000_000);
		expect(t.subagentExhausted('a')).toBe(false);
	});

	it('[<200ms] resets cleanly', () => {
		const t = new BudgetTracker(POLICY);
		t.recordOrchestrator(200);
		t.recordSubagent('a', 50);
		t.reset();
		expect(t.snapshot().consumedOrchestrator).toBe(0);
		expect(t.snapshot().consumedSubagents.size).toBe(0);
	});

	it('[<200ms] blocks the call that goes past maxCalls and names the limit', () => {
		const t = new BudgetTracker({ ...POLICY, maxCalls: 2 });
		expect(t.recordCall()).toBeNull();
		expect(t.recordCall()).toBeNull();
		expect(t.recordCall()).toContain('maxCalls 2 exceeded');
	});

	it('[<200ms] blocks the retry that goes past maxRetries', () => {
		const t = new BudgetTracker({ ...POLICY, maxRetries: 1 });
		expect(t.recordRetry()).toBeNull();
		expect(t.recordRetry()).toContain('maxRetries');
	});

	it('[<200ms] blocks the turn that goes past maxTurns', () => {
		const t = new BudgetTracker({ ...POLICY, maxTurns: 1 });
		expect(t.recordTurn(PROGRESS)).toBeNull();
		expect(t.recordTurn(PROGRESS)).toContain('maxTurns 1 exceeded');
	});

	it('[<200ms] limits concurrency and frees a slot on release', () => {
		const t = new BudgetTracker({ ...POLICY, maxConcurrency: 1 });
		expect(t.acquireSlot()).toBeNull();
		expect(t.acquireSlot()).toContain('maxConcurrency 1 exceeded');
		t.releaseSlot();
		expect(t.acquireSlot()).toBeNull();
		t.releaseSlot();
		t.releaseSlot();
		expect(t.acquireSlot()).toBeNull();
	});

	it('[<200ms] stops after N consecutive turns with no progress', () => {
		const t = new BudgetTracker({ ...POLICY, maxBarrenTurns: 2 });
		expect(t.recordTurn()).toBeNull();
		expect(t.recordTurn(PROGRESS)).toBeNull();
		expect(t.recordTurn()).toBeNull();
		expect(t.recordTurn()).toContain('no progress');
	});

	it('[<200ms] leaves limits off when the policy sets none', () => {
		const t = new BudgetTracker(POLICY);
		expect(t.recordCall()).toBeNull();
		expect(t.recordRetry()).toBeNull();
		expect(t.recordTurn()).toBeNull();
		expect(t.acquireSlot()).toBeNull();
	});
});
