/**
 * agent-closure-report.spec.ts — the gate that decides whether an agent
 * may close a slice, and what it refuses.
 *
 * It had no coverage at all, which for a gate is the worst place to have
 * none: a gate nobody exercises is indistinguishable from a gate that
 * always says yes. Each case below is a refusal that costs something if
 * it stops working — closing work whose self-review failed, attributing
 * a slice to nobody, or accepting a model the host does not run.
 */
import { describe, expect, it } from 'vitest';

import {
	AgentClosureGateError,
	assertGate,
	evaluateSelfReviewGate,
	type IAgentClosureReport,
	type IAgentClosureVocabulary,
} from '@delendai/proposals/lib/agents/agent-closure-report';

const report = (
	overrides: Partial<IAgentClosureReport> = {},
): IAgentClosureReport => ({
	agentName: 'copilot-minimax-m3',
	agentSlot: 'implementation_runner',
	model: 'claude-opus-5',
	selfReview: 'pass',
	filesReRead: 3,
	reviewEvidence: ['typecheck', 'tests'],
	...overrides,
});

describe('evaluateSelfReviewGate', () => {
	it('closes a slice whose self-review passed and whose model is declared', () => {
		const decision = evaluateSelfReviewGate(report());
		expect(decision.closureDecision).toBe('close');
		expect(decision.blockerType).toBe('none');
	});

	it('never closes a slice whose self-review failed', () => {
		// The whole point of the gate. `open_fix` and not `awaiting_user`:
		// the agent owns this diff and can repair it without a human.
		const decision = evaluateSelfReviewGate(report({ selfReview: 'fail' }));
		expect(decision.closureDecision).toBe('open_fix');
		expect(decision.blockerType).toBe('owned-validation-failure');
	});

	it('asks a human when the work belongs to nobody', () => {
		// Attribution cannot be invented, so this is the one case the gate
		// escalates instead of asking the agent to fix it alone.
		for (const agentName of ['', '   ']) {
			const decision = evaluateSelfReviewGate(report({ agentName }));
			expect(decision.closureDecision).toBe('awaiting_user');
			expect(decision.blockerType).toBe('state-inconsistency');
		}
	});

	it('refuses a model the host does not actually run', () => {
		const vocabulary: IAgentClosureVocabulary = {
			slots: ['implementation_runner'],
			validModels: new Set(['claude-opus-5']),
		};
		expect(
			evaluateSelfReviewGate(report({ model: 'gpt-guess' }), vocabulary)
				.closureDecision,
		).toBe('open_fix');
		expect(
			evaluateSelfReviewGate(report(), vocabulary).closureDecision,
		).toBe('close');
	});

	it('accepts any model when the host declared no inventory', () => {
		// An absent inventory means "unknown", and refusing every model on
		// that basis would block every close on a host that never
		// published one.
		expect(
			evaluateSelfReviewGate(report({ model: 'anything-at-all' }))
				.closureDecision,
		).toBe('close');
	});

	it('names the inventory in the refusal when the host labelled it', () => {
		// An agent told only "not in inventory" cannot tell WHICH
		// inventory it failed.
		const decision = evaluateSelfReviewGate(report({ model: 'nope' }), {
			slots: ['implementation_runner'],
			validModels: new Set(['claude-opus-5']),
			modelInventoryLabel: 'observed 2026-09-11',
		});
		expect(decision.reason).toContain('observed 2026-09-11');
	});

	it('checks attribution before the model, so a nameless slice never reads as a model problem', () => {
		const decision = evaluateSelfReviewGate(
			report({ agentName: '', model: 'nope' }),
			{ slots: ['implementation_runner'], validModels: new Set() },
		);
		expect(decision.closureDecision).toBe('awaiting_user');
		expect(decision.reason).toContain('agentName');
	});
});

describe('assertGate', () => {
	it('is silent when the gate closes', () => {
		expect(() => {
			assertGate(report());
		}).not.toThrow();
	});

	it('carries the decision on the error, not just a message', () => {
		// A caller that catches this needs the nextAction, not a string to
		// re-parse.
		let caught: unknown;
		try {
			assertGate(report({ selfReview: 'fail' }));
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(AgentClosureGateError);
		const error = caught as AgentClosureGateError;
		expect(error.closureDecision).toBe('open_fix');
		expect(error.blockerType).toBe('owned-validation-failure');
		expect(error.nextAction.length).toBeGreaterThan(0);
	});
});
