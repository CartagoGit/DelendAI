import {
	assertReleaseMetadata,
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

/**
 * Per-PR options. Hosts can override the default target branch
 * (`releaseTargetBranch`, default `main`) and explicitly opt out of
 * the integration branch via `rejectIntegrationBase: false` only when
 * they have a real reason to open a PR against `integrationBranch`.
 */
export interface IReleasePrOptions {
	readonly releaseTargetBranch: string;
	readonly integrationBranch: string;
	readonly rejectIntegrationBase?: boolean;
}

export const DEFAULT_RELEASE_PR_OPTIONS: IReleasePrOptions = Object.freeze({
	releaseTargetBranch: 'main',
	integrationBranch: 'develop',
	rejectIntegrationBase: true,
});

export const resolveReleasePrOptions = (
	override?: Partial<IReleasePrOptions>,
): IReleasePrOptions =>
	Object.freeze({
		releaseTargetBranch:
			override?.releaseTargetBranch ??
			DEFAULT_RELEASE_PR_OPTIONS.releaseTargetBranch,
		integrationBranch:
			override?.integrationBranch ??
			DEFAULT_RELEASE_PR_OPTIONS.integrationBranch,
		...(override?.rejectIntegrationBase !== undefined
			? { rejectIntegrationBase: override.rejectIntegrationBase }
			: {}),
	});

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
	readonly currentBranch: string;
	readonly upstream?: string | undefined;
	readonly provider: IReleasePrProvider;
	readonly options?: Partial<IReleasePrOptions>;
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
		| 'invalid-metadata'
		| 'missing-upstream'
		| 'readiness-blocked'
		| 'provider-contract'
		| 'integration-base-forbidden';
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
const ANTECEDENT_PR_NUMBER = 50;

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
		`Antecedent: PR #${ANTECEDENT_PR_NUMBER} used develop as its source; this release flow keeps the candidate branch explicit.`,
	].join('\n');
};

export const createReleasePullRequest = async ({
	candidate,
	gates,
	currentBranch,
	upstream,
	provider,
	options,
}: ICreateReleasePrInput): Promise<IReleasePrResult> => {
	const resolved = resolveReleasePrOptions(options);
	try {
		assertReleaseMetadata(candidate);
	} catch (error) {
		throw new ReleasePrContractError(
			'invalid-metadata',
			error instanceof Error ? error.message : 'invalid release metadata',
		);
	}
	// Forbidden-shape check fires BEFORE the branch-match check so a
	// caller that pointed the contract at the integration branch gets
	// the most specific error instead of `wrong-branch`.
	if (
		resolved.rejectIntegrationBase !== false &&
		resolved.integrationBranch === candidate.branch
	)
		throw new ReleasePrContractError(
			'integration-base-forbidden',
			`release PR source must not be the integration branch: ${resolved.integrationBranch}`,
		);
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
		candidate.branch === resolved.releaseTargetBranch
	)
		throw new ReleasePrContractError(
			'wrong-base',
			`release PR source must not be the release target: ${resolved.releaseTargetBranch}`,
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
	const description = buildReleasePrDescription(candidate, readiness);
	const existing = (
		await provider.listPullRequests({
			headBranch: candidate.branch,
			baseBranch: resolved.releaseTargetBranch,
		})
	).find(
		(pr) =>
			pr.headBranch === candidate.branch &&
			pr.baseBranch === resolved.releaseTargetBranch,
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
		baseBranch: resolved.releaseTargetBranch,
	});
	if (
		pr.headBranch !== candidate.branch ||
		pr.baseBranch !== resolved.releaseTargetBranch
	)
		throw new ReleasePrContractError(
			'provider-contract',
			'provider returned a release PR with unexpected branches',
			{
				expectedHeadBranch: candidate.branch,
				expectedBaseBranch: resolved.releaseTargetBranch,
				actualHeadBranch: pr.headBranch,
				actualBaseBranch: pr.baseBranch,
			},
		);
	return Object.freeze({ created: true, pr, readiness, description });
};
