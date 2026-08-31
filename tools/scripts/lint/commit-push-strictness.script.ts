#!/usr/bin/env bun
/**
 * commit-push-strictness.script.ts — x00272 S2
 *
 * Structural ratchet over the commit-policy push driver. This guard
 * blocks regressions where direct push to `main` stops being refused by
 * a hard-coded branch check and falls back to the user-configurable
 * `protectedBranches` override.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const PUSH_DRIVER_REL = 'plugins/commit-policy/src/lib/services/push-driver.ts';

const DIRECT_PUSH_TO_MAIN_CODE = 'DIRECT_PUSH_TO_MAIN_NOT_ALLOWED';
const DIRECT_PUSH_TO_DEVELOP_CODE = 'DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED';
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

	if (pushDriverSource.includes(DIRECT_PUSH_TO_DEVELOP_CODE)) {
		violations.push(
			'legacy develop-only refusal is still present; x00272 requires the structural guard to target main instead',
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
		'fix: restore the hard-coded `main` refusal ahead of `protectedBranches`, with the canonical reason code, message, and PR guidance.',
	);
	return 1;
};

if (import.meta.main) {
	process.exit(run(repoRoot()));
}
