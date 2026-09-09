#!/usr/bin/env bun
/**
 * commit-push-strictness.script.ts — x00272 S2
 *
 * Structural ratchet over the commit-policy push driver, holding two
 * refusals in place against a silent revert.
 *
 * `main` is refused by a hard-coded branch check that must stay AHEAD of
 * the user-configurable `protectedBranches` override, so no config can
 * open the release path (x00272).
 *
 * The INTEGRATION branch is refused from the resolved development
 * policy — by `branches.integration`, gated on
 * `persistence.allowsDirectIntegrationCommit` — never by the name
 * 'develop'. Both halves matter. Without the refusal, a pull-request
 * policy is advisory: on 2026-09-09 a background agent pushed straight
 * to `develop` through this driver, because the repository's only
 * develop guard was a pre-push hook that a push driven through the
 * plugin never reaches. Without the gate, every `shared-direct` adopter
 * — a model that is still supported — would break.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const PUSH_DRIVER_REL = 'plugins/commit-policy/src/lib/services/push-driver.ts';

const DIRECT_PUSH_TO_MAIN_CODE = 'DIRECT_PUSH_TO_MAIN_NOT_ALLOWED';
const DIRECT_PUSH_TO_DEVELOP_CODE = 'DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED';
const DIRECT_PUSH_TO_INTEGRATION_CODE =
	'DIRECT_PUSH_TO_INTEGRATION_NOT_ALLOWED';
const ALLOWS_DIRECT_PATTERN = /persistence\.allowsDirectIntegrationCommit/u;
const PROTECTED_BRANCHES_ANCHORS: readonly RegExp[] = [
	/policy\.protectedBranches\.includes\(branch\)/,
	/isBranchProtected\(\s*branch\s*,\s*\{[^}]*protected:\s*effectiveProtectedBranches/,
];
const MAIN_GUARD_PATTERN =
	/if\s*\(\s*branch\s*===\s*['"]main['"]\s*\)[\s\S]*?DIRECT_PUSH_TO_MAIN_NOT_ALLOWED[\s\S]*?direct push to 'main' is not allowed; cuts the release\/publish path\.[\s\S]*?open a PR from a feature branch \(release\/\* or develop\)\./;

export const findStrictnessViolations = (
	pushDriverSource: string,
): readonly string[] => {
	const violations: string[] = [];

	if (!MAIN_GUARD_PATTERN.test(pushDriverSource)) {
		violations.push(
			'missing the canonical direct-push-to-main guard (branch check + reason code + message + suggested next action)',
		);
	}

	const mainGuardIdx = pushDriverSource.indexOf(DIRECT_PUSH_TO_MAIN_CODE);
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
			'direct-push-to-main refusal must happen before the protectedBranches override check',
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
			'✓ commit-push-strictness: push-driver hard-blocks direct push to main.',
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
		'fix: keep the hard-coded `main` refusal and the policy-derived integration-branch refusal ahead of `protectedBranches`, each with its canonical reason code and an actionable message.',
	);
	return 1;
};

if (import.meta.main) {
	process.exit(run(repoRoot()));
}
