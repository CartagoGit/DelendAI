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

const releaseBranch =
	BRANCH_PROTECTION.branches.find((branch) => branch.name === 'main')?.name ??
	'main';
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

export const findDuplicates = (
	files: readonly { readonly name: string; readonly raw: string }[],
): readonly IDuplicateTrigger[] =>
	files
		.filter((file) =>
			doublesOnRelease(parseWorkflowYaml(file.raw), {
				integration: integrationBranch,
				release: releaseBranch,
			}),
		)
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
	return duplicates.length === 0 ? 0 : 1;
};

if (import.meta.main) process.exit(main());
