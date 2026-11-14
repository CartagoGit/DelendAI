/**
 * integration.command.ts — `delendai integration rehearse`, `doctor`, `adopt` and `pass`.
 *
 * It only wires ports: `gh` as the signed-in user, the real clock, the
 * project's policy and files. The rehearsal itself, its scenarios and its
 * report live in the integration plugin.
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	ownedRehearsalPrefixes,
	readWorkspacePolicy,
	scalarArg,
} from '@delendai/core/cli';
import {
	REHEARSAL_ALL_SCENARIOS,
	createGithubRehearsalForge,
	createRehearsalSetup,
	landIntegratorWorkflow,
	REHEARSAL_CATALOGUE,
	rehearse,
	renderReportTable,
	selectScenarios,
	type IRehearsalCommandResult,
	type IRehearsalCommandRunner,
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

import { runIntegrationAdopt } from './integration-adopt.command';
import { runIntegrationDoctor } from './integration-doctor.command';
import { runIntegrationPassCommand } from './integration-pass.command';
import { usage } from './groups/group-helpers';

const USAGE = `integration doctor [--manifest] | integration pass | integration adopt [--needs=<job,job>] | integration rehearse [--mode=${INTEGRATION_REHEARSAL_MODES.join('|')}] [--scenarios=<id,id|${REHEARSAL_ALL_SCENARIOS}>]`;

/** `gh` as whoever is signed in; a token is never read or passed here. */
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
		child.stdin.end(input ?? '');
	});

/** The project's CI and scan workflows, by file name, for a real-mode rehearsal. */
const REAL_WORKFLOW_FILES = ['ci.yml', 'codeql.yml'] as const;
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

/** The command over the program that runs `gh`; the real one spawns it, a spec gives it answers. */
export const createIntegrationCommand = (
	runGh: IRehearsalCommandRunner,
): ICliCommand => ({
	name: 'integration',
	...INTEGRATION_COMMAND,
	async run(args, ctx): Promise<ICliCommandResult> {
		const [sub, ...rest] = args;
		if (sub === 'doctor') return runIntegrationDoctor(rest, ctx, runGh);
		if (sub === 'adopt') return runIntegrationAdopt(rest, ctx);
		if (sub === 'pass') return runIntegrationPassCommand(ctx, runGh);
		if (sub !== 'rehearse') return usage(USAGE);
		const mode = scalarArg(rest, 'mode') ?? 'fast';
		if (!(INTEGRATION_REHEARSAL_MODES as readonly string[]).includes(mode))
			return usage(USAGE);
		const ids = (scalarArg(rest, 'scenarios') ?? REHEARSAL_ALL_SCENARIOS)
			.split(',')
			.filter((id) => id !== '');
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
		const policy = await readWorkspacePolicy(ctx.cwd);
		const policyText = await readFile(
			join(ctx.cwd, 'delendai.config.json'),
			'utf8',
		);
		const realWorkflows =
			mode === 'real' ? await readRealWorkflows(ctx.cwd) : undefined;
		const branchPrefix = ownedRehearsalPrefixes(policy.branches)[0] ?? '';
		try {
			const report = await rehearse({
				forge: createGithubRehearsalForge({
					slug: repository,
					run: runGh,
				}),
				clock: {
					now: () => Date.now(),
					wait: (ms) => new Promise((done) => setTimeout(done, ms)),
				},
				setup: (runId) =>
					createRehearsalSetup({
						runId,
						branchPrefix,
						policyText,
						...(realWorkflows === undefined
							? {}
							: { realWorkflows }),
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
				scenarios: selectScenarios(
					REHEARSAL_CATALOGUE,
					ids,
					REHEARSAL_ALL_SCENARIOS,
				),
				log: (line) => process.stderr.write(`${line}\n`),
			});
			return {
				code: report.ok ? EXIT_CODE.OK : EXIT_CODE.RUNTIME,
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
