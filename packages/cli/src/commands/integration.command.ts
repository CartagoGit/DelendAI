/**
 * integration.command.ts — `delendai integration rehearse`, `doctor`, `adopt` and `pass`.
 *
 * It only wires ports: `gh` as the signed-in user, the real clock, the
 * project's policy and files. The rehearsal itself, its scenarios and its
 * report live in the integration plugin.
 */
import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import {
	ownedRehearsalPrefixes,
	readWorkspacePolicy,
	scalarArg,
} from '@delendai/core/cli';
import {
	REHEARSAL_ALL_SCENARIOS,
	createGithubRehearsalForge,
	createRehearsalSetup,
	REHEARSAL_REAL_CI_FILE,
	REHEARSAL_REAL_SCAN_FILE,
	landIntegratorWorkflow,
	REHEARSAL_CATALOGUE,
	rehearse,
	renderReportTable,
	sweepStaleRuns,
	rehearsalGroupReportPath,
	rehearsalReportPath,
	scenariosForMode,
	selectScenarios,
	type IRehearsalCommandResult,
	type IRehearsalMode,
	type IRehearsalScenario,
	type IRehearsalCommandRunner,
	type IRehearsalReport,
} from '@delendai/integration/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import {
	INTEGRATION_COMMAND,
	INTEGRATION_REHEARSAL_MODES,
} from '../contracts/constants/integration-command.constant';
import type {
	ICliCommand,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';

import {
	runIntegrationActivate,
	runIntegrationDeactivate,
	runIntegrationResume,
} from './integration-activation.command';
import {
	chooseGroup,
	mergeGroups,
	planGroups,
} from './integration-rehearsal-groups.command';
import { runIntegrationAdopt } from './integration-adopt.command';
import { runIntegrationDoctor } from './integration-doctor.command';
import { runIntegrationPassCommand } from './integration-pass.command';
import { createSetupMaterialiser } from './integration-rehearsal-setup.helper';
import { repositorySlugOf } from './integration-repository.helper';
import { usage } from './groups/group-helpers';

/**
 * Whether the run exits 0. A played group is judged by its scenarios and the
 * secret scan; the targets belong to the whole mode, which `--merge` judges.
 */
export const rehearsalExitOk = (
	report: Pick<IRehearsalReport, 'ok' | 'scenarios' | 'secretHits'>,
	group: number | undefined,
): boolean =>
	group === undefined
		? report.ok
		: report.scenarios.every((scenario) => scenario.ok) &&
			report.secretHits.length === 0;

const USAGE = `integration doctor [--manifest] | integration pass | integration activate | integration deactivate | integration resume | integration adopt [--needs=<job,job>] | integration rehearse [--mode=${INTEGRATION_REHEARSAL_MODES.join('|')}] [--scenarios=<id,id|${REHEARSAL_ALL_SCENARIOS}>] [--base=<sha|ref>] [--concurrency=<n>] [--group=<n>/<total>] [--plan] [--merge] [--sweep]`;

/** `gh` as whoever is signed in; a token is never read or passed here. */
const execFileAsync = promisify(execFile);

/** The commit a rehearsal tests: `base` when given, else the checkout's HEAD, which is the code that runs. */
export const commitUnderTest = async (
	cwd: string,
	base: string | undefined,
): Promise<string> =>
	(
		await execFileAsync(
			'git',
			['rev-parse', '--verify', `${base ?? 'HEAD'}^{commit}`],
			{ cwd },
		)
	).stdout.trim();

const spawnGh = (
	args: readonly string[],
	input?: string,
): Promise<IRehearsalCommandResult> =>
	new Promise((resolve) => {
		const child = spawn('gh', [...args], {
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk: Buffer) => (stdout += String(chunk)));
		child.stderr.on('data', (chunk: Buffer) => (stderr += String(chunk)));
		child.on('error', (error) =>
			resolve({ stdout, stderr, spawnError: error.message }),
		);
		child.on('close', (exitCode) =>
			resolve({ exitCode: exitCode ?? undefined, stdout, stderr }),
		);
		// A gh that exits (or never starts) before reading its input is its answer, not a crash.
		child.stdin.on('error', () => undefined);
		child.stdin.end(input ?? '');
	});

/** The project's CI and scan workflows, by file name, for a real-mode rehearsal. */
const REAL_WORKFLOW_FILES = [
	REHEARSAL_REAL_CI_FILE,
	REHEARSAL_REAL_SCAN_FILE,
] as const;
const readRealWorkflows = async (
	cwd: string,
): Promise<Record<string, string>> =>
	Object.fromEntries(
		await Promise.all(
			REAL_WORKFLOW_FILES.map(
				async (name) =>
					[
						name,
						await readFile(
							join(cwd, '.github', 'workflows', name),
							'utf8',
						),
					] as const,
			),
		),
	);

const isRehearsalMode = (mode: string): mode is IRehearsalMode =>
	(INTEGRATION_REHEARSAL_MODES as readonly string[]).includes(mode);

/** The command over the program that runs `gh`; the real one spawns it, a spec gives it answers. */
export const createIntegrationCommand = (
	runGh: IRehearsalCommandRunner,
	commitOf: typeof commitUnderTest = commitUnderTest,
): ICliCommand => ({
	name: 'integration',
	...INTEGRATION_COMMAND,
	async run(args, ctx): Promise<ICliCommandResult> {
		const [sub, ...rest] = args;
		if (sub === 'doctor') return runIntegrationDoctor(rest, ctx, runGh);
		if (sub === 'adopt') return runIntegrationAdopt(rest, ctx);
		if (sub === 'activate') return runIntegrationActivate(ctx, runGh);
		if (sub === 'deactivate') return runIntegrationDeactivate(ctx, runGh);
		if (sub === 'resume') return runIntegrationResume(ctx, runGh);
		if (sub === 'pass') return runIntegrationPassCommand(ctx, runGh);
		if (sub !== 'rehearse') return usage(USAGE);
		const mode = scalarArg(rest, 'mode') ?? 'fast';
		if (!isRehearsalMode(mode)) return usage(USAGE);
		const ids = (scalarArg(rest, 'scenarios') ?? REHEARSAL_ALL_SCENARIOS)
			.split(',')
			.filter((id) => id !== '');
		let selected: readonly IRehearsalScenario[];
		try {
			selected = selectScenarios(
				scenariosForMode(REHEARSAL_CATALOGUE, mode),
				ids,
				REHEARSAL_ALL_SCENARIOS,
			);
		} catch (error) {
			return {
				code: EXIT_CODE.RUNTIME,
				error: error instanceof Error ? error.message : String(error),
			};
		}
		if (rest.includes('--plan')) return planGroups(mode, selected);
		if (rest.includes('--merge'))
			return mergeGroups(ctx.cwd, mode, selected);
		const choice = chooseGroup(
			scalarArg(rest, 'group'),
			mode,
			selected,
			USAGE,
		);
		if ('refusal' in choice) return choice.refusal;
		const concurrencyArg = scalarArg(rest, 'concurrency');
		if (concurrencyArg !== undefined && !/^[1-9]\d*$/u.test(concurrencyArg))
			return usage(USAGE);
		const named = await repositorySlugOf(runGh);
		if ('error' in named)
			return { code: EXIT_CODE.RUNTIME, error: named.error };
		const repository = named.slug;
		const policy = await readWorkspacePolicy(ctx.cwd);
		// Every scenario of the group plays at once; the policy's number only ever lowers that.
		const concurrency = Math.min(
			concurrencyArg === undefined
				? policy.integration.rehearsal.concurrency
				: Number(concurrencyArg),
			choice.scenarios.length,
		);
		const policyText = await readFile(
			join(ctx.cwd, 'delendai.config.json'),
			'utf8',
		);
		const realWorkflows =
			mode === 'real' ? await readRealWorkflows(ctx.cwd) : undefined;
		const branchPrefix = ownedRehearsalPrefixes(policy.branches)[0] ?? '';
		const clock = {
			now: () => Date.now(),
			wait: (ms: number) =>
				new Promise<void>((done) => setTimeout(done, ms)),
		};
		if (rest.includes('--sweep')) {
			// The workflow's last step, run even when the job timed out: only one rehearsal runs at a time, so every root left is dead.
			const swept = await sweepStaleRuns({
				forge: createGithubRehearsalForge({
					slug: repository,
					run: runGh,
					wait: clock.wait,
				}),
				clock,
				branchPrefix,
				now: clock.now(),
				// Alone, every root left is dead; as a group, only its own and the stale ones are.
				...(choice.n === undefined
					? { olderThanMs: 0 }
					: { ownGroup: choice.n }),
			});
			return {
				code: EXIT_CODE.OK,
				text: `swept ${String(swept.length)} run(s) of leftovers${swept.map((id) => ` ${id}`).join('')}`,
			};
		}
		try {
			const baseCommit = await commitOf(ctx.cwd, scalarArg(rest, 'base'));
			const report = await rehearse({
				forge: createGithubRehearsalForge({
					slug: repository,
					run: runGh,
					wait: clock.wait,
				}),
				clock,
				setup: (runId) =>
					createRehearsalSetup({
						runId,
						branchPrefix,
						policyText,
						...(realWorkflows === undefined
							? {}
							: {
									realWorkflows,
									projectIntegration:
										policy.branches.integration,
									setupCommand:
										policy.integration.rehearsal
											.setupCommand,
									materialise: createSetupMaterialiser(
										ctx.cwd,
										baseCommit,
									),
								}),
						integratorWorkflow: (integration, concurrencyGroup) =>
							landIntegratorWorkflow(
								integration,
								concurrencyGroup,
								{
									releaseBranch: policy.branches.release,
									passCommand:
										'bun tools/scripts/forge/land.script.ts',
									identity: policy.integration.identity,
								},
							),
					}),
				repository,
				branchPrefix,
				baseBranch: policy.branches.integration,
				baseCommit,
				mode,
				scenarios: choice.scenarios,
				...(choice.n === undefined ? {} : { group: choice.n }),
				concurrency,
				log: (line) => process.stderr.write(`${line}\n`),
			});
			const reportFile = join(
				ctx.cwd,
				choice.n === undefined
					? rehearsalReportPath(mode)
					: rehearsalGroupReportPath(mode, choice.n),
			);
			await mkdir(dirname(reportFile), { recursive: true });
			await writeFile(reportFile, JSON.stringify(report, null, '\t'));
			return {
				code: rehearsalExitOk(report, choice.n)
					? EXIT_CODE.OK
					: EXIT_CODE.RUNTIME,
				data: report,
				text: renderReportTable(report),
			};
		} catch (error) {
			return {
				code: EXIT_CODE.RUNTIME,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
});

export const integrationCommand = createIntegrationCommand(spawnGh);
