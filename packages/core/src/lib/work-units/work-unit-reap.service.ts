import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { reapLandedRetired } from './retired-landed.service';
import { reapSpentReservations } from './slice-reservation-reap.service';
import { reapDeliveredUnits } from './unit-reaper.service';
import { leaseWindowSeconds } from './unit-verdict.service';
import {
	integrationRemote,
	mainWorktreeOf,
	openWork,
} from './work-unit-shared.service';
import { reapHusks } from './worktree-husks.service';

/**
 * `work reap [--apply]` — remove the worktree and local branch of every
 * delivered unit whose worktree holds no edit of its own, and every
 * directory beside the units that is no unit, keeping on the forge what
 * such a directory held that no commit has; and drop from the forge the
 * retired work the integration branch came to hold and the slice
 * reservations whose unit is gone. Reports only, without `--apply`.
 */
export const reaped = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const units = await reapDeliveredUnits({
		root: opened.root,
		policy: opened.policy,
		apply: args.includes('--apply'),
	});
	const root = mainWorktreeOf(opened.root);
	const remote = ctx.globals.remote ?? integrationRemote(root, opened.policy);
	const husks = await reapHusks({
		root,
		remote,
		namespace: opened.policy.branches.namespacePrefix,
		windowSeconds: leaseWindowSeconds(
			opened.policy.coordination.leaseTtlMinutes,
		),
		apply: args.includes('--apply'),
		now: Math.floor(Date.now() / 1000),
	});
	const retired = reapLandedRetired({
		root,
		policy: opened.policy,
		remote,
		apply: args.includes('--apply'),
	});
	const reservations = reapSpentReservations({
		root,
		policy: opened.policy,
		remote,
		apply: args.includes('--apply'),
		now: Math.floor(Date.now() / 1000),
	});
	return {
		code: EXIT_CODE.OK,
		data: { units, husks, retired, reservations },
	};
};
