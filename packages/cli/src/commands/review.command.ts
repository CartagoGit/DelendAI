/**
 * review.command.ts — a review is four commands (x00727).
 *
 * Reviewing a proposal is reading what it delivered and saying whether it
 * holds. On 2026-09-28 six reviewers spent hours failing at the steps
 * around that: entering a review unit, finding its worktree, claiming a
 * proposal with a hand-written empty commit and trailer, passing the
 * worktree as `checkout` on every call, committing after each verdict,
 * publishing. Each step was a place to go wrong, and most of them went
 * wrong somewhere.
 *
 *   review next              your unit (entered once), the next proposal
 *                            claimed for you, and what to check
 *   review approve <id> <s>  the slice holds: recorded and committed
 *   review changes <id> <s>  it does not: recorded, committed, reopened
 *   review finish            your verdicts become one pull request
 *
 * Nothing here decides anything new. The unit is `work enter` / `work
 * publish`, the claim is the commit `review_queue` names, and the verdict
 * is `proposal_review`, which closes a proposal on its last approval and
 * reopens it on a change request; the write binding commits what it
 * wrote (x00722).
 */
import { execFileSync } from 'node:child_process';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import { REVIEW_COMMAND } from '../contracts/constants/review-command.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { readWorkspacePolicy } from '@delendai/core/cli';
import { data, request, scalarArg } from '../lib/helpers/cli-command.helper';
import { usage } from './groups/group-helpers';
import { evidenceArgs } from './groups/proposals';
import { workCommand } from './work.command';

/** The unit every review lives in: one batch per reviewer session. */
const REVIEW_UNIT = ['--kind=review', '--proposal=batch', '--slice=all'];

/** The trailer `review_queue` reads a claim from. */
const CLAIM_TRAILER = 'Claims';

const QUEUE_TOOL = 'delendai_proposals_review_queue';
const VERDICT_TOOL = 'delendai_proposals_proposal_review';
const CLAIM_TOOL = 'delendai_proposals_review_claim';

interface IQueueSlice {
	readonly sliceId: string;
	readonly title?: string;
	readonly verdict: string;
	readonly implementer?: string;
	readonly gate?: string;
	readonly files?: readonly string[];
	readonly acceptance?: readonly string[];
	readonly candidates?: readonly { readonly commit: string }[];
	readonly missing?: string;
}

interface IQueueProposal {
	readonly id: string;
	readonly file: string;
	readonly slices: readonly IQueueSlice[];
	readonly close?: string;
	readonly claimedBy?: readonly string[];
}

interface IQueue {
	readonly proposals?: readonly IQueueProposal[];
	/** The unit's pack: published as one pull request once full. */
	readonly pack?: { readonly full: boolean; readonly size: number };
}

interface IUnit {
	readonly path: string;
	readonly session: string;
	readonly ref: string;
}

/** Who reviews: `--agent`, or the declared agent id. */
const agentOf = (args: readonly string[]): string | undefined =>
	scalarArg(args, 'agent') ?? process.env.DELENDAI_AGENT_ID;

const sessionOf = (args: readonly string[]): string | undefined =>
	scalarArg(args, 'session') ?? process.env.DELENDAI_SESSION_ID;

const quiet = (ctx: ICliCommandContext): ICliCommandContext => ({
	...ctx,
	globals: { ...ctx.globals, json: true, format: 'json' },
});

/** `work <sub>` on the reviewer's unit, as data. */
const workOnUnit = async (
	sub: 'enter' | 'publish',
	agent: string,
	session: string | undefined,
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> =>
	workCommand.run(
		[
			sub,
			...REVIEW_UNIT,
			`--agent=${agent}`,
			...(session === undefined ? [] : [`--session=${session}`]),
		],
		quiet(ctx),
	);

/** The reviewer's unit, entered if it is not yet. */
const unitOf = async (
	agent: string,
	session: string | undefined,
	ctx: ICliCommandContext,
): Promise<IUnit | ICliCommandResult> => {
	// No topic: `work enter` then finds this reviewer's unit whatever it
	// was named, and names a new one itself.
	const entered = await workOnUnit('enter', agent, session, ctx);
	const unit = entered.data as
		| { path?: string | null; session?: string; ref?: string }
		| undefined;
	if (
		entered.code !== EXIT_CODE.OK ||
		typeof unit?.path !== 'string' ||
		typeof unit.session !== 'string' ||
		typeof unit.ref !== 'string'
	) {
		return entered.code === EXIT_CODE.OK
			? { code: EXIT_CODE.RUNTIME, error: 'work enter gave no worktree.' }
			: entered;
	}
	return { path: unit.path, session: unit.session, ref: unit.ref };
};

const isUnit = (value: IUnit | ICliCommandResult): value is IUnit =>
	'path' in value;

const gitIn = (
	cwd: string,
	args: readonly string[],
): { readonly ok: boolean; readonly out: string } => {
	try {
		return {
			ok: true,
			out: execFileSync('git', args, {
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			}).trim(),
		};
	} catch (error) {
		const stderr = (error as { stderr?: unknown }).stderr;
		return { ok: false, out: String(stderr ?? error).trim() };
	}
};

/** The proposals this unit has claimed: its own commits' claim trailers. */
const claimsOf = (unit: IUnit, integration: string): readonly string[] => {
	// Only the unit's own commits: not those the integration branch
	// holds, here or on the remote, whichever of the two exist.
	const integrated = [
		`refs/heads/${integration}`,
		`refs/remotes/origin/${integration}`,
	].filter(
		(ref) => gitIn(unit.path, ['rev-parse', '--verify', '--quiet', ref]).ok,
	);
	const log = gitIn(unit.path, [
		'log',
		`--format=%(trailers:key=${CLAIM_TRAILER},valueonly)`,
		'HEAD',
		...(integrated.length === 0 ? [] : ['--not', ...integrated]),
		'--',
	]);
	if (!log.ok) return [];
	return [
		...new Set(
			log.out
				.split('\n')
				.map((line) => line.trim().toLowerCase())
				.filter((line) => line.length > 0),
		),
	];
};

const needsVerdict = (proposal: IQueueProposal): boolean =>
	proposal.slices.some((slice) => slice.verdict === 'needs-verdict');

const queueOf = async (
	ctx: ICliCommandContext,
	agent: string,
	extra: Record<string, unknown> = {},
): Promise<IQueue> =>
	request<IQueue>(ctx, QUEUE_TOOL, {
		agent,
		limit: 50,
		detail: true,
		...extra,
	});

/** What the reviewer needs to judge one proposal, and how to answer. */
const briefFor = (proposal: IQueueProposal, unit: IUnit, agent: string) => {
	const who = `--agent=${agent} --session=${unit.session}`;
	return {
		proposal: proposal.id,
		file: `${unit.path}/${proposal.file}`,
		read: 'Read the proposal and, for each slice below, what its candidate commit delivered (`git show <commit>`). Run its gate. Judge it on what it delivered.',
		slices: proposal.slices
			.filter((slice) => slice.verdict === 'needs-verdict')
			.map((slice) => ({
				slice: slice.sliceId,
				...(slice.title === undefined ? {} : { title: slice.title }),
				...(slice.implementer === undefined
					? {}
					: { implementer: slice.implementer }),
				...(slice.gate === undefined ? {} : { gate: slice.gate }),
				...(slice.files === undefined ? {} : { files: slice.files }),
				...(slice.acceptance === undefined
					? {}
					: { acceptance: slice.acceptance }),
				commits: (slice.candidates ?? []).map((each) => each.commit),
				approve: `delendai review approve ${proposal.id} ${slice.sliceId} ${who} --commit=${slice.candidates?.[0]?.commit ?? '<sha>'} --validate-exit=<gate exit code> --tests-passing=<n> --tests-total=<n> --note="<what you verified>"`,
				changes: `delendai review changes ${proposal.id} ${slice.sliceId} ${who} --note="<what is missing, precisely>"`,
			})),
		afterwards: `delendai review next ${who}`,
	};
};

const next = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const agent = agentOf(args);
	if (agent === undefined)
		return usage('review next --agent=<you> [--session=<s>]');
	const unit = await unitOf(agent, sessionOf(args), ctx);
	if (!isUnit(unit)) return unit;
	const policy = await readWorkspacePolicy(unit.path);
	if (policy === undefined) {
		return {
			code: EXIT_CODE.VALIDATION,
			error: 'This project declares no development policy, so it has no review units.',
		};
	}
	// The unit, not only the agent: another instance of this model is
	// another reviewer, and its claims are not ours.
	const answer = await queueOf(ctx, agent, { unit: unit.ref });
	const queue = answer.proposals ?? [];
	const claimed = claimsOf(unit, policy.branches.integration);
	// Your own claim first: a review you started is finished before
	// another is taken.
	const resumed = queue.find(
		(proposal) =>
			claimed.includes(proposal.id.toLowerCase()) &&
			needsVerdict(proposal),
	);
	const free = queue.find(
		(proposal) =>
			proposal.claimedBy === undefined &&
			!claimed.includes(proposal.id.toLowerCase()) &&
			needsVerdict(proposal),
	);
	const chosen = resumed ?? free;
	const session = {
		unit: unit.ref,
		worktree: unit.path,
		session: unit.session,
	};
	// A pack ends in a pull request: the verdicts reach the integration
	// branch pack by pack, not when a backlog of a hundred runs dry.
	// Only a unit that claimed something has a pack to publish: a fresh one
	// never publishes, whatever the queue says.
	const packDone =
		resumed === undefined &&
		claimed.length > 0 &&
		answer.pack?.full === true;
	if (packDone || (chosen === undefined && claimed.length > 0)) {
		const published = await workOnUnit('publish', agent, unit.session, ctx);
		if (published.code !== EXIT_CODE.OK || chosen === undefined) {
			return published.code !== EXIT_CODE.OK
				? published
				: data({
						...session,
						published: published.data,
						next: 'Nothing else is waiting for a verdict; your pack is published as its pull request.',
					});
		}
		// The next pack, in a unit of its own.
		return next(
			[
				...args.filter((arg) => !arg.startsWith('--session=')),
				`--session=${unit.session}`,
			],
			ctx,
		);
	}
	if (chosen === undefined) {
		return data({
			...session,
			next: 'Nothing is waiting for your verdict.',
		});
	}
	if (resumed === undefined) {
		// One way to claim, whatever host: the tool an MCP host calls too.
		await request(ctx, CLAIM_TOOL, {
			proposalId: chosen.id,
			agent,
			checkout: unit.path,
		});
	}
	return data({ ...session, ...briefFor(chosen, unit, agent) });
};

const verdict = async (
	action: 'approve' | 'request_changes',
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const [proposalId, sliceId] = args.filter((arg) => !arg.startsWith('-'));
	const agent = agentOf(args);
	const note = scalarArg(args, 'note');
	const sub = action === 'approve' ? 'approve' : 'changes';
	if (
		proposalId === undefined ||
		sliceId === undefined ||
		agent === undefined ||
		note === undefined
	) {
		return usage(
			`review ${sub} <proposalId> <sliceId> --agent=<you> --session=<s> --note="<why>"${action === 'approve' ? ' --commit=<sha> --validate-exit=<n> --tests-passing=<n> --tests-total=<n>' : ''}`,
		);
	}
	const unit = await unitOf(agent, sessionOf(args), ctx);
	if (!isUnit(unit)) return unit;
	const evidence = action === 'approve' ? evidenceArgs(args) : undefined;
	const commit = scalarArg(args, 'commit');
	const answer = await request<Record<string, unknown>>(ctx, VERDICT_TOOL, {
		proposalId,
		sliceId,
		action,
		agent,
		note,
		...(evidence === undefined ? {} : { evidence }),
		...(commit === undefined ? {} : { commitHash: commit }),
		checkout: unit.path,
	});
	return data({
		...answer,
		unit: unit.ref,
		next: `delendai review next --agent=${agent} --session=${unit.session}`,
	});
};

const finish = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const agent = agentOf(args);
	if (agent === undefined)
		return usage('review finish --agent=<you> --session=<s>');
	return workOnUnit('publish', agent, sessionOf(args), ctx);
};

export const reviewRoundCommand: ICliCommand = {
	name: 'review',
	...REVIEW_COMMAND,
	async run(args, ctx): Promise<ICliCommandResult> {
		const [sub, ...rest] = args;
		if (sub === 'next') return next(rest, ctx);
		if (sub === 'approve') return verdict('approve', rest, ctx);
		if (sub === 'changes') return verdict('request_changes', rest, ctx);
		if (sub === 'finish') return finish(rest, ctx);
		return usage(
			'review <next|approve|changes|finish> — start with: delendai review next --agent=<you>',
		);
	},
};
