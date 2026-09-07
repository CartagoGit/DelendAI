/**
 * CapabilityResolver structured error envelope.
 *
 * Discriminated union over the **terminal** failure shapes the resolver
 * reports to the LLM. Internal lifecycle states of the lazy-loading
 * pipeline (`unloaded`, `pending`, `hidden`, `deactivated`) are
 * runtime-internal and must NEVER cross this wire as
 * `disabled` / `not available` / `not loaded` — those phrases hide a
 * recoverable state behind a terminal-looking error.
 *
 * Invariant x00512 I2: this union is the **complete** set of
 * `status === 'terminal'` outcomes. Anything that is not one of these
 * six categories is either `status === 'ok'` (a tool result was
 * produced) or a thrown, un-caught exception (which the runtime
 * surfaces via the existing `toolError` envelope).
 *
 * x00512 / S1.
 */

export type IResolverTerminalReason =
	| 'catalog_missing'
	| 'ambiguous_capability'
	| 'policy_denied'
	| 'host_read_only'
	| 'activation_failed'
	| 'argument_validation_failed'
	| 'execution_failed';

export interface IResolverError {
	readonly status: 'terminal';
	readonly reason: IResolverTerminalReason;
	/**
	 * Human-readable detail. Should never read like a host phrase such as
	 * "tool disabled". It identifies *why* and references the capability
	 * the LLM asked for, so the diagnostic trail points back to the
	 * intent, not the implementation.
	 */
	readonly detail: string;
	/**
	 * The input the LLM supplied. Echoed back so the resolver-result
	 * envelope is self-describing for log reconstruction (see also
	 * `delendai_resolve_capability`'s structured result).
	 */
	readonly request: Readonly<Record<string, unknown>>;
	/**
	 * Present when the request matched several canonical capabilities and
	 * the caller must disambiguate explicitly.
	 */
	readonly candidates?: readonly string[];
	/**
	 * When the failure is about a SPECIFIC capability (catalog missing,
	 * policy denied, activation failed) the resolver fills this with the
	 * canonical name it looked up, so the LLM does not have to reflow
	 * both inputs. Optional because some failures (e.g. argument
	 * validation) are tied to inputs, not identities.
	 */
	readonly capability?: string;
	/**
	 * When the resolver wants to suggest the next action — for example,
	 * "the capability exists but is administratively deactivated; the
	 * operator may re-authorize it via plugin_activate" — it is surfaced
	 * here. Optional and free-form; never required.
	 */
	readonly nextAction?: string;
}

export const isResolverError = (value: unknown): value is IResolverError => {
	if (value === null || typeof value !== 'object') return false;
	const candidate = value as { status?: unknown; reason?: unknown };
	return (
		candidate.status === 'terminal' && typeof candidate.reason === 'string'
	);
};

/**
 * Build a terminal resolver error.
 *
 * Internal helper. The factory exists so the six reason constants stay
 * compile-checked (a typo on a string union becomes a type error here,
 * not a silent semantic regression).
 */
export const resolverError = (input: {
	readonly reason: IResolverTerminalReason;
	readonly detail: string;
	readonly request: Readonly<Record<string, unknown>>;
	readonly candidates?: readonly string[];
	readonly capability?: string;
	readonly nextAction?: string;
}): IResolverError => ({
	status: 'terminal',
	reason: input.reason,
	detail: input.detail,
	request: input.request,
	...(input.candidates !== undefined ? { candidates: input.candidates } : {}),
	...(input.capability !== undefined ? { capability: input.capability } : {}),
	...(input.nextAction !== undefined ? { nextAction: input.nextAction } : {}),
});
