/**
 * git-port.ts — the git operations the integration engine needs that the
 * WIP engine does not already own.
 *
 * The WIP engine owns everything that builds a checkpoint (staging,
 * committing, replaying onto a new base). What integration adds is
 * publishing a ref to a remote, proving containment, and deleting a ref
 * once it is provably represented elsewhere. Those three are separated
 * behind a port for the same reason the forge is: a spec can then drive
 * the cycle against a REAL repository and a REAL bare remote, which is
 * the only way the ref assertions mean anything.
 *
 * Two deliberate shapes:
 *
 *  - `pushRef` and `deleteRef` are compare-and-swap by default. A push
 *    that would overwrite an unexpected remote tip, or a delete of a ref
 *    that has moved since it was inspected, is refused rather than
 *    performed — losing an agent's checkpoint to a stale expectation is
 *    exactly the failure this engine exists to prevent.
 *  - Nothing here can move HEAD. There is no checkout, switch, merge or
 *    reset in the port, so the shared working tree stays pinned.
 */

/** Outcome of one git operation. Never throws for an expected failure. */
export interface IGitOpResult {
	readonly ok: boolean;
	/** Human-readable cause. Empty when `ok`. */
	readonly reason: string;
}

/** Publish a local ref to a remote branch. */
export interface IPushRefRequest {
	readonly remote: string;
	/** Fully-qualified local ref, e.g. `refs/wip/agent-a/p-s-g1`. */
	readonly localRef: string;
	/** Remote branch name, without `refs/heads/`. */
	readonly branch: string;
	/**
	 * Allow a non-fast-forward push. Required after a rebase, where the
	 * replayed candidate is deliberately not a descendant of the old one.
	 */
	readonly force: boolean;
	/**
	 * Remote tip the push expects to replace. When given, the push is a
	 * compare-and-swap (`--force-with-lease`); an empty string asserts the
	 * branch does not exist yet.
	 */
	readonly expectedRemoteSha?: string;
}

/** Delete a local ref, refusing if it no longer points where expected. */
export interface IDeleteRefRequest {
	readonly ref: string;
	readonly expectedSha: string;
}

/** The git surface of the integration engine. */
export interface IIntegrationGit {
	/** Absolute working-tree root the port is bound to. */
	readonly root: string;
	/** Resolve a revision to a full object id, `undefined` when unknown. */
	resolveRevision(revision: string): Promise<string | undefined>;
	/** Update the local view of a remote. */
	fetch(remote: string, refspec: string): Promise<IGitOpResult>;
	pushRef(request: IPushRefRequest): Promise<IGitOpResult>;
	deleteRef(request: IDeleteRefRequest): Promise<IGitOpResult>;
	/** True when `ancestor` is reachable from `descendant`. */
	isAncestor(ancestor: string, descendant: string): Promise<boolean>;
}
