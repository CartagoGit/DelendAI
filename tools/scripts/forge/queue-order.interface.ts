import type {
	IIntegrationCertification,
	ITrainCandidate,
} from '@delendai/core/cli';

/**
 * How a train touches the forge and git, injected so the train itself
 * runs on fixtures and on any forge.
 */
export interface ITrainPorts {
	/** The commit an existing train ref points at, or `undefined`. */
	readonly trainAt: (ref: string) => string | undefined;
	/** The runs of the certifying workflow at a train's commit, judged. */
	readonly runAt: (sha: string) => IIntegrationCertification;
	/**
	 * Merge the members, in order, onto the integration tip and push the
	 * result to `ref`, regenerating once the derived files a member
	 * conflicted in. Pushes nothing when any member conflicts in another
	 * file, and returns the conflicting ones.
	 */
	readonly assemble: (
		ref: string,
		members: readonly ITrainCandidate[],
	) => {
		readonly conflicting: readonly number[];
		/** Git's reason, when the push of the assembled train was declined. */
		readonly pushFailure?: string;
	};
	/**
	 * Start one run of the certifying workflow on `ref`, judged since the
	 * integration tip: the union of the members' scopes, not the full suite.
	 */
	readonly dispatch: (ref: string) => boolean;
	/**
	 * Land a proved train: fast-forward the integration branch to `sha`,
	 * else merge each member through its pull request, in train order.
	 * Returns the members that landed.
	 */
	readonly land: (
		sha: string,
		members: readonly ITrainCandidate[],
	) => readonly number[];
	/** Tell the culprit's author, and keep it out until its head moves. */
	readonly blame: (candidate: ITrainCandidate) => void;
	/**
	 * The jobs that are red on the train `ref` when `candidate`'s own
	 * required checks are green on its head: then the train, not the
	 * member, is at fault. `undefined` when the member's checks are not
	 * green (it stays the culprit) or the port is not given.
	 */
	readonly trainFault?: (
		candidate: ITrainCandidate,
		ref: string,
	) => readonly string[] | undefined;
	/** Open or refresh the one issue for a train red on its own. */
	readonly reportTrainRed?: (
		ref: string,
		candidate: ITrainCandidate,
		jobs: readonly string[],
	) => void;
	readonly say: (line: string) => void;
}
