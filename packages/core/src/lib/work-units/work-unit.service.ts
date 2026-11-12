import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import { access } from 'node:fs/promises';
import { WORK_ARGUMENT_RULES } from '../contracts/constants/work-arguments.constant';
import type { IWorkArgumentsRule } from '../contracts/interfaces/work-arguments.interface';
import { scalarArg } from './command-args.helper';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import type { IPolicyIdentity } from '../contracts/interfaces/policy-identity.interface';

import { doctored, statusOf, swarm } from './work-unit-status.service';
import { entered } from './work-unit-enter.service';
import { published } from './work-unit-publish.service';
import { publishedSupersedingOld } from './superseded-publication.service';
import { proved } from './work-unit-prove.service';
import { claimed } from './work-unit-claim.service';
import { retiredDropped } from './work-retired-drop.service';
import { retired, retiredListed } from './work-unit-retire.service';
import { checkpointed } from './work-unit-checkpoint.service';
import {
	agentFor,
	refused,
	withSessionOfCwd,
	workspaceOf,
} from './work-unit-shared.service';
import { readWorkspacePolicy } from './development-policy.service';
import { recordUnitEntered, touchUnitOfCheckout } from './unit-lease.service';
import { pruneUnitLeases } from './unit-standings.service';
import { reaped } from './work-unit-reap.service';
import { rescued } from './shared-checkout-rescue.service';
import { looseSharedCheckoutRefusal } from './shared-checkout-clean.service';
import { integrationProtocolRefusal } from '../integration/protocol/integration-protocol.helper';
import { withGitInvocationMemo } from '../shared/git-invocation-memo.helper';
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
	// Publishing from inside the unit removed the directory it ran in:
	// nothing there can be read, so nothing is asked of it.
	try {
		await access(workspaceOf(ctx));
	} catch {
		return;
	}
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
	axis?: IPolicyIdentity | undefined,
): Promise<void> => {
	const data = result.data as Partial<IEnteredWorktree> | undefined;
	if (data?.ref === undefined) return;
	try {
		await recordUnitEntered({
			cwd: workspaceOf(ctx),
			ref: data.ref,
			owner: {
				agent: agentFor(args, workspaceOf(ctx), axis),
				session: data.session ?? null,
			},
			worktree: data.path ?? null,
			clientCwd: ctx.cwd,
			serverRoot: workspaceOf(ctx),
		});
	} catch {
		// see showLife
	}
};

/**
 * The commands that write a unit's work or land it. None runs while the
 * shared checkout holds loose edits: they would be carried, lost or taken
 * for the unit's, and the shared checkout stays clean by construction.
 * `work deliver` proves first, so it is refused with `prove`.
 */
const MUTATING = new Set(['enter', 'checkpoint', 'prove', 'publish']);

/**
 * The operations that move refs or pull requests on the forge. A process
 * older than the repository's integration protocol refuses them.
 */
const INTEGRATING = new Set(['publish', 'claim', 'retire', 'reap']);

/**
 * A unit-of-work operation (`status`, `swarm`, `doctor`, `claim`, `enter`,
 * `checkpoint`, `prove`, `publish`, `retire`) from its flags: the one engine behind the CLI's
 * `work` command and the MCP `work` tool.
 */
export const runWorkUnit = (
	given: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> =>
	// One memo of git reads per invocation: the common dir, the remotes and
	// the worktree list do not change between the many services one command
	// asks, and a write forgets them.
	withGitInvocationMemo(() => runWorkUnitOnce(given, ctx));

/**
 * The refusal of a call missing a flag no default fills, before anything
 * is asked of git or read from the workspace.
 */
const missingArguments = (
	args: readonly string[],
): IWorkUnitResult | undefined => {
	const rules: Readonly<Record<string, IWorkArgumentsRule | undefined>> =
		WORK_ARGUMENT_RULES;
	const rule = rules[args[0] ?? ''];
	if (rule === undefined) return undefined;
	return rule.required.every(
		(flag) => (scalarArg(args, flag) ?? '').trim().length > 0,
	)
		? undefined
		: refused(rule.reason, rule.usage);
};

const runWorkUnitOnce = async (
	given: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const missing = missingArguments(given);
	if (missing !== undefined) return missing;
	let args = given;
	const sub = args[0];
	// One policy read serves the whole operation: the session check and
	// the entered-unit record both name the agent the same way, and the
	// way is the project's `development.identity` axis (f00758).
	const policy = await readWorkspacePolicy(workspaceOf(ctx));
	const axis = policy.identity;
	args = withSessionOfCwd(args, ctx.cwd, axis);
	await showLife(ctx);
	if (sub !== undefined && INTEGRATING.has(sub)) {
		const stale = integrationProtocolRefusal(policy.integration.protocol);
		if (stale !== undefined) return refused(stale.reason, stale.remedy);
	}
	if (sub !== undefined && MUTATING.has(sub)) {
		const loose = looseSharedCheckoutRefusal(workspaceOf(ctx), policy);
		if (loose !== undefined) return refused(loose.reason, loose.remedy);
	}
	if (sub === 'status' || sub === undefined) return statusOf(ctx);
	if (sub === 'checkpoint') return checkpointed(args, ctx);
	if (sub === 'enter') {
		const result = await entered(args, ctx);
		await recordEntered(args, ctx, result, axis);
		return result;
	}
	if (sub === 'reap') return reaped(args, ctx);
	if (sub === 'rescue') return rescued(args, ctx);
	if (sub === 'publish') {
		const result = await publishedSupersedingOld(args, ctx, published);
		await pruneEndedLeases(ctx);
		return result;
	}
	if (sub === 'prove') return proved(args, ctx);
	if (sub === 'swarm') return swarm(ctx, args);
	if (sub === 'doctor') return doctored(args, ctx);
	if (sub === 'claim') return claimed(args, ctx);
	if (sub === 'retire') return retired(args, ctx);
	if (sub === 'retired') {
		return args.some((arg) => arg.startsWith('--drop'))
			? retiredDropped(args, ctx)
			: retiredListed(ctx);
	}
	return {
		code: EXIT_CODE.VALIDATION,
		error: `Unknown subcommand '${sub}'. Use status, swarm, doctor, claim, enter, checkpoint, prove, publish, retire or reap.`,
	};
};
