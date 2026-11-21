import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import {
	renderLandSignalWorkflow,
	renderLandWorkflow,
} from '@delendai/core/cli';

import {
	REPO_LAND_WORKFLOW,
	landWorkflowFilesOf,
} from './land-workflow.script';

const app = REPO_LAND_WORKFLOW.identity;
const pat = { ...app, kind: 'pat', tokenSecret: 'MY_PAT' } as const;

describe('the land workflow acts as its identity', () => {
	it('[<10ms] names the workflow token only for the steps that declare a read with it, so nothing is written through it', () => {
		const reading = (REPO_LAND_WORKFLOW.upkeep ?? []).filter(
			(step) => step.readsWithWorkflowToken !== undefined,
		);
		for (const identity of [app, pat])
			expect(
				renderLandWorkflow({ ...REPO_LAND_WORKFLOW, identity }).split(
					'github.token',
				).length - 1,
			).toBe(reading.length);
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

	it('[<10ms] keeps its only timer as a watchdog that is strict only when no event-driven pass is in flight', () => {
		expect(text.match(/- cron:/gu)).toHaveLength(1);
		expect(text).toContain(
			"LAND_WATCHDOG: ${{ github.event_name == 'schedule' && steps.inflight.outputs.count == '0' && '1' || '' }}",
		);
		expect(text).toContain('select(.event != "schedule")');
		expect(text).not.toContain('failure() && github.event_name');
		expect(text).not.toContain(
			'gh issue create --repo "${GITHUB_REPOSITORY}"\n',
		);
	});
});

describe('the watchdog keeps one issue per missed event', () => {
	const steps = (
		parse(renderLandWorkflow(REPO_LAND_WORKFLOW)) as {
			jobs: { land: { steps: { name: string; run?: string }[] } };
		}
	).jobs.land.steps;
	const script = steps.find((step) =>
		step.name.startsWith('Keep the one issue'),
	)?.run;

	/** Runs the step's script with a fake `gh` that logs its calls and lists `open`. */
	const keep = (rc: string, open: readonly number[]): string[] => {
		const dir = mkdtempSync(join(tmpdir(), 'watchdog-'));
		try {
			const gh = join(dir, 'gh');
			writeFileSync(
				gh,
				`#!/bin/bash\nif [ "$2" = list ] || [ "$3" = list ]; then ${open.map((n) => `echo ${String(n)};`).join(' ')} exit 0; fi\necho "$*" | tr "\\n" " " >> "${dir}/calls"; echo >> "${dir}/calls"\n`,
			);
			chmodSync(gh, 0o755);
			writeFileSync(
				join(dir, 'evidence.md'),
				'- Commit: abc\n  - #3022 merged\n',
			);
			const done = spawnSync('bash', ['-c', script ?? 'exit 9'], {
				env: {
					PATH: `${dir}:${process.env.PATH ?? ''}`,
					GITHUB_REPOSITORY: 'o/n',
					RC: rc,
					RUN: '7',
					RUN_URL: 'https://x/runs/7',
					SHA: 'abc',
					EVIDENCE: join(dir, 'evidence.md'),
				},
				encoding: 'utf8',
			});
			expect(done.status).toBe(0);
			try {
				return readFileSync(join(dir, 'calls'), 'utf8')
					.trim()
					.split('\n');
			} catch {
				return [];
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	};

	it('[<100ms] opens one issue naming the run and the evidence when none is open', () => {
		const [call, ...rest] = keep('1', []);
		expect(rest).toEqual([]);
		expect(call).toContain('issue create');
		expect(call).toContain('Run 7');
		expect(call).toContain('#3022 merged');
	});

	it('[<100ms] refreshes the first open issue and closes its duplicates', () => {
		const calls = keep('1', [2763, 3024]);
		expect(calls).toHaveLength(2);
		expect(calls[0]).toContain('issue close 3024');
		expect(calls[0]).toContain('Duplicate of #2763');
		expect(calls[1]).toContain('issue edit 2763');
	});

	it('[<100ms] closes every open issue once a strict pass finds nothing', () => {
		const calls = keep('0', [2763, 3024]);
		expect(calls.map((c) => c.slice(0, 16))).toEqual([
			'issue close 2763',
			'issue close 3024',
		]);
	});

	it('[<100ms] files nothing for a crashed pass: the failed run is the evidence', () => {
		expect(keep('5', [2763])).toEqual([]);
	});
});

describe('the land workflow stays out of the pull request code', () => {
	const text = renderLandWorkflow(REPO_LAND_WORKFLOW);

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

describe('the land workflow files follow the engine in a config text', () => {
	const config = (engine: string): string =>
		`{ "development": { "integration": { "engine": "${engine}" } } }`;

	it('[<50ms] renders both files while the engine is land', () => {
		const files = landWorkflowFilesOf(config('land'));
		expect(files.map((file) => file.path)).toEqual([
			'.github/workflows/land.yml',
			'.github/workflows/land-signal.yml',
		]);
		for (const file of files) expect(file.expected).toBeTypeOf('string');
	});

	it('[<50ms] renders none while the engine is none', () => {
		for (const file of landWorkflowFilesOf(config('none')))
			expect(file.expected).toBeUndefined();
	});
});
