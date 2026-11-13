/**
 * Contract shapes for `./effective-policy`.
 */
import type { IResolveDevelopmentPolicyInput } from './resolve.interface';

export interface IEffectivePolicyInput extends IResolveDevelopmentPolicyInput {
	/** The workspace, asked for its stable default branch when none is declared. */
	readonly workspaceRoot: string;
}
