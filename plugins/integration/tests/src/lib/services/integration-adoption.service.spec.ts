import { describe, expect, it } from 'vitest';

import { renderAdoption } from '../../../../src/lib/services/integration-adoption.service';

/** A project that is not this one: integration branch `main`, its own CI jobs. */
const FIXTURE = {
	integrationBranch: 'main',
	releaseBranch: 'stable',
	identity: {
		kind: 'app',
		appIdVariable: 'ACME_APP_ID',
		keySecret: 'ACME_APP_KEY',
		tokenSecret: 'ACME_PAT',
	},
	cron: '23 * * * *',
	requiredJobs: ['build', 'unit-tests'],
	version: '9.9.9',
} as const;

const ALL = (): string =>
	renderAdoption(FIXTURE)
		.files.map((file) => file.content ?? '')
		.concat(renderAdoption(FIXTURE).signalJob)
		.join('\n');

describe('integration adoption', () => {
	it('[<20ms] renders the integrator and the rehearsal from the project policy', () => {
		const { files } = renderAdoption(FIXTURE);
		expect(files.map((file) => file.path)).toEqual([
			'.github/workflows/land.yml',
			'.github/workflows/rehearsal.yml',
		]);
		const land = files[0]?.content ?? '';
		expect(land).toContain('branches: [main]');
		expect(land).toContain('vars.ACME_APP_ID');
		expect(land).toContain(
			'npx --yes @delendai/cli@9.9.9 integration pass',
		);
	});

	it('[<20ms] makes the signal job wait on the project own jobs and wake the integrator', () => {
		const { signalJob } = renderAdoption(FIXTURE);
		expect(signalJob).toContain('needs: [build, unit-tests]');
		expect(signalJob).toContain("github.ref == 'refs/heads/main'");
		expect(signalJob).toContain('gh workflow run land.yml');
	});

	it('[<20ms] names no path, script, action or proposal of this repository', () => {
		const text = ALL();
		expect(text).not.toMatch(
			/tools\/scripts|setup-bun-repo|\bbun\b|forge:/u,
		);
		expect(text).not.toMatch(/\b[qxfva]\d{5}\b/u);
		expect(text).not.toMatch(/\.github\/actions|delendai\/pr\//u);
		// The only delendai names are the version pin and the tool's own command.
		const names = text.match(/delendai[^\s'"`,)]*/giu) ?? [];
		for (const name of names)
			expect(name).toMatch(
				/^(delendai\/cli@9\.9\.9|delendai-integrator|delendai:)/iu,
			);
	});
});
