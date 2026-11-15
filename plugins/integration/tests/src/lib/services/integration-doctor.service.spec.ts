import { describe, expect, it } from 'vitest';

import type { IIntegrationDoctorProbe } from '../../../../src/lib/contracts/interfaces/integration-doctor.interface';
import {
	diagnoseIdentity,
	renderAppManifest,
	renderDoctorTable,
} from '../../../../src/lib/services/integration-doctor.service';

const app = {
	kind: 'app',
	appIdVariable: 'APP_ID',
	keySecret: 'APP_KEY',
	tokenSecret: 'TOKEN',
} as const;

const GOOD = {
	contents: 'write',
	pull_requests: 'write',
	issues: 'write',
	actions: 'write',
	workflows: 'write',
	checks: 'read',
};

const probe = (
	over: Partial<IIntegrationDoctorProbe> = {},
): IIntegrationDoctorProbe => ({
	variables: async () => ['APP_ID'],
	secrets: async () => ['APP_KEY'],
	installationPermissions: async () => ({
		status: 'granted',
		permissions: GOOD,
	}),
	...over,
});

describe('the integration doctor', () => {
	it('[<50ms] is green when the variable, the secret and every permission are there', async () => {
		const report = await diagnoseIdentity(app, probe());
		expect(report.ok).toBe(true);
		expect(renderDoctorTable(report)).toContain('doctor: green');
	});

	it('[<50ms] refuses when the App id, the key or the permissions are missing', async () => {
		const report = await diagnoseIdentity(
			app,
			probe({
				variables: async () => [],
				secrets: async () => [],
				installationPermissions: async () => ({
					status: 'granted',
					permissions: { ...GOOD, workflows: 'read', checks: 'none' },
				}),
			}),
		);
		expect(report.ok).toBe(false);
		const failed = report.checks.filter((c) => !c.ok).map((c) => c.name);
		expect(failed).toEqual([
			'variable APP_ID',
			'secret APP_KEY',
			'app permission workflows',
			'app permission checks',
		]);
		expect(renderDoctorTable(report)).toContain('NOT green');
	});

	it('[<50ms] refuses an App that is not installed', async () => {
		const report = await diagnoseIdentity(
			app,
			probe({
				installationPermissions: async () => ({
					status: 'not-installed',
				}),
			}),
		);
		expect(report.ok).toBe(false);
		expect(report.checks.at(-1)?.name).toBe('app permissions');
	});

	it('[<50ms] does not fail on an installation the credential cannot read', async () => {
		const report = await diagnoseIdentity(
			app,
			probe({
				installationPermissions: async () => ({
					status: 'unverifiable',
				}),
			}),
		);
		expect(report.ok).toBe(true);
		expect(report.checks.at(-1)?.detail).toContain('cannot be verified');
	});

	it('[<50ms] needs only the token secret for a personal access token', async () => {
		const pat = { ...app, kind: 'pat' } as const;
		expect(
			(
				await diagnoseIdentity(
					pat,
					probe({ secrets: async () => ['TOKEN'] }),
				)
			).ok,
		).toBe(true);
		expect((await diagnoseIdentity(pat, probe())).ok).toBe(false);
	});

	it('[<50ms] renders the manifest with the permissions the integrator needs and no webhook', () => {
		const manifest = renderAppManifest({
			name: 'x-integrator',
			url: 'https://u',
		});
		expect(manifest.default_permissions).toEqual({
			contents: 'write',
			pull_requests: 'write',
			issues: 'write',
			actions: 'write',
			workflows: 'write',
			checks: 'read',
		});
		expect(manifest.hook_attributes.active).toBe(false);
		expect(manifest.public).toBe(false);
	});
});
