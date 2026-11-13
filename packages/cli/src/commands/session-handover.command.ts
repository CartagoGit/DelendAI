/**
 * session-handover.command.ts — `session handover`: the CLI face of the
 * session handover in core. It parses the action and prints the answer.
 */
import {
	runSessionHandover,
	SESSION_HANDOVER_ACTIONS,
	type ISessionHandoverAction,
} from '@delendai/core/cli';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommand } from '../contracts/interfaces/cli-command.interface';
import { scalarArg } from '../lib/helpers/cli-command.helper';

const isAction = (value: string | undefined): value is ISessionHandoverAction =>
	SESSION_HANDOVER_ACTIONS.some((action) => action === value);

export const sessionHandoverCommand: ICliCommand = {
	name: 'session handover',
	offline: true,
	readsOnly: (args) => args[0] !== 'persist',
	summary:
		'Persist the session handover from delendai stores, print its bounded index, or show one entry in full.',
	usage: 'session handover <persist|index|show> [--entry=<id>] [--session=<id>]',
	flags: ['entry', 'session'],
	async run(args, ctx) {
		const action = args.find((arg) => !arg.startsWith('--'));
		if (!isAction(action)) {
			return {
				code: EXIT_CODE.USAGE,
				text: `usage: session handover <${SESSION_HANDOVER_ACTIONS.join('|')}> [--entry=<id>] [--session=<id>]\n`,
			};
		}
		const entry = scalarArg(args, 'entry');
		const sessionId = scalarArg(args, 'session');
		const result = await runSessionHandover({
			root: ctx.globals.workspace,
			action,
			...(entry === undefined ? {} : { entry }),
			...(sessionId === undefined ? {} : { sessionId }),
		});
		return {
			code: result.ok ? EXIT_CODE.OK : EXIT_CODE.USAGE,
			data: result.data,
			text: result.text,
		};
	},
};
