/**
 * work.command.ts — the CLI's `work` command: the unit-of-work engine in
 * core (`runWorkUnit`), which the MCP `work` tool runs too, and the
 * `progress` view of the work, which is the CLI's own.
 */
import { runWorkUnit } from '@delendai/core/cli';

import { WORK_COMMAND } from '../contracts/constants/work-command.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { isRecord } from '../lib/helpers/cli-command.helper';
import { runWorkProgress } from '../lib/work-progress.service';

/**
 * Where an agent that just entered a unit reads what its slice asks for.
 * A plan document runs to tens of kilobytes and a slice is a few hundred
 * bytes of it; the proposals plugin cuts the open slices out, with what
 * each waits on, changes and still has to meet.
 */
const SLICES_VIEW_HINT =
	'the open slices of the proposal (the proposals `proposal_get` tool, view `slices`), not its whole document';

/** Name that view to whoever entered: in the payload, and in the text. */
export const withSlicesView = (
	result: ICliCommandResult,
	ctx: ICliCommandContext,
): ICliCommandResult => {
	if (result.code !== 0 || !isRecord(result.data)) return result;
	if (!ctx.globals.json) {
		process.stdout.write(`read             ${SLICES_VIEW_HINT}\n`);
	}
	return { ...result, data: { ...result.data, read: SLICES_VIEW_HINT } };
};

export const createWorkCommand = (): ICliCommand => ({
	name: 'work',
	...WORK_COMMAND,
	run: async (args, ctx) => {
		if (args[0] === 'progress') return runWorkProgress(args.slice(1), ctx);
		const result = await runWorkUnit(args, ctx);
		return args[0] === 'enter' ? withSlicesView(result, ctx) : result;
	},
});

export const workCommand: ICliCommand = createWorkCommand();
