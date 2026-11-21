#!/usr/bin/env bun
/**
 * certify-integration.script.ts — record what the full runs of the
 * integration branch's tip concluded.
 *
 * A pull request, or a train of them, lands on the run of the sections it
 * touches; the full suite runs on the promotion into the release branch,
 * whose head is the integration branch's tip. Nothing dispatches a full
 * run after each merge any more, and nothing waits for one before arming:
 * this only records the verdict of the full runs that exist (a push, a
 * dispatch without a base, or the promotion's own run) for
 * `proposal_transition` to read.
 *
 *   bun tools/scripts/forge/certify-integration.script.ts
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { readTextIfPresent } from '../lib/read-text-if-present';
import { dirname, join } from 'node:path';

import { parseJsonc } from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { INTEGRATION_CERTIFICATION_LOG_RELATIVE_PATH } from '../../../plugins/proposals/src/lib/contracts/constants/proposal-paths.constant';
import { repoRoot } from '../lib/repo-root';
import type {
	ICertificationRun,
	IIntegrationCertification,
} from './certify-integration.interface';

export type {
	ICertificationRun,
	IIntegrationCertification,
} from './certify-integration.interface';

/** The workflow that validates the integration branch in full. */
export const CERTIFYING_WORKFLOW = 'ci.yml';

/**
 * How many full runs of one commit may end cancelled before the commit
 * reads red. A job over its `timeout-minutes` ends its run `cancelled`
 * (measured on 2026-09-29: job and run both report `cancelled`, and only
 * the annotation "The job has exceeded the maximum execution time" tells it
 * from a person's cancel), so one cancelled run says nothing; a commit
 * cancelled this often does not finish, a failure a person reads.
 */
export const MAX_CANCELLED_FULL_RUNS = 3;

/**
 * Runs that validate `sha` in full: a push or a dispatch run everything,
 * and so does the promotion, the one pull request whose head is the
 * integration branch. A train's dispatch runs on its own commit, never on
 * the tip's.
 */
const fullRunsOf = (
	runs: readonly ICertificationRun[],
	sha: string,
	integration?: string,
): readonly ICertificationRun[] =>
	runs.filter(
		(run) =>
			run.head_sha === sha &&
			(run.event === 'push' ||
				run.event === 'workflow_dispatch' ||
				(run.event === 'pull_request' &&
					integration !== undefined &&
					run.head_branch === integration)),
	);

const isCancelled = (run: ICertificationRun): boolean =>
	run.conclusion === 'cancelled';

/**
 * Whether `sha` has passed its full validation. Only a push or a
 * dispatched run counts — a pull-request run may have run only part — and
 * a cancelled one says nothing either way, until
 * {@link MAX_CANCELLED_FULL_RUNS} of them say the commit does not finish.
 */
export const certificationOf = (
	runs: readonly ICertificationRun[],
	sha: string,
	integration?: string,
): IIntegrationCertification => {
	const all = fullRunsOf(runs, sha, integration);
	const full = all.filter((run) => !isCancelled(run));
	if (full.some((run) => run.conclusion === 'success')) return 'certified';
	if (full.some((run) => run.status !== 'completed')) return 'pending';
	if (full.length > 0) return 'red';
	return all.length >= MAX_CANCELLED_FULL_RUNS ? 'red' : 'uncertified';
};

/**
 * The line to append to the certification log, or `undefined` when there
 * is nothing new to say: only a finished run counts (certified or red),
 * and the same verdict for the same commit is recorded once.
 */
export const certificationRecord = (
	existing: string,
	sha: string,
	state: IIntegrationCertification,
	now: Date,
): string | undefined => {
	if (state !== 'certified' && state !== 'red') return undefined;
	const last = existing.trim().split('\n').at(-1) ?? '';
	try {
		const parsed = JSON.parse(last) as { sha?: string; state?: string };
		if (parsed.sha === sha && parsed.state === state) return undefined;
	} catch {
		// No readable last line: this is the first record.
	}
	return `${JSON.stringify({ sha, state, timestamp: now.toISOString() })}\n`;
};

/** Append what this pass observed, for `proposal_transition` to read. */
const recordCertification = (
	root: string,
	sha: string,
	state: IIntegrationCertification,
): void => {
	const path = join(root, INTEGRATION_CERTIFICATION_LOG_RELATIVE_PATH);
	const existing = readTextIfPresent(path) ?? '';
	const line = certificationRecord(existing, sha, state, new Date());
	if (line === undefined) return;
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, line);
};

const main = (): void => {
	const root = repoRoot();
	const { value, errors } = parseJsonc(
		readFileSync(join(root, 'delendai.config.json'), 'utf8'),
	);
	const [first] = errors;
	if (first !== undefined) {
		throw new Error(
			`delendai.config.json is not valid JSONC: ${first.line}:${first.column} ${first.message}`,
		);
	}
	const config = value as { readonly development?: Record<string, unknown> };
	if (config.development === undefined) return;
	const integration = resolveDevelopmentPolicy({
		development: config.development,
	}).branches.integration;
	const remote = process.env.DELENDAI_REMOTE ?? 'origin';
	const sha = execFileSync(
		'git',
		['rev-parse', `refs/remotes/${remote}/${integration}`],
		{ cwd: root, encoding: 'utf8' },
	).trim();
	const runs = JSON.parse(
		execFileSync(
			'gh',
			[
				'api',
				`repos/{owner}/{repo}/actions/workflows/${CERTIFYING_WORKFLOW}/runs?head_sha=${sha}&per_page=50`,
				'--jq',
				'.workflow_runs',
			],
			{ cwd: root, encoding: 'utf8' },
		),
	) as readonly ICertificationRun[];
	const state = certificationOf(runs, sha, integration);
	recordCertification(root, sha, state);
	console.log(
		`certify-integration: ${integration} at ${sha.slice(0, 9)} is ${state}; no full run is dispatched for it, the promotion runs one.`,
	);
};

if (import.meta.main) main();
