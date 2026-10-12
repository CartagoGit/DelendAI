/**
 * resolve-identity.ts — the `development.identity` block, carried into
 * the policy (f00758).
 *
 * Like `resolve-guard.ts`: only a declared value is stored, so a project
 * that never mentions the axis keeps today's behaviour (bridge on,
 * unrecognized refused by the identity being empty). An unrecognised
 * value is carried through for `validateDevelopmentPolicy` to name back
 * to the operator, exactly as every other axis does.
 */
import type {
	IPolicyIdentity,
	IUnrecognizedModelPolicy,
} from '../contracts/interfaces/policy-identity.interface';

/** The `development.identity` block as a config file writes it. */
export interface IIdentityConfigInput {
	readonly providerBridge?: unknown;
	readonly unrecognizedModel?: unknown;
}

/**
 * Whether `value` is the rename form: `{ use: <non-empty string> }`.
 * Anything else with a `use` that is not a usable name is carried
 * through untouched so the validator, not the resolver, explains it.
 */
const asRename = (value: unknown): IUnrecognizedModelPolicy | undefined => {
	if (typeof value !== 'object' || value === null || Array.isArray(value))
		return undefined;
	const use = (value as { readonly use?: unknown }).use;
	return typeof use === 'string' && use.trim().length > 0
		? { use }
		: undefined;
};

const unrecognizedModelOf = (
	value: unknown,
): IUnrecognizedModelPolicy | undefined => {
	if (typeof value === 'string')
		// Carried through as-is; `validateDevelopmentPolicy` accepts only
		// what UNRECOGNIZED_MODEL_POLICIES names.
		return value as IUnrecognizedModelPolicy;
	return asRename(value);
};

export const identityOverride = (
	input: IIdentityConfigInput | undefined,
): { readonly identity?: IPolicyIdentity } => {
	if (input === undefined) return {};
	const providerBridge =
		typeof input.providerBridge === 'boolean'
			? input.providerBridge
			: undefined;
	const unrecognizedModel = unrecognizedModelOf(input.unrecognizedModel);
	if (providerBridge === undefined && unrecognizedModel === undefined)
		return {};
	return {
		identity: {
			...(providerBridge === undefined ? {} : { providerBridge }),
			...(unrecognizedModel === undefined ? {} : { unrecognizedModel }),
		},
	};
};
