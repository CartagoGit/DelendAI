import { describe, expect, it } from 'vitest';

import {
	DuplicateSignalSourceError,
	isExecutionDecision,
	SignalRegistry,
	UNDECIDED,
	type IExecutionDecision,
	type ISignalSource,
	type ITaskObservation,
} from '../../../../src/lib/policy/execution-decision.contract';

const task = (partial: Partial<ITaskObservation> = {}): ITaskObservation => ({
	description: 'rename a local variable',
	files: ['packages/core/src/lib/a.ts'],
	tags: [],
	...partial,
});

const source = (
	id: string,
	observe: ISignalSource['observe'],
): ISignalSource => ({ id, observe });

const decision = (
	partial: Partial<IExecutionDecision> = {},
): IExecutionDecision => ({ ...UNDECIDED, ...partial });

describe('execution decision contract (f00503 S1)', () => {
	describe('signals are registered, never branched on', () => {
		it('collects from every registered source', () => {
			const registry = new SignalRegistry()
				.register(
					source('security', () => ({
						signals: [
							{
								code: 'auth-path',
								direction: 'toward-ceremony',
								weight: 0.9,
								detail: 'touches the auth boundary',
							},
						],
						overrides: [],
					})),
				)
				.register(
					source('locality', () => ({
						signals: [
							{
								code: 'single-file',
								direction: 'toward-directness',
								weight: 0.6,
								detail: 'one file, one subsystem',
							},
						],
						overrides: [],
					})),
				);

			const collected = registry.collect(task());

			expect(collected.signals.map((s) => s.code)).toEqual([
				'auth-path',
				'single-file',
			]);
		});

		it('adding a source needs no change to anything that decides', () => {
			// The whole point of the seam: a plugin that learns something
			// new about risk teaches the policy by registering, not by
			// editing a chain of ifs somewhere else.
			const registry = new SignalRegistry();
			expect(registry.size).toBe(0);

			registry.register(
				source('storms', () => ({
					signals: [
						{
							code: 'area-failing',
							direction: 'toward-ceremony',
							weight: 0.5,
							detail: 'this area produced a storm in the last hour',
						},
					],
					overrides: [],
				})),
			);

			expect(registry.size).toBe(1);
			expect(registry.has('storms')).toBe(true);
			expect(registry.collect(task()).signals).toHaveLength(1);
		});

		it('replays in registration order, so a decision is reproducible', () => {
			const registry = new SignalRegistry()
				.register(source('a', () => ({ signals: [], overrides: [] })))
				.register(source('b', () => ({ signals: [], overrides: [] })))
				.register(source('c', () => ({ signals: [], overrides: [] })));

			expect(registry.ids()).toEqual(['a', 'b', 'c']);
		});

		it('refuses a duplicate id, so a reason traces back to one source', () => {
			const registry = new SignalRegistry().register(
				source('dup', () => ({ signals: [], overrides: [] })),
			);

			expect(() =>
				registry.register(
					source('dup', () => ({ signals: [], overrides: [] })),
				),
			).toThrow(DuplicateSignalSourceError);
		});

		it('carries hard overrides through untouched', () => {
			const registry = new SignalRegistry().register(
				source('security', () => ({
					signals: [],
					overrides: [
						{
							code: 'security-boundary',
							forces: 'proposal',
							detail: 'changes how a request is authorised',
						},
					],
				})),
			);

			expect(registry.collect(task()).overrides).toEqual([
				{
					code: 'security-boundary',
					forces: 'proposal',
					detail: 'changes how a request is authorised',
				},
			]);
		});
	});

	describe('one broken source does not cost the whole decision', () => {
		it('keeps the other sources and records the failure as a signal', () => {
			// Losing a plugin's opinion should cost precision, not the
			// ability to decide at all — and the loss must stay visible.
			const registry = new SignalRegistry()
				.register(
					source('broken', () => {
						throw new Error('probe unavailable');
					}),
				)
				.register(
					source('ok', () => ({
						signals: [
							{
								code: 'single-file',
								direction: 'toward-directness',
								weight: 0.6,
								detail: 'one file',
							},
						],
						overrides: [],
					})),
				);

			const collected = registry.collect(task());

			expect(collected.signals.map((s) => s.code)).toEqual([
				'signal-source-failed',
				'single-file',
			]);
			expect(collected.signals[0]?.detail).toContain('broken');
			expect(collected.signals[0]?.detail).toContain('probe unavailable');
		});
	});

	describe('the decision is serializable and checkable', () => {
		it('survives a JSON round trip unchanged', () => {
			// Any consumer must be able to read a decision without knowing
			// which plugin produced it, including across a process.
			const original = decision({
				ceremony: 'proposal',
				execution: 'swarm',
				validation: 'full',
				confidence: 0.8,
			});

			const revived: unknown = JSON.parse(JSON.stringify(original));

			expect(revived).toEqual(original);
			expect(isExecutionDecision(revived)).toBe(true);
		});

		it('accepts a well-formed decision', () => {
			expect(isExecutionDecision(UNDECIDED)).toBe(true);
		});

		it('rejects shapes that would spend budget on nonsense', () => {
			// A decision can arrive from another process or a cache written
			// by an older version, so it is checked rather than trusted.
			const cases: readonly [string, unknown][] = [
				['not an object', 'proposal'],
				['null', null],
				['unknown ceremony', decision({ ceremony: 'ritual' as never })],
				['unknown execution', decision({ execution: 'mob' as never })],
				[
					'unknown validation',
					decision({ validation: 'some' as never }),
				],
				['empty route', decision({ route: '' })],
				['confidence above one', decision({ confidence: 1.5 })],
				['confidence below zero', decision({ confidence: -0.1 })],
				['missing budgets', { ...UNDECIDED, budgets: undefined }],
				[
					'budget that is not a number',
					{
						...UNDECIDED,
						budgets: {
							...UNDECIDED.budgets,
							reviewQuorum: 'two',
						},
					},
				],
				[
					'reasons that are not signals',
					{ ...UNDECIDED, reasons: ['x'] },
				],
				[
					'an override forcing an unknown ceremony',
					{
						...UNDECIDED,
						overrides: [
							{ code: 'x', forces: 'ritual', detail: 'd' },
						],
					},
				],
			];

			for (const [name, value] of cases) {
				expect(isExecutionDecision(value), name).toBe(false);
			}
		});
	});

	describe('the default is the cheap one, and says it is a default', () => {
		it('falls back to direct rather than to ceremony', () => {
			// The failure modes are not symmetric. Treating a small change
			// as large wastes a session every single time; treating a large
			// change as small is caught by the hard rules, which no score
			// can outvote.
			expect(UNDECIDED.ceremony).toBe('direct');
			expect(UNDECIDED.budgets.maxConcurrentAgents).toBe(1);
			expect(UNDECIDED.budgets.reviewQuorum).toBe(1);
		});

		it('reports zero confidence and explains that nothing informed it', () => {
			expect(UNDECIDED.confidence).toBe(0);
			expect(UNDECIDED.reasons[0]?.code).toBe('no-signals');
			expect(UNDECIDED.reasons[0]?.detail).toContain('not a judgement');
		});

		it('defaults the review quorum to one, so the panel costs nothing until asked', () => {
			// f00508 reads this. A fixed quorum of two would put constant
			// cost into the system whose whole thesis is spending in
			// proportion to what is at stake.
			expect(UNDECIDED.budgets.reviewQuorum).toBe(1);
		});
	});
});
