import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { reapDeliveredUnits } from './unit-reaper.service';
import { openWork } from './work-unit-shared.service';

/**
 * `work reap [--apply]` — remove the worktree and local branch of every
 * delivered unit whose worktree holds no edit of its own. Reports only,
 * without `--apply`.
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
	return { code: EXIT_CODE.OK, data: { units } };
};
