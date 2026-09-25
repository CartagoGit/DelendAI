/**
 * publish-proposal.interface.ts — the contract behind
 * `../../tools/publish-proposal.ts`.
 *
 * Convention: types live in `contracts/interfaces/*.interface.ts`
 * (`lint:types-in-contracts`); every exported type/interface is prefixed
 * `I`.
 */
import type { IGitRunner } from '../../shared/git-runner';

/**
 * The slice of the resolved development policy publication needs.
 *
 * Deliberately narrower than `IResolvedDevelopmentPolicy`: a publisher
 * needs to know whether this project integrates through a pull request,
 * what prefix its publication refs carry, and which branches it must
 * never push onto. Taking the whole policy would let this module reach
 * for fields whose meaning it has no business deciding.
 */
export interface IProposalPublicationPolicy {
	/** True when work reaches the integration branch via a pull request. */
	readonly requiresPullRequest?: boolean | undefined;
	/** Ref prefix for published work, e.g. `delendai/pr/`. */
	readonly publicationRefPrefix?: string | undefined;
	/** The integration branch, which publication must never push onto. */
	readonly integration?: string | undefined;
	/** The release branch, which publication must never push onto. */
	readonly release?: string | undefined;
}

/** What a publication commit is built from. */
export interface IProposalCommitInput {
	/** Revision the commit is based on: the integration branch head. */
	readonly baseSha: string;
	/** Workspace-relative path of the one file the commit adds. */
	readonly relativePath: string;
	readonly message: string;
}

export type IProposalCommitResult =
	| { readonly ok: true; readonly sha: string }
	| { readonly ok: false; readonly reason: string };

/**
 * Builds the publication commit without touching the checkout: no
 * `HEAD` move, nothing staged in the shared index.
 */
export type IProposalCommitPort = (
	input: IProposalCommitInput,
) => Promise<IProposalCommitResult>;

/** One proposal to publish, and the git runner to publish it with. */
export interface IPublishProposalRequest {
	/** The proposal's id, which names its ref. */
	readonly proposalId: string;
	/** Workspace-relative path of the file to stage and commit. */
	readonly relativePath: string;
	/** Commit message for the publication commit. */
	readonly message: string;
	/** Injectable git runner, for reads and the push. */
	readonly git: IGitRunner;
	/** Builds the commit off to the side of the checkout. */
	readonly commit: IProposalCommitPort;
	/** How this project publishes. Absent ⇒ nothing is published. */
	readonly policy?: IProposalPublicationPolicy | undefined;
	/** Push remote. Defaults to `origin`. */
	readonly remote?: string | undefined;
}

/**
 * What publication did, or why it did not happen.
 *
 * `published: false` is never an error the caller should treat as a
 * failed authoring: the proposal document exists either way, and the
 * reason is reported so an agent knows whether a step is still owed.
 */
export interface IPublishProposalOutcome {
	readonly published: boolean;
	/** The ref the proposal was published on, when one was derived. */
	readonly ref?: string | undefined;
	/** The published commit, when the push succeeded. */
	readonly sha?: string | undefined;
	/** Why publication did not happen, when it did not. */
	readonly reason?: string | undefined;
}
