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
import { withSessionOfCwd } from './work-unit-shared.service';

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
	if (sub === 'status' || sub === undefined) return statusOf(ctx);
	if (sub === 'checkpoint') return checkpointed(args, ctx);
	if (sub === 'enter') return entered(args, ctx);
	if (sub === 'publish') return published(args, ctx);
	if (sub === 'swarm') return swarm(ctx);
	if (sub === 'doctor') return doctored(args, ctx);
	if (sub === 'claim') return claimed(args, ctx);
	return {
		code: EXIT_CODE.VALIDATION,
		error: `Unknown subcommand '${sub}'. Use status, swarm, enter, checkpoint or publish.`,
	};
};
