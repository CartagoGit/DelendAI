/**
 * Every code external_mcp_call can answer a refused or failed call with.
 * The outputSchema's enum and the types are derived from these lists, so a
 * new code cannot reach a client the schema would make reject it.
 */

/** Why the activation policy refused a call. */
export const ACTIVATION_DENIAL_CODES = [
	'llm-activation-disabled',
	'ack-required',
] as const;

/** Why the registry could not complete a routed call. */
export const EXTERNAL_CALL_FAILURE_CODES = [
	'unknown-server',
	'missing-env',
	'call-failed',
	'call-timeout',
] as const;
