#!/usr/bin/env bun
/**
 * no-duplicate-release-triggers.script.ts
 *
 * A workflow that runs on a push to the INTEGRATION branch and also on
 * a pull request into the RELEASE branch runs twice on the same commit.
 *
 * The release promotion is a pull request whose head IS the integration
 * branch, so both triggers fire for one SHA and every job reports twice.
 * Measured on the release candidate before this gate existed: **89 check
 * rows of which 48 were distinct names** — `ci.yml` alone contributed 35
 * of each. Half the compute, and a checks list nobody can read.
 *
 * It is not a correctness problem, which is why nothing caught it: both
 * runs agree, and required status checks are evaluated per COMMIT rather
 * than per event, so the push run satisfies the release branch on its
 * own. It is a cost and a legibility problem, and those are the ones
 * that accumulate quietly.
 *
 * One workflow is exempt, and must have the doubled shape: the one that
 * reports a required check of the release branch. The forge counts a
 * check towards a pull request only when its run belongs to that pull
 * request or to a push, and the integration branch no longer gets push
 * runs: the queue merges with the workflow token, whose pushes start no
 * workflow, and certifies develop with a dispatched run, which the forge
 * does not associate with the promotion. On 2026-10-07 the promotion
 * (#911) sat BLOCKED with `delendai-validate` "expected", although the
 * dispatched run had reported it green on the very same commit.
 *
 * The branch names come from the canonical development policy's own
 * projection, not from literals here: a repository that renames its
 * branches must not have to remember this file.
 *
 * Exit codes:
 *   0 — no workflow doubles up on the release candidate.
 *   1 — at least one does.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BRANCH_PROTECTION } from '../../../.github/branch-protection.ts';
import { repoRoot } from '../lib/repo-root';

import { parseWorkflowYaml, type YamlValue } from '../ci/workflow-yaml';

const WORKFLOWS_DIR = join(repoRoot(), '.github/workflows');

const releasePolicy = BRANCH_PROTECTION.branches.find(
	(branch) => branch.name === 'main',
);
const releaseBranch = releasePolicy?.name ?? 'main';
const releaseChecks: readonly string[] = releasePolicy?.required_checks ?? [];
const integrationBranch =
	BRANCH_PROTECTION.branches.find(
		(branch) => branch.protected && branch.name !== releaseBranch,
	)?.name ?? 'develop';

export interface IDuplicateTrigger {
	readonly workflow: string;
}

const asRecord = (value: YamlValue | undefined): Record<string, YamlValue> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, YamlValue>)
		: {};

/** The `branches:` list of one trigger, as plain strings. */
export const branchesOf = (
	trigger: YamlValue | undefined,
): readonly string[] => {
	const branches = asRecord(trigger)['branches'];
	if (!Array.isArray(branches)) return [];
	return branches.filter((each): each is string => typeof each === 'string');
};

/**
 * Whether a workflow fires twice for the release candidate: once for the
 * push that landed the commit on the integration branch, and once for
 * the pull request that proposes the same commit to the release branch.
 */
export const doublesOnRelease = (
	workflow: Record<string, YamlValue>,
	branches: {
		readonly integration: string;
		readonly release: string;
	},
): boolean => {
	const on = asRecord(workflow['on']);
	return (
		branchesOf(on['push']).includes(branches.integration) &&
		branchesOf(on['pull_request']).includes(branches.release)
	);
};

/** The required checks of the release branch this workflow's jobs report. */
export const releaseChecksReported = (
	workflow: Record<string, YamlValue>,
	checks: readonly string[],
): readonly string[] => {
	const names = Object.values(asRecord(workflow['jobs'])).map(
		(job) => asRecord(job)['name'],
	);
	return checks.filter((check) => names.includes(check));
};

/** Whether the workflow runs on pull requests into the release branch. */
export const runsOnReleasePullRequests = (
	workflow: Record<string, YamlValue>,
	release: string,
): boolean =>
	branchesOf(asRecord(workflow['on'])['pull_request']).includes(release);

export const findDuplicates = (
	files: readonly { readonly name: string; readonly raw: string }[],
	checks: readonly string[] = releaseChecks,
): readonly IDuplicateTrigger[] =>
	files
		.filter((file) => {
			const workflow = parseWorkflowYaml(file.raw);
			return (
				releaseChecksReported(workflow, checks).length === 0 &&
				doublesOnRelease(workflow, {
					integration: integrationBranch,
					release: releaseBranch,
				})
			);
		})
		.map((file) => ({ workflow: file.name }));

/**
 * Workflows that report a required check of the release branch without
 * running on its pull requests: the promotion waits on them for good.
 */
export const findUnreportedReleaseChecks = (
	files: readonly { readonly name: string; readonly raw: string }[],
	checks: readonly string[] = releaseChecks,
): readonly IDuplicateTrigger[] =>
	files
		.filter((file) => {
			const workflow = parseWorkflowYaml(file.raw);
			return (
				releaseChecksReported(workflow, checks).length > 0 &&
				!runsOnReleasePullRequests(workflow, releaseBranch)
			);
		})
		.map((file) => ({ workflow: file.name }));

export const formatReport = (
	duplicates: readonly IDuplicateTrigger[],
): string => {
	if (duplicates.length === 0) {
		return `✓ no-duplicate-release-triggers: no workflow runs twice on a ${integrationBranch} → ${releaseBranch} candidate.`;
	}
	return [
		`✖ no-duplicate-release-triggers: ${String(duplicates.length)} workflow(s) run twice on the same commit:`,
		'',
		...duplicates.map((each) => `  .github/workflows/${each.workflow}`),
		'',
		`  Each fires on a push to \`${integrationBranch}\` AND on a pull request`,
		`  into \`${releaseBranch}\` — and the release pull request's head IS`,
		`  \`${integrationBranch}\`, so both build the same SHA and every job`,
		'  reports twice.',
		'',
		`  Fix: narrow the trigger to \`pull_request: branches: [${integrationBranch}]\`.`,
		'  The push run already covers the candidate, and required checks are',
		'  evaluated per commit rather than per event, so nothing stops being',
		'  verified.',
	].join('\n');
};

export const main = (): number => {
	let names: readonly string[];
	try {
		names = readdirSync(WORKFLOWS_DIR).filter((name) =>
			name.endsWith('.yml'),
		);
	} catch {
		console.error(
			'no-duplicate-release-triggers: could not read .github/workflows, so nothing was checked.',
		);
		return 1;
	}
	const files = names.map((name) => ({
		name,
		raw: readFileSync(join(WORKFLOWS_DIR, name), 'utf8'),
	}));
	const duplicates = findDuplicates(files);
	console.log(formatReport(duplicates));
	const unreported = findUnreportedReleaseChecks(files);
	for (const each of unreported) {
		console.log(
			`✖ no-duplicate-release-triggers: .github/workflows/${each.workflow} reports a required check of \`${releaseBranch}\` (${releaseChecks.join(', ')}) but does not run on pull requests into it, so the promotion waits for a check that never reports there.`,
		);
	}
	return duplicates.length === 0 && unreported.length === 0 ? 0 : 1;
};

if (import.meta.main) process.exit(main());
