/**
 * integration-pass.service.ts — one `land` pass, composed from the
 * development policy and the ports a project can name. `delendai
 * integration pass` and this repository's own script both call it, so the
 * same inputs make the same pass. Core owns the decisions; this only wires.
 */
// effect-boundary-authorized: runs the project's own commands, the one port that spawns for the pass
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

import {
	createGithubLandForge,
	integrationProtocolRefusal,
	LandBranchGoneError,
	LAND_WORKFLOW_FILE,
	landConfigFromPolicy,
	landPass,
} from '@delendai/core/cli';
import type { ILandReport } from '@delendai/core/cli';

import { LAND_REMOTE } from '../contracts/constants/integration-pass.constant';
import type {
	IIntegrationPassInput,
	IProjectCommandRunner,
} from '../contracts/interfaces/integration-pass.interface';

import { createBringForward } from './land-bring-forward.helper';
import { createLandGit } from './land-git.service';
import { createRefreshMoved } from './land-refresh-moved.helper';
import { landProjectPorts } from './land-project-ports.helper';
import { runLandRounds } from './land-rounds.helper';
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

/** The real clock, wired only here so every other caller injects its own. */
const realWait = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

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
			wait: input.ports?.wait ?? realWait,
		});
	const round = () =>
		landPass({
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
			// A proposal file the head moved while the tip edited its old copy.
			refreshMoved:
				input.ports?.refreshMoved ??
				createRefreshMoved({
					root,
					remote: LAND_REMOTE,
					token: env.GH_TOKEN ?? '',
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
		}).catch((cause: unknown) => {
			// A rehearsal's cleanup, or a deleted branch: the run this pass served is over.
			if (cause instanceof LandBranchGoneError) return cause;
			throw cause;
		});
	const { reports, notes } = await runLandRounds(
		forge,
		round,
		(outcome) => outcome instanceof LandBranchGoneError,
	);
	for (const note of notes) log(`land: ${note}`);
	const actions: string[] = [];
	for (const outcome of reports) {
		if (outcome instanceof LandBranchGoneError) {
			log(`land: ${outcome.message}; nothing to settle.`);
			return 0;
		}
		actions.push(...outcome.actions);
		logReport(outcome, log);
	}
	return await finish(
		env,
		actions,
		error,
		input.ports?.writeEvidence ?? writeFile,
	);
};

/** What one round did, one line each. */
const logReport = (report: ILandReport, log: (line: string) => void): void => {
	for (const line of report.actions) log(`land: ${line}`);
	// Every open pull request, every pass: "0 merged" is never silent.
	for (const [number, reason] of [...report.reasons].sort(
		([a], [b]) => a - b,
	))
		log(`land: #${String(number)} ${reason}`);
	log(
		`land: ${String(report.mergedCount)} merged${report.mergedPRs.length > 0 ? ` (${report.mergedPRs.map((n) => `#${String(n)}`).join(', ')})` : ''}; tip ${report.tipSha.slice(0, 12)}`,
	);
};

/**
 * The watchdog runs the same pass on a timer: work it finds is work no event
 * started, so it fails the run. It also says which event: the trigger, the
 * commit and each thing it did (a pull request number is in the line), in the
 * file the workflow reads to keep the one open issue.
 */
const finish = async (
	env: Readonly<Record<string, string | undefined>>,
	actions: readonly string[],
	error: (line: string) => void,
	writeEvidence: (path: string, text: string) => void | Promise<void>,
): Promise<number> => {
	if (env.LAND_WATCHDOG !== '1' || actions.length === 0) return 0;
	error(
		`land: the watchdog acted ${String(actions.length)} time(s): an event was missed.`,
	);
	const path = env.LAND_WATCHDOG_EVIDENCE;
	if (path !== undefined && path !== '')
		await writeEvidence(
			path,
			[
				`- Trigger: ${env.GITHUB_EVENT_NAME ?? 'schedule'} on ${env.GITHUB_REF_NAME ?? 'the integration branch'}`,
				`- Commit: ${env.GITHUB_SHA ?? 'unknown'}`,
				'- What the pass did that no event had started:',
				...actions.map((line) => `  - ${line}`),
				'',
			].join('\n'),
		);
	return 1;
};
