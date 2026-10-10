import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { reapLandedRetired } from './retired-landed.service';
import { reapSpentReservations } from './slice-reservation-reap.service';
import { hydrateKeptUnits } from './kept-unit-hydration.service';
import { reapDeliveredUnits } from './unit-reaper.service';
import { worktreeOfRef } from './unit-removal.service';
import { hasLocalBranch, readUnitStandings } from './unit-standings.service';
import { leaseWindowSeconds } from './unit-verdict.service';
import {
	integrationBase,
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
	// What was not removed and holds nothing is brought forward, so a unit
	// kept for its proposal's next slice does not fall behind unseen.
	const removed = new Set(
		units
			.filter((unit) => unit.outcome === 'removed')
			.map((unit) => unit.ref),
	);
	const advanced = hydrateKeptUnits({
		root: opened.root,
		base: integrationBase(opened.root, opened.policy),
		units: (
			await readUnitStandings({
				root: opened.root,
				policy: opened.policy,
			})
		)
			.filter(
				(unit) =>
					!removed.has(unit.ref) &&
					hasLocalBranch(opened.root, unit.ref),
			)
			.map((unit) => ({
				ref: unit.ref,
				worktree: worktreeOfRef(opened.root, unit.ref),
			})),
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
		data: { units, advanced, husks, retired, reservations },
	};
};
