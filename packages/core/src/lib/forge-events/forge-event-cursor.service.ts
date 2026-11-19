/**
 * forge-event-cursor.service.ts — the last forge events this host delivered
 * for each subscribed pull request, so a host that was offline asks the
 * forge once for what it missed and tells each session of it exactly once.
 *
 * A key names one fact (a merge, a failed check, a label on a head), never
 * a time: the forge is asked what is true now, and the cursor says which of
 * those truths a session already heard.
 */

import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	FORGE_EVENT_CURSOR_FILE,
	FORGE_EVENT_CURSOR_KEYS,
	FORGE_EVENT_MAX_SUBSCRIPTIONS,
} from '../contracts/constants/forge-event-store.constant';
import { writeFileAtomic } from '../shared/atomic-write';
import { withFileMutex } from '../shared/with-file-mutex';

import type { IForgeEventCursor } from '../contracts/interfaces/forge-event-store.interface';

const cursorPath = (dir: string): string => join(dir, FORGE_EVENT_CURSOR_FILE);

/** The cursor's name for a pull request. */
export const forgeCursorTarget = (repository: string, number: number): string =>
	`${repository}#${String(number)}`;

/** Every delivered key by target; none when the file is missing or unreadable. */
export const readForgeEventCursor = async (
	dir: string,
): Promise<IForgeEventCursor> => {
	try {
		const parsed: unknown = JSON.parse(
			await readFile(cursorPath(dir), 'utf8'),
		);
		if (typeof parsed !== 'object' || parsed === null) return {};
		return Object.fromEntries(
			Object.entries(parsed).flatMap(([target, keys]) =>
				Array.isArray(keys)
					? [
							[
								target,
								keys.filter(
									(key): key is string =>
										typeof key === 'string',
								),
							],
						]
					: [],
			),
		);
	} catch {
		return {};
	}
};

/** Remember that `key` was delivered for `target`. */
export const markForgeEventDelivered = async (
	dir: string,
	target: string,
	key: string,
): Promise<void> => {
	await mkdir(dir, { recursive: true });
	const path = cursorPath(dir);
	await withFileMutex(
		path,
		async () => {
			const current = await readForgeEventCursor(dir);
			const kept = (current[target] ?? []).filter((one) => one !== key);
			const next = Object.entries({
				...current,
				[target]: [...kept, key].slice(-FORGE_EVENT_CURSOR_KEYS),
			}).slice(-FORGE_EVENT_MAX_SUBSCRIPTIONS);
			await writeFileAtomic(
				path,
				`${JSON.stringify(Object.fromEntries(next), null, '\t')}\n`,
			);
		},
		{ onContention: 'wait' },
	);
};
