/**
 * resolve-guard.ts — the `development.guard` block, carried into the policy.
 *
 * Only a declared value is stored: an absent key keeps the derived default
 * (`unknownActorOf`), so a project that never mentions it follows the
 * workspace it uses. An unrecognised value is carried through for
 * `validateDevelopmentPolicy` to name back to the operator.
 */
import type {
	IPolicyGuard,
	IUnknownActor,
} from '../contracts/interfaces/policy-guard.interface';

export const guardOverride = (
	guard: { readonly unknownActor?: string | undefined } | undefined,
): { readonly guard?: IPolicyGuard } =>
	guard?.unknownActor === undefined
		? {}
		: { guard: { unknownActor: guard.unknownActor as IUnknownActor } };
