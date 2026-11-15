import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import {
	renderLandSignalWorkflow,
	renderLandWorkflow,
} from '@delendai/core/cli';

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

	it('[<10ms] runs on a push, the schedule and a dispatch, and not on pull_request_target, workflow_run or check_suite', () => {
		expect(text).not.toContain('pull_request_target');
		expect(text).not.toContain('pull_request:');
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

describe('the land signal workflow wakes the land at the base ref', () => {
	const text = renderLandSignalWorkflow({ integrationBranch: 'develop' });

	it('[<10ms] triggers on the pull request events into the integration branch only', () => {
		expect(text).toContain('    pull_request:\n');
		expect(text).toContain(
			'types: [opened, reopened, synchronize, ready_for_review, labeled, unlabeled, converted_to_draft, closed]',
		);
		expect(text).toContain('branches: [develop]');
		expect(text).not.toContain('pull_request_target');
	});

	it('[<10ms] holds only actions write and contents read, and checks out nothing', () => {
		expect(text).toContain(
			'permissions:\n    actions: write\n    contents: read\n',
		);
		expect(text).not.toMatch(/uses:|checkout|create-github-app-token/u);
		expect(text.match(/^ {4}[\w-]+:$/gmu)).toEqual([
			'    pull_request:',
			'    land-signal:',
		]);
	});

	it('[<10ms] dispatches land.yml at the base ref with the pull request number, and warns when refused', () => {
		expect(text).toContain('GH_TOKEN: ${{ github.token }}');
		expect(text).toContain(
			'BRANCH: ${{ github.event.pull_request.base.ref }}',
		);
		expect(text).toContain('gh workflow run land.yml');
		expect(text).toContain('--ref "${BRANCH}"');
		expect(text).toContain('-f pr="${PULL_REQUEST}"');
		expect(text).toContain('::warning::could not wake the integrator');
	});
});

describe('the land workflow keeps no workflow token in its clone', () => {
	const checkoutsOf = (text: string) =>
		Object.values(
			(
				parse(text) as {
					jobs: Record<
						string,
						{
							steps?: {
								uses?: string;
								with?: Record<string, unknown>;
							}[];
						}
					>;
				}
			).jobs,
		).flatMap((job) =>
			(job.steps ?? []).filter(
				(step) =>
					step.uses?.startsWith('actions/checkout') === true ||
					step.uses === './.github/actions/setup-bun-repo',
			),
		);

	it('[<20ms] sets persist-credentials false on every checkout it renders', () => {
		const steps = checkoutsOf(renderLandWorkflow(REPO_LAND_WORKFLOW));
		expect(steps.length).toBeGreaterThan(0);
		for (const step of steps)
			expect(String(step.with?.['persist-credentials'])).toBe('false');
	});

	it('[<20ms] refuses a checkout that keeps the credential', () => {
		expect(() =>
			renderLandWorkflow({
				...REPO_LAND_WORKFLOW,
				setupSteps: ['- uses: actions/checkout@abc'],
			}),
		).toThrow('persist-credentials: false');
	});
});
