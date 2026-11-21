/**
 * work.command.ts — the CLI's `work` command: the unit-of-work engine in
 * core (`runWorkUnit`), which the MCP `work` tool runs too, and the
 * `progress` view of the work, which is the CLI's own.
 */
import { spawnSync } from 'node:child_process';
import { basename, dirname } from 'node:path';

import {
	compileOwnedWorkRefParser,
	gitNamespaceRenamePorts,
	noteUnitUrgency,
	renameNamespace,
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
import type { ILeaveWorktreePorts } from '../contracts/interfaces/leave-worktree-ports.interface';
import type { ILoadedOnce } from '../contracts/interfaces/loaded-once.interface';
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

/** One forge read: the open pull request of a branch; undefined when none or the read failed. */
const readOpenPullRequestUrl = (
	cwd: string,
	branch: string,
): string | undefined => {
	const read = spawnSync(
		'gh',
		[
			'pr',
			'list',
			'--head',
			branch.replace(/^refs\/heads\//u, ''),
			'--state',
			'open',
			'--json',
			'url',
			'--jq',
			'.[0].url // ""',
		],
		{ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
	);
	const url = read.status === 0 ? read.stdout.trim() : '';
	return url === '' ? undefined : url;
};

/** The head branches of every open pull request; undefined when the forge cannot be read. */
const readOpenPullRequestHeads = (
	cwd: string,
): readonly string[] | undefined => {
	const read = spawnSync(
		'gh',
		[
			'pr',
			'list',
			'--state',
			'open',
			'--limit',
			'1000',
			'--json',
			'headRefName',
			'--jq',
			'.[].headRefName',
		],
		{ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
	);
	return read.status === 0
		? read.stdout.split('\n').filter((line) => line.length > 0)
		: undefined;
};

/** `work rename-namespace`: a dry run unless `--apply`. */
const runRenameNamespace = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const policy = await readWorkspacePolicy(ctx.cwd);
	const report = renameNamespace({
		policy,
		apply: args.includes('--apply'),
		ports: gitNamespaceRenamePorts({
			root: ctx.cwd,
			remote: 'origin',
			openPullRequestHeads: () => readOpenPullRequestHeads(ctx.cwd),
		}),
	});
	if (!ctx.globals.json) {
		for (const ref of report.refs)
			process.stdout.write(`${ref.outcome}  ${ref.from} -> ${ref.to}\n`);
		process.stdout.write(`${report.message}\n`);
	}
	return report.refused === undefined
		? { code: 0, data: report }
		: { code: EXIT_CODE.VALIDATION, error: report.message };
};

/**
 * The last submit removes the unit worktree, and a module imported lazily
 * from it afterwards fails with ENOENT, losing the end-of-run answer. The
 * verbs that can end a unit start these loads up front; every later use
 * awaits the same promise.
 */
const WORKTREE_ENDING_VERBS: ReadonlySet<string> = new Set([
	'deliver',
	'publish',
	'prove',
]);

/** Whether a run of `verb` can remove the unit worktree it was started in. */
export const endsWorktree = (verb: string): boolean =>
	WORKTREE_ENDING_VERBS.has(verb);

/** Loads `load` at most once, on `preload()` rather than on first use. */
export const loadedOnce = <T>(load: () => Promise<T>): ILoadedOnce<T> => {
	let pending: Promise<T> | undefined;
	const get = (): Promise<T> => {
		pending ??= load();
		return pending;
	};
	return {
		preload: () => {
			// An unused failed load must not become an unhandled rejection.
			get().catch(() => undefined);
		},
		get,
	};
};

const gitLocate: ILeaveWorktreePorts['locate'] = (cwd) => {
	const read = spawnSync(
		'git',
		[
			'rev-parse',
			'--path-format=absolute',
			'--show-toplevel',
			'--git-common-dir',
		],
		{ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
	);
	const [top, commonDir] = read.stdout?.trim().split('\n') ?? [];
	return read.status === 0 && top && commonDir
		? { top, commonDir }
		: undefined;
};

/**
 * The context moved to the shared checkout's root when it runs in a linked
 * worktree. The last submit removes the unit worktree: anything resolved from
 * that directory afterwards (the repository, the forge, the answer size)
 * fails, so the run stands on a directory that outlives the unit.
 */
export const leaveWorktree = (
	ctx: ICliCommandContext,
	ports: ILeaveWorktreePorts = { locate: gitLocate, chdir: process.chdir },
): ICliCommandContext => {
	const found = ports.locate(ctx.cwd);
	if (found === undefined || basename(found.commonDir) !== '.git') return ctx;
	const root = dirname(found.commonDir);
	if (root === found.top) return ctx;
	ports.chdir(root);
	return { ...ctx, cwd: root };
};

/** Read after the transition to review, when the worktree may be gone: preloaded by the verbs that end a unit. */
const deliveredRemote = loadedOnce(
	() => import('../lib/work-deliver-remote.service'),
);

/** The ports `deliverUnit` runs on, wired to the unit engine and the proposals tool. */
export const deliverPortsOf = (
	ctx: ICliCommandContext,
	run: IDeliverRun,
): IWorkDeliverPorts => {
	const { id, reason, agent, urgent, unitFlags } = run;
	return {
		slice: scalarArg(unitFlags, 'slice') ?? 'all',
		// Loaded when a delivery fails: only a failure needs it (startup budget).
		recordFailure: async (failure) => {
			const { recordProjectFailure } = await import(
				'@delendai/self-learning/public'
			);
			await recordProjectFailure(ctx.cwd, failure.source, {
				subject: failure.subject,
				unit: failure.unit,
			});
		},
		publish: () => runWorkUnit(['publish', ...unitFlags], ctx),
		readOpenPullRequest: async (branch) =>
			readOpenPullRequestUrl(ctx.cwd, branch),
		locate: () => runWorkUnit(['prove', ...unitFlags, '--locate'], ctx),
		publicationReached: async (publication, checkout) => {
			const { publicationReachedFrom } = await deliveredRemote.get();
			return publicationReachedFrom(
				checkout ?? ctx.cwd,
				ctx.cwd,
				publication,
			);
		},
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
		precheck: () =>
			runWorkUnit(['prove', ...unitFlags, '--only=precheck'], ctx),
		// Loaded when asked for: only a delivery needs it (startup budget).
		coveragePrecheck: async () => {
			const { coveragePrecheckFlag } = await import(
				'../lib/work-deliver-coverage-precheck.service'
			);
			return runWorkUnit(
				['prove', ...unitFlags, coveragePrecheckFlag()],
				ctx,
			);
		},
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
	const parser = compileOwnedWorkRefParser(policy.branches, {
		requireKind: false,
	});
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
	const parser = compileOwnedWorkRefParser(policy.branches, {
		requireKind: false,
	});
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
	run: async (rawArgs, startCtx) => {
		let ctx = startCtx;
		const verbose = rawArgs.includes('--verbose');
		const args = rawArgs.filter((arg) => arg !== '--verbose');
		// Loaded for the verbs that size an answer (startup budget). Those that
		// can end the unit load it now: after the last submit removes the
		// worktree, an import from it fails with ENOENT.
		const answerSize = loadedOnce(
			() => import('../lib/work-answer-size.service'),
		);
		if (endsWorktree(args[0] ?? '')) {
			answerSize.preload();
			deliveredRemote.preload();
		}
		const sized = async (
			result: ICliCommandResult,
		): Promise<ICliCommandResult> =>
			(await answerSize.get()).sizedAnswer({
				verb: args[0] ?? '',
				result,
				verbose,
				json: ctx.globals.json === true,
				cwd: ctx.cwd,
			});
		if (args[0] === 'enter') await briefOnEntering();
		if (args[0] === 'rename-namespace')
			return runRenameNamespace(args.slice(1), ctx);
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
			ctx = leaveWorktree(ctx);
			return await sized(
				await deliverUnit(
					deliverPortsOf(ctx, {
						id,
						reason,
						agent,
						urgent: scalarArg(unit, 'urgent'),
						unitFlags: withSlice,
					}),
				),
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
		if (args[0] === 'publish') ctx = leaveWorktree(ctx);
		const result = await runWorkUnit(unitArgs, ctx);
		return args[0] === 'enter'
			? withSlicesView(result, ctx)
			: await sized(result);
	},
});

export const workCommand: ICliCommand = createWorkCommand();
