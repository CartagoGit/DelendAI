/**
 * seams.ts — everything outside the reconciler it is allowed to talk to.
 *
 * WHY these are interfaces and not imports: the reconciler's job is to
 * make a boot on a NEW machine behave like a continuation of the last
 * one, and that behaviour has to be provable. Git and the forge are the
 * two inputs whose real implementations are slow, networked and
 * destructive to fake badly, so the contract between them and this
 * subsystem is stated here — narrow enough that a spec can implement it
 * against a real temporary repository, and narrow enough that nothing in
 * this directory can reach past it and start rewriting history.
 *
 * Note what is missing on purpose: no `deleteRef`, no `resetHard`, no
 * `push`, no forge WRITE. Startup reconciliation observes, records and
 * repairs local state, and the only repair it may perform on the tree is
 * the one that cannot lose anything — see `fastForward`.
 */

import type {
	IDesiredForgeState,
	IForgeRepositoryRef,
	ILiveForgeState,
} from '../forge-governance/index';

/**
 * A working tree, as far as git could be asked. `unknown` is a real
 * answer: it is what a failed `git status` means, and reading it as
 * `clean` is how a precondition gets asserted without being checked.
 */
export type IWorktreeDirtiness =
	| { readonly kind: 'clean' }
	| { readonly kind: 'dirty'; readonly paths: readonly string[] }
	| { readonly kind: 'unknown'; readonly reason: string };

/** Injectable clock: a boot report must be reproducible in a test. */
export interface IStartupClock {
	now(): number;
}

/** Where the reconciler is running and against what. */
export interface IStartupEnvironment {
	readonly workspaceRoot: string;
	readonly machineId: string;
	readonly hostname: string;
	readonly platform: string;
	/** The agent identity this process reconciles as. */
	readonly agentId: string;
	/** Undefined when the repository identity could not be determined. */
	readonly repository?: IStartupRepositoryKey | undefined;
}

/** Forge-side identity of the repository. Mirrors the work model's key. */
export interface IStartupRepositoryKey {
	readonly forge: string;
	readonly owner: string;
	readonly name: string;
}

/** Detects the environment. Fails soft: unknown fields come back absent. */
export interface IStartupEnvironmentSeam {
	detect(): Promise<IStartupEnvironment>;
}

/** A ref as git currently reports it. */
export interface IObservedRef {
	readonly name: string;
	readonly sha: string;
}

/** Everything the reconciler needs to know about one work ref. */
export interface IWorkRefSnapshot {
	readonly name: string;
	readonly sha: string;
	/** Merge base with the integration branch; empty when unrelated. */
	readonly baseSha: string;
	/** Paths the ref changes relative to the base, sorted. */
	readonly fileScope: readonly string[];
	/** Content fingerprint over the scope; stable across machines. */
	readonly patchDigest: string;
}

/** Result of a git operation that may legitimately be unavailable. */
export interface IGitOutcome {
	readonly ok: boolean;
	readonly reason?: string | undefined;
}

/**
 * The git surface. `fetch` is the single network call; it and
 * `fastForward` are the only mutations, and between them they write
 * remote-tracking refs and advance a branch that was already behind.
 */
export interface IStartupGitSeam {
	/** Fetch the integration branch and the managed work-ref namespace. */
	fetch(request: {
		readonly integrationBranch: string;
		readonly workRefPrefix: string;
		/**
		 * The candidate namespace, so `--prune` reaches it too.
		 *
		 * Optional because a policy that publishes no candidates has
		 * none; absent means "do not fetch or prune that space" rather
		 * than a default guess at its name.
		 */
		readonly publicationRefPrefix?: string | undefined;
	}): Promise<IGitOutcome>;
	/** All refs under a namespace, sorted by name. */
	listRefs(prefix: string): Promise<readonly IObservedRef[]>;
	/** Resolve a ref to a SHA; undefined when it does not exist. */
	resolveRef(name: string): Promise<string | undefined>;
	/** Describe a work ref against the integration head. */
	describeRef(
		name: string,
		integrationRef: string,
	): Promise<IWorkRefSnapshot | undefined>;
	/** True when `ancestor` is contained in `descendant`. */
	isAncestor(ancestor: string, descendant: string): Promise<boolean>;
	/** The branch HEAD points at, or undefined when detached. */
	currentBranch(): Promise<string | undefined>;
	/**
	 * Paths the working tree has changed against HEAD, staged or not.
	 *
	 * Under a shared checkout this is the one question nobody was
	 * asking. A tracked file can be rewritten by a generator, a stray
	 * command or a half-finished edit, and every OTHER agent then sees
	 * a dirty tree it did not make — sweeps it into an unrelated
	 * candidate, or reverts somebody's work believing it to be noise.
	 * With one agent that is an annoyance; with fifteen it is the
	 * failure mode.
	 */
	dirtyPaths(): Promise<readonly string[]>;
	/**
	 * What the working tree is, including the case nobody can answer.
	 * Optional so an existing seam implementation stays valid; a caller
	 * that must not guess treats its absence as `unknown`.
	 */
	dirtyState?(): Promise<IWorktreeDirtiness>;
	/**
	 * The one remote this workspace integrates with, resolved from what
	 * the integration branch tracks. Optional so an existing seam stays
	 * valid; a caller without it falls back to `origin`, which is what
	 * every call site hard-coded before.
	 */
	integrationRemote?(integrationBranch: string): Promise<string | undefined>;
	/** The commit HEAD points at. */
	headSha(): Promise<string | undefined>;
	/**
	 * Advance the CURRENT branch to `target`, and only when that is a
	 * fast-forward.
	 *
	 * The one mutation this seam offers, and the reason it is admissible
	 * when `switch`, `reset` and `push` are not: a fast-forward creates
	 * no commit, rewrites no history and discards nothing. Git refuses
	 * it unless the current head is an ancestor of the target, so the
	 * safety is enforced twice — by the caller's preconditions and by
	 * git itself.
	 *
	 * WHY it had to exist. Under a shared checkout the visible tree sits
	 * on the integration branch and nobody moves it, so when the forge
	 * absorbs a pull request the local branch simply stays where it was.
	 * The reconciler already NOTICED this and said "advance it with a
	 * fast-forward before publishing" — advice nobody was around to
	 * follow. Measured on this repository: the shared checkout was 92
	 * commits behind its remote, and every agent starting there was
	 * building on a tree that old.
	 */
	fastForward(target: string): Promise<IGitOutcome>;
}

/** One pull request as the forge reports it. */
export interface IForgePullRequest {
	readonly number: number;
	readonly headRef: string;
	readonly baseRef: string;
	readonly headSha: string;
	readonly state: 'draft' | 'open' | 'closed' | 'merged';
	readonly mergeSha?: string | undefined;
}

/** One check run as the forge reports it. */
export interface IForgeCheckRun {
	readonly candidateSha: string;
	readonly workflow: string;
	readonly checkName: string;
	readonly externalId?: string | undefined;
	readonly state:
		| 'queued'
		| 'in_progress'
		| 'success'
		| 'failure'
		| 'cancelled'
		| 'timed_out'
		| 'neutral';
	readonly startedAt?: number | undefined;
	readonly completedAt?: number | undefined;
}

/**
 * A conditional-read result. `notModified` is what makes a warm boot
 * cheap: the forge is asked with the previous ETag and answers with a
 * status instead of a payload.
 */
export type IForgeRead<TPayload> =
	| {
			readonly kind: 'payload';
			readonly payload: TPayload;
			readonly etag?: string | undefined;
	  }
	| { readonly kind: 'not-modified' }
	| { readonly kind: 'unavailable'; readonly reason: string };

/** Read-only forge access. No mutation is reachable from here. */
export interface IStartupForgeSeam {
	listPullRequests(request: {
		readonly etag?: string | undefined;
	}): Promise<IForgeRead<readonly IForgePullRequest[]>>;
	listCheckRuns(request: {
		readonly shas: readonly string[];
	}): Promise<IForgeRead<readonly IForgeCheckRun[]>>;
}

/** One exported coordination event, as it travels between machines. */
export interface IJournalSourceEvent {
	readonly eventKind:
		| 'owner-changed'
		| 'slice-recovered'
		| 'slice-deprecated'
		| 'semantic-checkpoint'
		| 'recovery-decision'
		| 'migration-applied'
		| 'reconciliation-outcome';
	readonly repositoryUid?: string | undefined;
	readonly workUnitUid?: string | undefined;
	readonly proposalUid?: string | undefined;
	readonly sliceUid?: string | undefined;
	readonly generation?: number | undefined;
	readonly actorAgentId?: string | undefined;
	readonly machineId?: string | undefined;
	readonly occurredAt: number;
	readonly payload?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * The durable journal, wherever the project ships it (a ref, a bucket, a
 * forge release asset). It is the ONE input a rebuild cannot re-derive
 * from git and the forge, so it gets its own seam.
 */
export interface IStartupJournalSource {
	/** Events at or after `sinceOccurredAt`, oldest first. */
	read(request: {
		readonly sinceOccurredAt?: number | undefined;
	}): Promise<IForgeRead<readonly IJournalSourceEvent[]>>;
}

/**
 * Read-only governance. Applying is the broker's job — this seam has no
 * write method precisely so a boot cannot start changing branch rules.
 */
export interface IStartupGovernanceSeam {
	readLiveState(request: {
		readonly target: IForgeRepositoryRef;
		readonly desired: IDesiredForgeState;
	}): Promise<ILiveForgeState | undefined>;
}

/** Outcome of trying to become the one process that reconciles. */
export type IMutexOutcome =
	| { readonly kind: 'acquired'; readonly release: () => Promise<void> }
	| { readonly kind: 'busy'; readonly holder: string };

/** The startup/reconcile mutex. Concurrent boots must not both reconcile. */
export interface IStartupMutex {
	acquire(): Promise<IMutexOutcome>;
}
