/**
 * integration-pass.service.ts — one `land` pass, composed from the
 * development policy and the ports a project can name. `delendai
 * integration pass` and this repository's own script both call it, so the
 * same inputs make the same pass. Core owns the decisions; this only wires.
 */
// effect-boundary-authorized: runs the project's own commands, the one port that spawns for the pass
import { spawnSync } from 'node:child_process';

import {
	createGithubLandForge,
	integrationProtocolRefusal,
	LAND_WORKFLOW_FILE,
	landConfigFromPolicy,
	landPass,
} from '@delendai/core/cli';

import { LAND_REMOTE } from '../contracts/constants/integration-pass.constant';
import type {
	IIntegrationPassInput,
	IProjectCommandRunner,
} from '../contracts/interfaces/integration-pass.interface';

import { createBringForward } from './land-bring-forward.helper';
import { createLandGit } from './land-git.service';
import { landProjectPorts } from './land-project-ports.helper';
import { runGit } from './land-train-assembly.helper';

/** A project's command line through the shell, in `cwd`, with no input. */
export const runProjectCommand: IProjectCommandRunner = (cwd, commandLine) => {
	const done = spawnSync(commandLine, {
		cwd,
		shell: true,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
		timeout: 600_000,
	});
	return { ok: done.status === 0, stdout: done.stdout ?? '' };
};

/** Runs one pass; the exit code the process should end with. */
export const runIntegrationPass = async (
	input: IIntegrationPassInput,
): Promise<number> => {
	const { policy, root, env, log, error } = input;
	const slug = env.GITHUB_REPOSITORY;
	if (slug === undefined) {
		error('land: GITHUB_REPOSITORY is not set.');
		return 2;
	}
	if (policy.integration.engine !== 'land') {
		log(
			"land: the policy's integration engine is not `land`; nothing to do.",
		);
		return 0;
	}
	const stale = integrationProtocolRefusal(policy.integration.protocol);
	if (stale !== undefined) {
		error(`land: ${stale.reason} ${stale.remedy}`);
		return 2;
	}
	const exec = input.ports?.gitExec ?? runGit;
	const ports = landProjectPorts({
		root,
		options: policy.integration,
		exec,
		runCommand: input.ports?.runProjectCommand ?? runProjectCommand,
	});
	const config = landConfigFromPolicy(policy, {
		sectionOfCheck: ports.sectionOfCheck,
		batches: policy.integration.batching === 'overlap',
	});
	const forge =
		input.ports?.forge ??
		createGithubLandForge({
			slug,
			integration: config.integrationBranch,
			mergeMethod: config.mergeMethod,
			run: input.runGh,
		});
	const report = await landPass({
		forge,
		git:
			input.ports?.git ??
			createLandGit({
				root,
				remote: LAND_REMOTE,
				ports,
				exec,
				token: env.GH_TOKEN ?? '',
			}),
		config,
		// Its pushes are the identity's, so the forge builds what it moves.
		bringForward:
			input.ports?.bringForward ??
			createBringForward({
				root,
				remote: LAND_REMOTE,
				token: env.GH_TOKEN ?? '',
				normalize: ports.normalizeBatch,
			}),
		// A derived conflict is two jobs of the land workflow, never this pass.
		resolveDerived: (pr) =>
			forge.dispatchWorkflow(
				LAND_WORKFLOW_FILE,
				config.integrationBranch,
				{
					derived: String(pr.number),
				},
			),
	});
	for (const line of report.actions) log(`land: ${line}`);
	// Every open pull request, every pass: "0 merged" is never silent.
	for (const [number, reason] of [...report.reasons].sort(
		([a], [b]) => a - b,
	))
		log(`land: #${String(number)} ${reason}`);
	log(
		`land: ${String(report.mergedCount)} merged${report.mergedPRs.length > 0 ? ` (${report.mergedPRs.map((n) => `#${String(n)}`).join(', ')})` : ''}; tip ${report.tipSha.slice(0, 12)}`,
	);
	// The watchdog runs the same pass on a timer: work it finds is work no
	// event started, so it fails the run and the workflow files the evidence.
	if (env.LAND_WATCHDOG === '1' && report.actions.length > 0) {
		error(
			`land: the watchdog acted ${String(report.actions.length)} time(s): an event was missed.`,
		);
		return 1;
	}
	return 0;
};
