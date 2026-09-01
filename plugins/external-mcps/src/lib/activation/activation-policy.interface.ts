/**
 * activation-policy.interface.ts — types for the activation authorization
 * matrix (AUD-D04).
 *
 * `llmDecidesActivation` and `requireHumanAckWhenLlmDecides` were two
 * independently-read booleans threaded ad hoc through the call proxy
 * (only the second one actually was — see `activation-policy.ts` for the
 * fix). Modelling both as one pure decision function makes the policy a
 * single, exhaustively-testable surface instead of nested `if`s scattered
 * through I/O code.
 */

/** Everything the policy needs to decide one `call` invocation. */
export interface IActivationPolicyInput {
	/**
	 * When `true` (default) the LLM may activate a declared server that
	 * is not yet running. When `false` the model can only reach a server
	 * that is ALREADY active — activating a cold one is a human-only act
	 * (e.g. declaring `eager: true` in config, or an out-of-band host
	 * activation), never something the model's own tool call can trigger.
	 */
	readonly llmDecidesActivation: boolean;
	/**
	 * When `true` (default) an LLM-decided activation additionally needs
	 * a recorded, accepted human ack before it may proceed.
	 */
	readonly requireHumanAckWhenLlmDecides: boolean;
	/**
	 * True iff the target server already has a live cached child. An
	 * already-active server is a normal invocation, not an activation —
	 * neither knob applies to it.
	 */
	readonly alreadyActive: boolean;
	/** True iff a recorded, accepted human ack exists for this server. */
	readonly hasRecordedAck: boolean;
}

/** Stable, machine-actionable denial codes (mirrors `CallOutputSchema`). */
export type IActivationDenialCode = 'llm-activation-disabled' | 'ack-required';

/** The policy's verdict for one invocation. */
export interface IActivationDecision {
	readonly allowed: boolean;
	/** Present only when `allowed` is `false`. */
	readonly code?: IActivationDenialCode;
	/** Present only when `allowed` is `false` — one actionable line. */
	readonly hint?: string;
}
