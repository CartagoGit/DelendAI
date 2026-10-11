/**
 * work.command.ts — the CLI's `work` command: the unit-of-work engine in
 * core (`runWorkUnit`), which the MCP `work` tool runs too, and the
 * `progress` view of the work, which is the CLI's own.
 */
import { runWorkUnit } from '@delendai/core/cli';

import { WORK_COMMAND } from '../contracts/constants/work-command.constant';
import type { ICliCommand } from '../contracts/interfaces/cli-command.interface';
import { runWorkProgress } from '../lib/work-progress.service';

export const createWorkCommand = (): ICliCommand => ({
	name: 'work',
	...WORK_COMMAND,
	run: (args, ctx) =>
		args[0] === 'progress'
			? runWorkProgress(args.slice(1), ctx)
			: runWorkUnit(args, ctx),
});

export const workCommand: ICliCommand = createWorkCommand();
