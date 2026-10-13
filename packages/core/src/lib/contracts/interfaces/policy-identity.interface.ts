/**
 * policy-identity.interface.ts — the agent-identity axis of the
 * development policy (f00758).
 *
 * Sibling of `guard.unknownActor`: that axis says how an unidentified
 * ACTOR is judged at a git hook; this one says how a NAME that no source
 * declared a model counts when work is attributed — refs, commit
 * authors, review verdicts.
 */

/**
 * What to do with an identity no source named a model (nothing declared,
 * or the provider bridge refused/off and no client name marking one).
 *
 * - `'refuse'` — the historical default: no name, no unit. The refusal
 *   names this axis so the operator learns the knob exists.
 * - `{ use }` — name it `use` instead (normalised like any agent id), so
 *   a project that does not care WHICH model works still gets refs and
 *   authors it can read.
 */
export const UNRECOGNIZED_MODEL_POLICIES = ['refuse'] as const;
export type IUnrecognizedModelPolicy =
	| (typeof UNRECOGNIZED_MODEL_POLICIES)[number]
	| { readonly use: string };

/** Identity axis. Absent means today's behaviour: nothing renamed. */
export interface IPolicyIdentity {
	/**
	 * Whether an identity the provider bridge OBSERVED (a model the chat
	 * provider served and published) counts at all. Default `true`;
	 * `false` makes declared model ids the only way in.
	 */
	readonly providerBridge?: boolean | undefined;
	/** What an identity nothing named a model becomes. Default `'refuse'`. */
	readonly unrecognizedModel?: IUnrecognizedModelPolicy | undefined;
	/**
	 * Spellings this project knows name one model, e.g. `"minimax-3.1":
	 * "minimax-m3.1-flash-preview"`: for agents whose machine never saw the
	 * model in an editor, so the seen-model catalog cannot resolve them.
	 */
	readonly aliases?: Readonly<Record<string, string>> | undefined;
}

/**
 * The `development.identity` block as a config file writes it. Loosely
 * typed on purpose: `resolve-identity.ts` carries an unrecognised value
 * through so the validator names it back to the operator.
 */
export interface IIdentityConfigInput {
	readonly providerBridge?: unknown;
	readonly unrecognizedModel?: unknown;
	readonly aliases?: unknown;
}
