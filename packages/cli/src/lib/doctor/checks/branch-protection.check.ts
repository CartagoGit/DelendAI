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
import { readWorkspacePolicy } from '@delendai/core/cli';

import type { DoctorCheck, IDoctorSection } from '../types';
import { BRANCH_PROTECTION_FILE } from './branch-protection.constant';
import type { IBranchProtectionPolicy } from './branch-protection.interface';

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
	// The projection file is a generated artefact some projects keep; a
	// project that keeps none is not defective, so its absence is a fact
	// and only a projection that disagrees with the policy is a warning.
	const found =
		projection === undefined
			? []
			: expected.flatMap((each) => mismatches(projection, each));
	const stance = policy.governance.enforced
		? `governance is ${policy.governance.strategy}`
		: `governance is ${policy.governance.strategy}: delendai does not manage the forge's branch settings here`;
	return {
		name: CHECK_NAME,
		status: found.length === 0 ? 'ok' : 'warn',
		findings:
			found.length === 0
				? [
						stance,
						...declared,
						projection === undefined
							? `no ${BRANCH_PROTECTION_FILE}: nothing local to compare with`
							: `${BRANCH_PROTECTION_FILE} matches the policy`,
					]
				: found,
	};
};

type IPolicyReader = (
	workspace: string,
) => Promise<IBranchProtectionPolicy | undefined>;

/** The check, with the way the policy is read left to the caller. */
export const createBranchProtectionCheck =
	(readPolicy: IPolicyReader): DoctorCheck =>
	async ({ fs, workspace }) => {
		let policy: IBranchProtectionPolicy | undefined;
		try {
			policy = await readPolicy(workspace);
		} catch (error) {
			return {
				name: CHECK_NAME,
				status: 'warn',
				findings: [
					`the development policy could not be read: ${error instanceof Error ? error.message : String(error)}`,
				],
			};
		}
		return assessBranchProtection({
			policy,
			projection: await fs.readFile(BRANCH_PROTECTION_FILE),
		});
	};

export const checkBranchProtection: DoctorCheck =
	createBranchProtectionCheck(readWorkspacePolicy);
