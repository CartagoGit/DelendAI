/**
 * integration-activation.command.ts — `delendai integration activate`,
 * `deactivate` and `resume`: the engine switch as product code. They wire
 * `gh` (as the signed-in user), the project's config and its workflow
 * files to the plugin's services; none of them commits or pushes.
 */
import {
	access,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseJsonc, readWorkspacePolicy } from '@delendai/core/cli';
import {
	REHEARSAL_CATALOGUE,
	REHEARSAL_KNOWN_RED,
	activateIntegration,
	createGithubRehearsalForge,
	createGithubResumeForge,
	createRehearsalEvidence,
	deactivateIntegration,
	renderAdoption,
	resumeIntegration,
	scenariosForMode,
	type IActivationFile,
	type IActivationPorts,
	type IDoctorReport,
	type IRehearsalCommandRunner,
} from '@delendai/integration/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import { CLI_VERSION } from '../contracts/constants/version.constant';
import type {
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';

import { runIntegrationDoctor } from './integration-doctor.command';
import { repositorySlugOf } from './integration-repository.helper';

const CONFIG_FILE = 'delendai.config.json';
/** A project that generates its own land workflow says how here; every other project gets the generic one. */
const PROJECT_GENERATOR = 'tools/scripts/forge/land-workflow.script.ts';
const GENERIC_PATHS = [
	'.github/workflows/land.yml',
	'.github/workflows/land-signal.yml',
];

/** The report file inside a downloaded artifact: the one JSON file it holds. */
const downloadReport = async (
	runGh: IRehearsalCommandRunner,
	slug: string,
	runId: number,
	artifact: string,
): Promise<string | undefined> => {
	const dir = await mkdtemp(join(tmpdir(), 'delendai-rehearsal-'));
	try {
		const out = await runGh([
			'run',
			'download',
			String(runId),
			'--repo',
			slug,
			'--name',
			artifact,
			'--dir',
			dir,
		]);
		if (out.exitCode !== 0)
			throw new Error(
				`the artifact ${artifact} of run ${String(runId)} could not be downloaded: ${out.stderr.trim() || out.spawnError || 'no answer'}`,
			);
		const file = (await readdir(dir)).find((name) =>
			name.endsWith('.json'),
		);
		return file === undefined
			? undefined
			: await readFile(join(dir, file), 'utf8');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};

const engineOfText = (text: string): unknown => {
	const { value } = parseJsonc(text);
	const integration = (value as { development?: { integration?: unknown } })
		?.development?.integration as { engine?: unknown } | undefined;
	return integration?.engine;
};

/** The workflow files a config text implies: the project's own generator when it has one, else the generic render. */
export const renderWorkflows = async (
	cwd: string,
	configText: string,
): Promise<readonly IActivationFile[]> => {
	const generator = join(cwd, PROJECT_GENERATOR);
	const hasGenerator = await access(generator).then(
		() => true,
		() => false,
	);
	if (hasGenerator) {
		const mod = (await import(pathToFileURL(generator).href)) as {
			landWorkflowFilesOf: (text: string) => readonly {
				readonly path: string;
				readonly expected: string | undefined;
			}[];
		};
		return mod
			.landWorkflowFilesOf(configText)
			.map(({ path, expected }) => ({ path, content: expected }));
	}
	const policy = await readWorkspacePolicy(cwd);
	// the engine comes from the text being switched to: the file on disk still holds the old one
	if (engineOfText(configText) !== 'land')
		return GENERIC_PATHS.map((path) => ({ path, content: undefined }));
	const adoption = renderAdoption({
		integrationBranch: policy.branches.integration,
		releaseBranch: policy.branches.release,
		identity: policy.integration.identity,
		cron: policy.integration.watchdog.cron,
		requiredJobs: policy.integration.requiredChecks,
		version: CLI_VERSION,
	});
	return adoption.files
		.filter((file) => GENERIC_PATHS.includes(file.path))
		.map((file) => ({
			path: file.path,
			content: file.content ?? undefined,
		}));
};

const portsOf = (
	ctx: ICliCommandContext,
	runGh: IRehearsalCommandRunner,
	slug: string,
	policy: Awaited<ReturnType<typeof readWorkspacePolicy>>,
): IActivationPorts => {
	const forge = createGithubRehearsalForge({
		slug,
		run: runGh,
		wait: (ms) => new Promise((done) => setTimeout(done, ms)),
	});
	const evidence = createRehearsalEvidence({
		slug,
		run: runGh,
		download: (runId, artifact) =>
			downloadReport(runGh, slug, runId, artifact),
	});
	return {
		tipOf: () => forge.tipOf(policy.branches.integration),
		reportOf: evidence.reportOf,
		knownRed: REHEARSAL_KNOWN_RED,
		scenarioIds: {
			fast: scenariosForMode(REHEARSAL_CATALOGUE, 'fast').map(
				(s) => s.id,
			),
			real: scenariosForMode(REHEARSAL_CATALOGUE, 'real').map(
				(s) => s.id,
			),
		},
		doctor: async () => {
			const out = await runIntegrationDoctor([], ctx, runGh);
			if (out.error !== undefined) throw new Error(out.error);
			return out.data as IDoctorReport;
		},
		readConfig: () => readFile(join(ctx.cwd, CONFIG_FILE), 'utf8'),
		writeConfig: (text) => writeFile(join(ctx.cwd, CONFIG_FILE), text),
		renderWorkflows: (text) => renderWorkflows(ctx.cwd, text),
		readWorkflow: async (path) => {
			try {
				return await readFile(join(ctx.cwd, path), 'utf8');
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT')
					return undefined;
				throw error;
			}
		},
		writeWorkflow: async (path, content) => {
			await mkdir(dirname(join(ctx.cwd, path)), { recursive: true });
			await writeFile(join(ctx.cwd, path), content);
		},
		removeWorkflow: (path) => rm(join(ctx.cwd, path), { force: true }),
	};
};

const runtimeFailure = (error: unknown): ICliCommandResult => ({
	code: EXIT_CODE.RUNTIME,
	error: error instanceof Error ? error.message : String(error),
});

/** `integration activate`: switch the engine on, or refuse listing every reason. */
export const runIntegrationActivate = async (
	ctx: ICliCommandContext,
	runGh: IRehearsalCommandRunner,
): Promise<ICliCommandResult> => {
	try {
		const repository = await repositorySlugOf(runGh);
		if ('error' in repository)
			return { code: EXIT_CODE.RUNTIME, error: repository.error };
		const policy = await readWorkspacePolicy(ctx.cwd);
		const result = await activateIntegration(
			portsOf(ctx, runGh, repository.slug, policy),
		);
		if (result.refusals.length > 0)
			return {
				code: EXIT_CODE.RUNTIME,
				data: result,
				error: `activation refused:\n${result.refusals.map((reason) => `- ${reason}`).join('\n')}`,
			};
		return {
			code: EXIT_CODE.OK,
			data: result,
			text: `engine land written to ${CONFIG_FILE}; wrote ${result.changed.join(', ')}. Commit them in a work unit and publish it as a pull request: nothing was committed or pushed.`,
		};
	} catch (error) {
		return runtimeFailure(error);
	}
};

/** `integration deactivate`: engine none, and the generated workflows removed. */
export const runIntegrationDeactivate = async (
	ctx: ICliCommandContext,
	runGh: IRehearsalCommandRunner,
): Promise<ICliCommandResult> => {
	try {
		const repository = await repositorySlugOf(runGh);
		if ('error' in repository)
			return { code: EXIT_CODE.RUNTIME, error: repository.error };
		const policy = await readWorkspacePolicy(ctx.cwd);
		const result = await deactivateIntegration(
			portsOf(ctx, runGh, repository.slug, policy),
		);
		return {
			code: EXIT_CODE.OK,
			data: result,
			text: `engine none written to ${CONFIG_FILE}; removed ${result.changed.join(', ')}. Nothing was committed or pushed.`,
		};
	} catch (error) {
		return runtimeFailure(error);
	}
};

/** `integration resume`: ready every paused pull request into the integration branch and drop its label. */
export const runIntegrationResume = async (
	ctx: ICliCommandContext,
	runGh: IRehearsalCommandRunner,
): Promise<ICliCommandResult> => {
	try {
		const policy = await readWorkspacePolicy(ctx.cwd);
		if (policy.integration.engine === 'none')
			return {
				code: EXIT_CODE.RUNTIME,
				error: 'the engine is none: nothing would land the resumed pull requests. Run `integration activate` and merge it first.',
			};
		const repository = await repositorySlugOf(runGh);
		if ('error' in repository)
			return { code: EXIT_CODE.RUNTIME, error: repository.error };
		const resumed = await resumeIntegration({
			forge: createGithubResumeForge({
				slug: repository.slug,
				run: runGh,
			}),
			base: policy.branches.integration,
			prefix: policy.integration.labels.prefix,
		});
		return {
			code: EXIT_CODE.OK,
			data: { resumed },
			text:
				resumed.length === 0
					? 'no paused pull request to resume'
					: `marked ready and unlabelled: ${resumed.map((number) => `#${String(number)}`).join(', ')}`,
		};
	} catch (error) {
		return runtimeFailure(error);
	}
};
