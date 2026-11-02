import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { IEnteredWorktree } from '../contracts/interfaces/work-briefing.interface';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { briefingFrom, describeBriefing } from './work-briefing.service';
import { describeTaskBriefing, taskBriefingFor } from './task-briefing.service';
import { readSwarm } from './work-swarm.service';

/**
 * Hand an entering agent the picture, in whichever form it reads.
 *
 * The briefing is attached to the payload rather than only printed,
 * because the caller is as often a machine as a person: an agent driving
 * `--json` must not have to run a second command to learn what a human
 * would have read on the way in.
 */
export const withBriefing = async (
	ctx: IWorkUnitContext,
	root: string,
	policy: IResolvedDevelopmentPolicy,
	agent: string,
	data: IEnteredWorktree,
	unit: { readonly proposal: string; readonly slice: string },
): Promise<IWorkUnitResult> => {
	const briefing = briefingFrom({
		agent,
		view: readSwarm({ root, policy }),
	});
	const task =
		data.path === null
			? undefined
			: await taskBriefingFor({ worktree: data.path, ...unit });
	const payload = {
		...data,
		swarm: briefing,
		...(task === undefined ? {} : { task }),
	};
	if (ctx.globals.json || ctx.globals.format === 'json') {
		return { code: EXIT_CODE.OK, data: payload };
	}
	process.stdout.write(
		`${[
			`ref              ${data.ref}`,
			`worktree         ${data.path ?? '(none)'}`,
			...(data.session === undefined
				? []
				: [
						`session          ${data.session} (pass --session=${data.session} to enter this unit again)`,
					]),
			...describeBriefing(briefing),
			...(task === undefined ? [] : describeTaskBriefing(task)),
		].join('\n')}\n`,
	);
	return { code: EXIT_CODE.OK, data: payload, suppressDefaultPrint: true };
};
