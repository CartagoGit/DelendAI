/**
 * handoff-watcher.ts — watch the handoff directory and report new
 * handoff documents.
 *
 * Split out of `watcher.ts`, which had grown to hold two watchers that
 * share nothing but a polling shape: the release watcher observes a
 * single lock FILE and reports claims that disappeared, this one
 * observes a DIRECTORY and reports documents that appeared. Different
 * inputs, different events, no shared state.
 */
// effect-boundary-authorized: a filesystem watcher cannot route through
// ctx.effects — `IPluginEffectsCapability` declares only `git`, and its
// own doc comment states filesystem capabilities are deliberately not
// declared until a plugin migrates to need one. These are read-only
// observations (fs.watch + readdir + SafeWorkspaceReader), not the
// mutating effects the dry-run gate exists to intercept.
import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';

import { pathExists } from './watcher';

import type {
	IHandoffEvent,
	IHandoffWatcher,
} from '../contracts/interfaces/handoff-watcher.interface';

export type {
	IHandoffEvent,
	IHandoffWatcher,
} from '../contracts/interfaces/handoff-watcher.interface';

export const createHandoffWatcher = (params: {
	readonly handoffDir: string;
	readonly onHandoff: (events: readonly IHandoffEvent[]) => void;
	readonly intervalMs?: number;
}): IHandoffWatcher => {
	const seenFiles = new Set<string>();
	// The first `check()` call populates `seenFiles` from whatever already
	// exists in the directory without emitting events for it — equivalent
	// to the old constructor-time sync pre-scan, just deferred to the first
	// async tick (the factory itself stays sync).
	let primed = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	let fsWatcher: FSWatcher | undefined;
	// Serializes ticks: a `setInterval`/`fs.watch` callback firing while a
	// scan is already in flight skips the tick instead of overlapping it.
	let checkInFlight = false;

	const listJsonFiles = async (): Promise<string[]> => {
		try {
			const files = await readdir(params.handoffDir);
			return files.filter((file) => file.endsWith('.json'));
		} catch {
			return [];
		}
	};

	const check = async (): Promise<IHandoffEvent[]> => {
		const events: IHandoffEvent[] = [];

		if (!primed) {
			primed = true;
			for (const file of await listJsonFiles()) seenFiles.add(file);
			return events;
		}

		for (const file of await listJsonFiles()) {
			if (seenFiles.has(file)) continue;
			seenFiles.add(file);
			const pathAbs = join(params.handoffDir, file);
			try {
				const content = (
					await new SafeWorkspaceReader(params.handoffDir).readText(
						file,
					)
				).content;
				const parsed = JSON.parse(content);
				if (
					parsed &&
					typeof parsed.schema === 'string' &&
					parsed.schema.startsWith('delendai/handoff/')
				) {
					events.push({
						file,
						agent: parsed.from?.agent ?? 'unknown',
						reason: parsed.reason ?? 'unknown',
						handoffPath: pathAbs,
					});
				}
			} catch {
				// File might be in the middle of being written, remove from seen
				seenFiles.delete(file);
			}
		}

		if (events.length > 0) {
			params.onHandoff(events);
		}
		return events;
	};

	const tick = (): void => {
		if (checkInFlight) return;
		checkInFlight = true;
		void check().finally(() => {
			checkInFlight = false;
		});
	};

	const start = (): void => {
		const intervalMs = params.intervalMs ?? 2_000;
		timer = setInterval(tick, intervalMs);
		timer.unref?.();
		// Prime `seenFiles` before the first interval tick so pre-existing
		// files never appear as "new" once polling begins.
		void check();

		void (async (): Promise<void> => {
			try {
				if (await pathExists(params.handoffDir)) {
					fsWatcher = watch(params.handoffDir, tick);
				}
			} catch {
				// fs.watch unsupported here → polling fallback already covers it.
			}
		})();
	};

	const stop = (): void => {
		if (timer) clearInterval(timer);
		if (fsWatcher) fsWatcher.close();
		timer = undefined;
		fsWatcher = undefined;
	};

	return { check, start, stop };
};
