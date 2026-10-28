/**
 * push-target-contradiction.ts — the one setting that makes a start
 * IMPOSSIBLE rather than merely unwise.
 *
 * `plugins.commit-policy.options.push.branch` names the branch an
 * automatic push would target. Under a profile that reaches the
 * integration branch through the forge and never by a direct push,
 * naming it says the opposite of the profile: the push can never
 * succeed, and the start refuses.
 *
 * ## Why the rule lives in its own module
 *
 * Two consumers need it, and two consumers that re-derive it disagree
 * eventually — which is the defect the alignment check exists to
 * catch, reproduced one level up. The validator asks this module
 * whether the start must be refused; the migration asks this module
 * which setting to remove so the start does not have to refuse. The
 * migration never re-derives the condition: it removes exactly what
 * the refusal names.
 *
 * The condition is deliberately narrow. A `push.branch` that names
 * ANY OTHER branch is a legitimate setting — a feature branch, a
 * release branch — and is never touched. Only the branch the profile
 * integrates through the forge, named as a direct push target, is a
 * contradiction.
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

/**
 * The push target the project names, when it names one.
 *
 * `undefined` when the setting is absent, or when it is not a string:
 * a setting nobody can read is not a contradiction this rule can judge,
 * and the validator reports it as something else.
 */
export const pushTargetOf = (
	commitPolicyOptions: IOptionBag | undefined,
): string | undefined => {
	const push = asBag(commitPolicyOptions?.push);
	const branch = push?.branch;
	return typeof branch === 'string' ? branch : undefined;
};

/**
 * The contradiction, when there is one.
 *
 * `undefined` when the profile permits a direct push to the integration
 * branch (the setting then means what it says), when no push target is
 * named, or when the named target is not the integration branch.
 */
export const pushTargetContradiction = (
	policy: IResolvedDevelopmentPolicy,
	commitPolicyOptions: IOptionBag | undefined,
): IDevelopmentPolicyViolation | undefined => {
	// A profile that pushes the integration branch directly needs the
	// setting: that is what it does.
	if (policy.persistence.allowsDirectIntegrationCommit) return undefined;
	const branch = pushTargetOf(commitPolicyOptions);
	if (branch === undefined) return undefined;
	if (branch !== policy.branches.integration) return undefined;
	return {
		rule: 'push-target-contradicts-policy',
		path: 'plugins.commit-policy.options.push.branch',
		message: `\`${policy.profile}\` reaches \`${policy.branches.integration}\` through the forge and never by a direct push, but this config names \`${policy.branches.integration}\` as the push target. The push can never succeed, and the setting says the opposite of the profile.`,
		remedy: 'Remove `push.branch`. The development policy decides where work goes; that setting only exists to override a policy that permits it.',
	};
};
