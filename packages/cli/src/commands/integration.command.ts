/**
 * integration.command.ts — `delendai integration rehearse`.
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

import { usage } from './groups/group-helpers';

const USAGE = `integration rehearse [--mode=${INTEGRATION_REHEARSAL_MODES.join('|')}] [--scenarios=<id,id|${REHEARSAL_ALL_SCENARIOS}>]`;

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

/** The command over the program that runs `gh`; the real one spawns it, a spec gives it answers. */
export const createIntegrationCommand = (
	runGh: IRehearsalCommandRunner,
): ICliCommand => ({
	name: 'integration',
	...INTEGRATION_COMMAND,
	async run(args, ctx): Promise<ICliCommandResult> {
		const [sub, ...rest] = args;
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
						integratorWorkflow: (integration) =>
							landIntegratorWorkflow(integration, {
								releaseBranch: policy.branches.release,
								passCommand:
									'bun tools/scripts/forge/land.script.ts',
							}),
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
