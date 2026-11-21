/**
 * integration-repair.service.ts — the repair pass over the real forge: the
 * integration branch's CI ended red, so the culprit merge is reverted as a
 * repair, through the same forge and git wiring a `land` pass uses. Core
 * owns the decisions (`repairDevelopRed`); this only wires the ports. It
 * acts at most once per red run and otherwise does nothing.
 */
import {
	createGithubLandForge,
	integrationProtocolRefusal,
	knownFailingNoteOf,
	landConfigFromPolicy,
	landRepairPrefix,
	repairDevelopRed,
} from '@delendai/core/cli';
import type { ILandCiRun } from '@delendai/core/cli';

import {
	BATCH_COMMIT_IDENTITY,
	LAND_REMOTE,
} from '../contracts/constants/integration-pass.constant';
import type { IIntegrationPassInput } from '../contracts/interfaces/integration-pass.interface';

import { createLandGit } from './land-git.service';
import { landProjectPorts } from './land-project-ports.helper';
import { createRevertGit } from './land-revert-git.service';
import { runProjectCommand } from './integration-pass.service';
import { runGit } from './land-train-assembly.helper';
import { pushAsIdentity } from './land-identity-push.helper';

/** Completed CI runs read: enough to reach the last green one. */
const CI_RUNS_READ = 20;
const PULL_SUBJECT = /#(\d+)/u;

/** Runs one repair pass; the exit code the process should end with. */
export const runIntegrationRepair = async (
	input: IIntegrationPassInput & { readonly ciWorkflow?: string },
): Promise<number> => {
	const { policy, root, env, log, error } = input;
	const slug = env.GITHUB_REPOSITORY;
	if (slug === undefined) {
		error('land-repair: GITHUB_REPOSITORY is not set.');
		return 2;
	}
	if (policy.integration.engine !== 'land') {
		log("land-repair: the policy's integration engine is not `land`.");
		return 0;
	}
	const stale = integrationProtocolRefusal(policy.integration.protocol);
	if (stale !== undefined) {
		error(`land-repair: ${stale.reason} ${stale.remedy}`);
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
		batches: false,
	});
	const forge =
		input.ports?.forge ??
		createGithubLandForge({
			slug,
			integration: config.integrationBranch,
			mergeMethod: config.mergeMethod,
			run: input.runGh,
			wait: input.ports?.wait ?? (() => Promise.resolve()),
		});
	const token = env.GH_TOKEN ?? '';
	const land =
		input.ports?.git ??
		createLandGit({ root, remote: LAND_REMOTE, ports, exec, token });
	const ciWorkflow = input.ciWorkflow ?? env.LAND_CI_WORKFLOW ?? 'ci.yml';
	const result = await repairDevelopRed({
		forge,
		git: createRevertGit({
			root,
			remote: LAND_REMOTE,
			token,
			regenerate: ports.regenerate,
			exec,
		}),
		sectionOfCheck: ports.sectionOfCheck,
		repairPrefix: landRepairPrefix(config.batchPrefix),
		note: (line) => log(`land-repair: ${line}`),
		recentRuns: async (): Promise<readonly ILandCiRun[]> => {
			const out = await input.runGh([
				'run',
				'list',
				'--repo',
				slug,
				'--workflow',
				ciWorkflow,
				'--branch',
				config.integrationBranch,
				'--status',
				'completed',
				'--limit',
				String(CI_RUNS_READ),
				'--json',
				'headSha,conclusion',
			]);
			const rows = JSON.parse(out.stdout || '[]') as {
				headSha: string;
				conclusion: string;
			}[];
			return rows.map((row) => ({
				commit: row.headSha,
				conclusion: row.conclusion,
			}));
		},
		develop: {
			mergesBetween: (green, red) => {
				const lines = exec(root, [
					'log',
					'--first-parent',
					'--merges',
					'--reverse',
					'--format=%H%x09%s',
					`${green}..${red}`,
				]);
				return Promise.resolve(
					lines.split('\n').flatMap((line) => {
						const [sha = '', subject = ''] = line.split('\t');
						const number = PULL_SUBJECT.exec(subject)?.[1];
						return number === undefined || sha === ''
							? []
							: [{ number: Number(number), sha }];
					}),
				);
			},
			footprintOf: (merge) =>
				Promise.resolve(land.landedSince(`${merge.sha}^1`, merge.sha)),
			// The set travels as a git note of the commit: a proof reads it offline.
			recordKnownFailing: (commit, specs) => {
				const note = knownFailingNoteOf({
					namespace: policy.branches.namespacePrefix,
					commit,
					failingSpecs: specs,
				});
				try {
					exec(root, [
						'fetch',
						'-q',
						LAND_REMOTE,
						`+${note.ref}:${note.ref}`,
					]);
				} catch {
					// No notes ref yet: this is the first one.
				}
				exec(root, [
					...BATCH_COMMIT_IDENTITY,
					'notes',
					`--ref=${note.ref}`,
					'add',
					'-f',
					'-m',
					note.content.trimEnd(),
					note.commit,
				]);
				const failure = pushAsIdentity({
					cwd: root,
					remote: LAND_REMOTE,
					refspec: `${note.ref}:${note.ref}`,
					token,
				});
				log(
					`land-repair: ${commit.slice(0, 12)} fails ${String(specs.length)} spec(s)/check(s)${failure === undefined ? '' : `; the note was not pushed (${failure})`}`,
				);
				return Promise.resolve();
			},
		},
	});
	log(
		result.kind === 'nothing'
			? `land-repair: nothing to do (${result.why}).`
			: result.kind === 'unowned'
				? `land-repair: unowned failure, nobody reverted (${result.why}).`
				: result.kind === 'needs-person'
					? `land-repair: needs a person (${result.reason}).`
					: `land-repair: repair #${String(result.number)} ${result.kind}.`,
	);
	return 0;
};
