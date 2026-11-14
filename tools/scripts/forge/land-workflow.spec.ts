import { describe, expect, it } from 'vitest';

import { renderLandWorkflow } from '@delendai/core/cli';

import { REPO_LAND_WORKFLOW } from './land-workflow.script';

const app = REPO_LAND_WORKFLOW.identity;
const pat = { ...app, kind: 'pat', tokenSecret: 'MY_PAT' } as const;

describe('the land workflow acts as its identity', () => {
	it('[<10ms] never names the workflow token, so nothing is written through it', () => {
		for (const identity of [app, pat])
			expect(
				renderLandWorkflow({ ...REPO_LAND_WORKFLOW, identity }),
			).not.toContain('github.token');
	});

	it('[<10ms] mints an App installation token per job and hands it to every write step', () => {
		const text = renderLandWorkflow(REPO_LAND_WORKFLOW);
		const jobs = text.split(/\n {4}(?=[a-z-]+:\n {8}name:)/u).slice(1);
		expect(jobs.length).toBeGreaterThan(1);
		// The tokenless half of the derived resolution is the one job that mints nothing.
		const tokened = jobs.filter(
			(job) => !job.startsWith('derived-prepare:'),
		);
		expect(tokened.length).toBe(jobs.length - 1);
		for (const job of tokened) {
			expect(job).toContain('actions/create-github-app-token@');
			expect(job).toContain('${{ vars.DELENDAI_APP_ID }}');
			expect(job).toContain('${{ secrets.DELENDAI_APP_PRIVATE_KEY }}');
			expect(job).toContain(
				'GH_TOKEN: ${{ steps.identity.outputs.token }}',
			);
		}
	});

	it('[<10ms] resolves a derived conflict in two jobs: one with no token, one that only pushes', () => {
		const text = renderLandWorkflow(REPO_LAND_WORKFLOW);
		const [, prepare = '', push = ''] = text.split(
			/\n {4}(?=derived-(?:prepare|push):\n)/u,
		);
		expect(prepare).toContain('permissions:');
		expect(prepare).toContain('contents: read');
		expect(prepare).not.toMatch(
			/create-github-app-token|GH_TOKEN|secrets\./u,
		);
		expect(push).toContain('needs: derived-prepare');
		expect(push).toContain('actions/create-github-app-token@');
		expect(push).toContain('--phase=push');
		expect(text).toContain('derived:\n');
		const { derived: _omitted, ...without } = REPO_LAND_WORKFLOW;
		expect(renderLandWorkflow(without)).not.toContain('derived-prepare');
	});

	it('[<10ms] reads the token of a personal access token from its secret and mints nothing', () => {
		const text = renderLandWorkflow({
			...REPO_LAND_WORKFLOW,
			identity: pat,
		});
		expect(text).not.toContain('create-github-app-token');
		expect(text).toContain('GH_TOKEN: ${{ secrets.MY_PAT }}');
	});

	it('[<10ms] only reads with the permissions the workflow token holds', () => {
		const permissions = /\npermissions:\n((?: {4}\S.*\n)+)/u.exec(
			renderLandWorkflow(REPO_LAND_WORKFLOW),
		)?.[1];
		expect(permissions).toBeDefined();
		expect(permissions).not.toContain('write');
	});
});

describe('the land workflow wakes on events only', () => {
	const text = renderLandWorkflow(REPO_LAND_WORKFLOW);

	it('[<10ms] runs on the pull request events, a push and a dispatch, and not on workflow_run or check_suite', () => {
		expect(text).toContain(
			'types: [opened, reopened, synchronize, ready_for_review, labeled, unlabeled, converted_to_draft, closed]',
		);
		expect(text).toContain('pull_request_target:');
		expect(text).toContain('    push:');
		expect(text).toContain('    workflow_dispatch:');
		expect(text).not.toContain('workflow_run');
		expect(text).not.toContain('check_suite');
	});

	it('[<10ms] keeps its only timer as a watchdog that fails and files the evidence', () => {
		expect(text.match(/- cron:/gu)).toHaveLength(1);
		expect(text).toContain(
			"LAND_WATCHDOG: ${{ github.event_name == 'schedule'",
		);
		expect(text).toContain('gh issue create');
	});

	it('[<10ms] never checks out or runs pull request code', () => {
		expect(text).not.toContain('github.event.pull_request.head');
		expect(text).not.toContain('github.head_ref');
		expect(text).not.toMatch(/ref:\s/u);
	});
});
