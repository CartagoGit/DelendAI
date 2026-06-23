/**
 * f00046 S8 — status-marker commands. One subcommand per
 * `status-marker_*` MCP tool. Pure 1:1 delegation.
 *
 * Tools mapped:
 *   - `status-marker_close`    ({ state, reason? })
 *   - `status-marker_validate` ({ text })
 *   - `status-marker_ping`     (no args)
 */
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import {
	data,
	positionalArg,
	request,
	scalarArg,
	usage,
} from './group-helpers';

const closeCommand: ICliCommand = {
	name: 'status-marker close',
	summary: 'Return the exact coloured close-marker line for a state.',
	async run(args, ctx) {
		const state = positionalArg(args) ?? scalarArg(args, 'state');
		if (state === undefined) {
			return usage('status-marker close <state> [--reason=<why>]');
		}
		const reason = scalarArg(args, 'reason');
		return data(
			await request(ctx, 'status-marker_close', {
				state,
				...(reason !== undefined ? { reason } : {}),
			}),
		);
	},
};

const validateCommand: ICliCommand = {
	name: 'status-marker validate',
	summary: 'Check whether a response ends with a valid close marker.',
	async run(args, ctx) {
		const text = positionalArg(args) ?? scalarArg(args, 'text');
		if (text === undefined) return usage('status-marker validate <text>');
		return data(await request(ctx, 'status-marker_validate', { text }));
	},
};

const pingCommand: ICliCommand = {
	name: 'status-marker ping',
	summary: 'Echo plugin identity + resolved paths (confirm it is loaded).',
	async run(_args, ctx) {
		return data(await request(ctx, 'status-marker_ping', {}));
	},
};

export const statusMarkerCommands: readonly ICliCommand[] = [
	closeCommand,
	validateCommand,
	pingCommand,
];
