/** What `publishWorkRef` was asked to do. */
export interface IWorkPublishRequest {
	/** Repository root; every git command runs there. */
	readonly root: string;
	/** Directory the caller is standing in, so it is never removed. */
	readonly cwd: string;
	/** Fully-qualified work ref, e.g. `refs/heads/ns/wip/agent/x-S1-g1`. */
	readonly workRef: string;
	/** Fully-qualified publication ref, e.g. `refs/heads/ns/pr/name`. */
	readonly publicationRef: string;
	readonly remote: string;
	/** Publish, but keep the work ref and its worktree. */
	readonly keepWorkRef?: boolean | undefined;
	/** Why the work ref is kept, for the step that reports it. */
	readonly keepWorkRefBecause?: string | undefined;
}

/** One thing publishing did, or refused to do, and why. */
export interface IWorkPublishStep {
	readonly name: string;
	readonly ok: boolean;
	readonly detail: string;
}

/**
 * The outcome. `published` and `workRefRemoved` are separate on purpose:
 * a publication that succeeded while the cleanup did not must not read
 * as a failure, and must not read as finished either.
 */
export interface IWorkPublishOutcome {
	readonly published: boolean;
	readonly workRefRemoved: boolean;
	readonly steps: readonly IWorkPublishStep[];
	/** The commit that was published, or null when there was nothing. */
	readonly tip: string | null;
}
