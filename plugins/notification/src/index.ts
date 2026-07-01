import { definePlugin, joinRel } from '@mcp-vertex/core/public';
import { z } from 'zod';

import {
	buildAwaitLockRegistration,
	buildNotifyRegistration,
} from './lib/tools';

/**
 * The notification plugin. It turns the swarm's file-based lock release
 * into a push: each server watches the shared lock file and emits an MCP
 * `notifications/message` ({ event: "lock-released", ... }) when a lock
 * frees, so waiting agents stop polling `agent_lock status`.
 *
 * Load it with `mcp-vertex --plugins=notification`. Pairs with the
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
		/** Workspace-relative handoff directory to watch. Default `<cacheDir>/handoff`. */
		watchHandoffDir: z.string().optional(),
		/** Polling fallback interval (ms). Default 2000. */
		intervalMs: z.number().optional(),
		/** Heartbeat interval (ms) for agent-alive/idle/dead classification. */
		heartbeatMs: z.number().optional(),
		/**
		 * f00072 S4 — TTL (days) for stale handoff files. The plugin
		 * registers an `olderThanDays` eviction rule for `handoff/*` so
		 * crashed-agent handoff artefacts don't accumulate. Default 7
		 * (matches the loop-detector's `handoffTtlDays`).
		 */
		handoffTtlDays: z.number().optional(),
	}),
	register(ctx) {
		const lockRel =
			typeof ctx.options.watchLockFile === 'string'
				? (ctx.options.watchLockFile as string)
				: joinRel(ctx.cacheDir, 'agents.lock.json');
		const handoffRel =
			typeof ctx.options.watchHandoffDir === 'string'
				? (ctx.options.watchHandoffDir as string)
				: joinRel(ctx.cacheDir, 'handoff');

		const toolOptions = {
			namespacePrefix: ctx.namespacePrefix,
			lockFileAbs: ctx.workspace.resolve(lockRel),
			handoffDirAbs: ctx.workspace.resolve(handoffRel),
			handoffDirRel: handoffRel,
			...(typeof ctx.options.intervalMs === 'number'
				? { intervalMs: ctx.options.intervalMs as number }
				: {}),
			...(typeof ctx.options.heartbeatMs === 'number'
				? { heartbeatMs: ctx.options.heartbeatMs as number }
				: {}),
		};

		// f00072 S4: register a stale-handoff eviction rule against the
		// shared cache registry. Handoff artefacts are owned by this
		// plugin's watcher; nothing prunes them today. We only register
		// when the handoff dir lives under the cache root (the default),
		// so the rule's cache-relative `handoff/*` path stays contained;
		// a host that points `watchHandoffDir` elsewhere opts out. The
		// registry's `olderThanDays` strategy reads each entry's mtime
		// (handoff files are not date-named), dry-run by default.
		const defaultHandoffRel = joinRel(ctx.cacheDir, 'handoff');
		if (handoffRel === defaultHandoffRel) {
			const handoffTtlDays =
				typeof ctx.options.handoffTtlDays === 'number'
					? ctx.options.handoffTtlDays
					: 7;
			ctx.cacheEvictionRegistry?.register({
				id: 'handoff-stale',
				owner: 'notification',
				path: 'handoff/*',
				when: { kind: 'olderThanMtimeDays', days: handoffTtlDays },
			});
		}

		return {
			tools: [
				buildNotifyRegistration(toolOptions),
				buildAwaitLockRegistration(toolOptions),
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
						'`agent_lock status` in a loop. Either wait for the `lock-released`',
						'notification for the conflicting files, or call',
						'`<prefix>_await_lock { taskId }` — it blocks until that lock frees',
						'(or times out) and returns, so you retry the claim exactly once.',
						'This replaces N polling round-trips with a single wait.',
						'The same watcher also emits `agent-alive`, `agent-idle`,',
						'and `agent-dead` lifecycle messages from the lock-file',
						'heartbeat so recovery tools can react without scanning.',
					].join('\n'),
				},
			],
		};
	},
});
