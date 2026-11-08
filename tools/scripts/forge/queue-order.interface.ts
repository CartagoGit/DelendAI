import type { IIntegrationCertification } from './certify-integration.interface';

/** What the queue needs to know about one candidate to order it. */
export interface IQueueCandidateFacts {
	readonly number: number;
	/** The candidate's branch, without `refs/heads/`. */
	readonly headRef: string;
	readonly draft: boolean;
	/** A required or other check concluded badly on its head. */
	readonly red: boolean;
	/** The checks that concluded badly, by name; empty when not red. */
	readonly failing?: readonly string[];
	/** The forge reports conflicts with the integration branch. */
	readonly conflicting: boolean;
}

/**
 * What the queue does about a red integration branch: arm the candidate
 * whose own full run proved it repairs the branch, dispatch that full run
 * for the next candidate that has none, wait for one that is running, or
 * nothing when no candidate can.
 */
export type IRepairStep =
	| { readonly kind: 'arm'; readonly number: number }
	| {
			readonly kind: 'dispatch';
			readonly number: number;
			readonly headRef: string;
	  }
	| { readonly kind: 'wait'; readonly number: number }
	| { readonly kind: 'none' };

/**
 * What the queue does with a train: land the members whose train passed
 * (naming a culprit when bisection isolated one beside them), dispatch the
 * full run of a train that has none, wait for one that is running, report
 * the member whose train of one is red, or nothing when there is no train.
 */
export type ITrainStep =
	| {
			readonly kind: 'land';
			readonly members: readonly number[];
			readonly culprit?: number;
	  }
	| { readonly kind: 'dispatch'; readonly members: readonly number[] }
	| { readonly kind: 'wait'; readonly members: readonly number[] }
	| { readonly kind: 'culprit'; readonly number: number }
	| { readonly kind: 'none' };

/** A train candidate: its number, branch and current head. */
export interface ITrainCandidate {
	readonly number: number;
	readonly headRef: string;
	readonly headSha: string;
}

/**
 * How a train touches the forge and git, injected so the train itself
 * runs on fixtures and on any forge.
 */
export interface ITrainPorts {
	/** The commit an existing train ref points at, or `undefined`. */
	readonly trainAt: (ref: string) => string | undefined;
	/** The full runs of the certifying workflow at a commit, judged. */
	readonly fullRunAt: (sha: string) => IIntegrationCertification;
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
	/** Start one full run of the certifying workflow on `ref`. */
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
	readonly say: (line: string) => void;
}
