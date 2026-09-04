import { describe, expect, it } from 'vitest';

import {
	nextRecoveryStep,
	RECOVERY_LADDER,
	type IRecoveryPermissions,
	type TRecoveryRung,
} from '../../../../src/lib/rotation/recovery-ladder';

const permissions = (
	partial: Partial<IRecoveryPermissions> = {},
): IRecoveryPermissions => ({
	mayEscalateRoute: true,
	mayRotateAgent: true,
	attempted: [],
	...partial,
});

/** Climb until terminal, collecting the rungs offered. */
const climb = (base: Partial<IRecoveryPermissions> = {}): TRecoveryRung[] => {
	const taken: TRecoveryRung[] = [];
	for (let guard = 0; guard < 20; guard += 1) {
		const step = nextRecoveryStep(
			'stalled',
			permissions({ ...base, attempted: taken }),
		);
		taken.push(step.rung);
		if (step.isTerminal) break;
	}
	return taken;
};

describe('recovery ladder (f00504 S3)', () => {
	describe('rungs are climbed cheapest first', () => {
		it('starts with the nearly free one', () => {
			const step = nextRecoveryStep('stalled', permissions());

			expect(step.rung).toBe('compact-state');
			expect(step.isTerminal).toBe(false);
			expect(step.reason).toContain('more context than it can use');
		});

		it('offers each rung once, in cost order', () => {
			expect(climb()).toEqual([...RECOVERY_LADDER]);
		});

		it('never repeats a rung already attempted', () => {
			const step = nextRecoveryStep(
				'stalled',
				permissions({ attempted: ['compact-state'] }),
			);

			expect(step.rung).toBe('reevaluate-blocker');
		});

		it('counts the rungs attempted so stalls can be learned from', () => {
			const step = nextRecoveryStep(
				'stalled',
				permissions({
					attempted: ['compact-state', 'reevaluate-blocker'],
				}),
			);

			expect(step.rungsAttempted).toBe(3);
		});
	});

	describe('escalation never buys what was not authorised', () => {
		it('skips the route escalation when the configuration forbids it', () => {
			// The only rung that can spend more than was already committed.
			// A watchdog that could authorise its own spending would be a
			// budget hole with a helpful name.
			expect(climb({ mayEscalateRoute: false })).not.toContain(
				'escalate-route',
			);
		});

		it('skips rotation when there is no agent to rotate to', () => {
			expect(climb({ mayRotateAgent: false })).not.toContain(
				'rotate-agent',
			);
		});

		it('still reaches the terminal rung when everything above is forbidden', () => {
			const taken = climb({
				mayEscalateRoute: false,
				mayRotateAgent: false,
			});

			expect(taken.at(-1)).toBe('terminate-blocked');
		});

		it('records a skipped rung as attempted rather than pretending it was tried', () => {
			// The diagnosis must show what the ladder could actually reach,
			// not imply a remedy was tried and failed.
			const step = nextRecoveryStep(
				'stalled',
				permissions({
					mayEscalateRoute: false,
					attempted: [
						'compact-state',
						'reevaluate-blocker',
						'change-strategy',
						'alternative-tool',
						'rotate-agent',
					],
				}),
			);

			expect(step.isTerminal).toBe(true);
			expect(step.diagnosis?.attempted).toContain('escalate-route');
		});
	});

	describe('giving up is an outcome, and it explains itself', () => {
		it('is terminal only on the last rung', () => {
			const taken = climb();

			for (const rung of taken.slice(0, -1)) {
				expect(
					nextRecoveryStep(
						'stalled',
						permissions({
							attempted: taken.slice(0, taken.indexOf(rung)),
						}),
					).isTerminal,
				).toBe(false);
			}
			expect(taken.at(-1)).toBe('terminate-blocked');
		});

		it('carries the declared blocker into what a human is asked for', () => {
			const step = nextRecoveryStep(
				'blocked',
				permissions({ attempted: [...RECOVERY_LADDER.slice(0, 6)] }),
				'the deploy key has no write access',
			);

			expect(step.isTerminal).toBe(true);
			expect(step.diagnosis?.needsFromHuman).toContain(
				'the deploy key has no write access',
			);
			expect(step.diagnosis?.state).toBe('blocked');
		});

		it('still says something useful when no blocker was declared', () => {
			const step = nextRecoveryStep(
				'stalled',
				permissions({ attempted: [...RECOVERY_LADDER.slice(0, 6)] }),
			);

			expect(step.diagnosis?.needsFromHuman).toContain(
				'no blocker declared',
			);
			expect(step.diagnosis?.blocker).toBeUndefined();
		});

		it('reports what was tried, compactly rather than as a dump', () => {
			const step = nextRecoveryStep(
				'stalled',
				permissions({ attempted: [...RECOVERY_LADDER.slice(0, 6)] }),
				'a lock nobody released',
			);

			expect(step.diagnosis?.attempted).toHaveLength(
				RECOVERY_LADDER.length,
			);
			expect(step.diagnosis?.needsFromHuman.split('\n')).toHaveLength(1);
		});
	});
});
