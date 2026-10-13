#!/usr/bin/env bun
/**
 * certify-integration.script.ts — every commit that lands on the
 * integration branch gets the full CI run it is declared to get.
 *
 * `ci.yml` calls the integration branch the full validation boundary: a
 * pull request may run only what its change can reach, because the push
 * to the integration branch runs everything. But the queue merges with
 * the workflow token, and the forge starts no workflow for an event that
 * token caused. Measured on 2026-09-24: the six latest merges into
 * `develop` were made by github-actions[bot] and none had a CI run.
 *
 * The owner machine runs this after each merge it pulls. When the
 * integration branch's tip has no full run yet, it dispatches one, with
 * the owner's credential, which the forge does start.
 *
 *   bun tools/scripts/forge/certify-integration.script.ts [--apply]
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { readTextIfPresent } from '../lib/read-text-if-present';
import { dirname, join } from 'node:path';

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
 * How many full runs of one commit may end cancelled before a pass stops
 * starting another. A job over its `timeout-minutes` ends its run
 * `cancelled` (measured on 2026-09-29: job and run both report
 * `cancelled`, and only the annotation "The job has exceeded the maximum
 * execution time" tells it from a person's cancel), so a cancelled run is
 * run again. One that is cancelled every time would otherwise be started
 * on every pass for ever; after this many it is a failure a person reads.
 */
export const MAX_CANCELLED_FULL_RUNS = 3;

/** Runs that validate `sha` in full: a push or a dispatch run everything. */
const fullRunsOf = (
	runs: readonly ICertificationRun[],
	sha: string,
): readonly ICertificationRun[] =>
	runs.filter(
		(run) =>
			run.head_sha === sha &&
			(run.event === 'push' || run.event === 'workflow_dispatch'),
	);

const isCancelled = (run: ICertificationRun): boolean =>
	run.conclusion === 'cancelled';

/**
 * Whether `sha` still needs a full run: none that was started by a push
 * or a dispatch is running or finished for it, other than cancelled ones,
 * and fewer than {@link MAX_CANCELLED_FULL_RUNS} were cancelled.
 */
export const needsCertification = (
	runs: readonly ICertificationRun[],
	sha: string,
): boolean => {
	const full = fullRunsOf(runs, sha);
	return full.every(isCancelled) && full.length < MAX_CANCELLED_FULL_RUNS;
};

/**
 * Whether `sha` has passed its full validation. Only a push or a
 * dispatched run counts — a pull-request run may have run only part — and
 * a cancelled one says nothing either way, until
 * {@link MAX_CANCELLED_FULL_RUNS} of them say the commit does not finish.
 */
export const certificationOf = (
	runs: readonly ICertificationRun[],
	sha: string,
): IIntegrationCertification => {
	const all = fullRunsOf(runs, sha);
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
	const config = JSON.parse(
		readFileSync(join(root, 'delendai.config.json'), 'utf8'),
	) as { readonly development?: Record<string, unknown> };
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
	recordCertification(root, sha, certificationOf(runs, sha));
	if (!needsCertification(runs, sha)) {
		const cancelled = fullRunsOf(runs, sha).filter(isCancelled).length;
		console.log(
			cancelled >= MAX_CANCELLED_FULL_RUNS &&
				fullRunsOf(runs, sha).every(isCancelled)
				? `certify-integration: ${integration} at ${sha.slice(0, 9)} had ${cancelled} full runs cancelled (a job over its timeout, or by hand); not starting another — read the runs.`
				: `certify-integration: ${integration} at ${sha.slice(0, 9)} already has its full run.`,
		);
		return;
	}
	if (!process.argv.includes('--apply')) {
		console.log(
			`certify-integration: ${integration} at ${sha.slice(0, 9)} has no full run (read-only; pass --apply).`,
		);
		return;
	}
	execFileSync(
		'gh',
		['workflow', 'run', CERTIFYING_WORKFLOW, '--ref', integration],
		{ cwd: root, stdio: 'ignore' },
	);
	console.log(
		`certify-integration: dispatched the full run for ${integration} at ${sha.slice(0, 9)}.`,
	);
};

if (import.meta.main) main();
