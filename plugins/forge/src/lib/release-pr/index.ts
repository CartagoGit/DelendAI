import type { IReleasePromotionPlan } from '../contracts/interfaces/release-promotion-plan.interface';
import {
	assertReleaseMetadata,
	evaluateReleaseReadiness,
	type IReleaseCandidateMetadata,
	type IReleaseGate,
	type IReleaseReadiness,
	type IReleaseTarget,
} from '@delendai/core/public';

export interface IReleasePrRecord {
	readonly number: number;
	readonly url: string;
	readonly title: string;
	readonly headBranch: string;
	readonly baseBranch: string;
}

export interface IReleasePrProvider {
	listPullRequests(input: {
		readonly headBranch: string;
		readonly baseBranch: string;
	}): Promise<readonly IReleasePrRecord[]>;
	createPullRequest(input: {
		readonly title: string;
		readonly body: string;
		readonly headBranch: string;
		readonly baseBranch: string;
	}): Promise<IReleasePrRecord>;
}

export interface ICreateReleasePrInput {
	readonly candidate: IReleaseCandidateMetadata;
	readonly gates: readonly IReleaseGate[];
	/** Where the release lands, from the project's policy. */
	readonly target: IReleaseTarget;
	readonly currentBranch: string;
	readonly upstream?: string | undefined;
	readonly provider: IReleasePrProvider;
}

export interface IReleasePrResult {
	readonly created: boolean;
	readonly pr: IReleasePrRecord;
	readonly readiness: IReleaseReadiness;
	readonly description: string;
}

export class ReleasePrContractError extends Error {
	readonly code:
		| 'wrong-branch'
		| 'wrong-base'
		| 'no-pull-request'
		| 'invalid-metadata'
		| 'missing-upstream'
		| 'readiness-blocked'
		| 'provider-contract';
	readonly details?: Readonly<Record<string, string>>;

	constructor(
		code: ReleasePrContractError['code'],
		message: string,
		details?: Readonly<Record<string, string>>,
	) {
		super(message);
		this.name = 'ReleasePrContractError';
		this.code = code;
		if (details !== undefined) this.details = details;
	}
}

const RELEASE_BRANCH =
	/^release\/(patch|minor|major)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

const NO_PULL_REQUEST_REASON: Readonly<
	Record<Exclude<IReleaseTarget['promotion'], 'pull-request'>, string>
> = {
	none: 'is both the integration and the release branch, so there is no release promotion',
	merge: 'integrates by merge, so a release reaches the release branch by merge and no pull request is opened',
	direct: 'integrates directly, so a release reaches the release branch by push and no pull request is opened',
};

export const assertPullRequestPromotion = (target: IReleaseTarget): void => {
	if (target.promotion === 'pull-request') return;
	throw new ReleasePrContractError(
		'no-pull-request',
		`${target.integrationBranch} ${NO_PULL_REQUEST_REASON[target.promotion]}`,
		{ promotion: target.promotion, releaseBranch: target.releaseBranch },
	);
};

export const buildReleasePrDescription = (
	candidate: IReleaseCandidateMetadata,
	readiness: IReleaseReadiness,
	target: IReleaseTarget,
): string => {
	const gates = readiness.gates
		.map(
			(gate) =>
				`${gate.name}=${gate.status}${gate.required === false ? ' (optional)' : ''}`,
		)
		.join(', ');
	return [
		`Release branch: ${candidate.branch}`,
		`Source ${target.integrationBranch} SHA: ${candidate.sourceDevelopSha}`,
		`Base ${target.releaseBranch} SHA: ${candidate.baseMainSha}`,
		`Version: ${candidate.fromVersion} -> ${candidate.targetVersion}`,
		`Release type: ${candidate.type}`,
		`Gates: ${gates || 'none'}`,
	].join('\n');
};

export const createReleasePullRequest = async ({
	candidate,
	gates,
	currentBranch,
	upstream,
	provider,
	target,
}: ICreateReleasePrInput): Promise<IReleasePrResult> => {
	assertPullRequestPromotion(target);
	try {
		assertReleaseMetadata(candidate);
	} catch (error) {
		throw new ReleasePrContractError(
			'invalid-metadata',
			error instanceof Error ? error.message : 'invalid release metadata',
		);
	}
	if (
		!RELEASE_BRANCH.test(currentBranch) ||
		currentBranch !== candidate.branch
	)
		throw new ReleasePrContractError(
			'wrong-branch',
			`release PR branch must match candidate: ${candidate.branch}`,
		);
	if (
		candidate.baseMainSha.trim() === '' ||
		candidate.branch === target.releaseBranch
	)
		throw new ReleasePrContractError(
			'wrong-base',
			`release PR target must be ${target.releaseBranch}`,
		);
	if (upstream?.trim() === undefined || upstream.trim() === '')
		throw new ReleasePrContractError(
			'missing-upstream',
			'release PR branch must have an upstream',
		);
	const readiness = evaluateReleaseReadiness(gates);
	if (!readiness.ready)
		throw new ReleasePrContractError(
			'readiness-blocked',
			`release readiness blocked: ${readiness.blockingGates.join(', ')}`,
		);
	const description = buildReleasePrDescription(candidate, readiness, target);
	const existing = (
		await provider.listPullRequests({
			headBranch: candidate.branch,
			baseBranch: target.releaseBranch,
		})
	).find(
		(pr) =>
			pr.headBranch === candidate.branch &&
			pr.baseBranch === target.releaseBranch,
	);
	if (existing !== undefined)
		return Object.freeze({
			created: false,
			pr: existing,
			readiness,
			description,
		});
	const pr = await provider.createPullRequest({
		title: `Release ${candidate.targetVersion}`,
		body: description,
		headBranch: candidate.branch,
		baseBranch: target.releaseBranch,
	});
	if (
		pr.headBranch !== candidate.branch ||
		pr.baseBranch !== target.releaseBranch
	)
		throw new ReleasePrContractError(
			'provider-contract',
			'provider returned a release PR with unexpected branches',
			{
				expectedHeadBranch: candidate.branch,
				expectedBaseBranch: target.releaseBranch,
				actualHeadBranch: pr.headBranch,
				actualBaseBranch: pr.baseBranch,
			},
		);
	return Object.freeze({ created: true, pr, readiness, description });
};

/**
 * Promotes a cut release the way the policy integrates: a pull request
 * only under the pull-request strategy; under merge or direct the
 * candidate is merged or pushed onto the release branch by the caller,
 * so no forge call is made; with one branch there is nothing to promote.
 */
export const planReleasePromotion = async (
	input: ICreateReleasePrInput,
): Promise<IReleasePromotionPlan> => {
	const { target, candidate } = input;
	if (target.promotion === 'none')
		return {
			kind: 'none',
			reason: `${target.integrationBranch} is both the integration and the release branch, so there is no release promotion`,
		};
	if (target.promotion === 'pull-request')
		return {
			kind: 'pull-request',
			result: await createReleasePullRequest(input),
		};
	return {
		kind: target.promotion,
		headBranch: candidate.branch,
		baseBranch: target.releaseBranch,
	};
};
