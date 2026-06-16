import { definePlugin, joinRel } from '@cartago-git/mcp-core/public';
import { z } from 'zod';

import { buildNotifyRegistration } from './lib/tools';

/**
 * The notification plugin. It turns the swarm's file-based lock release
 * into a push: each server watches the shared lock file and emits an MCP
 * `notifications/message` ({ event: "lock-released", ... }) when a lock
 * frees, so waiting agents stop polling `agent_lock status`.
 *
 * Load it with `mcp-core --plugins=notification`. Pairs with the
 * `proposals` plugin (which owns the lock file); the default watch path
 * matches its layout (`<cacheDir>/agents.lock.json`) and can be
 * overridden via the `watchLockFile` option.
 */
export default definePlugin({
	name: 'notification',
	version: '0.1.0',
	describe:
		'Push notifications/message when a file lock is released, so agents stop polling agent_lock.',
	optionsSchema: z.object({
		/** Workspace-relative lock file to watch. Default `<cacheDir>/agents.lock.json`. */
		watchLockFile: z.string().optional(),
		/** Polling fallback interval (ms). Default 2000. */
		intervalMs: z.number().optional(),
	}),
	register(ctx) {
		const lockRel =
			typeof ctx.options['watchLockFile'] === 'string'
				? (ctx.options['watchLockFile'] as string)
				: joinRel(ctx.cacheDir, 'agents.lock.json');

		return {
			tools: [
				buildNotifyRegistration({
					namespacePrefix: ctx.namespacePrefix,
					lockFileAbs: ctx.workspace.resolve(lockRel),
					...(typeof ctx.options['intervalMs'] === 'number'
						? { intervalMs: ctx.options['intervalMs'] as number }
						: {}),
				}),
			],
			knowledge: [
				{
					id: 'lock-notifications',
					title: 'Lock-release notifications',
					body: [
						'# Lock-release notifications',
						'',
						'With `--plugins=notification`, the server watches the shared lock',
						'file and emits an MCP `notifications/message` when a claim is',
						'released:',
						'',
						'```json',
						'{ "event": "lock-released", "taskId": "p81-s2", "agent": "falcon", "files": ["src/a.ts"] }',
						'```',
						'',
						'When you get `lock-conflict` from `agent_lock`, do NOT poll',
						'`agent_lock status` in a loop. Wait for the `lock-released`',
						'notification for the conflicting files, then retry the claim once.',
						'This replaces N polling round-trips with a single push.',
					].join('\n'),
				},
			],
		};
	},
});
