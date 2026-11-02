import { isReleaseBranch } from '../contracts/release-branch';

export const assertReleaseApproval = (input: {
	readonly sourceBranch: string;
	readonly targetBranch: string;
	readonly approved: boolean;
}): void => {
	if (!input.approved) throw new Error('release approval is required');
	if (!isReleaseBranch(input.sourceBranch) || input.targetBranch !== 'main')
		throw new Error('only an approved release branch may promote to main');
};

export const assertHotfixSource = (sourceBranch: string): void => {
	if (sourceBranch !== 'main') throw new Error('hotfix source must be main');
};
