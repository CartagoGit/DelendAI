/**
 * proposals-watch.service.ts — the slice listener wakes when a proposal
 * document changes instead of walking the whole tree every second.
 *
 * An idle server spent about 7% of a core listing the proposals tree
 * (lstat and readdir over every document) once a second, with nothing
 * changing. The directory is watched instead, and the poll stays only as
 * a slow safety net for a platform whose watcher misses events.
 */
// effect-boundary-authorized: the proposals watch is this plugin's file adapter
import { stat, watch } from 'node:fs/promises';

import { PROPOSALS_WATCH_DEBOUNCE_MS } from '../contracts/constants/proposals-watch.constant';
import type { IProposalsWatch } from '../contracts/interfaces/proposals-watch.interface';

/**
 * Watch `directory` recursively and call `onChange` once per burst of
 * changes. Answers `undefined` when the directory cannot be watched, and
 * the caller keeps polling at its own pace.
 */
export const watchProposals = async (
	directory: string,
	onChange: () => void,
	debounceMs: number = PROPOSALS_WATCH_DEBOUNCE_MS,
): Promise<IProposalsWatch | undefined> => {
	const found = await stat(directory).then(
		(info) => info.isDirectory(),
		() => false,
	);
	if (!found) return undefined;
	const stopped = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	void (async () => {
		try {
			for await (const _change of watch(directory, {
				recursive: true,
				signal: stopped.signal,
				persistent: false,
			})) {
				if (timer !== undefined) clearTimeout(timer);
				timer = setTimeout(() => {
					timer = undefined;
					onChange();
				}, debounceMs);
				timer.unref();
			}
		} catch {
			// Closed, or the watcher died: the safety poll carries on.
		}
	})();
	return {
		close: () => {
			if (timer !== undefined) clearTimeout(timer);
			stopped.abort();
		},
	};
};
