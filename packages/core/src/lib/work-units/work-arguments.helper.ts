/**
 * work-arguments.helper.ts — the refusal of a work subcommand missing a
 * flag no default fills, worded once for the early check in
 * `runWorkUnit` and for each subcommand's own.
 */
import { WORK_ARGUMENT_RULES } from '../contracts/constants/work-arguments.constant';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import type { IWorkArgumentsSubcommand } from '../contracts/interfaces/work-arguments.interface';
import { refused } from './work-unit-shared.service';

export const argumentsRefused = (
	sub: IWorkArgumentsSubcommand,
	more = '',
): IWorkUnitResult =>
	refused(
		WORK_ARGUMENT_RULES[sub].reason,
		`${WORK_ARGUMENT_RULES[sub].usage}${more}`,
	);
