import { describe, expect, it } from 'vitest';

import { subtractBaseFailures } from '@delendai/core/lib/work-units/work-unit-prove.service';
import type { IUnitProofReport } from '@delendai/core/lib/contracts/interfaces/unit-proof.interface';

const failed = (tail: string): IUnitProofReport => ({
	declared: true,
	passed: false,
	steps: [
		{
			command: 'bun run prove',
			scope: 'all',
			passed: false,
			outputTail: tail,
		},
	],
});

describe('subtractBaseFailures', () => {
	it('[<50ms] reports a known-failing spec outside the unit footprint as base, not the unit', () => {
		const out = subtractBaseFailures({
			report: failed('FAIL a/old.spec.ts'),
			known: new Set(['a/old.spec.ts']),
			touched: new Set(['b/new.ts']),
		});
		expect(out).toEqual({
			own: [],
			base: ['a/old.spec.ts'],
			passed: true,
		});
	});

	it('[<50ms] fails the proof when the unit touched the known-failing spec footprint', () => {
		const out = subtractBaseFailures({
			report: failed('FAIL a/old.spec.ts'),
			known: new Set(['a/old.spec.ts']),
			touched: new Set(['a/old.spec.ts']),
		});
		expect(out.own).toEqual(['a/old.spec.ts']);
		expect(out.passed).toBe(false);
	});

	it('[<50ms] keeps a spec develop does not know as the unit failure', () => {
		const out = subtractBaseFailures({
			report: failed('FAIL a/old.spec.ts\nFAIL c/mine.spec.ts'),
			known: new Set(['a/old.spec.ts']),
			touched: new Set(),
		});
		expect(out.own).toEqual(['c/mine.spec.ts']);
		expect(out.base).toEqual(['a/old.spec.ts']);
		expect(out.passed).toBe(false);
	});

	it('[<50ms] does not excuse a failed step that names no spec', () => {
		const out = subtractBaseFailures({
			report: failed('tsc error TS2322'),
			known: new Set(['a/old.spec.ts']),
			touched: new Set(),
		});
		expect(out.passed).toBe(false);
	});
});
