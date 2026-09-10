/**
 * Contract shapes for `./resolve`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `resolve.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `resolve.ts`, so no import site changes.
 */

/** The `development` block, exactly as it may appear in the config file. */
export interface IDevelopmentConfigInput {
	readonly profile?: string | undefined;
	readonly branches?:
		| {
				readonly integration?: string | undefined;
				readonly release?: string | undefined;
				readonly workRefTemplate?: string | undefined;
				readonly workRefPrefix?: string | undefined;
		  }
		| undefined;
	readonly workspace?: { readonly strategy?: string | undefined } | undefined;
	readonly persistence?:
		| { readonly strategy?: string | undefined }
		| undefined;
	readonly checkpoint?:
		| {
				readonly strategy?: string | undefined;
				readonly intervalMinutes?: number | undefined;
				readonly durableWip?: boolean | undefined;
		  }
		| undefined;
	readonly integration?:
		| {
				readonly strategy?: string | undefined;
				readonly requiredChecks?: readonly string[] | undefined;
				readonly requireLatestIntegration?: boolean | undefined;
				readonly mergeGreenProgressContinuously?: boolean | undefined;
				readonly requiredApprovals?: number | undefined;
				readonly releaseRequiredApprovals?: number | undefined;
				readonly mergeMethod?: string | undefined;
				readonly deleteMergedWorkRef?: boolean | undefined;
				readonly linearHistory?: boolean | undefined;
				readonly allowForcePush?: boolean | undefined;
				readonly allowDeleteIntegrationBranch?: boolean | undefined;
		  }
		| undefined;
	readonly coordination?:
		| {
				readonly strategy?: string | undefined;
				readonly leaseTtlMinutes?: number | undefined;
		  }
		| undefined;
	readonly recovery?:
		| {
				readonly strategy?: string | undefined;
				readonly neverDiscardUnmergedWork?: boolean | undefined;
		  }
		| undefined;
	readonly governance?:
		| {
				readonly strategy?: string | undefined;
				readonly failClosedOnUnverifiable?: boolean | undefined;
		  }
		| undefined;
}

/**
 * The pre-policy fields the compatibility layer reads. Deliberately typed
 * loosely: these come from a config file written against an older schema,
 * so anything unrecognised must degrade rather than throw.
 */
export interface ILegacyDevelopmentInput {
	/** Top-level `agentWorktree`. */
	readonly agentWorktree?: boolean | undefined;
	/** `plugins.commit-policy.options`, if present. */
	readonly commitPolicyOptions?: Record<string, unknown> | undefined;
}

export interface IResolveDevelopmentPolicyInput {
	readonly development?: IDevelopmentConfigInput | undefined;
	readonly legacy?: ILegacyDevelopmentInput | undefined;
}
