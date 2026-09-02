import { describe, expect, it } from 'vitest';

import { diagnoseValidateBlocker } from '../../../../src/lib/services/validate-blocker';

const NOW = Date.parse('2026-09-02T12:00:00.000Z');
const hoursAgo = (hours: number): string =>
	new Date(NOW - hours * 3_600_000).toISOString();

describe('diagnoseValidateBlocker', () => {
	it('tells an agent that has never run validate to run it', () => {
		const diagnosis = diagnoseValidateBlocker([], NOW);
		expect(diagnosis.state).toBe('never-ran');
		expect(diagnosis.nextAction).toContain('bun run validate');
	});

	it('does NOT tell an agent whose validate just failed to run it again', () => {
		// The loop, exactly: the gate used to answer "bun run validate"
		// to an agent that had run it and watched it fail, so the agent
		// ran it again. Nothing about the refusal may read as "retry".
		const diagnosis = diagnoseValidateBlocker(
			[
				{
					result: 'fail',
					exitCode: 1,
					timestamp: hoursAgo(0.1),
					failedSteps: ['bun run lint', 'bun run test'],
				},
			],
			NOW,
		);
		expect(diagnosis.state).toBe('red');
		expect(diagnosis.nextAction).toContain('Fix the failing steps');
		expect(diagnosis.nextAction).toContain('bun run lint');
		expect(diagnosis.nextAction).toContain('bun run test');
		expect(diagnosis.nextAction).toContain('do NOT retry this call');
	});

	it('names shared-branch breakage as everyone’s blocker', () => {
		// In a swarm the failing steps are often another agent's. Left
		// unsaid, each agent concludes the block is not its problem and
		// starts another slice — which is how the whole team ends up
		// busy with nothing closing.
		const diagnosis = diagnoseValidateBlocker(
			[{ result: 'fail', exitCode: 1, timestamp: hoursAgo(0.1) }],
			NOW,
		);
		expect(diagnosis.nextAction).toContain('every agent');
		expect(diagnosis.nextAction).toContain('do NOT start another slice');
	});

	it('distinguishes a pass that has aged out from one that never happened', () => {
		const diagnosis = diagnoseValidateBlocker(
			[{ result: 'pass', exitCode: 0, timestamp: hoursAgo(30) }],
			NOW,
		);
		expect(diagnosis.state).toBe('stale-pass');
		expect(diagnosis.reason).toContain('more than 24h ago');
		expect(diagnosis.nextAction).toContain('bun run validate');
	});

	it('judges by the most recent run, not the most recent pass', () => {
		// An older green run must not vouch for a tree that has since
		// gone red — that is how known-broken work shipped on a shared
		// branch.
		const diagnosis = diagnoseValidateBlocker(
			[
				{ result: 'pass', exitCode: 0, timestamp: hoursAgo(2) },
				{ result: 'fail', exitCode: 1, timestamp: hoursAgo(1) },
			],
			NOW,
		);
		expect(diagnosis.state).toBe('red');
	});

	it('still gives a next step when the journal recorded no step names', () => {
		// Entries written before the runner started recording them, or
		// by a different writer. A missing detail must not cost the agent
		// its next move.
		const diagnosis = diagnoseValidateBlocker(
			[{ result: 'fail', exitCode: 1, timestamp: hoursAgo(0.1) }],
			NOW,
		);
		expect(diagnosis.failedSteps).toEqual([]);
		expect(diagnosis.nextAction).toContain('re-run');
	});

	it('ignores rows whose timestamp cannot be parsed', () => {
		const diagnosis = diagnoseValidateBlocker(
			[
				{ result: 'fail', exitCode: 1, timestamp: 'not-a-date' },
				{ result: 'pass', exitCode: 0, timestamp: hoursAgo(1) },
			],
			NOW,
		);
		expect(diagnosis.state).toBe('never-ran');
		expect(diagnosis.reason).toContain('still fresh');
	});
});
