import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { reapLandedRetired } from './retired-landed.service';
import { reapSpentReservations } from './slice-reservation-reap.service';
import { hydrateKeptUnits } from './kept-unit-hydration.service';
import { releaseIdleDependencies } from './idle-unit-dependencies.service';
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
import { reapStrayRefs } from './stray-refs-reap.service';

/**
 * `work reap [--apply]` — remove the worktree and local branch of every
 * delivered unit whose worktree holds no edit of its own, and every
 * directory beside the units that is no unit, keeping on the forge what
 * such a directory held that no commit has; and drop from the forge the
 * retired work the integration branch came to hold, the slice
 * reservations and review claims whose unit is gone, and the refs
 * outside every namespace that carry no work; and give back the
 * dependencies of the kept units nobody works on. Reports only, without
 * `--apply`.
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
	// A unit the reaper just judged spent is not also brought forward.
	const spent = new Set<string>();
	for (const unit of units) spent.add(unit.ref);
	const kept = (
		await readUnitStandings({
			root: opened.root,
			policy: opened.policy,
		})
	).filter(
		(unit) => !spent.has(unit.ref) && hasLocalBranch(opened.root, unit.ref),
	);
	const advanced = hydrateKeptUnits({
		root: opened.root,
		base: integrationBase(opened.root, opened.policy),
		units: kept.map((unit) => ({
			ref: unit.ref,
			worktree: worktreeOfRef(opened.root, unit.ref),
		})),
		apply: args.includes('--apply'),
	});
	// A kept unit whose owner is not live gives its dependencies back;
	// entering it again installs them.
	const dependencies = await releaseIdleDependencies({
		units: kept.map((unit) => ({
			ref: unit.ref,
			standing: unit.standing,
			worktree: worktreeOfRef(opened.root, unit.ref) ?? null,
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
	// A ref outside every namespace a clone holds, carrying no work.
	const strays = reapStrayRefs({
		root,
		policy: opened.policy,
		apply: args.includes('--apply'),
	});
	return {
		code: EXIT_CODE.OK,
		data: {
			units,
			advanced,
			dependencies,
			husks,
			retired,
			reservations,
			strays,
		},
	};
};
