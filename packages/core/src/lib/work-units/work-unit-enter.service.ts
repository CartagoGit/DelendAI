import { isAbsolute, relative, resolve } from 'node:path';

import { sanitizeRefComponent } from '../wip-engine/index';
import { holdWorkRef } from '../wip-engine/work-ref-lock';
import { sharedCheckout } from '../shared/shared-checkout';
import { MAX_WORK_TOPIC_LENGTH } from '../contracts/constants/work-topic.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { withBriefing } from './work-unit-enter-briefing.service';
import { hydratedIdleUnit } from './kept-unit-hydration.service';
import { readSwarm } from './work-swarm.service';
import { aliasedIdentity, describeAlias } from './agent-alias.service';
import { describeSliceHolders, holdersOfSlice } from './slice-holders.service';
import { sliceHeldOnForge } from './slice-reservation.service';
import { isUnitHolding, readUnitStandings } from './unit-standings.service';
import { liveProposalBranch } from './proposal-branch.service';
import {
	reviewedByEntrant,
	topicForNewUnit,
} from './reviewed-proposal.service';
import { scalarArg } from './command-args.helper';

import {
	agentFor,
	claimWorktree,
	readGit,
	heldByAnother,
	integrationBase,
	kindInAgent,
	openWork,
	refused,
	sessionFor,
	unknownKind,
	workspaceOf,
} from './work-unit-shared.service';
import {
	ambiguousUnit,
	chooseGeneration,
	existingWorkRef,
	unitGeneration,
} from './work-unit-generation.service';

/**
 * Give this agent its own working tree on its own ref.
 *
 * WHY a command and not a paragraph of instructions: an agent told "do
 * not edit the shared checkout" needs somewhere else to edit. Without one
 * reachable command it improvises — a branch here, a worktree there —
 * which is exactly the mess this proposal exists to end. Creating the
 * ref, if it does not exist, is done with `update-ref` from the
 * integration branch: the shared checkout never moves.
 */
/** How long an entering instance waits for another entering the same unit. */
const ENTER_WAIT_MS = 60_000;
const ENTER_POLL_MS = 200;

/**
 * `work enter`, one instance at a time per unit (x00731).
 *
 * Choosing a generation and creating its ref and worktree is one step.
 * Two instances of one model entering the same unit at the same moment
 * both chose g1, both tried to add its worktree, and the one that lost
 * rolled back the ref the other had just made: neither got a unit. Held
 * on the unit (its agent, kind, proposal and slice, any generation), the
 * second waits for the first, then sees g1 held by another session and
 * takes g2.
 */
export const entering = new Map<string, Promise<unknown>>();

/**
 * `work enter` on `unit`, after any other entry on it in this process. The
 * file lock below holds processes apart; calls in one process share its
 * pid, so the lock alone would let them through together.
 */
export const oneEntryAtATime = async <T>(
	unit: string,
	enter: () => Promise<T>,
): Promise<T> => {
	const previous = entering.get(unit) ?? Promise.resolve();
	const next = previous.then(enter, enter);
	const settled = next.catch(() => undefined);
	entering.set(unit, settled);
	try {
		return await next;
	} finally {
		if (entering.get(unit) === settled) entering.delete(unit);
	}
};

export const entered = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const unit = [
		agentFor(args),
		scalarArg(args, 'kind') ?? '',
		scalarArg(args, 'proposal') ?? '',
		scalarArg(args, 'slice') ?? '',
	].join('/');
	return oneEntryAtATime(unit, () => enteredLocked(unit, args, ctx));
};

export const enteredLocked = async (
	unit: string,
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const root = workspaceOf(ctx);
	const common = readGit(root, [
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	]);
	if (common === undefined) return enteredHeld(args, ctx);
	const deadline = Date.now() + ENTER_WAIT_MS;
	for (;;) {
		const held = await holdWorkRef({
			gitCommonDir: common,
			ref: `refs/heads/enter/${unit}`,
		});
		if (held.kind === 'acquired') {
			try {
				return await enteredHeld(args, ctx);
			} finally {
				await held.release();
			}
		}
		if (Date.now() >= deadline) {
			return refused(
				`Another instance (${held.holder}) is still entering ${unit}.`,
				'Try again in a moment; it holds the unit only while it creates its worktree.',
			);
		}
		await new Promise((resolve) => setTimeout(resolve, ENTER_POLL_MS));
	}
};

export const enteredHeld = async (
	given: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	let args = given;
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { root, policy } = opened;
	const proposal = scalarArg(args, 'proposal');
	const slice = scalarArg(args, 'slice');
	const agent = agentFor(args);
	if (proposal === undefined || slice === undefined || agent.length === 0) {
		return refused(
			'A worktree belongs to one identity and one unit of work.',
			'work enter --proposal=<id> --slice=<id> [--agent=<who>] [--generation=<n>] [--topic=<text>] [--dir=<path>] [--alongside]; --agent defaults to DELENDAI_AGENT_ID.',
		);
	}
	if (policy.branches.workRefTemplate.length === 0) {
		return refused(
			`The \`${policy.profile}\` profile has no work-ref model: it commits to \`${policy.branches.integration}\` directly.`,
			'There is nothing to isolate; edit the checkout as the profile intends.',
		);
	}
	const badKind = unknownKind(args) ?? kindInAgent(agent);
	if (badKind !== undefined) return badKind;
	const swarm = readSwarm({ root, policy });
	const respelled = aliasedIdentity(agent, [
		...new Set(
			[...swarm.units, ...swarm.published].map((unit) => unit.agent),
		),
	]);
	if (respelled !== undefined) {
		return refused(
			'An identity is spelled one way.',
			describeAlias(agent, respelled),
		);
	}
	const reviewed = await reviewedByEntrant(
		root,
		policy,
		args,
		agent,
		proposal,
	);
	if (reviewed !== undefined) return reviewed;
	if (!args.includes('--alongside')) {
		const onSlice = holdersOfSlice({
			view: swarm,
			agent,
			kind: scalarArg(args, 'kind') ?? 'implement',
			proposal,
			slice,
		});
		// A unit its owner left, or whose work landed, holds nothing: the
		// slice is free, and the swarm view still shows the unit.
		const standings = await readUnitStandings({ root, policy });
		const holders = onSlice.filter((unit) =>
			isUnitHolding(standings, unit.ref.replace(/^refs\/heads\//u, '')),
		);
		if (holders.length > 0) {
			return refused(
				`${proposal} ${slice} is already being worked on by another agent: two units on one slice do the same work twice and collide when they land.`,
				describeSliceHolders(holders).join('\n'),
			);
		}
	}
	if (scalarArg(args, 'generation') === undefined) {
		const chosen = chooseGeneration(
			root,
			args,
			policy,
			agent,
			proposal,
			slice,
		);
		if ('refusal' in chosen) return chosen.refusal;
		args = [...args, `--generation=${String(chosen.generation)}`];
	}
	const ambiguous = ambiguousUnit(root, args, policy, agent, proposal, slice);
	if (ambiguous !== undefined) return ambiguous;
	let ref = existingWorkRef(root, args, policy, agent, proposal, slice);
	if (
		scalarArg(args, 'topic') === undefined &&
		readGit(root, ['rev-parse', '-q', '--verify', ref]) === undefined
	) {
		// A unit nobody named is named for what it is.
		args = [
			...args,
			`--topic=${await topicForNewUnit(root, policy, args, proposal)}`,
		];
		ref = existingWorkRef(root, args, policy, agent, proposal, slice);
	}
	const branch = ref.replace(/^refs\/heads\//u, '');
	const base = integrationBase(root, policy);
	if (base === undefined) {
		return refused(
			`The integration branch \`${policy.branches.integration}\` resolves to no commit in this clone.`,
			'Fetch it (git fetch), or correct development.branches.integration.',
		);
	}
	const existing = readGit(root, ['worktree', 'list', '--porcelain']) ?? '';
	const known = existing
		.split('\n\n')
		.find((block) => block.includes(`branch ${ref}`));
	const session = sessionFor(args);
	if (known !== undefined) {
		const path = known
			.split('\n')
			.find((line) => line.startsWith('worktree '))
			?.slice('worktree '.length);
		const held =
			path === undefined ? undefined : heldByAnother(path, session);
		if (held !== undefined) return held;
		const claimed =
			path === undefined ? session : claimWorktree(path, agent, session);
		return withBriefing(ctx, root, policy, agent, {
			ref,
			branch,
			path: path ?? null,
			created: false,
			session: claimed,
			...hydratedIdleUnit(root, path, ref, base),
		});
	}
	// A proposal in progress keeps one branch: a later slice continues on
	// the branch the agent already has for it.
	const continued = liveProposalBranch(
		policy.branches.workRefTemplate,
		ref,
		existing,
	);
	if (continued !== undefined) {
		const path = continued.path ?? undefined;
		const held =
			path === undefined ? undefined : heldByAnother(path, session);
		if (held !== undefined) return held;
		const claimed =
			path === undefined ? session : claimWorktree(path, agent, session);
		return withBriefing(ctx, root, policy, agent, {
			ref: continued.ref,
			branch: continued.ref.replace(/^refs\/heads\//u, ''),
			path: continued.path,
			created: false,
			session: claimed,
			...hydratedIdleUnit(root, path, continued.ref, base),
		});
	}
	const createdRef =
		readGit(root, ['rev-parse', '-q', '--verify', ref]) === undefined;
	const topic = sanitizeRefComponent(scalarArg(args, 'topic') ?? '');
	if (createdRef && topic.length > MAX_WORK_TOPIC_LENGTH) {
		return refused(
			`The topic is ${String(topic.length)} characters; a unit's topic is at most ${String(MAX_WORK_TOPIC_LENGTH)}.`,
			'Name the work in a few words (--topic=review-pack-3). A review unit lists what it claims in its commits, not in its name.',
		);
	}
	if (
		createdRef &&
		(scalarArg(args, 'kind') ?? 'implement') === 'implement' &&
		!args.includes('--alongside')
	) {
		// The refs this clone has may be a minute old: the forge decides.
		const reservedElsewhere = sliceHeldOnForge({
			root,
			policy,
			proposal,
			slice,
			agent,
			branch,
		});
		if (reservedElsewhere !== undefined) return reservedElsewhere;
	}
	if (createdRef) {
		// From the integration branch, by plumbing: no checkout moves.
		if (readGit(root, ['update-ref', ref, base]) === undefined) {
			return refused(
				`Could not create ${ref}.`,
				'Inspect the repository; nothing was changed.',
			);
		}
	}
	// The agent is part of the path, as it is of the unit (x00695): two
	// reviewers each entering `--proposal=batch --slice=all` were both sent
	// to `batch-all`, and took turns checking their branches out in it.
	// Units live beside each other under the SHARED checkout, wherever
	// `work enter` runs: entered from inside another unit, the default
	// placed the new worktree inside that one's `.cache`, and installing
	// dependencies there pointed every hook in the clone at it.
	const dir =
		scalarArg(args, 'dir') ??
		resolve(
			sharedCheckout(root) ?? root,
			scalarArg(args, 'worktrees') ?? '.cache/delendai/.worktrees',
			sanitizeRefComponent(
				`${agent}-${proposal}-${slice}${unitGeneration(args) > 1 ? `-g${String(unitGeneration(args))}` : ''}`,
			),
		);
	// A worktree an agent places in the shared checkout's tree is a loose
	// edit on the integration branch (`?? batch-g5/`) unless git ignores
	// the path. The default location is delendai's own, self-ignoring.
	const within = relative(root, resolve(root, dir));
	if (
		scalarArg(args, 'dir') !== undefined &&
		within.length > 0 &&
		!within.startsWith('..') &&
		!isAbsolute(within) &&
		readGit(root, ['check-ignore', '-q', '--no-index', `${within}/`]) ===
			undefined
	) {
		return refused(
			`${dir} is inside the shared checkout and not ignored: the worktree would show there as an untracked directory, a loose edit on the integration branch.`,
			'Leave --dir out (units live under .cache/delendai/.worktrees), or give a path git ignores or outside the repository.',
		);
	}
	const added = readGit(root, ['worktree', 'add', dir, branch]);
	if (added === undefined) {
		// A branch made for a worktree that could not be added belongs to
		// nobody: it went on to sit in the namespace looking alive.
		if (createdRef) readGit(root, ['update-ref', '-d', ref]);
		return refused(
			`Could not add a worktree for ${branch} at ${dir}.`,
			'Check that the path is free and that the branch is not already checked out elsewhere.',
		);
	}
	// Whatever runtime works here is recognised as this agent (x00688),
	// and this session of it holds the unit (x00699).
	// `--dir` may be absolute: joining it onto the root named a path that
	// does not exist, the session was stamped nowhere, and the next
	// instance took this unit as free (x00731).
	const path = resolve(root, dir);
	const claimed = claimWorktree(path, agent, session);
	return withBriefing(ctx, root, policy, agent, {
		ref,
		branch,
		path,
		created: true,
		session: claimed,
	});
};
