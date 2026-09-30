/**
 * doctor/checks/branch-protection.check.ts — does the forge projection a
 * project keeps match the branches and checks its development policy
 * declares?
 *
 * The branch names and the required checks come from the resolved
 * policy, never from this repository's habits: a project integrating on
 * `next`, or releasing from the branch it integrates on, is judged
 * against what it declared. Where governance is only observed, delendai
 * does not manage forge settings, so a missing projection file is a fact
 * to report, not a defect to warn about.
 */
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import type { IDoctorSection } from '../types';

/** The slice of the policy this check reads. */
export type IBranchProtectionPolicy = Pick<
	IResolvedDevelopmentPolicy,
	'branches' | 'integration' | 'governance'
>;

/** Where the generated projection of the policy is kept. */
export const BRANCH_PROTECTION_FILE = '.github/branch-protection.ts';

const CHECK_NAME = 'branch-protection';

interface IExpectedBranch {
	readonly name: string;
	readonly role: 'integration' | 'release';
	readonly checks: readonly string[];
}

/** One entry when the release branch is absent or the integration branch. */
export const expectedBranches = (
	policy: IBranchProtectionPolicy,
): readonly IExpectedBranch[] => {
	const { integration, release } = policy.branches;
	const integrationChecks = policy.integration.requiredChecks;
	const branches: IExpectedBranch[] = [
		{ name: integration, role: 'integration', checks: integrationChecks },
	];
	if (release !== '' && release !== integration) {
		branches.push({
			name: release,
			role: 'release',
			checks:
				policy.integration.releaseRequiredChecks.length > 0
					? policy.integration.releaseRequiredChecks
					: integrationChecks,
		});
	}
	return branches;
};

const escapeRegExp = (text: string): string =>
	text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const blockOf = (text: string, branch: string): string | undefined =>
	text.match(
		new RegExp(
			`name:\\s*['"]${escapeRegExp(branch)}['"][\\s\\S]*?(?=name:\\s*['"]|$)`,
			'u',
		),
	)?.[0];

const mismatches = (
	text: string,
	expected: IExpectedBranch,
): readonly string[] => {
	const block = blockOf(text, expected.name);
	if (block === undefined) {
		return [
			`${expected.role} branch \`${expected.name}\` has no entry in ${BRANCH_PROTECTION_FILE}`,
		];
	}
	if (expected.checks.length === 0) return [];
	const findings: string[] = [];
	if (!/protected:\s*true/u.test(block)) {
		findings.push(
			`\`${expected.name}\` requires checks in the policy but is not protected in ${BRANCH_PROTECTION_FILE}`,
		);
	}
	for (const check of expected.checks) {
		if (!new RegExp(`['"]${escapeRegExp(check)}['"]`, 'u').test(block)) {
			findings.push(
				`\`${expected.name}\` must require \`${check}\` (the policy names it) but ${BRANCH_PROTECTION_FILE} does not`,
			);
		}
	}
	return findings;
};

const describeExpected = (expected: IExpectedBranch): string =>
	`${expected.role} \`${expected.name}\`: ${
		expected.checks.length === 0
			? 'no required checks'
			: `requires ${expected.checks.join(', ')}`
	}`;

export const assessBranchProtection = (input: {
	readonly policy: IBranchProtectionPolicy | undefined;
	readonly projection: string | undefined;
}): IDoctorSection => {
	const { policy, projection } = input;
	if (policy === undefined) {
		return {
			name: CHECK_NAME,
			status: 'ok',
			findings: [
				'no development policy is declared, so there is no branch policy to verify',
			],
		};
	}
	const expected = expectedBranches(policy);
	const declared = expected.map(describeExpected);
	if (!policy.governance.enforced) {
		const found =
			projection === undefined
				? []
				: expected.flatMap((each) => mismatches(projection, each));
		return {
			name: CHECK_NAME,
			status: found.length === 0 ? 'ok' : 'warn',
			findings: [
				`governance is ${policy.governance.strategy}: delendai does not manage the forge's branch settings here`,
				...declared,
				...found,
			],
		};
	}
	if (projection === undefined) {
		return {
			name: CHECK_NAME,
			status: 'warn',
			findings: [
				`${BRANCH_PROTECTION_FILE} not found; governance is enforced, so the projection of the policy should exist`,
				...declared,
			],
		};
	}
	const found = expected.flatMap((each) => mismatches(projection, each));
	return found.length === 0
		? {
				name: CHECK_NAME,
				status: 'ok',
				findings: [
					`${BRANCH_PROTECTION_FILE} matches the policy`,
					...declared,
				],
			}
		: { name: CHECK_NAME, status: 'warn', findings: found };
};
