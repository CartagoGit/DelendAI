/**
 * land-checkout-credentials.spec.ts — the land workflows a rehearsal and an
 * adopting project render keep no workflow token in their clone, so every
 * push must authenticate as the identity.
 */
import { DEFAULT_INTEGRATION_OPTIONS } from '@delendai/core/cli';
import { describe, expect, it } from 'vitest';

import { renderAdoption } from '../../../../src/lib/services/integration-adoption.service';
import { landIntegratorWorkflow } from '../../../../src/lib/services/rehearsal-setup.helper';

const kept = (text: string): number =>
	text.split('\n').filter((line) => /persist-credentials/u.test(line)).length;

describe('the rendered land workflows', () => {
	it('[<20ms] drop the credential on every checkout of a rehearsal', () => {
		const text = landIntegratorWorkflow('ns/i', 'group', {
			releaseBranch: 'main',
			passCommand: 'pass',
			identity: DEFAULT_INTEGRATION_OPTIONS.identity,
		});
		// Both setup steps of every job carry it.
		expect(kept(text)).toBe(
			text
				.split('\n')
				.filter(
					(l) =>
						l.includes('uses: actions/checkout') ||
						l.includes('setup-bun-repo'),
				).length,
		);
		expect(text).not.toMatch(/persist-credentials: true/u);
	});

	it('[<20ms] drop the credential on the checkout an adopting project gets', () => {
		const land = renderAdoption({
			integrationBranch: 'develop',
			releaseBranch: 'main',
			identity: DEFAULT_INTEGRATION_OPTIONS.identity,
			cron: '0 * * * *',
			requiredJobs: ['ci'],
			version: '1.0.0',
		}).files.find((file) => file.path.endsWith('land.yml'));
		expect(land?.content).toContain('persist-credentials: false');
	});
});
