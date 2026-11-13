/**
 * types.ts — the vocabulary of the WIP ref engine, kept in one file so the
 * operations (`checkpoint.ts`, `restore.ts`, `rebase.ts`) can be read as
 * pure mechanism.
 *
 * Two shape decisions are deliberate and load-bearing:
 *
 *  - Every operation returns a RESULT, never throws for an expected
 *    outcome. A rebase that cannot be replayed is a fact about the work,
 *    not an exception: the recovery flow has to name the conflicting
 *    paths to a human or to another agent, and a thrown error loses that
 *    structure. `status` is the discriminator.
 *  - Optional fields are avoided where a caller would have to guess:
 *    `exactOptionalPropertyTypes` is on in this repo, so a field that can
 *    be absent is written `readonly x?: string` and only ever assembled
 *    through an explicit spread, never assigned `undefined`.
 */

/** A single staged path: what the tree says about it. */
export interface IWipScopeEntry {
	/** Repository-root-relative path, forward slashes, as git stores it. */
	readonly path: string;
	/** Git file mode, e.g. `100644` / `100755` / `120000`. */
	readonly mode: string;
	/** Blob object id. */
	readonly sha: string;
}

/** `Name <email>` identity stamped on a checkpoint commit. */
export interface IWipAuthor {
	readonly name: string;
	readonly email: string;
}

/** Input to `createOrUpdateWipRef`. */
export interface IWipCheckpointRequest {
	/**
	 * The integration commit this unit of work is based on. The temporary
	 * index is seeded from this tree, so the checkpoint reads as
	 * "`baseSha`, plus exactly my paths" — never as a snapshot of whatever
	 * else happened to be dirty in the shared checkout.
	 */
	readonly baseSha: string;
	/**
	 * The claimed scope: files or directories, repository-root-relative.
	 * Nothing outside this list can enter the commit.
	 */
	readonly paths: readonly string[];
	/** Fully-qualified ref to create or advance, e.g. `refs/wip/a/p-s-g1`. */
	readonly ref: string;
	/** Commit subject/body. Scope trailers are appended by the engine. */
	readonly message: string;
	/** Identity for both author and committer. Defaults to git's config. */
	readonly author?: IWipAuthor;
	/**
	 * Opt in to a checkpoint whose scope is NARROWER than the one the ref
	 * already recorded — that is, to dropping previously-checkpointed
	 * content out of the ref's tree.
	 *
	 * Off by default, and that default is the point. The temporary index is
	 * seeded from `baseSha`, so a caller that quietly passes fewer paths
	 * than last time would produce a tree missing work it had already
	 * durably checkpointed: the agent is told its work is safe while the
	 * ref stops carrying it. Releasing a claim IS legitimate, so the
	 * capability stays — it just has to be said out loud.
	 */
	readonly allowScopeNarrowing?: boolean;
}

/**
 * Outcome of a checkpoint.
 *
 * `unchanged` is not a failure and not a no-op we hide: an interval-driven
 * checkpoint runs whether or not the agent edited anything, and answering
 * "the scope still hashes to X, no new commit" is what keeps a WIP ref
 * from accumulating a commit a minute of identical trees.
 *
 * `scope-narrowed` is the refusal that protects the engine's one promise.
 * A checkpoint exists so work is not lost; a request that would drop
 * already-checkpointed paths out of the ref is therefore answered with
 * the list of paths at risk and NO ref movement, rather than with a
 * narrower tree the caller would read as success.
 */
export interface IWipCheckpointResult {
	readonly status: 'created' | 'unchanged' | 'scope-narrowed' | 'failed';
	readonly ref: string;
	/** New checkpoint commit (or the existing head when `unchanged`). */
	readonly commit: string;
	/** Commit the checkpoint was built on: the old ref head, or `baseSha`. */
	readonly parent: string;
	/** Tree object id of the checkpoint. */
	readonly tree: string;
	/** Deterministic digest of the staged scope — see `patch-digest.ts`. */
	readonly patchDigest: string;
	/**
	 * The concrete files the scope expanded to, sorted — or, when the
	 * request was refused as `scope-narrowed`, the validated claim itself
	 * (nothing was expanded, because nothing was staged).
	 */
	readonly scope: readonly string[];
	/**
	 * Previously-checkpointed paths this request would have dropped from
	 * the ref. Populated only on `scope-narrowed`, where it is the whole
	 * answer: these are the files that would have been silently lost.
	 */
	readonly dropped: readonly string[];
	/** Present only when `status` is `failed` or `scope-narrowed`. */
	readonly reason?: string;
}

/** Input to `restorePathsFromRef`. */
export interface IWipRestoreRequest {
	/** Ref holding the checkpoint to restore from. */
	readonly ref: string;
	/** Paths to restore. Must all lie inside the ref's recorded scope. */
	readonly paths: readonly string[];
}

/** Outcome of a restore. */
export interface IWipRestoreResult {
	readonly status: 'restored' | 'refused' | 'failed';
	/** Files written back into the working tree. */
	readonly restored: readonly string[];
	/** Files removed because the checkpoint records them as deleted. */
	readonly deleted: readonly string[];
	/** Requested paths that are outside the ref's scope — cause of `refused`. */
	readonly outOfScope: readonly string[];
	readonly reason?: string;
}

/** Input to `rebaseWipOntoNewBase`. */
export interface IWipRebaseRequest {
	/** Ref to replay. Updated in place on success. */
	readonly ref: string;
	/** Base the ref was built on — the merge base of the replay. */
	readonly oldBase: string;
	/** Base to replay onto, typically the current integration head. */
	readonly newBase: string;
	/** Message for the replayed commit. Defaults to the original's. */
	readonly message?: string;
	readonly author?: IWipAuthor;
}

/**
 * Outcome of a rebase.
 *
 * `RECOVERY_CONFLICT` is spelled the way the recovery vocabulary spells
 * it because it leaves this engine and becomes a state another component
 * routes on. A conflict never updates the ref and never auto-resolves:
 * the old checkpoint stays exactly where it was, still recoverable.
 */
export interface IWipRebaseResult {
	readonly status: 'rebased' | 'unchanged' | 'RECOVERY_CONFLICT' | 'failed';
	readonly ref: string;
	/** Replayed commit; the unchanged head when nothing moved; `''` otherwise. */
	readonly commit: string;
	/** Tree of the replayed commit, or `''` when it was not produced. */
	readonly tree: string;
	/** Digest of the replayed scope, or `''` when it was not produced. */
	readonly patchDigest: string;
	/** Paths git could not merge — populated only on `RECOVERY_CONFLICT`. */
	readonly conflicts: readonly string[];
	readonly reason?: string;
}
