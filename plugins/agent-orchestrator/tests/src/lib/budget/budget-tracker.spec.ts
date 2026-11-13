import { describe, it, expect } from 'vitest';

import { BudgetTracker } from '../../../../src/lib/budget/budget-tracker.js';
import type { IBudgetPolicy } from '../../../../src/lib/policy/types.js';

const POLICY: IBudgetPolicy = {
	maxTokensOrchestrator: 1000,
	maxTokensPerSubagent: 400,
	timeoutMs: 0,
};

describe('BudgetTracker', () => {
	it('accumulates orchestrator tokens', () => {
		const t = new BudgetTracker(POLICY);
		t.recordOrchestrator(300);
		t.recordOrchestrator(400);
		expect(t.snapshot().consumedOrchestrator).toBe(700);
		expect(t.snapshot().steps).toBe(2);
	});

	it('accumulates subagent tokens per id', () => {
		const t = new BudgetTracker(POLICY);
		t.recordSubagent('a', 100);
		t.recordSubagent('a', 50);
		t.recordSubagent('b', 200);
		expect(t.snapshot().consumedSubagents.get('a')).toBe(150);
		expect(t.snapshot().consumedSubagents.get('b')).toBe(200);
	});

	it('flags orchestrator exhausted', () => {
		const t = new BudgetTracker(POLICY);
		t.recordOrchestrator(1001);
		expect(t.orchestratorExhausted()).toBe(true);
	});

	it('flags subagent exhausted', () => {
		const t = new BudgetTracker(POLICY);
		t.recordSubagent('a', 500);
		expect(t.subagentExhausted('a')).toBe(true);
		expect(t.subagentExhausted('b')).toBe(false);
	});

	it('treats 0 cap as unlimited', () => {
		const t = new BudgetTracker({ ...POLICY, maxTokensOrchestrator: 0 });
		t.recordOrchestrator(10_000_000);
		expect(t.orchestratorExhausted()).toBe(false);
	});

	it('rejects negative tokens', () => {
		const t = new BudgetTracker(POLICY);
		expect(() => t.recordOrchestrator(-1)).toThrow(RangeError);
		expect(() => t.recordSubagent('x', -1)).toThrow(RangeError);
	});

	it('rejects an empty subagentId', () => {
		const t = new BudgetTracker(POLICY);
		expect(() => t.recordSubagent('', 10)).toThrow(RangeError);
	});

	it('treats a 0 per-subagent cap as unlimited', () => {
		const t = new BudgetTracker({ ...POLICY, maxTokensPerSubagent: 0 });
		t.recordSubagent('a', 10_000_000);
		expect(t.subagentExhausted('a')).toBe(false);
	});

	it('resets cleanly', () => {
		const t = new BudgetTracker(POLICY);
		t.recordOrchestrator(200);
		t.recordSubagent('a', 50);
		t.reset();
		expect(t.snapshot().consumedOrchestrator).toBe(0);
		expect(t.snapshot().consumedSubagents.size).toBe(0);
	});
});
