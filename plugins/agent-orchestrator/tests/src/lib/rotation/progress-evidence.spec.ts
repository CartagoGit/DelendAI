import { describe, expect, it } from 'vitest';

import {
	barrenStreak,
	deriveProgressState,
	hasAnyEvidence,
	NO_EVIDENCE,
	progressSeverity,
	type IProgressEvidence,
	type IProgressHistory,
	type TProgressState,
} from '../../../../src/lib/rotation/progress-evidence';

const evidence = (
	partial: Partial<IProgressEvidence> = {},
): IProgressEvidence => ({ ...NO_EVIDENCE, ...partial });

const history = (
	operations: readonly IProgressEvidence[],
	partial: Partial<IProgressHistory> = {},
): IProgressHistory => ({ operations, barrenLimit: 4, ...partial });

describe('progress evidence (f00504 S1)', () => {
	describe('what counts as evidence', () => {
		it('recognises each kind of meaningful operation', () => {
			const kinds: readonly Partial<IProgressEvidence>[] = [
				{ newInformation: true },
				{ stateChanged: true },
				{ filesTouched: ['a.ts'] },
				{ acceptanceAdvanced: 1 },
				{ blockerChanged: true },
			];

			for (const kind of kinds) {
				expect(hasAnyEvidence(evidence(kind))).toBe(true);
			}
		});

		it('an operation that produced nothing is not evidence', () => {
			expect(hasAnyEvidence(NO_EVIDENCE)).toBe(false);
		});
	});

	describe('the seven states are ordered by severity', () => {
		it('ranks a healthy state below a stalled one', () => {
			const order: readonly TProgressState[] = [
				'advancing',
				'exploring',
				'waiting',
				'retrying',
				'churning',
				'stalled',
				'blocked',
			];

			for (let index = 1; index < order.length; index += 1) {
				expect(
					progressSeverity(order[index] as TProgressState),
				).toBeGreaterThan(
					progressSeverity(order[index - 1] as TProgressState),
				);
			}
		});
	});

	describe('a task that is moving is not disturbed', () => {
		it('reads a satisfied acceptance criterion as advancing', () => {
			const verdict = deriveProgressState(
				history([evidence({ acceptanceAdvanced: 2 })]),
			);

			expect(verdict.state).toBe('advancing');
			expect(verdict.shouldEscalate).toBe(false);
			expect(verdict.reason).toContain('2 acceptance criteria');
		});

		it('reads changed files as advancing', () => {
			expect(
				deriveProgressState(
					history([evidence({ filesTouched: ['a.ts', 'b.ts'] })]),
				).state,
			).toBe('advancing');
		});

		it('reads a state change with no file write as advancing', () => {
			expect(
				deriveProgressState(history([evidence({ stateChanged: true })]))
					.state,
			).toBe('advancing');
		});

		it('reads reading and searching as exploring, not as churning', () => {
			// Real work with no output yet. It only becomes a problem if it
			// never converges, which the barren streak measures separately.
			const verdict = deriveProgressState(
				history([evidence({ newInformation: true })]),
			);

			expect(verdict.state).toBe('exploring');
			expect(verdict.shouldEscalate).toBe(false);
		});

		it('does not judge a run that has not started', () => {
			const verdict = deriveProgressState(history([]));

			expect(verdict.state).toBe('exploring');
			expect(verdict.reason).toContain('nothing has run yet');
		});
	});

	describe('waiting is not stalling, and never escalates', () => {
		it('treats an agent queued behind another agent lock as waiting', () => {
			// It produces no evidence at all and looks exactly like an
			// agent going in circles — but it is behaving correctly.
			const verdict = deriveProgressState(
				history([evidence({ waitingOn: "another agent's file lock" })]),
			);

			expect(verdict.state).toBe('waiting');
			expect(verdict.shouldEscalate).toBe(false);
			expect(verdict.reason).toContain('not a stall');
		});

		it('does not escalate however long the wait has been', () => {
			// Rotating a correctly queued agent throws away its place and
			// puts a second agent behind the same lock.
			const waits = Array.from({ length: 20 }, () =>
				evidence({ waitingOn: 'a running validation' }),
			);

			expect(deriveProgressState(history(waits)).shouldEscalate).toBe(
				false,
			);
		});

		it('does not count waiting operations toward the barren streak', () => {
			expect(
				barrenStreak([
					NO_EVIDENCE,
					NO_EVIDENCE,
					evidence({ waitingOn: 'a lock' }),
				]),
			).toBe(0);
		});

		it('resumes judging normally once the wait ends', () => {
			const verdict = deriveProgressState(
				history([
					evidence({ waitingOn: 'a lock' }),
					evidence({ filesTouched: ['a.ts'] }),
				]),
			);

			expect(verdict.state).toBe('advancing');
		});
	});

	describe('going nowhere is detected, but not on the first sign of it', () => {
		it('calls one empty operation ordinary', () => {
			const verdict = deriveProgressState(history([NO_EVIDENCE]));

			expect(verdict.state).toBe('retrying');
			expect(verdict.shouldEscalate).toBe(false);
		});

		it('calls a growing run of empty operations churning, without escalating yet', () => {
			const verdict = deriveProgressState(
				history([NO_EVIDENCE, NO_EVIDENCE, NO_EVIDENCE]),
			);

			expect(verdict.state).toBe('churning');
			expect(verdict.shouldEscalate).toBe(false);
			expect(verdict.barrenOperations).toBe(3);
		});

		it('escalates once the barren streak reaches the limit', () => {
			const verdict = deriveProgressState(
				history(Array.from({ length: 4 }, () => NO_EVIDENCE)),
			);

			expect(verdict.state).toBe('stalled');
			expect(verdict.shouldEscalate).toBe(true);
			expect(verdict.reason).toContain('no evidence of any kind');
		});

		it('resets the streak as soon as anything moves', () => {
			expect(
				barrenStreak([
					NO_EVIDENCE,
					NO_EVIDENCE,
					NO_EVIDENCE,
					evidence({ filesTouched: ['a.ts'] }),
					NO_EVIDENCE,
				]),
			).toBe(1);
		});

		it('does not flag a legitimate repeat that keeps producing evidence', () => {
			// Running the same spec after each fix is honest work. A
			// watchdog that cries wolf on it gets ignored, which is worse
			// than no watchdog.
			const verdict = deriveProgressState(
				history(
					Array.from({ length: 10 }, () =>
						evidence({ filesTouched: ['a.ts'] }),
					),
				),
			);

			expect(verdict.state).toBe('advancing');
			expect(verdict.shouldEscalate).toBe(false);
		});
	});

	describe('a declared blocker outranks everything', () => {
		it('is blocked even when the last operation advanced', () => {
			const verdict = deriveProgressState(
				history([evidence({ filesTouched: ['a.ts'] })], {
					declaredBlocker: 'the API key is missing',
				}),
			);

			expect(verdict.state).toBe('blocked');
			expect(verdict.shouldEscalate).toBe(true);
			expect(verdict.reason).toContain('the API key is missing');
		});

		it('is blocked even while waiting', () => {
			expect(
				deriveProgressState(
					history([evidence({ waitingOn: 'a lock' })], {
						declaredBlocker: 'no upstream configured',
					}),
				).state,
			).toBe('blocked');
		});
	});

	describe('the derivation is total and deterministic', () => {
		it('gives the same answer twice for the same history', () => {
			const input = history([
				evidence({ newInformation: true }),
				NO_EVIDENCE,
				NO_EVIDENCE,
			]);

			expect(deriveProgressState(input)).toEqual(
				deriveProgressState(input),
			);
		});

		it('only ever escalates from stalled or blocked', () => {
			const cases: readonly IProgressHistory[] = [
				history([]),
				history([NO_EVIDENCE]),
				history([NO_EVIDENCE, NO_EVIDENCE]),
				history([evidence({ newInformation: true })]),
				history([evidence({ waitingOn: 'x' })]),
				history([evidence({ acceptanceAdvanced: 1 })]),
				history(Array.from({ length: 9 }, () => NO_EVIDENCE)),
				history([], { declaredBlocker: 'x' }),
			];

			for (const input of cases) {
				const verdict = deriveProgressState(input);
				expect(verdict.shouldEscalate).toBe(
					verdict.state === 'stalled' || verdict.state === 'blocked',
				);
			}
		});
	});
});
