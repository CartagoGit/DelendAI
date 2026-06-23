/**
 * f00046 S8 — notification commands. One subcommand per `notification_*`
 * MCP tool. Pure 1:1 delegation.
 *
 * Tools mapped:
 *   - `notification_notify_status` (no args)
 *   - `notification_await_lock`    ({ taskId, timeoutMs? })
 */
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import {
	data,
	numberArg,
	positionalArg,
	request,
	usage,
} from './group-helpers';

const notifyStatusCommand: ICliCommand = {
	name: 'notification status',
	summary:
		'Report the lock-release notifier (watched file + recent releases).',
	async run(_args, ctx) {
		return data(await request(ctx, 'notification_notify_status', {}));
	},
};

const awaitLockCommand: ICliCommand = {
	name: 'notification await-lock',
	summary: 'Block until a taskId lock is released (or timeout), then return.',
	async run(args, ctx) {
		const taskId = positionalArg(args);
		if (taskId === undefined) {
			return usage('notification await-lock <taskId> [--timeout=N]');
		}
		const timeoutMs =
			numberArg(args, 'timeout') ?? numberArg(args, 'timeoutMs');
		return data(
			await request(ctx, 'notification_await_lock', {
				taskId,
				...(timeoutMs !== undefined ? { timeoutMs } : {}),
			}),
		);
	},
};

export const notificationCommands: readonly ICliCommand[] = [
	notifyStatusCommand,
	awaitLockCommand,
];
