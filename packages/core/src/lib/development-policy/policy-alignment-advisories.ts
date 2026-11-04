/**
 * policy-alignment-advisories.ts — plugin settings that contradict the
 * resolved development policy without making startup impossible.
 *
 * `validatePolicyAlignment` refuses settings that can never work. These
 * are the ones that still start: a protected-branch list that forbids the
 * very branch the profile commits to, an automatic push the profile
 * already performs another way, a cadence that checkpoints on a schedule
 * the profile did not choose. They are reported as warnings because each
 * is a valid setting on its own; the policy is the source of truth, and
 * the warning names the setting to remove.
 */

import type {
	IDevelopmentPolicyViolation,
	IResolvedDevelopmentPolicy,
} from '../contracts/interfaces/development-policy.interface';

type IOptionBag = Readonly<Record<string, unknown>>;

const asBag = (value: unknown): IOptionBag | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as IOptionBag)
		: undefined;

const asStrings = (value: unknown): readonly string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];

const COMMIT_POLICY_PATH = 'plugins.commit-policy.options';
const GIT_PATH = 'plugins.git.options';

const protectedIntegrationRule = (
	policy: IResolvedDevelopmentPolicy,
	path: string,
	names: readonly string[],
): IDevelopmentPolicyViolation | undefined => {
	if (!policy.persistence.allowsDirectIntegrationCommit) return undefined;
	const integration = policy.branches.integration;
	if (!names.includes(integration)) return undefined;
	return {
		rule: 'protected-branches-contradict-policy',
		path,
		message: `\`${policy.profile}\` commits and pushes straight to \`${integration}\`, but this list protects it, so every push the profile expects is refused.`,
		remedy: `Remove \`${integration}\` from \`${path}\`, or leave the setting out: the default protects the release branch and, under a profile that forbids direct commits, the integration branch.`,
	};
};

const pushAutomationRule = (
	policy: IResolvedDevelopmentPolicy,
	push: IOptionBag,
): IDevelopmentPolicyViolation | undefined => {
	if (policy.persistence.allowsDirectIntegrationCommit) return undefined;
	if (push.enabled !== true) return undefined;
	const automatic =
		push.onCommit === true ||
		typeof push.everyNCommits === 'number' ||
		typeof push.everyNMinutes === 'number';
	if (!automatic) return undefined;
	return {
		rule: 'push-automation-contradicts-policy',
		path: `${COMMIT_POLICY_PATH}.push`,
		message: `\`${policy.profile}\` never pushes the integration branch from the shared checkout; its work reaches the remote through the work ref (persistence.autoPushAfterCommit=${policy.persistence.autoPushAfterCommit}). This automatic push (\`onCommit\` / \`everyNCommits\` / \`everyNMinutes\`) targets the checked-out branch instead and is refused each time.`,
		remedy: `Remove \`push.onCommit\`, \`push.everyNCommits\` and \`push.everyNMinutes\`, and set \`development.persistence.autoPushAfterCommit\` if the work ref should be pushed.`,
	};
};

const cadenceRule = (
	policy: IResolvedDevelopmentPolicy,
	cadence: IOptionBag,
): IDevelopmentPolicyViolation | undefined => {
	const triggers = Array.isArray(cadence.triggers) ? cadence.triggers : [];
	const interval = triggers
		.map(asBag)
		.find((trigger) => trigger?.kind === 'interval');
	if (interval === undefined) return undefined;
	if (policy.checkpoint.strategy === 'slice') {
		return {
			rule: 'cadence-contradicts-policy',
			path: `${COMMIT_POLICY_PATH}.cadence.triggers`,
			message: `\`${policy.profile}\` checkpoints only when a slice closes (checkpoint.strategy=slice), but this cadence also commits on a timer, which sweeps in work that is still being edited.`,
			remedy: 'Remove the `interval` trigger, or choose a checkpoint strategy that uses an interval.',
		};
	}
	if (
		typeof interval.minutes === 'number' &&
		policy.checkpoint.intervalMinutes > 0 &&
		interval.minutes !== policy.checkpoint.intervalMinutes
	) {
		return {
			rule: 'cadence-contradicts-policy',
			path: `${COMMIT_POLICY_PATH}.cadence.triggers`,
			message: `The interval trigger runs every ${interval.minutes} minutes, but \`${policy.profile}\` checkpoints every ${policy.checkpoint.intervalMinutes}.`,
			remedy: `Set the trigger to ${policy.checkpoint.intervalMinutes} minutes or change \`development.checkpoint.intervalMinutes\`; one of the two must yield.`,
		};
	}
	return undefined;
};

/** Warnings for plugin settings that disagree with the resolved policy. */
export const policyAlignmentAdvisories = (
	policy: IResolvedDevelopmentPolicy,
	commitPolicyOptions: IOptionBag | undefined,
	gitOptions: IOptionBag | undefined,
): readonly IDevelopmentPolicyViolation[] => {
	const push = asBag(commitPolicyOptions?.push);
	const cadence = asBag(commitPolicyOptions?.cadence);
	const found = [
		push === undefined
			? undefined
			: protectedIntegrationRule(
					policy,
					`${COMMIT_POLICY_PATH}.push.protectedBranches`,
					asStrings(push.protectedBranches),
				),
		protectedIntegrationRule(
			policy,
			`${GIT_PATH}.protectedBranches`,
			asStrings(gitOptions?.protectedBranches),
		),
		push === undefined ? undefined : pushAutomationRule(policy, push),
		cadence === undefined ? undefined : cadenceRule(policy, cadence),
	];
	return found
		.filter((v): v is IDevelopmentPolicyViolation => v !== undefined)
		.map((violation) => ({ ...violation, severity: 'warning' as const }));
};
