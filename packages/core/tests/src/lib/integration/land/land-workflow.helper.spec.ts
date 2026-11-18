import { describe, expect, it } from 'vitest';

import { DEFAULT_INTEGRATION_OPTIONS } from '@delendai/core/lib/contracts/constants/integration-options.constant';
import { renderLandWorkflow } from '@delendai/core/lib/integration/land/land-workflow.helper';

const render = (concurrencyGroup?: string): string =>
	renderLandWorkflow({
		integrationBranch: 'develop',
		releaseBranch: 'main',
		identity: DEFAULT_INTEGRATION_OPTIONS.identity,
		cron: '*/15 * * * *',
		passCommand: 'pass',
		promotionCommand: 'promote',
		forwardSyncCommand: 'sync',
		upkeep: [{ name: 'up', run: 'up', env: {} }],
		derived: { prepareCommand: 'prepare', pushCommand: 'push' },
		setupSteps: ['- uses: checkout'],
		...(concurrencyGroup === undefined ? {} : { concurrencyGroup }),
	});

const workflowGroup = (text: string): string =>
	/^concurrency:\n {4}group: (.+)\n {4}cancel-in-progress: false$/mu.exec(
		text,
	)?.[1] ?? '';

describe('renderLandWorkflow concurrency', () => {
	it('[<50ms] serialises at the workflow level and in no job, so no run waits on a job-level group', () => {
		const text = render();
		const [head = '', jobs = ''] = text.split('\njobs:\n');
		expect(head).toMatch(/^concurrency:$/mu);
		expect(jobs).not.toMatch(/concurrency:/u);
		expect(text.match(/cancel-in-progress/gu)).toHaveLength(1);
		expect(text.match(/^concurrency:/gmu)).toHaveLength(1);
	});

	it('[<50ms] keeps one group per kind of run, ending with the branch, so a run that skips the pass never displaces a pending pass', () => {
		const group = workflowGroup(render());
		expect(group).toContain('land-${{ ');
		expect(group.endsWith("|| 'pass-' }}${{ github.ref_name }}")).toBe(
			true,
		);
		for (const kind of ['derived-', 'promote-', 'upkeep-', 'forward-sync-'])
			expect(group).toContain(`&& '${kind}'`);
		expect(group).toContain("inputs.derived != ''");
		expect(group).toContain("inputs.promote != ''");
		expect(group).toContain("github.event_name == 'schedule'");
		expect(group).toContain(
			"github.event_name == 'push' && github.ref_name == 'main'",
		);
	});

	it('[<50ms] names each run by its group, so a signal can tell a queued pass from another kind', () => {
		const text = render();
		expect(/^run-name: (.+)$/mu.exec(text)?.[1]).toBe(workflowGroup(text));
	});

	it('[<50ms] leaves out the kinds the project does not have', () => {
		const text = renderLandWorkflow({
			integrationBranch: 'develop',
			releaseBranch: 'main',
			identity: DEFAULT_INTEGRATION_OPTIONS.identity,
			cron: '*/15 * * * *',
			passCommand: 'pass',
			setupSteps: ['- uses: checkout'],
		});
		expect(workflowGroup(text)).not.toContain('derived-');
	});

	it('[<50ms] derives the group from the named concurrency group', () => {
		expect(workflowGroup(render('land-rehearsal-r1'))).toMatch(
			/^land-rehearsal-r1-\$\{\{ /u,
		);
	});
});

describe('renderLandWorkflow setup', () => {
	/**
	 * Every job runs a repository script that imports the workspace packages
	 * (derived-push: derived-resolve.script.ts --phase=push; promote:
	 * open-promotion.script.ts; forward-sync: forward-sync-release.script.ts),
	 * so each needs the project's install and carries its setup steps.
	 */
	it('[<50ms] gives every job that runs a project script the project setup, derived-push, promote and forward-sync included', () => {
		const jobs = render()
			.split('\njobs:\n')[1]
			?.split(/^ {4}(?=[a-z-]+:$)/mu)
			.filter((job) => /^[a-z-]+:/u.test(job));
		expect(jobs?.map((job) => job.split(':')[0])).toEqual([
			'land',
			'derived-prepare',
			'derived-push',
			'promote',
			'forward-sync',
			'upkeep',
		]);
		for (const job of jobs ?? [])
			expect(job, job.split(':')[0]).toContain('- uses: checkout');
	});
});

const renderUpkeep = (reads: boolean): string =>
	renderLandWorkflow({
		integrationBranch: 'develop',
		releaseBranch: 'main',
		identity: DEFAULT_INTEGRATION_OPTIONS.identity,
		cron: '*/15 * * * *',
		passCommand: 'pass',
		upkeep: [
			{ name: 'writes', run: 'w' },
			{
				name: 'reads',
				run: 'r',
				...(reads
					? { readsWithWorkflowToken: ['security-events'] }
					: {}),
			},
		],
		setupSteps: ['- uses: checkout'],
	});

const upkeepJob = (text: string): string =>
	text.slice(text.indexOf('    upkeep:'));

describe('renderLandWorkflow upkeep reads', () => {
	it('[<50ms] gives a reading step the workflow token and the job exactly the reads it names', () => {
		const job = upkeepJob(renderUpkeep(true));
		const reading = job.slice(job.indexOf('- name: reads'));
		const writing = job.slice(
			job.indexOf('- name: writes'),
			job.indexOf('- name: reads'),
		);
		expect(reading).toContain('GH_TOKEN: ${{ github.token }}');
		expect(writing).toContain('steps.identity.outputs.token');
		expect(writing).not.toContain('github.token');
		const permissions = job.slice(
			job.indexOf('permissions:'),
			job.indexOf('steps:'),
		);
		expect(permissions.match(/: read/gu)).toHaveLength(5);
		expect(permissions).toContain('security-events: read');
		for (const name of ['contents', 'pull-requests', 'checks', 'actions'])
			expect(permissions).toContain(`${name}: read`);
	});

	it('[<50ms] renders no job-level permissions block when no step reads with the workflow token', () => {
		expect(upkeepJob(renderUpkeep(false))).not.toContain('permissions:');
	});
});

describe('renderLandWorkflow reconcile step', () => {
	const withReconcile = (command?: string): string =>
		renderLandWorkflow({
			integrationBranch: 'develop',
			releaseBranch: 'main',
			identity: DEFAULT_INTEGRATION_OPTIONS.identity,
			cron: '*/15 * * * *',
			passCommand: 'pass',
			...(command === undefined ? {} : { reconcileCommand: command }),
			setupSteps: ['- uses: checkout'],
		});
	const passJob = (text: string): string =>
		text.slice(
			text.indexOf('    land:'),
			text.indexOf('    upkeep:') === -1
				? undefined
				: text.indexOf('    upkeep:'),
		);

	it('[<50ms] runs the reconcile command after the pass, whatever the pass concluded, off the schedule', () => {
		const job = passJob(withReconcile('reconcile'));
		expect(job.indexOf('run: reconcile')).toBeGreaterThan(
			job.indexOf('run: pass'),
		);
		expect(job).toContain(
			"!cancelled() && github.event_name != 'schedule'",
		);
	});

	it('[<50ms] adds no step when the project names no reconcile command', () => {
		expect(withReconcile()).not.toContain('Reconcile the refs');
	});
});
