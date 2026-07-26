import { mkdir, open, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { withFileMutex } from '@mcp-vertex/core/public';

import type { ILogStoreOptions } from '../contracts/interfaces/log-store.interface';
import { type LogSeverity, severityForOutcome } from './kinds';
import {
	type ILogEvent,
	type LogEventKind,
	type LogOutcome,
	serializeRedactedEvent,
} from './normalize-event';

export type { ILogStoreOptions } from '../contracts/interfaces/log-store.interface';

export interface ILogStore {
	appendEvent(event: ILogEvent): Promise<void>;
	readRange(filter?: ILogRangeFilter): Promise<readonly ILogEvent[]>;
	tail(options?: ILogTailOptions): Promise<readonly ILogEvent[]>;
}

export interface ILogRangeFilter {
	readonly since?: string;
	readonly until?: string;
	readonly kind?: LogEventKind;
	readonly agent?: string;
	readonly taskId?: string;
	readonly outcome?: LogOutcome;
	/**
	 * f00153 S1 — minimum severity (inclusive). `error` matches
	 * `error`/`critical`/`alert`/`emergency`. Filters by the event's
	 * stored `severity` field.
	 */
	readonly severityAtLeast?: LogSeverity;
	/** f00153 S1 — exact incidentType match (`tool-failure`, …). */
	readonly incidentType?: string;
}

export interface ILogTailOptions {
	readonly limit?: number;
	readonly outcomeFilter?: LogOutcome;
	readonly kindFilter?: LogEventKind;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;

const dayFromTs = (ts: string): string => {
	const parsed = new Date(ts);
	if (Number.isNaN(parsed.getTime()))
		return new Date().toISOString().slice(0, 10);
	return parsed.toISOString().slice(0, 10);
};

const compareIso = (a: string, b: string): number =>
	new Date(a).getTime() - new Date(b).getTime();

const SEVERITY_RANK: Readonly<Record<LogSeverity, number>> = {
	debug: 0,
	info: 1,
	notice: 2,
	warning: 3,
	error: 4,
	critical: 5,
	alert: 6,
	emergency: 7,
};

const matches = (event: ILogEvent, filter: ILogRangeFilter): boolean => {
	if (filter.since && compareIso(event.ts, filter.since) < 0) return false;
	if (filter.until && compareIso(event.ts, filter.until) > 0) return false;
	if (filter.kind && event.kind !== filter.kind) return false;
	if (filter.agent && event.agent !== filter.agent) return false;
	if (filter.taskId && event.taskId !== filter.taskId) return false;
	if (filter.outcome && event.outcome !== filter.outcome) return false;
	if (
		filter.severityAtLeast &&
		SEVERITY_RANK[event.severity] < SEVERITY_RANK[filter.severityAtLeast]
	) {
		return false;
	}
	if (filter.incidentType && event.incidentType !== filter.incidentType) {
		return false;
	}
	return true;
};

export const createLogStore = async (
	logsDir: string,
	options: ILogStoreOptions = {},
): Promise<ILogStore> => {
	const fileFor = (event: ILogEvent): string =>
		join(logsDir, `${dayFromTs(event.ts)}.jsonl`);

	const readAllFiles = async (): Promise<readonly ILogEvent[]> => {
		await mkdir(logsDir, { recursive: true });
		const names = (await readdir(logsDir))
			.filter((name) => DATE_RE.test(name))
			.sort();
		const events: ILogEvent[] = [];
		for (const name of names) {
			const file = join(logsDir, name);
			const content = await withFileMutex(
				file,
				async () => await readFile(file, 'utf8').catch(() => ''),
				{ onContention: 'fail', timeoutMs: 10_000 },
			);
			for (const line of content.split('\n')) {
				if (!line.trim()) continue;
				try {
					events.push(JSON.parse(line) as ILogEvent);
				} catch {
					events.push({
						ts: new Date().toISOString(),
						kind: 'log-warning',
							severity: 'warning',
							incidentType: 'corrupt-line',
						agent: null,
						taskId: null,
						outcome: 'failed',
						files: [join(logsDir, name)],
						summary: 'Skipped corrupt log line',
						meta: { file: name },
					});
				}
			}
		}
		return events.sort((a, b) => compareIso(a.ts, b.ts));
	};

	return {
		async appendEvent(event) {
			const file = fileFor(event);
			await mkdir(logsDir, { recursive: true });
			const line = `${serializeRedactedEvent(event, options.maxLineBytes)}\n`;
			await withFileMutex(
				file,
				async () => {
					const handle = await open(file, 'a');
					try {
						await handle.writeFile(line, 'utf8');
						await handle.sync();
					} finally {
						await handle.close();
					}
				},
				{ onContention: 'fail', timeoutMs: 10_000 },
			);
		},
		async readRange(filter = {}) {
			const events = await readAllFiles();
			return events.filter((event) => matches(event, filter));
		},
		async tail(options = {}) {
			const limit = Math.max(1, Math.min(options.limit ?? 50, 1000));
			const events = await readAllFiles();
			return events
				.filter(
					(event) =>
						(options.outcomeFilter
							? event.outcome === options.outcomeFilter
							: true) &&
						(options.kindFilter
							? event.kind === options.kindFilter
							: true),
				)
				.slice(-limit);
		},
	};
};
