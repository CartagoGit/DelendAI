import type {
	IPublicationTarget,
	IPublicationTargetRequest,
} from './publication-target.interface';

/** An open pull request, as the forge lists it. */
export interface IOpenPullRequest {
	readonly number: number;
	/** The branch the pull request is opened from. */
	readonly headRefName: string;
	/** The commit that branch points at. */
	readonly headRefOid: string;
}

/** What the republication decision asks of git and of the forge's CLI. */
export interface IRepublicationPorts {
	/** Git's trimmed output, or `undefined` when it failed. */
	readonly git: (args: readonly string[]) => string | undefined;
	/** The forge CLI's trimmed output, or `undefined` when it failed. */
	readonly gh: (args: readonly string[]) => string | undefined;
}

/** Where a publication goes, with what the caller should be told. */
export interface IResolvedPublicationTarget extends IPublicationTarget {
	/** The open pull request the publication updates, when it joins one. */
	readonly pullRequestNumber?: number | undefined;
	/** One line per thing the caller must know; empty when nothing. */
	readonly notes: readonly string[];
}

export type IRepublicationRequest = IPublicationTargetRequest;
