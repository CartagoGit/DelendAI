/**
 * Contract shapes for `./development-policy.migrator`.
 */
import type {
	IAdoptionBlock,
	IAdoptionEvidence,
} from '../../development-policy/adopt';

/** The slice of the config file adoption reads. */
export interface IConfigShape {
	readonly development?: unknown;
	readonly agentWorktree?: unknown;
}

/** The block adoption writes: its profile, branches, and any checks. */
export interface IAdoptedBlock extends IAdoptionBlock {
	readonly integration?: { readonly requiredChecks: readonly string[] };
}

export interface IAdoption {
	readonly block?: IAdoptedBlock | undefined;
	readonly reasons: readonly string[];
	/** The forge the remote points at, so setup can follow it too. */
	readonly forge: IAdoptionEvidence['forge'];
}
