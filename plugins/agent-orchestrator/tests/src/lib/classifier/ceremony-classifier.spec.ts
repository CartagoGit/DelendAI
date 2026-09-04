import { describe, expect, it } from 'vitest';

import {
	ceremonyScore,
	classifyCeremony,
	decisionConfidence,
	quorumFor,
} from '../../../../src/lib/classifier/ceremony-classifier';
import {
	isExecutionDecision,
	type IExecutionOverride,
	type IExecutionSignal,
} from '../../../../src/lib/policy/execution-decision.contract';

const toward = (weight: number, code = 'risk'): IExecutionSignal => ({
	code,
	direction: 'toward-ceremony',
	weight,
	detail: `${code} argues for more process`,
});

const against = (weight: number, code = 'local'): IExecutionSignal => ({
	code,
	direction: 'toward-directness',
	weight,
	detail: `${code} argues the change is small`,
});

const override = (
	forces: IExecutionOverride['forces'],
	code = 'security-boundary',
): IExecutionOverride => ({
	code,
	forces,
	detail: `${code} fired`,
});

describe('ceremony classifier (f00503 S2)', () => {
	describe('what the score decides when no hard rule fires', () => {
		it('sends a strongly risky task to a proposal', () => {
			const decision = classifyCeremony({
				signals: [
					toward(0.9, 'architectural'),
					toward(0.8, 'migration'),
				],
				overrides: [],
			});

			expect(decision.ceremony).toBe('proposal');
			expect(decision.validation).toBe('full');
			expect(decision.context).toBe('broad');
		});

		it('sends a clearly local task straight to direct', () => {
			const decision = classifyCeremony({
				signals: [
					against(0.9, 'single-file'),
					against(0.7, 'reversible'),
				],
				overrides: [],
			});

			expect(decision.ceremony).toBe('direct');
			expect(decision.execution).toBe('single');
			expect(decision.response).toBe('terse');
		});

		it('gives the middle case the middle path, which did not exist before', () => {
			// The change that touches five files and decides nothing
			// architectural: too big for direct, far too small for the
			// whole proposal cycle.
			const decision = classifyCeremony({
				signals: [
					toward(0.6, 'several-subsystems'),
					against(0.4, 'reversible'),
				],
				overrides: [],
			});

			expect(decision.ceremony).toBe('light-plan');
			expect(decision.validation).toBe('package');
		});

		it('defaults to direct when the evidence is balanced', () => {
			const decision = classifyCeremony({
				signals: [toward(0.5), against(0.5)],
				overrides: [],
			});

			expect(ceremonyScore([toward(0.5), against(0.5)])).toBe(0);
			expect(decision.ceremony).toBe('direct');
		});

		it('defaults to direct when nothing was observed at all', () => {
			const decision = classifyCeremony({ signals: [], overrides: [] });

			expect(decision.ceremony).toBe('direct');
			expect(decision.confidence).toBe(0);
		});
	});

	describe('hard rules are not tradeable against the score', () => {
		it('forces a proposal even when every signal says the change is tiny', () => {
			// The cost of being wrong here is not proportional to the size
			// of the diff, which is exactly why the score does not get a
			// vote.
			const decision = classifyCeremony({
				signals: [against(1, 'single-file'), against(1, 'reversible')],
				overrides: [override('proposal')],
			});

			expect(decision.ceremony).toBe('proposal');
		});

		it('says in the reasons that the score was overruled, and what it would have chosen', () => {
			const decision = classifyCeremony({
				signals: [against(1, 'single-file')],
				overrides: [override('proposal')],
			});

			expect(decision.reasons[0]?.code).toBe(
				'override:security-boundary',
			);
			expect(decision.reasons[0]?.detail).toContain('hard rule');
			expect(decision.reasons[0]?.detail).toContain('"direct"');
		});

		it('forces direct when the task is provably local and reversible', () => {
			const decision = classifyCeremony({
				signals: [toward(0.9, 'contains-the-word-refactor')],
				overrides: [override('direct', 'local-reversible-identified')],
			});

			expect(decision.ceremony).toBe('direct');
		});

		it('breaks a disagreement toward the more careful rule', () => {
			// Deliberately asymmetric: an unnecessary proposal costs a
			// session; a missing one costs the thing the rule protected.
			const decision = classifyCeremony({
				signals: [],
				overrides: [
					override('direct', 'local-reversible-identified'),
					override('proposal', 'public-contract'),
				],
			});

			expect(decision.ceremony).toBe('proposal');
		});

		it('keeps every override on the decision, not just the winning one', () => {
			const decision = classifyCeremony({
				signals: [],
				overrides: [override('direct', 'a'), override('proposal', 'b')],
			});

			expect(decision.overrides.map((o) => o.code)).toEqual(['a', 'b']);
		});
	});

	describe('confidence measures the evidence, not the verdict', () => {
		it('stays low when one weak signal produces a lopsided score', () => {
			// A clear-looking verdict resting on almost nothing. Reporting
			// that as confident is how a system earns distrust.
			const thin = [toward(0.1)];

			expect(ceremonyScore(thin)).toBe(1);
			expect(decisionConfidence(thin)).toBeLessThan(0.1);
		});

		it('rises with more agreeing evidence', () => {
			expect(decisionConfidence([toward(1), toward(1)])).toBeGreaterThan(
				decisionConfidence([toward(0.3)]),
			);
		});

		it('drops when strong evidence disagrees with itself', () => {
			const agreeing = decisionConfidence([toward(1), toward(1)]);
			const conflicting = decisionConfidence([toward(1), against(1)]);

			expect(conflicting).toBeLessThan(agreeing);
		});

		it('never reports confidence outside 0..1', () => {
			for (const signals of [
				[],
				[toward(0)],
				[toward(10), against(10)],
				[toward(100)],
			]) {
				const value = decisionConfidence(signals);
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThanOrEqual(1);
			}
		});
	});

	describe('the review quorum is bought by risk, not charged by default', () => {
		it('leaves a direct task with a single reviewer', () => {
			// A second reviewer on a typo is another agent, another
			// context and another chance to stall, bought for nothing.
			expect(quorumFor('direct', false)).toBe(1);
			expect(quorumFor('light-plan', false)).toBe(1);
		});

		it('asks for two on a proposal, where a shared blind spot costs something', () => {
			expect(quorumFor('proposal', false)).toBe(2);
		});

		it('asks for three only when a hard rule fired', () => {
			expect(quorumFor('proposal', true)).toBe(3);
		});

		it('carries the quorum onto the decision budgets', () => {
			const trivial = classifyCeremony({
				signals: [against(1)],
				overrides: [],
			});
			const guarded = classifyCeremony({
				signals: [],
				overrides: [override('proposal')],
			});

			expect(trivial.budgets.reviewQuorum).toBe(1);
			expect(guarded.budgets.reviewQuorum).toBe(3);
		});
	});

	describe("the user's configuration wins over the calculated risk", () => {
		it('honours a forced quorum in both directions', () => {
			const forcedUp = classifyCeremony(
				{ signals: [against(1)], overrides: [] },
				{ reviewQuorum: 3 },
			);
			const forcedDown = classifyCeremony(
				{ signals: [], overrides: [override('proposal')] },
				{ reviewQuorum: 1 },
			);

			expect(forcedUp.budgets.reviewQuorum).toBe(3);
			expect(forcedDown.budgets.reviewQuorum).toBe(1);
		});

		it('treats the agent ceiling as a ceiling, never as a target', () => {
			const capped = classifyCeremony(
				{ signals: [toward(1), toward(1)], overrides: [] },
				{ maxConcurrentAgents: 1 },
			);
			const generous = classifyCeremony(
				{ signals: [against(1)], overrides: [] },
				{ maxConcurrentAgents: 8 },
			);

			expect(capped.ceremony).toBe('proposal');
			expect(capped.budgets.maxConcurrentAgents).toBe(1);
			// A direct task does not become a swarm because the user
			// allowed one.
			expect(generous.budgets.maxConcurrentAgents).toBe(1);
		});

		it('uses the configured route', () => {
			expect(
				classifyCeremony(
					{ signals: [], overrides: [] },
					{ route: 'subscription-included' },
				).route,
			).toBe('subscription-included');
		});
	});

	describe('what it produces is a valid decision', () => {
		it('passes the contract check in every branch', () => {
			const cases = [
				classifyCeremony({ signals: [], overrides: [] }),
				classifyCeremony({ signals: [toward(1)], overrides: [] }),
				classifyCeremony({ signals: [against(1)], overrides: [] }),
				classifyCeremony({
					signals: [toward(0.6), against(0.4)],
					overrides: [],
				}),
				classifyCeremony({
					signals: [],
					overrides: [override('proposal')],
				}),
			];

			for (const decision of cases) {
				expect(isExecutionDecision(decision)).toBe(true);
			}
		});

		it('survives a JSON round trip, so another process can read it', () => {
			const decision = classifyCeremony({
				signals: [toward(0.9), against(0.2)],
				overrides: [override('proposal')],
			});

			expect(JSON.parse(JSON.stringify(decision))).toEqual(decision);
		});

		it('always explains itself, never returning an opaque sum', () => {
			const decision = classifyCeremony({
				signals: [toward(0.9, 'architectural')],
				overrides: [],
			});

			expect(decision.reasons[0]?.detail).toContain('scored');
			expect(decision.reasons.map((r) => r.code)).toContain(
				'architectural',
			);
		});
	});
});
