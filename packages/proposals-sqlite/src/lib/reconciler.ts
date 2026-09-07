import {
	reconcileProposalMarkdown,
	type IMarkdownReconcileInput,
	type IReconcileResult,
} from './reconciler-markdown';
import {
	reconcileShadowToStaging,
	type IShadowReconcileInput,
	type IShadowReconcileResult,
} from './reconciler-staging';

export {
	reconcileProposalMarkdown,
	type IMarkdownReconcileInput,
	type IProposalCandidate,
	type IQuarantineCandidate,
	type IReconcileResult,
	type IReconcilerInputFile,
} from './reconciler-markdown';

export type IReconcileInput = IMarkdownReconcileInput | IShadowReconcileInput;

export type TReconcileOutput = IReconcileResult | IShadowReconcileResult;

const isShadowStagingInput = (
	input: IReconcileInput,
): input is IShadowReconcileInput =>
	input.mode === 'shadow' &&
	'workspacePath' in input &&
	'statePath' in input &&
	'sha' in input;

export const reconcile = (input: IReconcileInput): TReconcileOutput =>
	isShadowStagingInput(input)
		? reconcileShadowToStaging(input)
		: reconcileProposalMarkdown(input);
