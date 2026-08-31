import { open } from 'node:fs/promises';

import type { IRuntimeEvent } from '@mcp-vertex/core/contracts';

export interface IRuntimeEventCursor {
	readonly offset: number;
	readonly events: readonly IRuntimeEvent[];
	readonly fileKey?: string;
	readonly pending?: string;
}

const isRuntimeEvent = (value: unknown): value is IRuntimeEvent => {
	if (typeof value !== 'object' || value === null) return false;
	const event = value as Partial<IRuntimeEvent>;
	return (
		event.version === 1 &&
		typeof event.ts === 'string' &&
		typeof event.sessionId === 'string' &&
		typeof event.kind === 'string'
	);
};

const parseLines = (raw: string): readonly IRuntimeEvent[] =>
	raw
		.split('\n')
		.filter((line) => line.trim().length > 0)
		.flatMap((line) => {
			try {
				const value: unknown = JSON.parse(line);
				return isRuntimeEvent(value) ? [value] : [];
			} catch {
				return [];
			}
		});

/** Read only the bytes appended after a cursor, tolerating a partial last line. */
export const readRuntimeEvents = async (
	filePath: string,
	cursor: IRuntimeEventCursor = { offset: 0, events: [] },
): Promise<IRuntimeEventCursor> => {
	let handle: Awaited<ReturnType<typeof open>>;
	try {
		handle = await open(filePath, 'r');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return cursor;
		throw error;
	}
	try {
		const stat = await handle.stat();
		const fileKey = `${stat.dev}:${stat.ino}`;
		const offset =
			cursor.fileKey !== undefined && cursor.fileKey !== fileKey
				? 0
				: cursor.offset;
		const rotated =
			cursor.fileKey !== undefined && cursor.fileKey !== fileKey;
		const length = stat.size - offset;
		if (length === 0) return { ...cursor, fileKey };
		const buffer = Buffer.alloc(length);
		await handle.read(buffer, 0, length, offset);
		const raw = `${rotated ? '' : (cursor.pending ?? '')}${buffer.toString('utf8')}`;
		const completeLength = raw.lastIndexOf('\n') + 1;
		const pending = raw.slice(completeLength);
		return {
			offset: offset + length,
			fileKey,
			...(pending.length === 0 ? {} : { pending }),
			events: [
				...(rotated ? [] : cursor.events),
				...parseLines(raw.slice(0, completeLength)),
			],
		};
	} finally {
		await handle.close();
	}
};

export type {
	IRuntimeEvent,
	RuntimeEventInput,
} from '@mcp-vertex/core/contracts';
