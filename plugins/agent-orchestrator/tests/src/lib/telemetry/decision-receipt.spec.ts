import { describe, expect, it } from 'vitest';

import type {
	IExecutionDecision,
	ITaskObservation,
} from '../../../../src/lib/policy/execution-decision.contract';
import {
	abandonReceipt,
	closeReceipt,
	describeTask,
	estimateFrom,
	openReceipt,
	summarizeReceipt,
	type IActualCost,
} from '../../../../src/lib/telemetry/decision-receipt';

const task = (partial: Partial<ITaskObservation> = {}): ITaskObservation => ({
	description: 'rename the exported helper and update its callers',
	files: ['plugins/proposals/src/lib/a.ts'],
	tags: ['refactor'],
	...partial,
});

const decision = (
	partial: Partial<IExecutionDecision> = {},
): IExecutionDecision => ({
	ceremony: 'light-plan',
	execution: 'single',
	context: 'focused',
	validation: 'targeted',
	response: 'normal',
	route: 'sonnet/default',
	budgets: { maxConcurrentAgents: 1, reviewQuorum: 1, maxMinutes: 20 },
	confidence: 0.72,
	reasons: [
		{
			code: 'public-contract-touched',
			direction: 'toward-ceremony',
			weight: 0.4,
			detail: 'plugins/proposals/src/index.ts re-exports the symbol',
		},
	],
	overrides: [],
	...partial,
});

const spent = (partial: Partial<IActualCost> = {}): IActualCost => ({
	agents: 1,
	minutes: 20,
	reviewers: 1,
	...partial,
});

describe('decision receipt (f00503 S4)', () => {
	describe('it keeps the shape of a task and not what anyone typed', () => {
		it('never carries the description through', () => {
			const receipt = closeReceipt(
				openReceipt('t1', task(), decision(), 0),
				spent(),
				'succeeded',
				1000,
			);

			expect(JSON.stringify(receipt)).not.toContain(
				'rename the exported',
			);
		});

		it('keeps the description only as a length and a digest', () => {
			const features = describeTask(
				task({ description: 'one two three four' }),
			);

			expect(features.descriptionWords).toBe(4);
			expect(features.digest).toMatch(/^[0-9a-f]{16}$/u);
		});

		it('gives the same task the same digest across runs', () => {
			expect(describeTask(task()).digest).toBe(
				describeTask(task()).digest,
			);
		});

		it('recognises the same task written with different casing', () => {
			// Learning wants to group repeats of one task; "Fix the parser"
			// and "fix the parser" are the same task by any reading.
			expect(
				describeTask(task({ description: 'Fix The Parser ' })).digest,
			).toBe(
				describeTask(task({ description: 'fix the parser' })).digest,
			);
		});

		it('drops the free-form detail from every reason', () => {
			const receipt = openReceipt('t1', task(), decision(), 0);

			expect(receipt.reasons[0]).toEqual({
				code: 'public-contract-touched',
				direction: 'toward-ceremony',
				weight: 0.4,
			});
		});

		it('keeps an override as a code and nothing else', () => {
			const receipt = openReceipt(
				't1',
				task(),
				decision({
					overrides: [
						{
							code: 'security-boundary',
							forces: 'proposal',
							detail: 'touches packages/core/src/lib/auth/token.ts',
						},
					],
				}),
				0,
			);

			expect(receipt.overrideCodes).toEqual(['security-boundary']);
			expect(JSON.stringify(receipt)).not.toContain('token.ts');
		});
	});

	describe('counting subsystems', () => {
		it('treats two files in one plugin as one subsystem', () => {
			expect(
				describeTask(
					task({
						files: [
							'plugins/proposals/src/a.ts',
							'plugins/proposals/src/b.ts',
						],
					}),
				).subsystemCount,
			).toBe(1);
		});

		it('separates two different plugins', () => {
			expect(
				describeTask(
					task({
						files: [
							'plugins/proposals/src/a.ts',
							'plugins/commit-policy/src/b.ts',
						],
					}),
				).subsystemCount,
			).toBe(2);
		});

		it('does not fold every top-level directory into one', () => {
			expect(
				describeTask(
					task({ files: ['docs/x.md', 'tools/scripts/y.ts'] }),
				).subsystemCount,
			).toBe(2);
		});

		it('sorts tags so two receipts for one task compare equal', () => {
			expect(describeTask(task({ tags: ['b', 'a'] })).tags).toEqual([
				'a',
				'b',
			]);
		});
	});

	describe('the estimate comes from the decision, not from the caller', () => {
		it('reads the budgets the system actually acted on', () => {
			// An estimate passed in separately could drift from the
			// decision, and the drift would read as accuracy.
			expect(
				estimateFrom(
					decision({
						budgets: {
							maxConcurrentAgents: 3,
							reviewQuorum: 2,
							maxMinutes: 45,
						},
					}),
				),
			).toEqual({ agents: 3, reviewers: 2, minutes: 45 });
		});
	});

	describe('previsto frente a real', () => {
		it('records both sides, not just the difference', () => {
			const receipt = closeReceipt(
				openReceipt('t1', task(), decision(), 0),
				spent({ agents: 2, minutes: 40 }),
				'succeeded',
				1000,
			);

			expect(receipt.estimated.minutes).toBe(20);
			expect(receipt.actual.minutes).toBe(40);
			expect(receipt.variance.minutes).toBe(2);
		});

		it('reads above one when the decision under-provisioned', () => {
			const receipt = closeReceipt(
				openReceipt('t1', task(), decision(), 0),
				spent({ agents: 3 }),
				'succeeded',
				1,
			);

			expect(receipt.variance.agents).toBeGreaterThan(1);
		});

		it('calls a zero estimate met by zero spend exactly on target', () => {
			const receipt = closeReceipt(
				openReceipt(
					't1',
					task(),
					decision({
						budgets: {
							maxConcurrentAgents: 1,
							reviewQuorum: 0,
							maxMinutes: 20,
						},
					}),
					0,
				),
				spent({ reviewers: 0 }),
				'succeeded',
				1,
			);

			expect(receipt.variance.reviewers).toBe(1);
		});

		it('keeps tokens when the caller knows them and omits them when it does not', () => {
			const known = closeReceipt(
				openReceipt('t1', task(), decision(), 0),
				spent({ tokens: 4200 }),
				'succeeded',
				1,
			);

			expect(known.actual.tokens).toBe(4200);
			expect(
				closeReceipt(
					openReceipt('t1', task(), decision(), 0),
					spent(),
					'succeeded',
					1,
				).actual.tokens,
			).toBeUndefined();
		});
	});

	describe('a task that stopped without finishing is still data', () => {
		it('records what was spent before the work stopped', () => {
			const receipt = abandonReceipt(
				openReceipt('t1', task(), decision(), 0),
				{ minutes: 7 },
				500,
			);

			expect(receipt.outcome).toBe('abandoned');
			expect(receipt.actual.minutes).toBe(7);
			expect(receipt.actual.agents).toBe(0);
		});

		it('is distinguishable from a task that ran and failed', () => {
			// Collapsing the two would hide every timeout inside the
			// failure rate, and a corpus of only completed tasks is the
			// standard way this kind of dataset goes quietly wrong.
			const abandoned = abandonReceipt(
				openReceipt('t1', task(), decision(), 0),
				{},
				1,
			);
			const failed = closeReceipt(
				openReceipt('t1', task(), decision(), 0),
				spent(),
				'failed',
				1,
			);

			expect(abandoned.outcome).not.toBe(failed.outcome);
		});
	});

	describe('the record is a corpus, not a learner', () => {
		it('is serializable with no functions, classes or dates', () => {
			const receipt = closeReceipt(
				openReceipt('t1', task(), decision(), 0),
				spent(),
				'succeeded',
				1000,
			);

			expect(JSON.parse(JSON.stringify(receipt))).toEqual(receipt);
			expect(typeof receipt.openedAt).toBe('number');
			expect(typeof receipt.closedAt).toBe('number');
		});

		it('summarises in one line', () => {
			const line = summarizeReceipt(
				closeReceipt(
					openReceipt('t1', task(), decision(), 0),
					spent({ minutes: 40 }),
					'succeeded',
					1000,
				),
			);

			expect(line).not.toContain('\n');
			expect(line).toContain('minutes=40/20');
			expect(line).toContain('outcome=succeeded');
		});
	});

	describe('degenerate input', () => {
		it('handles a task with no files and no tags', () => {
			const features = describeTask(
				task({ files: [], tags: [], description: '' }),
			);

			expect(features.fileCount).toBe(0);
			expect(features.subsystemCount).toBe(0);
			expect(features.descriptionWords).toBe(0);
		});
	});
});
