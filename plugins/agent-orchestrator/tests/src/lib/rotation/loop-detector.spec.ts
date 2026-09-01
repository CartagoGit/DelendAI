import { describe, it, expect } from 'vitest';

import { LoopDetector } from '../../../../src/lib/rotation/loop-detector.js';
import type { IBudgetUsage } from '../../../../src/lib/budget/budget-tracker.js';
import type { RotationReason } from '../../../../src/lib/policy/types.js';

function emptyUsage(): IBudgetUsage {
	return {
		consumedOrchestrator: 0,
		consumedSubagents: new Map(),
		steps: 0,
	};
}

describe('LoopDetector', () => {
	it('rejects a negative budget cap', () => {
		const d = new LoopDetector();
		expect(() => d.setBudgetCap(-1)).toThrow(RangeError);
	});

	it('rejects a non-finite budget cap', () => {
		const d = new LoopDetector();
		expect(() => d.setBudgetCap(Number.POSITIVE_INFINITY)).toThrow(
			RangeError,
		);
	});

	it('falls back to subagentId as the grouping key when slotId is omitted', () => {
		// ingest()'s `step.slotId ?? step.subagentId` fallback: two ingests
		// under the same subagentId with no slotId must land in the same
		// history bucket as if that subagentId had been passed as slotId.
		const d = new LoopDetector();
		d.setBudgetCap(0);
		d.ingest({ subagentId: 'solo', output: 'x' }, emptyUsage(), 0);
		d.ingest({ subagentId: 'solo', output: 'y' }, emptyUsage(), 0);
		d.ingest({ subagentId: 'solo', output: 'x' }, emptyUsage(), 0);
		expect(d.evaluate('solo').reason).toBe<RotationReason>(
			'repeated-output',
		);
	});

	it('returns null reason when nothing has happened', () => {
		const d = new LoopDetector();
		d.setBudgetCap(1000);
		const v = d.evaluate('a');
		expect(v.reason).toBeNull();
	});

	it('detects token-budget-exhausted', () => {
		const d = new LoopDetector();
		d.setBudgetCap(100);
		d.ingest(
			{ subagentId: 'a', slotId: 'slot-1', output: 'hi' },
			emptyUsage(),
			100,
		);
		const usage: IBudgetUsage = {
			consumedOrchestrator: 0,
			consumedSubagents: new Map([['a', 200]]),
			steps: 1,
		};
		d.ingest(
			{ subagentId: 'a', slotId: 'slot-1', output: 'bye' },
			usage,
			100,
		);
		const v = d.evaluate('slot-1');
		expect(v.reason).toBe<RotationReason>('token-budget-exhausted');
	});

	it('detects repeated-output via the A,B,A pattern', () => {
		const d = new LoopDetector();
		d.setBudgetCap(0);
		// A
		d.ingest(
			{ subagentId: 'a', slotId: 's', output: 'x' },
			emptyUsage(),
			0,
		);
		expect(d.evaluate('s').reason).toBeNull();
		// B
		d.ingest(
			{ subagentId: 'a', slotId: 's', output: 'y' },
			emptyUsage(),
			0,
		);
		expect(d.evaluate('s').reason).toBeNull();
		// A (reverted) ⇒ A,B,A detected
		d.ingest(
			{ subagentId: 'a', slotId: 's', output: 'x' },
			emptyUsage(),
			0,
		);
		expect(d.evaluate('s').reason).toBe<RotationReason>('repeated-output');
	});

	it('does not flag A,A,A as a loop (stable confirmation)', () => {
		const d = new LoopDetector();
		d.setBudgetCap(0);
		d.ingest(
			{ subagentId: 'a', slotId: 's', output: 'ok' },
			emptyUsage(),
			0,
		);
		d.ingest(
			{ subagentId: 'a', slotId: 's', output: 'ok' },
			emptyUsage(),
			0,
		);
		d.ingest(
			{ subagentId: 'a', slotId: 's', output: 'ok' },
			emptyUsage(),
			0,
		);
		expect(d.evaluate('s').reason).toBeNull();
	});

	it('detects error-storm', () => {
		const d = new LoopDetector();
		d.setBudgetCap(0);
		for (let i = 0; i < 4; i += 1) {
			d.ingest(
				{ subagentId: 'a', slotId: 's', hadError: true },
				emptyUsage(),
				0,
			);
		}
		const v = d.evaluate('s');
		expect(v.reason).toBe<RotationReason>('error-storm');
	});

	it('detects schema-violation', () => {
		const d = new LoopDetector();
		d.setBudgetCap(0);
		d.ingest(
			{ subagentId: 'a', slotId: 's', schemaOk: false, output: '{}' },
			emptyUsage(),
			0,
		);
		const v = d.evaluate('s');
		expect(v.reason).toBe<RotationReason>('schema-violation');
	});

	it("isolates one slot's history from another's", () => {
		const d = new LoopDetector();
		d.setBudgetCap(0);
		// s1: A,B,A
		d.ingest(
			{ subagentId: 'a', slotId: 's1', output: 'x' },
			emptyUsage(),
			0,
		);
		d.ingest(
			{ subagentId: 'a', slotId: 's1', output: 'y' },
			emptyUsage(),
			0,
		);
		d.ingest(
			{ subagentId: 'a', slotId: 's1', output: 'x' },
			emptyUsage(),
			0,
		);
		// s2: A,B,B
		d.ingest(
			{ subagentId: 'b', slotId: 's2', output: 'different' },
			emptyUsage(),
			0,
		);
		expect(d.evaluate('s1').reason).toBe<RotationReason>('repeated-output');
		expect(d.evaluate('s2').reason).toBeNull();
	});

	it('tracks repeated-output across rotations (slotId persists)', () => {
		const d = new LoopDetector();
		d.setBudgetCap(0);
		d.ingest(
			{ subagentId: 'slot-1#1', slotId: 'slot-1', output: 'loop' },
			emptyUsage(),
			0,
		);
		d.ingest(
			{ subagentId: 'slot-1#2', slotId: 'slot-1', output: 'diff' },
			emptyUsage(),
			0,
		);
		d.ingest(
			{ subagentId: 'slot-1#3', slotId: 'slot-1', output: 'loop' },
			emptyUsage(),
			0,
		);
		expect(d.evaluate('slot-1').reason).toBe<RotationReason>(
			'repeated-output',
		);
	});
});
