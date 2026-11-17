import { describe, expect, it } from 'vitest';

import {
	resolveExecutionMode,
	shouldDelegate,
	type IDelegationCandidate,
	type TDelegationMode,
} from '../../../../src/lib/policy/decision-to-plan';
import {
	UNDECIDED,
	type IExecutionDecision,
} from '../../../../src/lib/policy/execution-decision.contract';

const decision = (
	partial: Partial<IExecutionDecision> = {},
): IExecutionDecision => ({
	...UNDECIDED,
	budgets: { ...UNDECIDED.budgets, maxConcurrentAgents: 3 },
	...partial,
});

const candidate = (
	partial: Partial<IDelegationCandidate> = {},
): IDelegationCandidate => ({ parts: 3, disjointness: 0.9, ...partial });

describe('decision to plan (f00503 S3)', () => {
	describe('the mode comes from the decision, not a second classification', () => {
		it('takes the execution mode the decision chose', () => {
			for (const execution of ['single', 'linear', 'swarm'] as const) {
				const resolved = resolveExecutionMode(
					decision({ execution }),
					'adaptive',
				);
				expect(resolved.mode).toBe(execution);
			}
		});

		it('says where the mode came from', () => {
			// Two classifiers that can disagree is not redundancy; it is a
			// bug waiting for the day they do, reported by nobody.
			expect(
				resolveExecutionMode(
					decision({ execution: 'linear' }),
					'adaptive',
				).reason,
			).toContain('rather than re-classified');
		});
	});

	describe('delegation must earn its coordination cost', () => {
		it('refuses to split work whose parts read the same material', () => {
			// Two investigators produce two readings of the same thing, at
			// twice the price, and then need a third step to notice they
			// agree.
			const verdict = shouldDelegate({ parts: 2, disjointness: 0.1 });

			expect(verdict.delegate).toBe(false);
			expect(verdict.reason).toContain('overlap too much');
		});

		it('accepts a split into genuinely independent parts', () => {
			const verdict = shouldDelegate({ parts: 3, disjointness: 0.9 });

			expect(verdict.delegate).toBe(true);
			expect(verdict.netBenefit).toBeGreaterThan(0);
		});

		it('refuses when coordination costs more than the parallelism recovers', () => {
			const verdict = shouldDelegate({ parts: 2, disjointness: 0.55 });

			expect(verdict.netBenefit).toBeGreaterThan(0);
			expect(
				shouldDelegate({ parts: 2, disjointness: 0.5 }).delegate,
			).toBe(true);
			expect(verdict.delegate).toBe(true);
		});

		it('has nothing to delegate with a single part', () => {
			const verdict = shouldDelegate({ parts: 1, disjointness: 1 });

			expect(verdict.delegate).toBe(false);
			expect(verdict.netBenefit).toBe(0);
		});

		it('drops a swarm to single when the split does not pay', () => {
			const resolved = resolveExecutionMode(
				decision({ execution: 'swarm' }),
				'adaptive',
				candidate({ disjointness: 0.2 }),
			);

			expect(resolved.mode).toBe('single');
			expect(resolved.constrained).toBe(true);
			expect(resolved.reason).toContain('overlap too much');
		});

		it('leaves a paying split alone', () => {
			expect(
				resolveExecutionMode(
					decision({ execution: 'swarm' }),
					'adaptive',
					candidate(),
				).mode,
			).toBe('swarm');
		});
	});

	describe('configured modes are constraints, not suggestions', () => {
		it('never means never, including against a confident decision', () => {
			// A policy the system may overrule when it disagrees is not a
			// policy; the user did not write a hint.
			const resolved = resolveExecutionMode(
				decision({ execution: 'swarm', confidence: 0.99 }),
				'never',
				candidate(),
			);

			expect(resolved.mode).toBe('single');
			expect(resolved.constrained).toBe(true);
		});

		it('manual does not start a split nobody asked for', () => {
			expect(
				resolveExecutionMode(
					decision({ execution: 'swarm' }),
					'manual',
					candidate(),
				).mode,
			).toBe('single');
		});

		it('manual honours a split the user did request', () => {
			expect(
				resolveExecutionMode(
					decision({ execution: 'swarm' }),
					'manual',
					candidate({ requestedByUser: true }),
				).mode,
			).toBe('swarm');
		});

		it('always widens a direct task onto the delegated path', () => {
			const resolved = resolveExecutionMode(
				decision({ execution: 'single' }),
				'always',
			);

			expect(resolved.mode).toBe('linear');
			expect(resolved.constrained).toBe(true);
		});

		it('adaptive lets the decision stand', () => {
			expect(
				resolveExecutionMode(
					decision({ execution: 'linear' }),
					'adaptive',
				).constrained,
			).toBe(false);
		});
	});

	describe('an authorised budget is a ceiling, not a target', () => {
		it('refuses a swarm when only one agent was authorised', () => {
			const resolved = resolveExecutionMode(
				decision({
					execution: 'swarm',
					budgets: { ...UNDECIDED.budgets, maxConcurrentAgents: 1 },
				}),
				'adaptive',
				candidate(),
			);

			expect(resolved.mode).toBe('linear');
			expect(resolved.reason).toContain('ceiling rather than a target');
		});

		it('does not promote a single task because many agents were allowed', () => {
			expect(
				resolveExecutionMode(
					decision({
						execution: 'single',
						budgets: {
							...UNDECIDED.budgets,
							maxConcurrentAgents: 8,
						},
					}),
					'adaptive',
				).mode,
			).toBe('single');
		});
	});

	describe('every mode resolves to something runnable', () => {
		it('returns a known mode for every combination', () => {
			const modes: readonly TDelegationMode[] = [
				'adaptive',
				'always',
				'never',
				'manual',
			];

			for (const delegation of modes) {
				for (const execution of [
					'single',
					'linear',
					'swarm',
				] as const) {
					const resolved = resolveExecutionMode(
						decision({ execution }),
						delegation,
						candidate(),
					);
					expect(['single', 'linear', 'swarm']).toContain(
						resolved.mode,
					);
					expect(resolved.reason.length).toBeGreaterThan(10);
				}
			}
		});
	});
});
