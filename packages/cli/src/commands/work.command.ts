/**
 * work.command.ts — the CLI's `work` command: the unit-of-work engine in
 * core (`runWorkUnit`), which the MCP `work` tool runs too, and the
 * `progress` view of the work, which is the CLI's own.
 */
import { runWorkUnit } from '@delendai/core/cli';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';

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

/** The flag that makes `work enter` print the worktree's path and nothing else. */
const PRINT_PATH_FLAG = '--print-path';

/**
 * `work enter --print-path`: the path alone on stdout, the refusal on
 * stderr with a non-zero exit. A script that read the path out of the
 * report through a pipe lost the exit code with it: the refusal left the
 * variable empty, `cd ""` stayed in the shared checkout, and the next git
 * command wrote there. Command substitution keeps the exit code.
 */
export const printPathOnly = (result: ICliCommandResult): ICliCommandResult => {
	const path =
		result.code === 0 && isRecord(result.data)
			? result.data.path
			: undefined;
	if (typeof path === 'string' && path.length > 0) {
		process.stdout.write(`${path}\n`);
		return { code: EXIT_CODE.OK };
	}
	return result.code === 0
		? {
				code: EXIT_CODE.VALIDATION,
				error: 'work enter answered without a worktree path',
			}
		: result;
};

export const createWorkCommand = (): ICliCommand => ({
	name: 'work',
	...WORK_COMMAND,
	run: async (args, ctx) => {
		if (args[0] === 'progress') return runWorkProgress(args.slice(1), ctx);
		if (args[0] === 'enter' && args.includes(PRINT_PATH_FLAG)) {
			return printPathOnly(
				await runWorkUnit(
					args.filter((arg) => arg !== PRINT_PATH_FLAG),
					{ ...ctx, globals: { ...ctx.globals, json: true } },
				),
			);
		}
		const result = await runWorkUnit(args, ctx);
		return args[0] === 'enter' ? withSlicesView(result, ctx) : result;
	},
});

export const workCommand: ICliCommand = createWorkCommand();
