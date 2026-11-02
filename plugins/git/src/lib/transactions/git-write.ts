import type { IToolTextResult, IStep } from '@delendai/core/public';

import {
	runGitCommit,
	runGitPush,
	type IGitCommitArgs,
	type IGitPushArgs,
	type IGitWriteToolOptions,
} from '../tools/write-tools';

interface ICapabilityGrantLike {
	readonly pluginId?: string;
	readonly toolId?: string;
	readonly permissions: readonly string[];
	readonly approvalRequired: boolean;
	readonly source?: string;
}

type TGitCommitHandler = typeof runGitCommit;
type TGitPushHandler = typeof runGitPush;

const toolFailureReason = (result: IToolTextResult): string => {
	if (result.isError !== true) return 'tool failed';
	const body = result.structuredContent as {
		error?: { readonly reason?: string };
	};
	return body.error?.reason ?? 'tool failed';
};

export interface IBuildGitCommitStepInput {
	readonly args: IGitCommitArgs;
	readonly toolOptions: Pick<IGitWriteToolOptions, 'run' | 'commitAuthor'>;
	readonly capabilityGrant: ICapabilityGrantLike;
	readonly handler?: TGitCommitHandler;
}

export interface IBuildGitPushStepInput {
	readonly args: IGitPushArgs;
	readonly toolOptions: Pick<
		IGitWriteToolOptions,
		'run' | 'protectedBranches'
	>;
	readonly capabilityGrant: ICapabilityGrantLike;
	readonly handler?: TGitPushHandler;
}

export const buildGitCommitStep = (
	input: IBuildGitCommitStepInput,
): IStep<IToolTextResult> => ({
	name: 'git.commit',
	fingerprint: JSON.stringify({ args: input.args }),
	effects: ['write'],
	compensable: false,
	run: async () => {
		const result = await (input.handler ?? runGitCommit)(
			input.toolOptions.run,
			input.args,
			input.toolOptions.commitAuthor,
		);
		if (result.isError === true) {
			throw new Error(toolFailureReason(result));
		}
		return result;
	},
});

export const buildGitPushStep = (
	input: IBuildGitPushStepInput,
): IStep<IToolTextResult> => ({
	name: 'git.push',
	fingerprint: JSON.stringify({ args: input.args }),
	effects: ['write'],
	compensable: false,
	run: async () => {
		const result = await (input.handler ?? runGitPush)(
			input.toolOptions.run,
			input.args,
			input.toolOptions.protectedBranches,
		);
		if (result.isError === true) {
			throw new Error(toolFailureReason(result));
		}
		return result;
	},
});
