import { describe, expect, it } from 'vitest';

import { buildCloseBlockerGuidance } from '../../../../src/lib/services/close-blocker';

describe('buildCloseBlockerGuidance', () => {
	it('never blames the validate gate', () => {
		// The observed failure: an agent read "Fix the failing validate
		// output", concluded the repo-wide validate chain was its
		// blocker, and waited for a green run that could never have
		// unblocked it — with the work finished and the slice open.
		const cases = [
			{
				reason: 'close requires a consistent snapshot and an active current actor',
				blockingReasons: [
					'the current actor has corrupt activity evidence',
				],
			},
			{
				reason: 'close requires an active current actor',
				blockingReasons: [
					'the current actor is not provably active in the activity snapshot',
				],
			},
			{
				reason: 'files fall outside every configured scope',
				blockingReasons: ['no scope matches src/x.ts'],
			},
			{ reason: 'something new', blockingReasons: [] },
		];
		for (const input of cases) {
			const guidance = buildCloseBlockerGuidance(input);
			expect(guidance.nextAction).toContain('NOT');
			expect(guidance.nextAction).toContain('validate gate');
		}
	});

	it('sends a corrupt snapshot to state_health / state_repair', () => {
		const guidance = buildCloseBlockerGuidance({
			reason: 'close requires a consistent snapshot and an active current actor',
			blockingReasons: [
				'the current actor has corrupt activity evidence',
			],
		});
		expect(guidance.nextAction).toContain('state_health');
		expect(guidance.nextAction).toContain('state_repair');
	});

	it('tells an inactive actor to re-claim its lock', () => {
		// The common cause: the lock was released before the close, so
		// the caller is no longer a provably active actor. Re-claiming
		// is the entire fix, and nothing said so.
		const guidance = buildCloseBlockerGuidance({
			reason: 'close requires an active current actor',
			blockingReasons: [
				'the current actor is not provably active in the activity snapshot',
			],
		});
		expect(guidance.nextAction).toContain('agent_lock');
		expect(guidance.nextAction).toContain('claim');
	});

	it('points a scope gap at the scope config or the slice Files list', () => {
		const guidance = buildCloseBlockerGuidance({
			reason: 'blocked',
			blockingReasons: ['file src/x.ts matches no configured scope'],
		});
		expect(guidance.nextAction).toContain('scope');
		expect(guidance.nextAction).toContain('Files');
	});

	it('admits it has no specific guidance rather than inventing one', () => {
		// An agent can escalate a stated unknown. It cannot escalate
		// silence, and it must not be handed a confident wrong action.
		const guidance = buildCloseBlockerGuidance({
			reason: 'some future blocker',
			blockingReasons: ['a reason nobody has seen yet'],
		});
		expect(guidance.nextAction).toContain(
			'does not have specific guidance',
		);
		expect(guidance.nextAction).toContain(
			'Do NOT retry this call unchanged',
		);
	});

	it('always passes the resolver’s own reasons through verbatim', () => {
		const guidance = buildCloseBlockerGuidance({
			reason: 'close requires an active current actor',
			blockingReasons: ['reason one', 'reason two'],
		});
		expect(guidance.blockingReasons).toEqual(['reason one', 'reason two']);
	});
});
