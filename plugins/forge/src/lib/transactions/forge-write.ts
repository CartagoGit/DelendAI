import type { IToolTextResult, IStep } from '@mcp-vertex/core/public';

import {
	runForgeIssueCreate,
	runForgePrComment,
	runForgePrCreate,
	type IForgeWriteToolOptions,
} from '../tools/forge-write.tool';
import type {
	ICommentPrOptions,
	ICreateIssueOptions,
	ICreatePrOptions,
} from '../contracts/interfaces/forge-write.interface';

interface ICapabilityGrantLike {
	readonly pluginId?: string;
	readonly toolId?: string;
	readonly permissions: readonly string[];
	readonly approvalRequired: boolean;
	readonly source?: string;
}

type TForgePrCreateHandler = typeof runForgePrCreate;
type TForgePrCommentHandler = typeof runForgePrComment;
type TForgeIssueCreateHandler = typeof runForgeIssueCreate;

const forgeFailureReason = (result: IToolTextResult): string => {
	if (result.isError !== true) return 'forge write failed';
	const body = result.structuredContent as {
		error?: { readonly reason?: string };
	};
	return body.error?.reason ?? 'forge write failed';
};

export interface IBuildForgePrCreateStepInput {
	readonly args: ICreatePrOptions;
	readonly toolOptions: IForgeWriteToolOptions;
	readonly capabilityGrant: ICapabilityGrantLike;
	readonly handler?: TForgePrCreateHandler;
}

export interface IBuildForgePrCommentStepInput {
	readonly args: ICommentPrOptions;
	readonly toolOptions: IForgeWriteToolOptions;
	readonly capabilityGrant: ICapabilityGrantLike;
	readonly handler?: TForgePrCommentHandler;
}

export interface IBuildForgeIssueCreateStepInput {
	readonly args: ICreateIssueOptions;
	readonly toolOptions: IForgeWriteToolOptions;
	readonly capabilityGrant: ICapabilityGrantLike;
	readonly handler?: TForgeIssueCreateHandler;
}

export const buildForgePrCreateStep = (
	input: IBuildForgePrCreateStepInput,
): IStep<IToolTextResult> => ({
	name: 'forge.pr_create',
	fingerprint: JSON.stringify({ args: input.args }),
	effects: ['write', 'network'],
	compensable: false,
	run: async () => {
		const result = await (input.handler ?? runForgePrCreate)(
			input.args,
			input.toolOptions,
		);
		if (result.isError === true)
			throw new Error(forgeFailureReason(result));
		return result;
	},
});

export const buildForgePrCommentStep = (
	input: IBuildForgePrCommentStepInput,
): IStep<IToolTextResult> => ({
	name: 'forge.pr_comment',
	fingerprint: JSON.stringify({ args: input.args }),
	effects: ['write', 'network'],
	compensable: false,
	run: async () => {
		const result = await (input.handler ?? runForgePrComment)(
			input.args,
			input.toolOptions,
		);
		if (result.isError === true)
			throw new Error(forgeFailureReason(result));
		return result;
	},
});

export const buildForgeIssueCreateStep = (
	input: IBuildForgeIssueCreateStepInput,
): IStep<IToolTextResult> => ({
	name: 'forge.issue_create',
	fingerprint: JSON.stringify({ args: input.args }),
	effects: ['write', 'network'],
	compensable: false,
	run: async () => {
		const result = await (input.handler ?? runForgeIssueCreate)(
			input.args,
			input.toolOptions,
		);
		if (result.isError === true)
			throw new Error(forgeFailureReason(result));
		return result;
	},
});
