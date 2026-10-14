import type {
	RuntimeEventKind,
	IRuntimeEvent,
	RuntimeEventInput,
	IRuntimeEventSink,
} from '../contracts/interfaces/runtime-event.interface';
export type {
	RuntimeEventKind,
	IRuntimeEvent,
	RuntimeEventInput,
	IRuntimeEventSink,
};
import { randomBytes } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { redactFreeText } from './timeline';
import { withFileMutex } from '../shared/with-file-mutex';

/**
 * A session id, from the CSPRNG and not from `Math.random`.
 *
 * It labels every event a session writes into a shared journal, so two
 * sessions that collide on it produce one timeline nobody can untangle —
 * and `Math.random` is seeded per process, which is exactly the case
 * where several agents start within the same millisecond.
 */
const sessionId = (): string =>
	`${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;

export const runtimeEventsPath = (cacheDirAbs: string): string =>
	join(cacheDirAbs, 'runtime', 'events.jsonl');

const safeEvent = (event: IRuntimeEvent): IRuntimeEvent => ({
	...event,
	...(event.toolName === undefined
		? {}
		: { toolName: redactFreeText(event.toolName) }),
	...(event.pluginName === undefined
		? {}
		: { pluginName: redactFreeText(event.pluginName) }),
	...(event.meta === undefined
		? {}
		: {
				meta: Object.fromEntries(
					Object.entries(event.meta).map(([key, value]) => [
						redactFreeText(key),
						typeof value === 'string'
							? redactFreeText(value)
							: value,
					]),
				),
			}),
});

/**
 * Append-only JSONL sink. The path is intentionally stable so a second
 * process can tail it without connecting to, or interfering with, MCP stdio.
 */
export const createJsonlRuntimeEventSink = (
	filePath: string,
	providedSessionId = sessionId(),
): IRuntimeEventSink => {
	let writeTail = Promise.resolve();
	return {
		emit: (event) => {
			writeTail = writeTail.then(async () => {
				const safe = safeEvent({
					...event,
					sessionId: providedSessionId,
					version: 1,
				});
				await withFileMutex(filePath, async () => {
					await mkdir(dirname(filePath), { recursive: true });
					await appendFile(
						filePath,
						`${JSON.stringify(safe)}\n`,
						'utf8',
					);
				});
			});
			return writeTail;
		},
	};
};

export const runtimeSessionStarted = (
	sink: IRuntimeEventSink | undefined,
	meta?: Readonly<Record<string, string | number | boolean>>,
): void => {
	if (sink === undefined) return;
	void Promise.resolve(
		sink.emit({
			version: 1,
			ts: new Date().toISOString(),
			kind: 'session.started',
			...(meta === undefined ? {} : { meta }),
		}),
	).catch(() => undefined);
};
