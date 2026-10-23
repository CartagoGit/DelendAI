/**
 * activation-policy.spec.ts — the pure activation-authorization matrix
 * (AUD-D04).
 *
 * `llmDecidesActivation` was declared, defaulted and documented but no
 * code path read it (see `invoke-proxy.ts`'s "Activation gate" doc
 * comment). This spec exhaustively covers the decision function that
 * fixes that: the 2×2×2 matrix over `llmDecidesActivation`,
 * `requireHumanAckWhenLlmDecides` and `hasRecordedAck`, plus the
 * `alreadyActive` short-circuit that keeps a running server callable
 * regardless of either knob.
 */
import { describe, expect, it } from 'vitest';

import { decideActivation } from '../../../src/lib/activation/activation-policy.helper';
import type { IActivationPolicyInput } from '../../../src/lib/activation/activation-policy.interface';

const base: IActivationPolicyInput = {
	llmDecidesActivation: true,
	requireHumanAckWhenLlmDecides: true,
	alreadyActive: false,
	hasRecordedAck: false,
};

describe('decideActivation — AUD-D04 authorization matrix', () => {
	it('an already-active server is always allowed, regardless of either knob or ack state', () => {
		for (const llmDecidesActivation of [true, false]) {
			for (const requireHumanAckWhenLlmDecides of [true, false]) {
				for (const hasRecordedAck of [true, false]) {
					expect(
						decideActivation({
							llmDecidesActivation,
							requireHumanAckWhenLlmDecides,
							alreadyActive: true,
							hasRecordedAck,
						}),
					).toEqual({ allowed: true });
				}
			}
		}
	});

	it('COLD server + llmDecidesActivation:false → denied with llm-activation-disabled, regardless of ack state', () => {
		for (const requireHumanAckWhenLlmDecides of [true, false]) {
			for (const hasRecordedAck of [true, false]) {
				const decision = decideActivation({
					...base,
					llmDecidesActivation: false,
					requireHumanAckWhenLlmDecides,
					hasRecordedAck,
				});
				expect(decision.allowed).toBe(false);
				expect(decision.code).toBe('llm-activation-disabled');
				expect(decision.hint).toContain('llmDecidesActivation');
			}
		}
	});

	it('COLD server + llmDecidesActivation:true + requireHumanAckWhenLlmDecides:true + no ack → denied with ack-required', () => {
		const decision = decideActivation({
			...base,
			llmDecidesActivation: true,
			requireHumanAckWhenLlmDecides: true,
			hasRecordedAck: false,
		});
		expect(decision).toMatchObject({
			allowed: false,
			code: 'ack-required',
		});
	});

	it('COLD server + llmDecidesActivation:true + requireHumanAckWhenLlmDecides:true + recorded ack → allowed', () => {
		const decision = decideActivation({
			...base,
			llmDecidesActivation: true,
			requireHumanAckWhenLlmDecides: true,
			hasRecordedAck: true,
		});
		expect(decision).toEqual({ allowed: true });
	});

	it('COLD server + llmDecidesActivation:true + requireHumanAckWhenLlmDecides:false → allowed regardless of ack', () => {
		for (const hasRecordedAck of [true, false]) {
			const decision = decideActivation({
				...base,
				llmDecidesActivation: true,
				requireHumanAckWhenLlmDecides: false,
				hasRecordedAck,
			});
			expect(decision).toEqual({ allowed: true });
		}
	});
});
