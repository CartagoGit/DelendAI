/**
 * integration-doctor.service.ts — is the integrator's identity ready, and
 * what must the owner create once if it is not.
 *
 * The doctor reads names and permission levels from the forge through an
 * injected probe; it never reads, prints or needs a token or a key.
 */
import {
	APP_MANIFEST_BASE,
	APP_READ_PERMISSIONS,
	APP_WRITE_PERMISSIONS,
} from '../contracts/constants/integration-doctor.constant';
import type {
	IAppManifest,
	IDoctorCheck,
	IDoctorIdentity,
	IDoctorReport,
	IIntegrationDoctorProbe,
} from '../contracts/interfaces/integration-doctor.interface';

/** The manifest of the App the integrator acts as; install it once per repository. */
export const renderAppManifest = (input: {
	readonly name: string;
	readonly url: string;
}): IAppManifest => ({
	name: input.name,
	url: input.url,
	...APP_MANIFEST_BASE,
	default_permissions: {
		...Object.fromEntries(APP_WRITE_PERMISSIONS.map((p) => [p, 'write'])),
		...Object.fromEntries(APP_READ_PERMISSIONS.map((p) => [p, 'read'])),
	},
});

const present = (
	label: string,
	name: string,
	names: readonly string[],
): IDoctorCheck => ({
	name: `${label} ${name}`,
	ok: names.includes(name),
	detail: names.includes(name)
		? 'set'
		: `missing: add ${label} \`${name}\` to the repository`,
});

const permissionChecks = (
	granted: Readonly<Record<string, string>> | undefined,
): readonly IDoctorCheck[] => {
	if (granted === undefined)
		return [
			{
				name: 'app permissions',
				ok: false,
				detail: 'cannot be read: install the App on this repository, then run the doctor again',
			},
		];
	const need = [
		...APP_WRITE_PERMISSIONS.map((p) => [p, 'write'] as const),
		...APP_READ_PERMISSIONS.map((p) => [p, 'read'] as const),
	];
	return need.map(([permission, level]) => {
		const have = granted[permission];
		const ok = have === 'write' || (level === 'read' && have === 'read');
		return {
			name: `app permission ${permission}`,
			ok,
			detail: ok ? have : `needs ${level}, has ${have ?? 'none'}`,
		};
	});
};

/** Every check of the identity the policy names; the report is green only when all pass. */
export const diagnoseIdentity = async (
	identity: IDoctorIdentity,
	probe: IIntegrationDoctorProbe,
): Promise<IDoctorReport> => {
	const secrets = await probe.secrets();
	const checks: IDoctorCheck[] =
		identity.kind === 'pat'
			? [present('secret', identity.tokenSecret, secrets)]
			: [
					present(
						'variable',
						identity.appIdVariable,
						await probe.variables(),
					),
					present('secret', identity.keySecret, secrets),
					...permissionChecks(await probe.installationPermissions()),
				];
	return { ok: checks.every((check) => check.ok), checks };
};

/** A short table of the checks, one line each. */
export const renderDoctorTable = (report: IDoctorReport): string =>
	[
		...report.checks.map(
			(check) =>
				`${check.ok ? 'ok  ' : 'FAIL'} ${check.name}: ${check.detail}`,
		),
		report.ok
			? 'doctor: green'
			: 'doctor: NOT green, activation is refused',
	].join('\n');
