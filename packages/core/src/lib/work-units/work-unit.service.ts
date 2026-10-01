import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';

import { doctored, statusOf, swarm } from './work-unit-status.service';
import { entered } from './work-unit-enter.service';
import { published } from './work-unit-publish.service';
import { claimed } from './work-unit-claim.service';
import { checkpointed } from './work-unit-checkpoint.service';
import {
	agentFor,
	withSessionOfCwd,
	workspaceOf,
} from './work-unit-shared.service';
import { readWorkspacePolicy } from './development-policy.service';
import { recordUnitEntered, touchUnitOfCheckout } from './unit-lease.service';
import { pruneUnitLeases } from './unit-standings.service';
import { abandoned } from './work-unit-abandon.service';
import { reaped } from './work-unit-reap.service';
import type { IEnteredWorktree } from '../contracts/interfaces/work-briefing.interface';

/**
 * Every work command is a sign of life for the unit whose worktree it runs
 * in. A heartbeat that fails must never fail the command it rides on.
 */
const showLife = async (ctx: IWorkUnitContext): Promise<void> => {
	try {
		await touchUnitOfCheckout(
			ctx.cwd,
			await readWorkspacePolicy(workspaceOf(ctx)),
		);
	} catch {
		// the lease is advisory evidence; the command goes on without it
	}
};

/** A published unit's ref is gone; so is the lease that named its owner. */
const pruneEndedLeases = async (ctx: IWorkUnitContext): Promise<void> => {
	try {
		await pruneUnitLeases({
			root: workspaceOf(ctx),
			policy: await readWorkspacePolicy(workspaceOf(ctx)),
		});
	} catch {
		// a stale lease is harmless: standings are read from the refs
	}
};

/** Record the owner of a unit `enter` just handed out. */
const recordEntered = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
	result: IWorkUnitResult,
): Promise<void> => {
	const data = result.data as Partial<IEnteredWorktree> | undefined;
	if (data?.ref === undefined) return;
	try {
		await recordUnitEntered({
			cwd: workspaceOf(ctx),
			ref: data.ref,
			owner: { agent: agentFor(args), session: data.session ?? null },
			worktree: data.path ?? null,
		});
	} catch {
		// see showLife
	}
};

/**
 * A unit-of-work operation (`status`, `swarm`, `doctor`, `claim`, `enter`,
 * `checkpoint`, `publish`) from its flags: the one engine behind the CLI's
 * `work` command and the MCP `work` tool.
 */
export const runWorkUnit = async (
	given: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	let args = given;
	const sub = args[0];
	args = withSessionOfCwd(args, ctx.cwd);
	await showLife(ctx);
	if (sub === 'status' || sub === undefined) return statusOf(ctx);
	if (sub === 'checkpoint') return checkpointed(args, ctx);
	if (sub === 'enter') {
		const result = await entered(args, ctx);
		await recordEntered(args, ctx, result);
		return result;
	}
	if (sub === 'abandon') return abandoned(args, ctx);
	if (sub === 'reap') return reaped(args, ctx);
	if (sub === 'publish') {
		const result = await published(args, ctx);
		await pruneEndedLeases(ctx);
		return result;
	}
	if (sub === 'swarm') return swarm(ctx);
	if (sub === 'doctor') return doctored(args, ctx);
	if (sub === 'claim') return claimed(args, ctx);
	return {
		code: EXIT_CODE.VALIDATION,
		error: `Unknown subcommand '${sub}'. Use status, swarm, enter, checkpoint, publish, abandon or reap.`,
	};
};
