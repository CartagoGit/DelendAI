/**
 * activation-policy.ts — the pure activation-authorization decision
 * (AUD-D04).
 *
 * `llmDecidesActivation` was declared, defaulted and documented ("when
 * `true` (default) the LLM may activate servers WITHIN the declared set;
 * when `false` it can only suggest and a human activates" —
 * `options-schema.ts`) but no code path read it: the call proxy only
 * consumed `requireHumanAckWhenLlmDecides` + the ack ledger. A user who
 * set `llmDecidesActivation: false` got zero enforcement — the model
 * could still trigger the first boot of any declared server exactly as
 * before.
 *
 * This module is the single place that decides whether one `call`
 * invocation may proceed. It is pure (no I/O, no registry, no clock) so
 * the full 2×2×2 authorization matrix is testable without spawning a
 * child process.
 */
import type {
	IActivationDecision,
	IActivationPolicyInput,
} from './activation-policy.interface';

/** Denied: the model tried to activate a cold server with the knob off. */
const LLM_ACTIVATION_DISABLED_HINT =
	'llmDecidesActivation is false — the model cannot activate this server on its own. A human must activate it explicitly (e.g. set eager: true under plugins.external-mcps.servers.<id> and restart the host, or boot it via an out-of-band host action) before it can be called.';

/** Denied: activation is allowed but still awaits a recorded human ack. */
const ACK_REQUIRED_HINT =
	'activating this server needs a recorded human ack (requireHumanAckWhenLlmDecides is on) and none is recorded — ask the human to ack, or set the knob to false in plugins.external-mcps.options.';

/**
 * Decide whether one `call` invocation may proceed.
 *
 * An already-active server (`alreadyActive: true`) is a normal
 * invocation, not an activation: neither autonomy knob applies to it —
 * this is what lets an eagerly-booted or human-activated server keep
 * serving calls even while `llmDecidesActivation` is `false`.
 *
 * For a cold server, `llmDecidesActivation: false` denies unconditionally
 * (the model may never trigger the first boot); `true` then defers to
 * `requireHumanAckWhenLlmDecides` exactly as before this fix.
 */
export const decideActivation = (
	input: IActivationPolicyInput,
): IActivationDecision => {
	if (input.alreadyActive) return { allowed: true };

	if (!input.llmDecidesActivation) {
		return {
			allowed: false,
			code: 'llm-activation-disabled',
			hint: LLM_ACTIVATION_DISABLED_HINT,
		};
	}

	if (input.requireHumanAckWhenLlmDecides && !input.hasRecordedAck) {
		return {
			allowed: false,
			code: 'ack-required',
			hint: ACK_REQUIRED_HINT,
		};
	}

	return { allowed: true };
};
