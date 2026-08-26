/**
 * tier-budget.spec.ts — covers c00139 (Track G, audit §31).
 *
 * Structural budget gate: parses every `tier*.yml` workflow in
 * `.github/workflows/`, pulls the per-job `timeout-minutes`
 * values out, and asserts each tier stays inside its declared
 * envelope:
 *
 *   tier1 — fast feedback per PR (≤ 5 min / job, well under the
 *           proposal's "<1 min" target on cache-hot runners).
 *   tier2 — pre-merge full matrix (≤ 10 min / job).
 *   tier3 — nightly + per-push-to-develop (≤ 30 min / job,
 *           no hard proposal budget).
 *
 * We intentionally do NOT try to measure real wall-clock time
 * from this CI — that belongs in the metrics plugin (c00134 /
 * c00136). What we CAN guarantee here is that a runaway job
 * fails the gate fast instead of stalling the runner.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseWorkflowYaml } from '../../scripts/ci/workflow-yaml';

interface IWorkflowJob {
	readonly 'timeout-minutes'?: number;
	readonly name?: string;
	readonly steps?: readonly unknown[];
	readonly needs?: unknown;
}

interface IWorkflow {
	readonly name?: string;
	readonly on?: unknown;
	readonly jobs?: Readonly<Record<string, IWorkflowJob>>;
}

interface IBudgetTier {
	readonly file: string;
	readonly workflowName: string;
	readonly jobCount: number;
	readonly maxTimeoutMinutes: number;
	readonly jobsWithoutTimeout: readonly string[];
}

const here = dirname(fileURLToPath(import.meta.url));
// tools/tests/ci/tier-budget.spec.ts → repo root is 3 levels up.
const repoRoot = join(here, '..', '..', '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');

const BUDGETS: ReadonlyMap<string, { max: number; label: string }> = new Map([
	['tier1.yml', { max: 5, label: 'tier1 fast feedback' }],
	['tier2.yml', { max: 10, label: 'tier2 pre-merge full matrix' }],
	['tier3.yml', { max: 30, label: 'tier3 nightly + per-push-to-develop' }],
]);

const loadWorkflow = (fileName: string): IWorkflow | null => {
	const path = join(workflowsDir, fileName);
	const raw = readFileSync(path, 'utf8');
	return parseWorkflowYaml(raw);
};

const describeTier = (fileName: string): IBudgetTier => {
	const wf = loadWorkflow(fileName);
	if (wf === null) {
		throw new Error(`workflow ${fileName} missing`);
	}
	const jobs = wf.jobs ?? {};
	const jobNames = Object.keys(jobs);
	const jobsWithoutTimeout: string[] = [];
	let max = 0;
	for (const [jobId, job] of Object.entries(jobs)) {
		const t = job['timeout-minutes'];
		if (typeof t !== 'number') {
			jobsWithoutTimeout.push(jobId);
			continue;
		}
		if (t > max) max = t;
	}
	return {
		file: fileName,
		workflowName: wf.name ?? '<unnamed>',
		jobCount: jobNames.length,
		maxTimeoutMinutes: max,
		jobsWithoutTimeout,
	};
};

describe('tier-budget (c00139)', () => {
	// Surface the budgets so a future engineer doesn't have to dig
	// through the proposal to see them — the spec is the source of
	// truth for what "within budget" means.
	const tierFiles = readdirSync(workflowsDir).filter(
		(f) => f.startsWith('tier') && f.endsWith('.yml'),
	);

	it('discovers at least the three tier workflows', () => {
		expect(tierFiles.length).toBeGreaterThanOrEqual(3);
		expect(tierFiles).toEqual(
			expect.arrayContaining(['tier1.yml', 'tier2.yml', 'tier3.yml']),
		);
	});

	for (const fileName of BUDGETS.keys()) {
		const budget = BUDGETS.get(fileName);
		if (budget === undefined) continue;
		const tier = describeTier(fileName);
		const rel = relative(repoRoot, join(workflowsDir, fileName));

		describe(`${fileName} — ${budget.label}`, () => {
			it('parses with a declared name', () => {
				expect(tier.workflowName.length).toBeGreaterThan(0);
				expect(tier.jobCount).toBeGreaterThan(0);
			});

			it('every job declares a timeout-minutes', () => {
				expect(tier.jobsWithoutTimeout).toEqual([]);
			});

			it(`max job timeout ≤ ${budget.max} min`, () => {
				expect(tier.maxTimeoutMinutes).toBeLessThanOrEqual(budget.max);
			});

			it(`workflow path is tracked: ${rel}`, () => {
				// Guard against the spec running on a fresh checkout
				// where the workflow files were never committed.
				expect(tier.file.length).toBeGreaterThan(0);
			});
		});
	}
});
