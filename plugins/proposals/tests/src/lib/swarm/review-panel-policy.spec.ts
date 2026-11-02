import { describe, expect, it } from 'vitest';

import {
	CRITICAL_DOMAINS,
	InvalidQuorumError,
	isCriticalDomain,
	MAX_QUORUM,
	MIN_QUORUM,
	resolveReviewQuorum,
	type TRiskLevel,
} from '../../../../src/lib/swarm/review-panel-policy';

describe('review panel policy (f00508 S3)', () => {
	describe('the panel costs nothing until something justifies it', () => {
		it('resolves one reviewer with no configuration and no risk signal', () => {
			// Today's behaviour. A fixed quorum of two would have put
			// constant cost into the system whose thesis is spending in
			// proportion to risk.
			const resolved = resolveReviewQuorum();

			expect(resolved.quorum).toBe(1);
			expect(resolved.configured).toBe(false);
			expect(resolved.reason).toContain('rather than a default');
		});

		it('leaves low and normal risk on a single reviewer', () => {
			for (const risk of ['low', 'normal'] as const) {
				const resolved = resolveReviewQuorum({}, risk);
				expect(resolved.quorum).toBe(1);
				expect(resolved.reason).toContain(
					'cost without a matching risk',
				);
			}
		});
	});

	describe('risk buys reviewers', () => {
		it('asks for two on a high-risk slice', () => {
			expect(resolveReviewQuorum({}, 'high').quorum).toBe(2);
		});

		it('asks for three on a critical one', () => {
			const resolved = resolveReviewQuorum({}, 'critical');

			expect(resolved.quorum).toBe(3);
			expect(resolved.configured).toBe(false);
		});

		it('never exceeds the maximum from risk alone', () => {
			const levels: readonly TRiskLevel[] = [
				'low',
				'normal',
				'high',
				'critical',
			];

			for (const risk of levels) {
				const { quorum } = resolveReviewQuorum({}, risk);
				expect(quorum).toBeGreaterThanOrEqual(MIN_QUORUM);
				expect(quorum).toBeLessThanOrEqual(MAX_QUORUM);
			}
		});

		it('rises monotonically with risk', () => {
			expect(resolveReviewQuorum({}, 'low').quorum).toBeLessThanOrEqual(
				resolveReviewQuorum({}, 'high').quorum,
			);
			expect(resolveReviewQuorum({}, 'high').quorum).toBeLessThanOrEqual(
				resolveReviewQuorum({}, 'critical').quorum,
			);
		});
	});

	describe("the operator's word outranks the calculation, both ways", () => {
		it('honours a configured quorum above what risk would choose', () => {
			const resolved = resolveReviewQuorum({ quorum: 4 }, 'low');

			expect(resolved.quorum).toBe(4);
			expect(resolved.configured).toBe(true);
		});

		it('honours a configured quorum below what risk would choose', () => {
			// A calculation that could override the operator would not be a
			// policy the operator set.
			expect(resolveReviewQuorum({ quorum: 1 }, 'critical').quorum).toBe(
				1,
			);
		});

		it('restores the single-reviewer contract when the panel is off', () => {
			const resolved = resolveReviewQuorum(
				{ enabled: false },
				'critical',
			);

			expect(resolved.quorum).toBe(1);
			expect(resolved.reason).toContain('exactly as before');
		});

		it('lets disabling win even over an explicit quorum', () => {
			expect(
				resolveReviewQuorum({ enabled: false, quorum: 3 }, 'critical')
					.quorum,
			).toBe(1);
		});
	});

	describe('an unusable quorum is refused, never clamped', () => {
		it('refuses zero, which would mean nothing reviews the work', () => {
			expect(() => resolveReviewQuorum({ quorum: 0 })).toThrow(
				InvalidQuorumError,
			);
		});

		it('refuses more than the maximum', () => {
			expect(() => resolveReviewQuorum({ quorum: 9 })).toThrow(
				InvalidQuorumError,
			);
		});

		it('refuses a fraction', () => {
			expect(() => resolveReviewQuorum({ quorum: 2.5 })).toThrow(
				InvalidQuorumError,
			);
		});

		it('says which values it would accept, instead of clamping silently', () => {
			// Clamping leaves the system disagreeing with its own
			// configuration and never saying so.
			try {
				resolveReviewQuorum({ quorum: 9 });
				expect.unreachable('should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidQuorumError);
				expect((error as Error).message).toContain('between 1 and 4');
				expect((error as Error).message).toContain('Clamping');
			}
		});
	});

	describe('critical domains are an explicit list, not a heuristic', () => {
		it('recognises the domains that make a change critical whatever its size', () => {
			for (const domain of CRITICAL_DOMAINS) {
				expect(isCriticalDomain([domain]), domain).toBe(true);
			}
		});

		it('is case and whitespace tolerant', () => {
			expect(isCriticalDomain(['  Security '])).toBe(true);
		});

		it('does not invent criticality for an ordinary domain', () => {
			expect(isCriticalDomain(['docs', 'formatting'])).toBe(false);
			expect(isCriticalDomain([])).toBe(false);
		});

		it('is short enough to argue with', () => {
			// The point of the list is that it is explicit and reviewable:
			// a heuristic would decide the most expensive case with the
			// least scrutiny.
			expect(CRITICAL_DOMAINS.length).toBeLessThanOrEqual(8);
		});
	});
});
