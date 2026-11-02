import type { IDerivedConfig } from '../bootstrap/derive-config';
export type { IAdoptionExtension } from '../contracts/interfaces/adoption-extension.interface';
import type {
	IAdoptionExtension,
	IAdoptionFileContribution,
} from '../contracts/interfaces/adoption-extension.interface';
import type { IBuildAdoptProjectPlanInput } from '../contracts/interfaces/adopt-project.interface';
import type { IScaffoldedFile } from '../scaffold/scaffold-host';

export interface IAdoptionPlanState {
	readonly config: Record<string, unknown>;
	readonly rationale: readonly string[];
	readonly files: readonly IScaffoldedFile[];
	readonly residual: readonly string[];
}

export interface IApplyAdoptionExtensionInput {
	readonly derived: IDerivedConfig;
	readonly plan: IAdoptionPlanState;
	readonly request: IBuildAdoptProjectPlanInput;
}

export interface IAdoptionPlanExtension extends IAdoptionExtension {
	readonly applyAdoptionPlan?: (
		input: IApplyAdoptionExtensionInput,
	) => IAdoptionPlanState;
}

const adoptionExtensions = new Map<string, readonly IAdoptionExtension[]>();

const renderAdoptionStep = (
	step: IAdoptionExtension['steps'][number],
): string => {
	const suffix = [
		step.command !== undefined ? `Command: ${step.command}.` : undefined,
		step.files !== undefined && step.files.length > 0
			? `Files: ${step.files.join(', ')}.`
			: undefined,
	]
		.filter((value): value is string => value !== undefined)
		.join(' ');
	return suffix.length > 0
		? `${step.title}: ${step.detail} ${suffix}`
		: `${step.title}: ${step.detail}`;
};

const applyOneExtension = (
	plan: IAdoptionPlanState,
	extension: IAdoptionExtension,
	input: Omit<IApplyAdoptionExtensionInput, 'plan'>,
): IAdoptionPlanState => {
	const typedExtension = extension as IAdoptionPlanExtension;
	if (typeof typedExtension.applyAdoptionPlan === 'function') {
		return typedExtension.applyAdoptionPlan({ ...input, plan });
	}
	if (extension.steps.length === 0) return plan;
	return {
		...plan,
		residual: [
			...plan.residual,
			...(extension.detail !== undefined
				? [`${extension.title}: ${extension.detail}`]
				: []),
			...extension.steps.map(renderAdoptionStep),
		],
	};
};

/** Registers a source-owned adoption extension set; repeated calls replace it. */
export const registerAdoptionExtensions = (
	source: string,
	extensions: readonly IAdoptionExtension[],
): void => {
	adoptionExtensions.set(source, extensions);
};

export const applyAdoptionExtensions = (
	input: IApplyAdoptionExtensionInput,
): IAdoptionPlanState => {
	let plan = input.plan;
	for (const extensions of adoptionExtensions.values()) {
		for (const extension of extensions) {
			plan = applyOneExtension(plan, extension, {
				derived: input.derived,
				request: input.request,
			});
		}
	}
	return plan;
};

/** Whether any loaded plugin contributes to adoption. */
export const hasAdoptionExtensions = (): boolean =>
	[...adoptionExtensions.values()].some((set) => set.length > 0);

/**
 * The files each loaded extension adds to `input.plan`, applied in the
 * order `applyAdoptionExtensions` applies them. Extensions that add no
 * file are left out.
 */
export const countAdoptionFileContributions = (
	input: IApplyAdoptionExtensionInput,
): readonly IAdoptionFileContribution[] => {
	const contributions: IAdoptionFileContribution[] = [];
	let plan = input.plan;
	for (const extensions of adoptionExtensions.values()) {
		for (const extension of extensions) {
			const next = applyOneExtension(plan, extension, {
				derived: input.derived,
				request: input.request,
			});
			const added = next.files.length - plan.files.length;
			if (added > 0) {
				contributions.push({ title: extension.title, count: added });
			}
			plan = next;
		}
	}
	return contributions;
};

export const resetAdoptionExtensionsForTests = (): void => {
	adoptionExtensions.clear();
};
