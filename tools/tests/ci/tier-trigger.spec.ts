/**
 * tier-trigger.spec.ts — covers c00139 (Track G, audit §31).
 *
 * Structural trigger gate: parses each `tier*.yml` workflow and
 * asserts the `on:` block matches the tier's contract. Catches
 * accidental drift (someone adding `push:` to tier1, or losing
 * the nightly schedule from tier3) without waiting for CI.
 *
 * Contracts:
 *   tier1 — runs on pull_request (opened/synchronize/reopened)
 *           and workflow_dispatch. NO schedule, NO push trigger.
 *   tier2 — runs on pull_request (ready_for_review /
 *           synchronize / reopened) and workflow_dispatch. NO
 *           schedule, NO push trigger.
 *   tier3 — runs on schedule (cron) + push to develop +
 *           workflow_dispatch. NO pull_request trigger (the
 *           gate lives in tier1/tier2).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseWorkflowYaml } from '../../scripts/ci/workflow-yaml';

interface IPullRequestTrigger {
	readonly branches?: readonly string[];
	readonly types?: readonly string[];
}

interface IPushTrigger {
	readonly branches?: readonly string[];
}

interface IScheduleEntry {
	readonly cron?: string;
}

interface IOnBlock {
	readonly pull_request?: IPullRequestTrigger | readonly string[];
	readonly push?: IPushTrigger | readonly string[];
	readonly schedule?: readonly IScheduleEntry[];
	readonly workflow_dispatch?: unknown;
}

interface IWorkflow {
	readonly name?: string;
	readonly on?: IOnBlock;
}

const here = dirname(fileURLToPath(import.meta.url));
// tools/tests/ci/tier-trigger.spec.ts → repo root is 3 levels up.
const repoRoot = join(here, '..', '..', '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');

const loadOn = (fileName: string): IOnBlock => {
	const raw = readFileSync(join(workflowsDir, fileName), 'utf8');
	const wf = parseWorkflowYaml(raw);
	return (wf.on ?? {}) as IOnBlock;
};

/**
 * Some GitHub-Actions shorthand lets `pull_request: develop`
 * be a string instead of a full map. Normalise to the map
 * shape so downstream assertions stay readable.
 */
const normalisePullRequest = (
	pr: IOnBlock['pull_request'],
): IPullRequestTrigger | undefined => {
	if (pr === undefined) return undefined;
	if (Array.isArray(pr)) return { branches: pr as readonly string[] };
	if (typeof pr === 'string') return { branches: [pr] };
	return pr;
};

const normalisePush = (push: IOnBlock['push']): IPushTrigger | undefined => {
	if (push === undefined) return undefined;
	if (Array.isArray(push)) return { branches: push as readonly string[] };
	if (typeof push === 'string') return { branches: [push] };
	return push;
};

describe('tier-trigger (c00139)', () => {
	describe('tier1.yml — PR fast feedback', () => {
		const on = loadOn('tier1.yml');

		it('triggers on pull_request', () => {
			expect(normalisePullRequest(on.pull_request)).toBeDefined();
		});

		it('pull_request targets develop + main', () => {
			const pr = normalisePullRequest(on.pull_request);
			expect(pr?.branches).toEqual(
				expect.arrayContaining(['develop', 'main']),
			);
		});

		it('pull_request narrows to opened/synchronize/reopened types', () => {
			const pr = normalisePullRequest(on.pull_request);
			expect(pr?.types).toEqual(
				expect.arrayContaining(['opened', 'synchronize', 'reopened']),
			);
		});

		it('has no push trigger (PR-only)', () => {
			expect(normalisePush(on.push)).toBeUndefined();
		});

		it('has no schedule trigger (PR-only)', () => {
			expect(on.schedule).toBeUndefined();
		});

		it('allows workflow_dispatch for manual reruns', () => {
			expect(on.workflow_dispatch).toBeDefined();
		});
	});

	describe('tier2.yml — PR ready_for_review full matrix', () => {
		const on = loadOn('tier2.yml');

		it('triggers on pull_request', () => {
			expect(normalisePullRequest(on.pull_request)).toBeDefined();
		});

		it('pull_request narrows to ready_for_review/synchronize/reopened types', () => {
			const pr = normalisePullRequest(on.pull_request);
			expect(pr?.types).toEqual(
				expect.arrayContaining([
					'ready_for_review',
					'synchronize',
					'reopened',
				]),
			);
		});

		it('has no schedule trigger (PR-only)', () => {
			expect(on.schedule).toBeUndefined();
		});

		it('has no push trigger (PR-only)', () => {
			expect(normalisePush(on.push)).toBeUndefined();
		});

		it('allows workflow_dispatch', () => {
			expect(on.workflow_dispatch).toBeDefined();
		});
	});

	describe('tier3.yml — nightly + per-push-to-develop', () => {
		const on = loadOn('tier3.yml');

		it('declares a cron schedule', () => {
			expect(on.schedule).toBeDefined();
			expect(Array.isArray(on.schedule)).toBe(true);
			expect((on.schedule ?? []).length).toBeGreaterThan(0);
			for (const entry of on.schedule ?? []) {
				expect(typeof entry.cron).toBe('string');
				expect(entry.cron).toMatch(/^\d+\s+\d+\s+\*\s+\*\s+\*$/);
			}
		});

		it('triggers on push to develop', () => {
			const push = normalisePush(on.push);
			expect(push).toBeDefined();
			expect(push?.branches).toEqual(expect.arrayContaining(['develop']));
		});

		it('does NOT trigger on pull_request (gate lives in tier1/tier2)', () => {
			expect(normalisePullRequest(on.pull_request)).toBeUndefined();
		});

		it('allows workflow_dispatch', () => {
			expect(on.workflow_dispatch).toBeDefined();
		});
	});
});
