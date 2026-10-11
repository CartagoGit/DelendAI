import { describe, expect, it } from 'vitest';

import {
	fingerprintObservations,
	fingerprintOperation,
	judgeRepetition,
	type IOperationFingerprintInput,
} from '../../../../src/lib/rotation/stall-fingerprint';

const op = (
	partial: Partial<IOperationFingerprintInput> = {},
): IOperationFingerprintInput => ({
	tool: 'run_tests',
	args: '{"scope":"core"}',
	inputDigest: 'in-1',
	outputDigest: 'out-1',
	taskDigest: 'task-1',
	...partial,
});

describe('stall fingerprint (f00504 S2)', () => {
	describe('the fingerprint covers the situation, not just the call', () => {
		it('is stable for the same situation', () => {
			expect(fingerprintOperation(op())).toBe(fingerprintOperation(op()));
		});

		it('changes when any part of the situation changes', () => {
			const base = fingerprintOperation(op());

			expect(fingerprintOperation(op({ tool: 'read' }))).not.toBe(base);
			expect(fingerprintOperation(op({ args: '{}' }))).not.toBe(base);
			expect(fingerprintOperation(op({ inputDigest: 'x' }))).not.toBe(
				base,
			);
			expect(fingerprintOperation(op({ outputDigest: 'x' }))).not.toBe(
				base,
			);
			expect(fingerprintOperation(op({ taskDigest: 'x' }))).not.toBe(
				base,
			);
		});

		it('cannot be collided by shifting a delimiter across a field', () => {
			// Without length prefixes, one operation would silently read as
			// a repeat of a different one.
			expect(
				fingerprintOperation(op({ tool: 'a:b', args: 'c' })),
			).not.toBe(fingerprintOperation(op({ tool: 'a', args: 'b:c' })));
		});
	});

	describe('a legitimate repeat is not a loop', () => {
		it('does not flag the same tool when the task keeps moving', () => {
			// Re-running the spec after each fix. A detector that fires on
			// this gets muted, and a muted detector protects nothing.
			const window = [
				op({ taskDigest: 'task-1', outputDigest: 'fail-1' }),
				op({ taskDigest: 'task-2', outputDigest: 'fail-2' }),
				op({ taskDigest: 'task-3', outputDigest: 'pass' }),
			];

			expect(judgeRepetition(window).isLoop).toBe(false);
		});

		it('does not flag the same call with different inputs', () => {
			const window = [
				op({ inputDigest: 'a' }),
				op({ inputDigest: 'b' }),
				op({ inputDigest: 'c' }),
			];

			expect(judgeRepetition(window).isLoop).toBe(false);
		});

		it('stays quiet however many times a moving task repeats a tool', () => {
			const window = Array.from({ length: 30 }, (_unused, index) =>
				op({ taskDigest: `task-${index.toString()}` }),
			);

			expect(judgeRepetition(window).isLoop).toBe(false);
		});
	});

	describe('a revalidation over an unchanged state is a loop', () => {
		it('flags the identical situation recurring', () => {
			const verdict = judgeRepetition([op(), op()]);

			expect(verdict.isLoop).toBe(true);
			expect(verdict.occurrences).toBe(2);
			expect(verdict.reason).toContain('unchanged task state');
		});

		it('does not flag a single occurrence', () => {
			const verdict = judgeRepetition([op()]);

			expect(verdict.isLoop).toBe(false);
			expect(verdict.reason).toContain('below the 2');
		});

		it('honours a higher threshold', () => {
			expect(judgeRepetition([op(), op()], 3).isLoop).toBe(false);
			expect(judgeRepetition([op(), op(), op()], 3).isLoop).toBe(true);
		});

		it('counts only the situation that just recurred', () => {
			const verdict = judgeRepetition([
				op({ tool: 'read' }),
				op({ tool: 'read' }),
				op({ tool: 'write' }),
			]);

			// The newest operation is the `write`, which happened once.
			expect(verdict.occurrences).toBe(1);
			expect(verdict.isLoop).toBe(false);
		});

		it('says nothing has run when the window is empty', () => {
			expect(judgeRepetition([]).isLoop).toBe(false);
		});
	});

	describe('both detectors feed one judgement', () => {
		it('reads observations from different detectors through the same rule', () => {
			// The point of the shared type: a detector reports what it saw
			// and this module decides what it means, so the two cannot
			// disagree.
			const verdict = fingerprintObservations([
				{ detectorId: 'agent-loop-detector', operation: op() },
				{ detectorId: 'rotation/loop-detector', operation: op() },
			]);

			expect(verdict.isLoop).toBe(true);
		});

		it('reaches the same verdict as the raw window would', () => {
			const window = [op({ taskDigest: 'a' }), op({ taskDigest: 'b' })];

			expect(
				fingerprintObservations(
					window.map((operation, index) => ({
						detectorId: `d${index.toString()}`,
						operation,
					})),
				),
			).toEqual(judgeRepetition(window));
		});
	});
});
