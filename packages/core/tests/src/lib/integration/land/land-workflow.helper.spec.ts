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

const groups = (text: string): string[] =>
	[...text.matchAll(/^ {12}group: (.+)$/gmu)].map((m) => m[1] ?? '');

describe('renderLandWorkflow concurrency', () => {
	it('has no workflow-level concurrency, so a skipped job cannot displace a pending pass', () => {
		expect(render()).not.toMatch(/^concurrency:/mu);
	});

	it('gives every job its own group, the pass keeping the base name', () => {
		const text = render();
		const jobCount = [
			...(text.split('\njobs:\n')[1] ?? '').matchAll(/^ {4}[a-z-]+:$/gmu),
		].length;
		expect(groups(text)).toEqual([
			'land',
			'land-derived-prepare',
			'land-derived-push',
			'land-promote',
			'land-forward-sync',
			'land-upkeep',
		]);
		expect(groups(text)).toHaveLength(jobCount);
		expect(text.match(/cancel-in-progress: false/gu)).toHaveLength(6);
	});

	it('derives the groups from the named concurrency group', () => {
		expect(groups(render('land-rehearsal-r1'))[0]).toBe(
			'land-rehearsal-r1',
		);
		expect(groups(render('land-rehearsal-r1'))[3]).toBe(
			'land-rehearsal-r1-promote',
		);
	});
});
