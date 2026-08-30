#!/usr/bin/env bun
/**
 * dry-run.spec.ts — f00201 (Track O / q00006 §55).
 *
 * Pins the `dryRun` contract for the workflow-transaction executor.
 * Two rules from the proposal:
 *   1. `execute(plan, { dryRun: true })` MUST NOT execute the
 *      `run` of any step — the whole point of a preview is
 *      "what would happen if I ran this for real?". Both pure
 *      and side-effecting steps are skipped; only the trace
 *      (`executedStepNames`, `risk`) is built.
 *   2. The compensation path is also skipped in dryRun mode —
 *      recorded as `skippedReason: 'dry-run'` so the LLM sees
 *      we considered them but did not invoke them.
 *
 * Tests use synthetic steps that mutate an in-process counter on
 * `run` and on `compensate`. The counter is the observable
 * side effect the tests check.
 */

import { describe, expect, it } from 'vitest';

import { execute, plan, type IStep } from '@mcp-vertex/core/public';

interface ICounters {
	readonly runs: { value: number };
	readonly compensations: { value: number };
}

const makeCounters = (): ICounters => ({
	runs: { value: 0 },
	compensations: { value: 0 },
});

const writeStep = (counters: ICounters, name: string): IStep<number> => ({
	name,
	effects: ['write'],
	compensable: true,
	run: async () => {
		counters.runs.value += 1;
		return counters.runs.value;
	},
	compensate: async () => {
		counters.compensations.value += 1;
	},
});

const _failWriteStep = (counters: ICounters, name: string): IStep<number> => ({
	name,
	effects: ['write'],
	compensable: true,
	run: async () => {
		counters.runs.value += 1;
		throw new Error(`"${name}" failed for test`);
	},
	compensate: async () => {
		counters.compensations.value += 1;
	},
});

const pureStep = (name: string, value: number): IStep<number> => ({
	name,
	effects: [],
	compensable: false,
	run: async () => value,
});

// ---------------------------------------------------------------------------
// dryRun — happy path
// ---------------------------------------------------------------------------

describe('f00201 — dryRun happy path', () => {
	it('skips `run` for steps with non-empty effects', async () => {
		const counters = makeCounters();
		const result = await execute(
			plan([
				writeStep(counters, 'a'),
				writeStep(counters, 'b'),
				writeStep(counters, 'c'),
			]),
			{ dryRun: true },
		);
		expect(result.ok).toBe(true);
		expect(counters.runs.value).toBe(0);
		expect(counters.compensations.value).toBe(0);
		expect(result.dryRun).toBe(true);
		expect(result.executedSteps).toBe(3);
		expect(result.executedStepNames).toEqual(['a', 'b', 'c']);
		expect(result.values).toEqual([]);
	});

	it('also skips `run` for pure steps (effects: [])', async () => {
		let pureCalls = 0;
		const counters = makeCounters();
		const pure: IStep<number> = {
			name: 'pure',
			effects: [],
			compensable: false,
			run: async () => {
				pureCalls += 1;
				return 42;
			},
		};
		const result = await execute(
			plan([pure, writeStep(counters, 'side-effect')]),
			{ dryRun: true },
		);
		expect(result.ok).toBe(true);
		// Preview is preview — even a pure step is not invoked.
		expect(pureCalls).toBe(0);
		expect(counters.runs.value).toBe(0);
		expect(result.values).toEqual([]);
		// The trace still lists every step that "would have run".
		expect(result.executedStepNames).toEqual(['pure', 'side-effect']);
	});

	it('does NOT call compensate — full chain is a preview', async () => {
		const counters = makeCounters();
		const result = await execute(
			plan([
				writeStep(counters, 'a'),
				writeStep(counters, 'b'),
				writeStep(counters, 'c'),
			]),
			{ dryRun: true },
		);
		expect(result.ok).toBe(true);
		expect(counters.runs.value).toBe(0);
		// No compensations invoked at all — nothing failed because
		// nothing ran.
		expect(counters.compensations.value).toBe(0);
		expect(result.compensations).toEqual([]);
	});

	it('marks dryRun=true on the result envelope', async () => {
		const counters = makeCounters();
		const result = await execute(plan([writeStep(counters, 'a')]), {
			dryRun: true,
		});
		expect(result.dryRun).toBe(true);
		expect(counters.runs.value).toBe(0);
	});

	it('defaults dryRun to false when the option is omitted', async () => {
		const counters = makeCounters();
		const result = await execute(plan([writeStep(counters, 'a')]));
		expect(result.dryRun).toBe(false);
		expect(counters.runs.value).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// dryRun — risk preview
// ---------------------------------------------------------------------------

describe('f00201 — dryRun risk surface', () => {
	it('surfaces the highest-risk effect across the plan', async () => {
		const counters = makeCounters();
		const result = await execute(
			plan([
				writeStep(counters, 'safe'),
				{
					name: 'risky',
					effects: ['destructive'],
					compensable: true,
					run: async () => 1,
					compensate: async () => undefined,
				},
			]),
			{ dryRun: true },
		);
		expect(result.ok).toBe(true);
		expect(result.risk).toBe('high');
		expect(counters.runs.value).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// dryRun — mixed plan with a pure step before a side-effecting step
// ---------------------------------------------------------------------------

describe('f00201 — dryRun mixed plans', () => {
	it('skips every run; only the trace is built', async () => {
		const counters = makeCounters();
		const result = await execute(
			plan([pureStep('header', 0), writeStep(counters, 'body')]),
			{ dryRun: true },
		);
		expect(result.ok).toBe(true);
		expect(result.values).toEqual([]);
		expect(counters.runs.value).toBe(0);
		expect(result.executedStepNames).toEqual(['header', 'body']);
		expect(result.executedSteps).toBe(2);
	});
});
