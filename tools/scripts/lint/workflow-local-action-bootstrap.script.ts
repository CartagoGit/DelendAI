#!/usr/bin/env bun
/**
 * workflow-local-action-bootstrap.script.ts
 *
 * A job that references a LOCAL composite action (`uses: ./path`) must
 * check the repository out first.
 *
 * GitHub resolves `uses: ./path` from the runner's filesystem, so the
 * path does not exist until something has checked the repo out. Our
 * `setup-bun-repo` composite action does its own checkout as its first
 * internal step — which is useless for bootstrapping it, because the
 * action itself cannot be found yet. A job that opens with it fails at
 * that step and reports every later step as `skipped`.
 *
 * That is not a hypothetical. From 2026-08-31 to 2026-09-03, `ci.yml`,
 * `tier1.yml`, `tier2.yml` and `tier3.yml` — 29 jobs — failed this way
 * on EVERY run, while `affected.yml` and `surface-bootstrap.yml` passed
 * because they happen to inline a plain checkout. Nothing said so: the
 * step names in the API still read "Build dist" and "Run tests", and
 * only their `conclusion: skipped` gave it away. Five days of red CI
 * that looked like failing tests and was a missing line of YAML.
 *
 * Hence a gate. The failure is silent, the diagnosis is unobvious, and
 * the cost is every gate in the repository.
 *
 * Exit codes: 0 — every local-action job bootstraps itself. 1 — at
 * least one does not.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse } from 'yaml';

import { repoRoot } from '../lib/monorepo-paths';

export interface IWorkflowBootstrapFinding {
	readonly workflow: string;
	readonly job: string;
	readonly localAction: string;
}

interface IStep {
	readonly uses?: unknown;
}

const CHECKOUT_RE = /^actions\/checkout@/u;

/**
 * A step list is well-formed when no local-action step appears before
 * the first `actions/checkout`.
 *
 * The check is deliberately positional rather than "does the job
 * contain a checkout anywhere": a checkout AFTER the composite action
 * does not help, because the action had to resolve first.
 */
export const findUnbootstrappedJobs = (
	workflowName: string,
	source: string,
): readonly IWorkflowBootstrapFinding[] => {
	let doc: unknown;
	try {
		doc = parse(source);
	} catch {
		// Unparseable YAML is a different gate's problem; this one
		// reports nothing rather than guessing.
		return [];
	}
	const jobs = (doc as { jobs?: Record<string, { steps?: IStep[] }> } | null)
		?.jobs;
	if (jobs === undefined || jobs === null) return [];

	const findings: IWorkflowBootstrapFinding[] = [];
	for (const [jobName, job] of Object.entries(jobs)) {
		const steps = Array.isArray(job?.steps) ? job.steps : [];
		let checkedOut = false;
		for (const step of steps) {
			const uses = typeof step?.uses === 'string' ? step.uses : undefined;
			if (uses === undefined) continue;
			if (CHECKOUT_RE.test(uses)) {
				checkedOut = true;
				continue;
			}
			if (uses.startsWith('./') && !checkedOut) {
				findings.push({
					workflow: workflowName,
					job: jobName,
					localAction: uses,
				});
			}
		}
	}
	return findings;
};

export const main = async (): Promise<number> => {
	const dir = join(repoRoot(), '.github', 'workflows');
	const entries = await readdir(dir).catch(() => []);
	const findings: IWorkflowBootstrapFinding[] = [];
	for (const name of entries.filter(
		(entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'),
	)) {
		const source = await readFile(join(dir, name), 'utf8');
		findings.push(...findUnbootstrappedJobs(name, source));
	}

	if (findings.length === 0) {
		console.log(
			'✓ workflow-local-action-bootstrap: every job that uses a local action checks out first.',
		);
		return 0;
	}

	console.error(
		`✖ workflow-local-action-bootstrap: ${String(findings.length)} job(s) use a local action before any checkout:`,
	);
	for (const finding of findings) {
		console.error(
			`  ${finding.workflow} → job "${finding.job}" → ${finding.localAction}`,
		);
	}
	console.error('');
	console.error(
		'  These jobs fail at that step and report every later step as `skipped`,',
	);
	console.error(
		'  which reads in the UI as "the build broke" rather than "the action was',
	);
	console.error(
		'  never found". Add a bare `uses: actions/checkout@v7` step before it; the',
	);
	console.error(
		'  composite action re-checks out at whatever fetch-depth it needs.',
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
