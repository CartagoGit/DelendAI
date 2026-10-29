import type {
	IPluginConfigurationIssue,
	IPluginConfigurationValidationInput,
} from '@delendai/core/public';
import type { IAutoWorkPersistMode } from '../tools/auto-work-persist';

const hasSliceTrigger = (
	options: Readonly<Record<string, unknown>>,
): boolean => {
	const cadence = options.cadence;
	if (typeof cadence !== 'object' || cadence === null) return false;
	const triggers = (cadence as { readonly triggers?: unknown }).triggers;
	return (
		Array.isArray(triggers) &&
		triggers.some(
			(trigger) =>
				typeof trigger === 'object' &&
				trigger !== null &&
				(trigger as { readonly kind?: unknown }).kind === 'slice',
		)
	);
};

export const commitPolicyOwnsSlicePersistence = (
	options: Readonly<Record<string, unknown>> | undefined,
): boolean => {
	if (options === undefined) return false;
	const commit = options.commit;
	const commitEnabled =
		typeof commit === 'object' &&
		commit !== null &&
		(commit as { readonly enabled?: unknown }).enabled === true;
	return commitEnabled && hasSliceTrigger(options);
};

export const resolveProposalPersistMode = (
	configuredMode: IAutoWorkPersistMode | undefined,
	commitPolicyOptions: Readonly<Record<string, unknown>> | undefined,
): IAutoWorkPersistMode =>
	commitPolicyOwnsSlicePersistence(commitPolicyOptions)
		? 'none'
		: (configuredMode ?? 'none');

/**
 * `commit-policy` owns slice persistence when it is enabled with a slice
 * trigger. Proposals keeps its configured mode as the fallback for hosts that
 * do not load that plugin or do not enable its slice cadence.
 */
export const validateProposalConfiguration = (
	input: IPluginConfigurationValidationInput,
): readonly IPluginConfigurationIssue[] => {
	void input;
	return [];
};
