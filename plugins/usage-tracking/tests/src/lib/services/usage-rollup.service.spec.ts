import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IInvocationRecordTelemetry } from '../../../../src/lib/contracts/invocation-record.interface';
import {
	buildCostPerCorrect,
	taskOutcomeFromGate,
} from '../../../../src/lib/services/cost-per-correct.helper';
import { buildInvocationTelemetryRollup } from '../../../../src/lib/services/usage-rollup.service';

const NOW = Date.parse('2026-11-13T00:00:00Z');

const call = (
	extra: Partial<IInvocationRecordTelemetry>,
): IInvocationRecordTelemetry =>
	fakePartial<IInvocationRecordTelemetry, 'ts' | 'outcome'>({
		ts: '2026-11-12T00:00:00Z',
		outcome: 'success',
		...extra,
	});

const model = (modelId: string): IInvocationRecordTelemetry['model'] => ({
	provider: 'p',
	modelId,
	kind: 'api',
});

describe('taskOutcomeFromGate', () => {
	it('[<20ms] maps a gate result to an outcome and has none without a gate', () => {
		expect(taskOutcomeFromGate('pass')).toBe('correct');
		expect(taskOutcomeFromGate('fail')).toBe('failed');
		expect(taskOutcomeFromGate('blocked')).toBe('blocked');
		expect(taskOutcomeFromGate(undefined)).toBeUndefined();
	});
});

describe('buildCostPerCorrect', () => {
	it('[<50ms] reports cost per correct result by task class and model with the sample count', () => {
		const rows = buildCostPerCorrect([
			call({
				taskClass: 'coding',
				model: model('m1'),
				taskOutcome: 'correct',
				costUsd: 1,
				usage: { totalTokens: 100, cacheReadTokens: 40 },
			}),
			call({
				taskClass: 'coding',
				model: model('m1'),
				taskOutcome: 'failed',
				costUsd: 3,
				usage: { inputTokens: 100, outputTokens: 100 },
			}),
			call({
				taskClass: 'coding',
				model: model('m2'),
				taskOutcome: 'blocked',
				costUsd: 2,
			}),
		]);
		expect(rows).toEqual([
			{
				taskClass: 'coding',
				model: 'm1',
				samples: 2,
				correct: 1,
				costUsd: 4,
				totalTokens: 300,
				costPerCorrectUsd: 4,
				tokensPerCorrect: 300,
			},
			{
				taskClass: 'coding',
				model: 'm2',
				samples: 1,
				correct: 0,
				costUsd: 2,
				totalTokens: 0,
				costPerCorrectUsd: null,
				tokensPerCorrect: null,
			},
		]);
	});

	it('[<50ms] leaves out calls no gate judged and files unclassified ones apart', () => {
		const rows = buildCostPerCorrect([
			call({ model: model('m1') }),
			call({ taskOutcome: 'correct' }),
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			taskClass: 'unclassified',
			model: 'unattributed',
		});
	});
});

describe('buildInvocationTelemetryRollup', () => {
	it('[<50ms] still reads records that predate the ledger fields', () => {
		const legacy = fakePartial<
			IInvocationRecordTelemetry,
			'ts' | 'outcome'
		>({
			ts: '2026-11-12T00:00:00Z',
			outcome: 'success',
			plugin: 'p',
			tool: 't',
			agent: { kind: 'unknown' } as IInvocationRecordTelemetry['agent'],
		});
		const rollup = buildInvocationTelemetryRollup([legacy], 7, NOW);
		expect(rollup.totals.calls).toBe(1);
		expect(rollup.costPerCorrect).toEqual([]);
	});

	it('[<50ms] carries the cost-per-correct rows', () => {
		const rollup = buildInvocationTelemetryRollup(
			[
				call({
					plugin: 'p',
					tool: 't',
					agent: {
						kind: 'unknown',
					} as IInvocationRecordTelemetry['agent'],
					taskClass: 'mechanical',
					taskOutcome: 'correct',
					costUsd: 2,
				}),
			],
			7,
			NOW,
		);
		expect(rollup.costPerCorrect[0]).toMatchObject({
			taskClass: 'mechanical',
			samples: 1,
			costPerCorrectUsd: 2,
		});
	});
});
