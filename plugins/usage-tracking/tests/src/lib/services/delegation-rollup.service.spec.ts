/**
 * delegation-rollup.service.spec.ts — delegations compared per kind of
 * task, with and without a manifest, observed figures kept apart.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IDelegationRecord } from '@delendai/contracts';

import type { IInvocationRecordTelemetry } from '../../../../src/lib/contracts/invocation-record.interface';
import { buildDelegationRollup } from '../../../../src/lib/services/delegation-rollup.service';
import { delegationsOf } from '../../../../src/lib/services/invocation-recorder.service';

const call = (
	...delegations: IDelegationRecord[]
): IInvocationRecordTelemetry =>
	fakePartial<IInvocationRecordTelemetry, 'delegations'>({ delegations });

const step = (
	delegation: IDelegationRecord['delegation'],
	tokensUsed: number,
	extra: Partial<IDelegationRecord> = {},
): IDelegationRecord => ({
	tags: ['refactor', 'cli'],
	role: 'implementer',
	delegation,
	tokensUsed,
	...extra,
});

describe('buildDelegationRollup', () => {
	it('compares the two kinds of delegation on the same kind of task', () => {
		const rollup = buildDelegationRollup(
			[
				call(
					step('manifest', 100, {
						manifestBytes: 300,
						inputTokens: 80,
						outputTokens: 20,
					}),
					step('manifest', 300, {
						manifestBytes: 500,
						contextRequested: true,
					}),
				),
				call(step('instruction-only', 900)),
				fakePartial<IInvocationRecordTelemetry>({}),
			],
			0,
		);
		expect(rollup.rows).toEqual([
			{
				task: 'cli,refactor',
				delegation: 'instruction-only',
				steps: 1,
				meanTokensUsed: 900,
				observed: {
					steps: 0,
					meanInputTokens: null,
					meanOutputTokens: null,
				},
				meanManifestBytes: null,
				contextRequested: 0,
			},
			{
				task: 'cli,refactor',
				delegation: 'manifest',
				steps: 2,
				meanTokensUsed: 200,
				observed: {
					steps: 1,
					meanInputTokens: 80,
					meanOutputTokens: 20,
				},
				meanManifestBytes: 400,
				contextRequested: 1,
			},
		]);
	});

	it('groups a task without tags apart', () => {
		const rollup = buildDelegationRollup(
			[call({ ...step('manifest', 10), tags: [] })],
			0,
		);
		expect(rollup.rows[0]?.task).toBe('(untagged)');
	});
});

describe('delegationsOf', () => {
	it('reads the well-formed records of a result and nothing else', () => {
		const good = step('manifest', 10);
		expect(
			delegationsOf({
				_meta: {
					'delendai/delegations': [
						good,
						{ tokensUsed: 'many' },
						{ ...good, delegation: 'other' },
						null,
					],
				},
			}),
		).toEqual([good]);
		expect(delegationsOf({ _meta: {} })).toEqual([]);
		expect(delegationsOf(undefined)).toEqual([]);
	});
});
