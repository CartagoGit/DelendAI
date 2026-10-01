/**
 * served-work-model.ts — the work model as the connect-time instructions
 * state it: whose decision it is, which branches it names, and what it
 * cannot apply.
 *
 * The steps are `declareWorkflow`'s and are not restated here. What this
 * adds is the frame around them, because an agent that is told a model
 * must also be told whether the project chose it or delendai adopted it
 * for a project that declared none, and must not be told about a
 * release branch a one-branch project does not have.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import { declareWorkflow } from './declare-workflow';
import { describeBranches, singleBranchWarnings } from './release-branch';

/** `default` and `legacy-compat` are what delendai resolves when nothing was declared. */
export const isAdoptedPolicy = (policy: IResolvedDevelopmentPolicy): boolean =>
	policy.source === 'default' || policy.source === 'legacy-compat';

/**
 * Who chose the model, in a clause every surface (instructions, overview,
 * `work status`, the startup report) shares. `undefined` when the project
 * chose it itself: an unremarkable answer needs no note.
 */
export const policyOriginNote = (
	policy: IResolvedDevelopmentPolicy,
): string | undefined => {
	if (policy.adoption !== undefined) {
		return `adopted and written: this project declared no \`development\` block, so delendai chose this model and wrote it into ${policy.adoption.writtenTo}; edit that block to choose a different one`;
	}
	return isAdoptedPolicy(policy)
		? 'adopted: this project declares no `development` block; add one to choose a different model'
		: undefined;
};

/**
 * The same fact in a few words, for the surfaces that pay per byte (the
 * overview): who chose the model when delendai did, else `undefined`.
 */
export const policyOriginTag = (
	policy: IResolvedDevelopmentPolicy,
): string | undefined => {
	if (policy.adoption !== undefined) {
		return `adopted and written to ${policy.adoption.writtenTo}`;
	}
	return isAdoptedPolicy(policy) ? 'adopted' : undefined;
};

const originClause = (policy: IResolvedDevelopmentPolicy): string => {
	const note = policyOriginNote(policy);
	return note === undefined
		? "resolved from this project's configuration"
		: note;
};

/** The lines a host puts in its model's instructions when it connects. */
export const servedWorkModelLines = (
	policy: IResolvedDevelopmentPolicy,
): readonly string[] => {
	const declaration = declareWorkflow(policy);
	return [
		`Work model: \`${declaration.profile}\` (${describeBranches(policy.branches)}), ${originClause(policy)}. It overrides any document that describes another workflow:`,
		...declaration.steps.map(
			(step) => `${step.order}. ${step.instruction}`,
		),
		...singleBranchWarnings(policy).map((warning) => `Warning: ${warning}`),
	];
};
