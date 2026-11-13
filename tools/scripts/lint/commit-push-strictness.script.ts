#!/usr/bin/env bun
/**
 * commit-push-strictness.script.ts — x00272 S2, reworked by x00769
 *
 * Structural ratchet over the commit-policy push driver, holding two
 * refusals in place against a silent revert.
 *
 * The RELEASE branch is refused by a guard that must stay AHEAD of the
 * user-configurable `protectedBranches` override, so no config can open
 * the release path (x00272). Which branch that is comes from the resolved
 * development policy (`branches.release`, when it is a branch of its own):
 * never a literal name, because a project may call it anything and a
 * single-branch project has no release path to guard.
 *
 * The INTEGRATION branch is refused from the resolved development
 * policy — by `branches.integration`, gated on
 * `persistence.allowsDirectIntegrationCommit` — never by the name
 * 'develop'. Both halves matter. Without the refusal, a pull-request
 * policy is advisory: on 2026-09-09 a background agent pushed straight
 * to `develop` through this driver, because the repository's only
 * develop guard was a pre-push hook that a push driven through the
 * plugin never reaches. Without the gate, every `shared-direct` adopter
 * — a model that is still supported — would break. Its remedy is the
 * resolved profile's own (`briefWorkModel`), never a fixed instruction to
 * open a pull request.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const PUSH_DRIVER_REL = 'plugins/commit-policy/src/lib/services/push-driver.ts';

const DIRECT_PUSH_TO_RELEASE_CODE = 'DIRECT_PUSH_TO_RELEASE_NOT_ALLOWED';
const DIRECT_PUSH_TO_DEVELOP_CODE = 'DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED';
const DIRECT_PUSH_TO_INTEGRATION_CODE =
	'DIRECT_PUSH_TO_INTEGRATION_NOT_ALLOWED';
const ALLOWS_DIRECT_PATTERN = /persistence\.allowsDirectIntegrationCommit/u;
const PROTECTED_BRANCHES_ANCHORS: readonly RegExp[] = [
	/policy\.protectedBranches\.includes\(branch\)/,
	/isBranchProtected\(\s*branch\s*,\s*\{[^}]*protected:\s*effectiveProtectedBranches/,
];
const RELEASE_GUARD_PATTERN =
	/distinctReleaseBranch\([\s\S]*?DIRECT_PUSH_TO_RELEASE_NOT_ALLOWED[\s\S]*?cuts the release\/publish path\./;
const HARD_CODED_BRANCH_PATTERN =
	/branch\s*===\s*['"](?:main|master|develop)['"]/;
const REMEDY_FROM_POLICY_PATTERN = /briefWorkModel\(/;
const FIXED_PULL_REQUEST_REMEDY_PATTERN = /open a pull request instead/i;

export const findStrictnessViolations = (
	pushDriverSource: string,
): readonly string[] => {
	const violations: string[] = [];

	if (!RELEASE_GUARD_PATTERN.test(pushDriverSource)) {
		violations.push(
			'missing the policy-derived release-branch guard (distinctReleaseBranch + reason code + message)',
		);
	}

	if (HARD_CODED_BRANCH_PATTERN.test(pushDriverSource)) {
		violations.push(
			'a push refusal compares against a literal branch name; derive the protected branch from the resolved development policy',
		);
	}

	if (!REMEDY_FROM_POLICY_PATTERN.test(pushDriverSource)) {
		violations.push(
			'the integration refusal must take its remedy from briefWorkModel(policy), so it describes the configured profile',
		);
	}

	if (FIXED_PULL_REQUEST_REMEDY_PATTERN.test(pushDriverSource)) {
		violations.push(
			"a refusal tells the agent to open a pull request as a fixed instruction; that is one profile's flow, not every profile's",
		);
	}

	const mainGuardIdx = pushDriverSource.indexOf(DIRECT_PUSH_TO_RELEASE_CODE);
	const protectedBranchesIdx = PROTECTED_BRANCHES_ANCHORS.reduce(
		(prevIdx, anchor) => {
			const match = pushDriverSource.search(anchor);
			return match === -1 ? prevIdx : Math.min(prevIdx, match);
		},
		Number.POSITIVE_INFINITY,
	);
	if (
		mainGuardIdx < 0 ||
		!Number.isFinite(protectedBranchesIdx) ||
		mainGuardIdx > protectedBranchesIdx
	) {
		violations.push(
			'direct-push-to-release refusal must happen before the protectedBranches override check',
		);
	}

	// x00272 banned a hard-coded `develop` refusal, and that ban still
	// stands: `develop` is not universally protected — a project on the
	// `shared-direct` policy pushes to it by design, and hard-coding the
	// name would break every such adopter.
	if (pushDriverSource.includes(DIRECT_PUSH_TO_DEVELOP_CODE)) {
		violations.push(
			'hard-coded develop-only refusal; the integration branch must be refused from the resolved development policy, not by name (x00272)',
		);
	}

	// ...but the POLICY-DERIVED refusal is now required. On 2026-09-09 a
	// background agent pushed straight to `develop` through this driver:
	// the repository's only develop guard was a pre-push hook, which a
	// push driven through the plugin never reaches. Nothing in the
	// running path refused it. This rule keeps that layer in place.
	if (!pushDriverSource.includes(DIRECT_PUSH_TO_INTEGRATION_CODE)) {
		violations.push(
			'missing the policy-derived integration-branch refusal; a pull-request policy must refuse a direct push to branches.integration in the running path, not only in a git hook',
		);
	}

	const integrationIdx = pushDriverSource.indexOf(
		DIRECT_PUSH_TO_INTEGRATION_CODE,
	);
	if (
		integrationIdx >= 0 &&
		Number.isFinite(protectedBranchesIdx) &&
		integrationIdx > protectedBranchesIdx
	) {
		violations.push(
			'integration-branch refusal must happen before the protectedBranches override check',
		);
	}

	if (!ALLOWS_DIRECT_PATTERN.test(pushDriverSource)) {
		violations.push(
			'the integration refusal must be gated on persistence.allowsDirectIntegrationCommit, so a shared-direct project keeps pushing as before',
		);
	}

	return violations;
};

export const run = (root: string): number => {
	const pushDriverSource = readFileSync(join(root, PUSH_DRIVER_REL), 'utf8');
	const violations = findStrictnessViolations(pushDriverSource);

	if (violations.length === 0) {
		console.log(
			'✓ commit-push-strictness: push-driver refuses direct pushes to the release and integration branches of the policy.',
		);
		return 0;
	}

	console.error(
		`✗ commit-push-strictness: ${violations.length} violation(s) in ${PUSH_DRIVER_REL}:`,
	);
	for (const violation of violations) {
		console.error(`  - ${violation}`);
	}
	console.error('');
	console.error(
		'fix: keep the policy-derived release refusal and the policy-derived integration-branch refusal ahead of `protectedBranches`, each with its canonical reason code and an actionable message.',
	);
	return 1;
};

if (import.meta.main) {
	process.exit(run(repoRoot()));
}
