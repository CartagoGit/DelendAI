/**
 * ResolvedCommitScope — the machine-readable scope a slice event may commit.
 *
 * For a slice event the engine never uses `gitDirtyFilePaths()` and never
 * uses `sliceContext.files` literally. Both contain entries that are not
 * git paths (markdown link syntax, "(or equivalent)", globs, free text).
 * This interface is the canonical, post-resolution shape that the driver
 * and the engine both consume.
 *
 * Why the name: a slice commit is only valid if the staged paths are a
 * subset of this scope. Anything outside the scope, even if it ended up
 * staged by accident, is a CAUSALITY_VIOLATION.
 */

export type ResolvedScopeSource = 'declared' | 'ownership' | 'mixed';

/**
 * A single entry from the slice's `Files:` block that we could not
 * resolve to a git-path. We do NOT block the commit on these — we
 * record them so the audit trail shows which entries were dropped
 * and why. An agent that wants those paths committed must put real
 * paths in `Files:` (see proposal f00420).
 */
export interface IUnresolvedScopeEntry {
	/** Raw text from `Files:`. */
	readonly raw: string;
	/** Short, machine-readable reason code. */
	readonly reason:
		| 'markdown-link'
		| 'vague-language'
		| 'glob'
		| 'annotation'
		| 'rename-arrow'
		| 'empty'
		| 'absolute-path'
		| 'cross-repo';
}

export interface IResolvedCommitScope {
	readonly proposalId: string;
	readonly sliceId: string;
	/** Present when the event carried agent/task identity (future use). */
	readonly agentId?: string | undefined;
	readonly taskId?: string | undefined;
	readonly transitionId?: string | undefined;
	/**
	 * How the canonical `files` list was assembled:
	 * - `declared`: every entry passed the path canonicalisation test.
	 * - `ownership`: only entries intersecting positive ownership remain.
	 * - `mixed`: both — some entries came from declared and others from
	 *   ownership filtering.
	 */
	readonly source: ResolvedScopeSource;
	/**
	 * Canonical, repo-relative, POSIX paths the engine may stage.
	 * Subset of this is what gets committed; subset ⊆ staged is the
	 * CAUSALITY_VIOLATION invariant.
	 */
	readonly files: readonly string[];
	/** Entries we could not resolve; WARN, not refusal. */
	readonly unresolvedEntries: readonly IUnresolvedScopeEntry[];
	/**
	 * Paths in `files` that were NOT actually dirty in the workspace.
	 * Informational: shows up in the engine's WARN line so the host
	 * can tell the agent "your slice is committed but you never
	 * touched these files".
	 */
	readonly foreignDirtyExcluded: readonly string[];
}

/** Engine input. Mirrors `IEngineEvent` plus the policy knobs we need. */
export interface IResolveScopeInput {
	readonly proposalId: string;
	readonly sliceId: string;
	readonly declaredFiles: readonly string[];
	/**
	 * Optional: when provided, the resolver intersects the canonical
	 * declared-files with the agent's positive ownership set.
	 */
	readonly ownership?:
		| {
				readonly agentId: string;
				readonly taskId: string;
				readonly ownedFiles: readonly string[];
		  }
		| undefined;
	/**
	 * The current workspace dirty set, used to compute
	 * `foreignDirtyExcluded`. Resolver never rejects on this; it is
	 * purely informational.
	 */
	readonly workspaceDirty?: readonly string[] | undefined;
}
