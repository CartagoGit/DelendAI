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
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
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
 * Whether `sha` still needs a full run: none that was started by a push
 * or a dispatch (both run everything) is running or finished for it.
 */
export const needsCertification = (
	runs: readonly ICertificationRun[],
	sha: string,
): boolean =>
	!runs.some(
		(run) =>
			run.head_sha === sha &&
			(run.event === 'push' || run.event === 'workflow_dispatch') &&
			run.conclusion !== 'cancelled',
	);

/**
 * Whether `sha` has passed its full validation. Only a push or a
 * dispatched run counts — a pull-request run may have run only part —
 * and a cancelled one says nothing either way.
 */
export const certificationOf = (
	runs: readonly ICertificationRun[],
	sha: string,
): IIntegrationCertification => {
	const full = runs.filter(
		(run) =>
			run.head_sha === sha &&
			(run.event === 'push' || run.event === 'workflow_dispatch') &&
			run.conclusion !== 'cancelled',
	);
	if (full.some((run) => run.conclusion === 'success')) return 'certified';
	if (full.some((run) => run.status !== 'completed')) return 'pending';
	return full.length > 0 ? 'red' : 'uncertified';
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
	const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
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
		console.log(
			`certify-integration: ${integration} at ${sha.slice(0, 9)} already has its full run.`,
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
