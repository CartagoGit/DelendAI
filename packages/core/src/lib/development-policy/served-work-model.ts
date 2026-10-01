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

const originClause = (policy: IResolvedDevelopmentPolicy): string =>
	isAdoptedPolicy(policy)
		? "adopted because this project's configuration declares no `development` block (add one to choose a different model)"
		: "resolved from this project's configuration";

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
