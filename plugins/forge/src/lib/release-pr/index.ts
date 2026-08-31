import {
	evaluateReleaseReadiness,
	type IReleaseCandidateMetadata,
	type IReleaseGate,
	type IReleaseReadiness,
} from '@mcp-vertex/core/public';

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
		readonly baseBranch: 'main';
	}): Promise<IReleasePrRecord>;
}

export interface ICreateReleasePrInput {
	readonly candidate: IReleaseCandidateMetadata;
	readonly gates: readonly IReleaseGate[];
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
	readonly code: 'wrong-branch' | 'wrong-base' | 'readiness-blocked';

	constructor(code: ReleasePrContractError['code'], message: string) {
		super(message);
		this.name = 'ReleasePrContractError';
		this.code = code;
	}
}

const RELEASE_BRANCH =
	/^release\/(patch|minor|major)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const buildReleasePrDescription = (
	candidate: IReleaseCandidateMetadata,
	readiness: IReleaseReadiness,
): string => {
	const gates = readiness.gates
		.map(
			(gate) =>
				`${gate.name}=${gate.status}${gate.required === false ? ' (optional)' : ''}`,
		)
		.join(', ');
	return [
		`Release branch: ${candidate.branch}`,
		`Source develop SHA: ${candidate.sourceDevelopSha}`,
		`Base main SHA: ${candidate.baseMainSha}`,
		`Version: ${candidate.fromVersion} -> ${candidate.targetVersion}`,
		`Release type: ${candidate.type}`,
		`Gates: ${gates || 'none'}`,
		'Antecedent: PR #50 used develop as its source; this release flow keeps the candidate branch explicit.',
	].join('\n');
};

export const createReleasePullRequest = async ({
	candidate,
	gates,
	currentBranch,
	upstream,
	provider,
}: ICreateReleasePrInput): Promise<IReleasePrResult> => {
	if (
		!RELEASE_BRANCH.test(currentBranch) ||
		currentBranch !== candidate.branch
	)
		throw new ReleasePrContractError(
			'wrong-branch',
			`release PR branch must match candidate: ${candidate.branch}`,
		);
	if (candidate.baseMainSha.trim() === '' || candidate.branch === 'main')
		throw new ReleasePrContractError(
			'wrong-base',
			'release PR target must be main',
		);
	if (upstream?.trim() === undefined || upstream.trim() === '')
		throw new ReleasePrContractError(
			'wrong-branch',
			'release PR branch must have an upstream',
		);
	const readiness = evaluateReleaseReadiness(gates);
	if (!readiness.ready)
		throw new ReleasePrContractError(
			'readiness-blocked',
			`release readiness blocked: ${readiness.blockingGates.join(', ')}`,
		);
	const description = buildReleasePrDescription(candidate, readiness);
	const existing = (
		await provider.listPullRequests({
			headBranch: candidate.branch,
			baseBranch: 'main',
		})
	).find(
		(pr) => pr.headBranch === candidate.branch && pr.baseBranch === 'main',
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
		baseBranch: 'main',
	});
	return Object.freeze({ created: true, pr, readiness, description });
};
