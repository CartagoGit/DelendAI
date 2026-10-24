const isReleaseBranch = (branch: string): boolean =>
	/^release\/(patch|minor|major)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(branch);

export interface IReleasePromotionGitInput {
	readonly currentBranch: string;
	readonly baseBranch: string;
	readonly upstream?: string | undefined;
}

export interface IReleasePromotionGitContext {
	readonly branch: string;
	readonly base: 'main';
	readonly upstream: string;
}

export type ReleasePromotionGitErrorCode =
	| 'wrong-branch'
	| 'wrong-base'
	| 'missing-upstream';

export class ReleasePromotionGitError extends Error {
	readonly code: ReleasePromotionGitErrorCode;

	constructor(code: ReleasePromotionGitErrorCode, message: string) {
		super(message);
		this.name = 'ReleasePromotionGitError';
		this.code = code;
	}
}

export const validateReleasePromotionGit = (
	input: IReleasePromotionGitInput,
): IReleasePromotionGitContext => {
	if (!isReleaseBranch(input.currentBranch))
		throw new ReleasePromotionGitError(
			'wrong-branch',
			`release PR source must be release/{patch|minor|major}/{slug}: ${input.currentBranch}`,
		);
	if (input.baseBranch !== 'main')
		throw new ReleasePromotionGitError(
			'wrong-base',
			`release PR target must be main: ${input.baseBranch}`,
		);
	const upstream = input.upstream?.trim() ?? '';
	if (upstream === '')
		throw new ReleasePromotionGitError(
			'missing-upstream',
			`release branch ${input.currentBranch} must have an upstream`,
		);
	return Object.freeze({
		branch: input.currentBranch,
		base: 'main',
		upstream,
	});
};
