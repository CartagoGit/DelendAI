/**
 * work.command.ts — the CLI's `work` command: the unit-of-work engine in
 * core (`runWorkUnit`), which the MCP `work` tool runs too, and the
 * `progress` view of the work, which is the CLI's own.
 */
import { spawnSync } from 'node:child_process';

import {
	compileWorkRefParser,
	noteUnitUrgency,
	readUnitStandings,
	readWorkspacePolicy,
	runWorkUnit,
} from '@delendai/core/cli';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';

import { WORK_COMMAND } from '../contracts/constants/work-command.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import {
	isRecord,
	request,
	scalarArg,
} from '../lib/helpers/cli-command.helper';
import {
	answerOf,
	deliverUnit,
	unitFlagsOf,
} from '../lib/work-deliver.service';
import { runGitCommand } from '@delendai/core/runtime';
import {
	answerCommittingWrites,
	toolCommitSubject,
} from '../lib/work-deliver-commit.service';
import type {
	IDeliverRun,
	IWorkDeliverPorts,
} from '../contracts/interfaces/work-deliver.interface';
import type { IGitInCheckout } from '../contracts/interfaces/git-in-checkout.interface';
import {
	chooseLiveUnit,
	flagsOfLiveUnit,
	liveUnitsOf,
} from '../lib/work-live-unit.service';
import { runWorkProgress } from '../lib/work-progress.service';

/**
 * Where an agent that just entered a unit reads what its slice asks for.
 * A plan document runs to tens of kilobytes and a slice is a few hundred
 * bytes of it; the proposals plugin cuts the open slices out, with what
 * each waits on, changes and still has to meet.
 */
const SLICES_VIEW_HINT =
	'the open slices of the proposal (the proposals `proposal_get` tool, view `slices`), not its whole document';

/** Name that view to whoever entered: in the payload, and in the text. */
export const withSlicesView = (
	result: ICliCommandResult,
	ctx: ICliCommandContext,
): ICliCommandResult => {
	if (result.code !== 0 || !isRecord(result.data)) return result;
	if (!ctx.globals.json) {
		process.stdout.write(`read             ${SLICES_VIEW_HINT}\n`);
	}
	return { ...result, data: { ...result.data, read: SLICES_VIEW_HINT } };
};

/** The tool whose write a delivery commits. */
const TRANSITION_TOOL = 'delendai_proposals_proposal_transition';

/** The ports `deliverUnit` runs on, wired to the unit engine and the proposals tool. */
export const deliverPortsOf = (
	ctx: ICliCommandContext,
	run: IDeliverRun,
): IWorkDeliverPorts => {
	const { id, reason, agent, urgent, unitFlags } = run;
	return {
		slice: scalarArg(unitFlags, 'slice') ?? 'all',
		publish: () => runWorkUnit(['publish', ...unitFlags], ctx),
		locate: () => runWorkUnit(['prove', ...unitFlags, '--locate'], ctx),
		preflight: (checkout) =>
			answerOf(
				request(ctx, TRANSITION_TOOL, {
					id,
					to: 'review',
					reason,
					preflight: true,
					...(agent === undefined ? {} : { agent }),
					checkout: checkout ?? ctx.cwd,
				}),
			),
		prove: () => runWorkUnit(['prove', ...unitFlags], ctx),
		transition: async (to, checkout) => {
			// The transition to review publishes the unit, apart from this
			// command: the reason is noted for it.
			if (to === 'review' && urgent !== undefined) {
				await noteUnitUrgency(checkout ?? ctx.cwd, urgent);
			}
			const where = checkout ?? ctx.cwd;
			const git: IGitInCheckout = (gitArgs) =>
				runGitCommand(where, gitArgs);
			// The tool's write is committed by the tool's flow, before the
			// proof reads the tree or anything else commits it.
			return answerCommittingWrites(
				git,
				toolCommitSubject(TRANSITION_TOOL, `${id} ${to}`),
				() =>
					answerOf(
						request(ctx, TRANSITION_TOOL, {
							id,
							to,
							reason,
							...(agent === undefined ? {} : { agent }),
							checkout: where,
						}),
					),
			);
		},
	};
};

/** The flag that makes `work enter` print the worktree's path and nothing else. */
const PRINT_PATH_FLAG = '--print-path';

/**
 * `work enter --print-path`: the path alone on stdout, the refusal on
 * stderr with a non-zero exit. A script that read the path out of the
 * report through a pipe lost the exit code with it: the refusal left the
 * variable empty, `cd ""` stayed in the shared checkout, and the next git
 * command wrote there. Command substitution keeps the exit code.
 */
export const printPathOnly = (result: ICliCommandResult): ICliCommandResult => {
	const path =
		result.code === 0 && isRecord(result.data)
			? result.data.path
			: undefined;
	if (typeof path === 'string' && path.length > 0) {
		process.stdout.write(`${path}\n`);
		return { code: EXIT_CODE.OK };
	}
	return result.code === 0
		? {
				code: EXIT_CODE.VALIDATION,
				error: 'work enter answered without a worktree path',
			}
		: result;
};

/** The planning plugin is loaded only when a unit is entered. */
export const briefOnEntering = async (): Promise<void> => {
	const { DEFAULT_PATH_LAYOUT, registerProposalsTaskBriefing } = await import(
		'@delendai/proposals/public'
	);
	registerProposalsTaskBriefing(DEFAULT_PATH_LAYOUT.proposalsDir);
};

/** The unit flags of the branch checked out at `cwd`, for `proposal`. */
export const unitHere = async (
	cwd: string,
	proposal: string,
): Promise<readonly string[]> => {
	const policy = await readWorkspacePolicy(cwd).catch(() => undefined);
	if (policy === undefined) return [];
	const parser = compileWorkRefParser(
		policy.branches.workRefTemplate,
		policy.branches.workRefPrefix,
		{ requireKind: false },
	);
	const branch = spawnSync(
		'git',
		['symbolic-ref', '--quiet', '--short', 'HEAD'],
		{
			cwd,
			encoding: 'utf8',
		},
	).stdout?.trim();
	return unitFlagsOf(
		branch === undefined || branch.length === 0 ? undefined : branch,
		proposal,
		(ref) => parser?.parse(ref),
	);
};

/**
 * The unit flags of the agent's one live unit of `proposal`, when the
 * command named no unit and the directory holds none; the refusal that
 * lists the candidates otherwise. Never a guessed slice.
 */
export const liveUnitFlags = async (
	args: readonly string[],
	cwd: string,
	input: {
		readonly proposal: string;
		readonly agent: string | undefined;
		readonly verb: string;
	},
): Promise<
	| { readonly flags: readonly string[] }
	| { readonly refusal: ICliCommandResult }
> => {
	const agent = input.agent ?? process.env.DELENDAI_AGENT_ID ?? '';
	const policy = await readWorkspacePolicy(cwd);
	const parser = compileWorkRefParser(
		policy.branches.workRefTemplate,
		policy.branches.workRefPrefix,
		{ requireKind: false },
	);
	const kind = scalarArg(args, 'kind');
	const units = liveUnitsOf(
		await readUnitStandings({ root: cwd, policy }),
		{ agent, proposal: input.proposal },
		(ref) => parser?.parse(ref),
	).filter((unit) => kind === undefined || unit.kind === kind);
	const chosen = chooseLiveUnit(units, { ...input, agent });
	return 'unit' in chosen
		? {
				flags: flagsOfLiveUnit(chosen.unit).filter(
					(f) => !f.startsWith('--kind='),
				),
			}
		: chosen;
};

const UNIT_FLAGS = ['--slice=', '--generation=', '--topic='] as const;

/**
 * `args` with the unit the checked-out branch stands for, when they name
 * none of its slice, generation or topic: `work prove` and `work publish`
 * run in a unit's worktree find that unit, as `work deliver` does.
 */
export const withUnitHere = async (
	args: readonly string[],
	cwd: string,
): Promise<readonly string[]> => {
	const proposal = scalarArg(args, 'proposal');
	if (
		proposal === undefined ||
		args.some((arg) => UNIT_FLAGS.some((flag) => arg.startsWith(flag)))
	) {
		return args;
	}
	return [...args, ...(await unitHere(cwd, proposal))];
};

export const createWorkCommand = (): ICliCommand => ({
	name: 'work',
	...WORK_COMMAND,
	run: async (args, ctx) => {
		if (args[0] === 'enter') await briefOnEntering();
		if (args[0] === 'progress') return runWorkProgress(args.slice(1), ctx);
		if (args[0] === 'revalidate') {
			const flags = args.slice(1);
			// Loaded here, not at start-up: only this subcommand needs it.
			const [{ revalidateBatch }, { revalidatePortsOf }] =
				await Promise.all([
					import('../lib/work-revalidate.service'),
					import('../lib/work-revalidate-ports.service'),
				]);
			return revalidateBatch(
				revalidatePortsOf(
					ctx,
					scalarArg(flags, 'agent'),
					TRANSITION_TOOL,
				),
				scalarArg(flags, 'proposals'),
			);
		}
		if (args[0] === 'deliver') {
			const unit = args.slice(1);
			const id = scalarArg(unit, 'proposal');
			const reason = scalarArg(unit, 'reason') ?? 'Proved and delivered.';
			if (id === undefined) {
				return {
					code: EXIT_CODE.VALIDATION,
					error: 'work deliver --proposal=<id> --agent=<you> [--slice=all] [--generation=<n>] [--topic=<text>] [--reason=<why>]',
				};
			}
			const agent = scalarArg(unit, 'agent');
			const here = await withUnitHere(unit, ctx.cwd);
			let withSlice = here;
			if (!here.some((arg) => arg.startsWith('--slice='))) {
				const found = await liveUnitFlags(here, ctx.cwd, {
					proposal: id,
					agent,
					verb: 'deliver',
				});
				if ('refusal' in found) return found.refusal;
				withSlice = [...here, ...found.flags];
			}
			return deliverUnit(
				deliverPortsOf(ctx, {
					id,
					reason,
					agent,
					urgent: scalarArg(unit, 'urgent'),
					unitFlags: withSlice,
				}),
			);
		}
		if (args[0] === 'enter' && args.includes(PRINT_PATH_FLAG)) {
			return printPathOnly(
				await runWorkUnit(
					args.filter((arg) => arg !== PRINT_PATH_FLAG),
					{ ...ctx, globals: { ...ctx.globals, json: true } },
				),
			);
		}
		const unitArgs =
			args[0] === 'prove' || args[0] === 'publish'
				? [args[0], ...(await withUnitHere(args.slice(1), ctx.cwd))]
				: args;
		const result = await runWorkUnit(unitArgs, ctx);
		return args[0] === 'enter' ? withSlicesView(result, ctx) : result;
	},
});

export const workCommand: ICliCommand = createWorkCommand();
