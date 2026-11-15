/**
 * integration-doctor.command.ts — `delendai integration doctor`: is the
 * integrator's identity ready, and the manifest of the App to create.
 *
 * It wires `gh` as the signed-in user to the doctor's probe. It reads
 * names and permission levels only; a token or a key is never read here.
 */
import { readWorkspacePolicy } from '@delendai/core/cli';
import {
	diagnoseIdentity,
	renderAppManifest,
	renderDoctorTable,
	type IIntegrationDoctorProbe,
	type IRehearsalCommandRunner,
} from '@delendai/integration/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';

const names = async (
	runGh: IRehearsalCommandRunner,
	kind: 'secret' | 'variable',
): Promise<readonly string[]> => {
	const out = await runGh([
		kind,
		'list',
		'--json',
		'name',
		'--jq',
		'.[].name',
	]);
	return out.exitCode === 0
		? out.stdout.split('\n').filter((name) => name !== '')
		: [];
};

const probeOf = (
	runGh: IRehearsalCommandRunner,
	repository: string,
): IIntegrationDoctorProbe => ({
	variables: () => names(runGh, 'variable'),
	secrets: () => names(runGh, 'secret'),
	installationPermissions: async () => {
		const out = await runGh([
			'api',
			`repos/${repository}/installation`,
			'--jq',
			'.permissions',
		]);
		if (out.exitCode !== 0)
			// Only an App's own credential may read an installation: a user's
			// gets 401/403 even for an installed App, and only 404 means absent.
			return /HTTP 404/u.test(out.stderr)
				? { status: 'not-installed' }
				: { status: 'unverifiable' };
		try {
			return {
				status: 'granted',
				permissions: JSON.parse(out.stdout) as Record<string, string>,
			};
		} catch {
			return { status: 'unverifiable' };
		}
	},
});

/** `integration doctor [--manifest]`: the checks, then the manifest; `--manifest` prints the manifest alone. */
export const runIntegrationDoctor = async (
	args: readonly string[],
	ctx: ICliCommandContext,
	runGh: IRehearsalCommandRunner,
): Promise<ICliCommandResult> => {
	const named = await runGh([
		'repo',
		'view',
		'--json',
		'nameWithOwner',
		'--jq',
		'.nameWithOwner',
	]);
	const repository = named.stdout.trim();
	if (named.exitCode !== 0 || repository === '')
		return {
			code: EXIT_CODE.RUNTIME,
			error: `gh could not name the repository: ${named.stderr.trim() || named.spawnError || 'no answer'}`,
		};
	const manifest = renderAppManifest({
		name: `${repository.split('/')[1] ?? 'project'}-integrator`,
		url: `https://github.com/${repository}`,
	});
	const manifestText = JSON.stringify(manifest, null, '\t');
	if (args.includes('--manifest'))
		return { code: EXIT_CODE.OK, data: manifest, text: manifestText };
	const { integration } = await readWorkspacePolicy(ctx.cwd);
	const report = await diagnoseIdentity(
		integration.identity,
		probeOf(runGh, repository),
	);
	return {
		code: report.ok ? EXIT_CODE.OK : EXIT_CODE.RUNTIME,
		data: { ...report, manifest },
		text: `${renderDoctorTable(report)}\n\nApp manifest (create the App from it once, install it on ${repository}, then add its id as a variable and its key as a secret):\n${manifestText}`,
	};
};
