/**
 * work.command.ts — the CLI's `work` command: the unit-of-work engine in
 * core (`runWorkUnit`), which the MCP `work` tool runs too.
 */
import { runWorkUnit } from '@delendai/core/cli';

import { WORK_COMMAND } from '../contracts/constants/work-command.constant';
import type { ICliCommand } from '../contracts/interfaces/cli-command.interface';

export const createWorkCommand = (): ICliCommand => ({
	name: 'work',
	...WORK_COMMAND,
	run: (args, ctx) => runWorkUnit(args, ctx),
});

export const workCommand: ICliCommand = createWorkCommand();
