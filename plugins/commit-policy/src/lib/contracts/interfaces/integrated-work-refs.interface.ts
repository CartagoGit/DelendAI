import type { IGitRunner } from '@delendai/core/public';

/** What removing integrated work refs needs. */
export interface IReapIntegratedWorkRefsInput {
	readonly run: IGitRunner;
	/** Work namespace from the policy, e.g. `heads/wip/`. */
	readonly workRefPrefix: string;
	/** Integration head the work must already be contained in. */
	readonly integrationSha: string;
	/** Remote whose copies are removed too; absent means local only. */
	readonly remote?: string | undefined;
	/** Fully-qualified refs never removed, such as the one just written. */
	readonly keep: readonly string[];
}

/** What was removed, and what could not be. Never a thrown error. */
export interface IReapIntegratedWorkRefsResult {
	readonly removedLocal: readonly string[];
	readonly removedRemote: readonly string[];
	readonly failures: readonly string[];
}
