#!/usr/bin/env bun
/**
 * plan.spec.ts — f00201 (Track O / q00006 §55).
 *
 * Pure-functional tests for the workflow-transaction executor:
 * synthetic steps (counter increments, no real side effects).
 * The acceptance criterion from the proposal is "si el step 3
 * falla, se compensan 1 y 2; el contador vuelve a 0", which we
 * pin with a counter step pattern.
 */

import { describe, expect, it } from 'vitest';

import {
	computePlanRisk,
	execute,
	plan,
	type IStep,
} from '@delendai/core/public';

// ---------------------------------------------------------------------------
// Helpers.
//
// A `counterStep` increments a shared counter on `run` and decrements
// on `compensate`. We use a fresh counter per test so the suites stay
// independent — no I/O, no global state.
// ---------------------------------------------------------------------------

const counterStep = <T>(
	name: string,
	counter: { value: number },
	value: T,
	failAt?: (ctx: { stepIndex: number; stepName: string }) => boolean,
): IStep<T> => {
	const base: IStep<T> = {
		name,
		effects: ['write'],
		compensable: true,
		run: async (ctx) => {
			if (
				failAt?.({ stepIndex: ctx.stepIndex, stepName: ctx.stepName })
			) {
				throw new Error(`step "${name}" failed as designed`);
			}
			counter.value += 1;
			return value;
		},
		compensate: async () => {
			counter.value -= 1;
		},
	};
	return base;
};

const pureStep = <T>(name: string, value: T): IStep<T> => ({
	name,
	effects: [],
	compensable: false,
	run: async () => value,
});

// ---------------------------------------------------------------------------
// plan() — descriptor validation
// ---------------------------------------------------------------------------

describe('f00201 — workflow transactions: plan()', () => {
	it('builds an immutable descriptor from a valid step list', () => {
		const steps = [pureStep<number>('a', 1), pureStep<number>('b', 2)];
		const descriptor = plan(steps);
		expect(descriptor.steps).toHaveLength(2);
		expect(descriptor.steps[0]?.name).toBe('a');
		expect(descriptor.steps[1]?.name).toBe('b');
	});

	it('throws on duplicate step names', () => {
		expect(() =>
			plan([pureStep('dup', 1), pureStep('dup', 2)]),
		).toThrowError(/duplicate step name "dup"/);
	});

	it('throws on a step with an empty name', () => {
		expect(() =>
			plan([
				{
					name: '',
					effects: [],
					compensable: false,
					run: async () => 1,
				},
			]),
		).toThrowError(/non-empty string/);
	});

	it('throws on a step missing `run`', () => {
		expect(() =>
			plan([
				{
					name: 'no-run',
					effects: [],
					compensable: false,
					run: undefined as unknown as () => Promise<unknown>,
				},
			]),
		).toThrowError(/run must be a function/);
	});

	it('throws when `effects` is not an array', () => {
		expect(() =>
			plan([
				{
					name: 'bad-effects',
					effects: undefined as unknown as readonly never[],
					compensable: false,
					run: async () => 1,
				},
			]),
		).toThrowError(/effects must be an array/);
	});

	it('throws when `compensable` is missing', () => {
		expect(() =>
			plan([
				{
					name: 'no-flag',
					effects: [],
					compensable: undefined as unknown as boolean,
					run: async () => 1,
				},
			]),
		).toThrowError(/compensable must be a boolean/);
	});

	it('freezes the descriptor so callers cannot mutate it', () => {
		const descriptor = plan([pureStep('x', 1)]);
		expect(() => {
			(descriptor.steps as IStep<number>[]).push(pureStep('y', 2));
		}).toThrowError();
	});
});

// ---------------------------------------------------------------------------
// computePlanRisk — preview
// ---------------------------------------------------------------------------

describe('f00201 — computePlanRisk', () => {
	it('returns "low" for empty plans', () => {
		expect(computePlanRisk(plan([]))).toBe('low');
	});

	it('returns "low" for read-only plans', () => {
		expect(
			computePlanRisk(plan([pureStep('a', 1), pureStep('b', 2)])),
		).toBe('low');
	});

	it('returns "medium" for spawn/network effects', () => {
		const step: IStep<number> = {
			name: 'net',
			effects: ['network'],
			compensable: false,
			run: async () => 1,
		};
		expect(computePlanRisk(plan([step]))).toBe('medium');
	});

	it('returns "high" when destructive is declared anywhere', () => {
		const step: IStep<number> = {
			name: 'destroy',
			effects: ['write', 'destructive'],
			compensable: true,
			run: async () => 1,
		};
		expect(computePlanRisk(plan([step]))).toBe('high');
	});
});

// ---------------------------------------------------------------------------
// execute() — happy path
// ---------------------------------------------------------------------------

describe('f00201 — execute() happy path', () => {
	it('runs every step in plan order and returns all values', async () => {
		const result = await execute(
			plan([
				pureStep<number>('a', 1),
				pureStep<number>('b', 2),
				pureStep<number>('c', 3),
			]),
		);
		expect(result.ok).toBe(true);
		expect(result.values).toEqual([1, 2, 3]);
		expect(result.compensations).toHaveLength(0);
		expect(result.executedSteps).toBe(3);
		expect(result.totalSteps).toBe(3);
		expect(result.executedStepNames).toEqual(['a', 'b', 'c']);
		expect(result.error).toBeUndefined();
		expect(result.dryRun).toBe(false);
	});

	it('passes prior values to subsequent steps', async () => {
		const seen: number[][] = [];
		const result = await execute(
			plan<number>([
				pureStep('a', 10),
				{
					name: 'b',
					effects: [],
					compensable: false,
					run: async (ctx) => {
						seen.push([...ctx.priorValues] as number[]);
						return 20;
					},
				},
				{
					name: 'c',
					effects: [],
					compensable: false,
					run: async (ctx) => {
						seen.push([...ctx.priorValues] as number[]);
						return 30;
					},
				},
			]),
		);
		expect(result.ok).toBe(true);
		expect(seen[0]).toEqual([10]);
		expect(seen[1]).toEqual([10, 20]);
	});

	it('reports risk from the highest-effect step', async () => {
		const result = await execute(
			plan([
				pureStep('safe', 1),
				{
					name: 'risky',
					effects: ['destructive'],
					compensable: true,
					run: async () => 2,
				},
			]),
		);
		expect(result.ok).toBe(true);
		expect(result.risk).toBe('high');
	});
});

// ---------------------------------------------------------------------------
// execute() — compensation on failure
// ---------------------------------------------------------------------------

describe('f00201 — execute() compensation (counter returns to 0)', () => {
	it('compensates completed steps in reverse order when a later step fails', async () => {
		const counter = { value: 0 };
		const result = await execute(
			plan([
				counterStep('a', counter, 'A'),
				counterStep('b', counter, 'B'),
				counterStep(
					'c',
					counter,
					'C',
					({ stepName }) => stepName === 'c',
				),
			]),
		);
		expect(result.ok).toBe(false);
		expect(counter.value).toBe(0);
		expect(result.values).toEqual(['A', 'B']);
		expect(result.error?.step).toBe('c');
		expect(result.error?.stepIndex).toBe(2);
		expect(result.compensations.map((c) => c.stepName)).toEqual(['b', 'a']);
		expect(result.compensations.every((c) => c.ok)).toBe(true);
		expect(result.executedStepNames).toEqual(['a', 'b', 'c']);
	});

	it('records a not-compensable step as skipped instead of throwing', async () => {
		const counter = { value: 0 };
		const step: IStep<string> = {
			name: 'a',
			effects: ['write'],
			compensable: false, // declared NOT compensable
			run: async () => {
				counter.value += 1;
				return 'A';
			},
		};
		const fail: IStep<string> = {
			name: 'b',
			effects: ['write'],
			compensable: false,
			run: async () => {
				throw new Error('boom');
			},
		};
		const result = await execute(plan([step, fail]));
		expect(result.ok).toBe(false);
		const aRec = result.compensations.find((c) => c.stepName === 'a');
		expect(aRec?.skippedReason).toBe('not-compensable');
		expect(aRec?.ok).toBe(true);
		expect(counter.value).toBe(1); // never decremented because no handler
	});

	it('records a compensable step with no handler as "no-handler"', async () => {
		const counter = { value: 0 };
		const step: IStep<string> = {
			name: 'a',
			effects: ['write'],
			compensable: true, // claims to be compensable but has no handler
			run: async () => {
				counter.value += 1;
				return 'A';
			},
		};
		const fail: IStep<string> = {
			name: 'b',
			effects: ['write'],
			compensable: false,
			run: async () => {
				throw new Error('boom');
			},
		};
		const result = await execute(plan([step, fail]));
		expect(result.ok).toBe(false);
		const aRec = result.compensations.find((c) => c.stepName === 'a');
		expect(aRec?.skippedReason).toBe('no-handler');
	});

	it('keeps compensating even when one compensation throws', async () => {
		const calls: string[] = [];
		const steps: IStep<string>[] = [
			{
				name: 'a',
				effects: ['write'],
				compensable: true,
				run: async () => 'A',
				compensate: async () => {
					calls.push('compensate-a');
				},
			},
			{
				name: 'b',
				effects: ['write'],
				compensable: true,
				run: async () => 'B',
				compensate: async () => {
					calls.push('compensate-b-throws');
					throw new Error('undo failed');
				},
			},
			{
				name: 'c',
				effects: ['write'],
				compensable: true,
				run: async () => 'C',
				compensate: async () => {
					calls.push('compensate-c');
				},
			},
			{
				name: 'd',
				effects: ['write'],
				compensable: false,
				run: async () => {
					throw new Error('boom');
				},
			},
		];
		const result = await execute(plan(steps));
		expect(result.ok).toBe(false);
		// Reverse plan order: d failed, so compensate c, b, a in that order.
		expect(calls).toEqual([
			'compensate-c',
			'compensate-b-throws',
			'compensate-a',
		]);
		const failed = result.compensations.find((c) => c.stepName === 'b');
		expect(failed?.ok).toBe(false);
		expect(failed?.error).toBeInstanceOf(Error);
		const succeeded = result.compensations.filter((c) => c.ok);
		expect(succeeded.map((c) => c.stepName)).toEqual(['c', 'a']);
	});

	it('returns ok=false with a populated error envelope', async () => {
		const cause = new Error('original failure');
		const result = await execute(
			plan([
				pureStep('ok', 1),
				{
					name: 'broken',
					effects: ['write'],
					compensable: false,
					run: async () => {
						throw cause;
					},
				},
			]),
		);
		expect(result.ok).toBe(false);
		expect(result.error).toBeDefined();
		expect(result.error?.step).toBe('broken');
		expect(result.error?.stepIndex).toBe(1);
		expect(result.error?.cause).toBe(cause);
	});
});

// ---------------------------------------------------------------------------
// execute() — empty plan edge case
// ---------------------------------------------------------------------------

describe('f00201 — empty plans', () => {
	it('returns ok=true with no values for an empty plan', async () => {
		const result = await execute(plan([]));
		expect(result.ok).toBe(true);
		expect(result.values).toEqual([]);
		expect(result.executedSteps).toBe(0);
		expect(result.totalSteps).toBe(0);
		expect(result.compensations).toEqual([]);
	});
});
