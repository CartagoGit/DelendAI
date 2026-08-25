import { mkdir, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { SafeWorkspaceReader, withFileMutex } from '@mcp-vertex/core/public';

import type { ILogStoreOptions } from '../contracts/interfaces/log-store.interface';
import {
	incidentTypeForKind,
	isLogSeverity,
	type LogSeverity,
	severityForOutcome,
} from './kinds';
import {
	type ILogEvent,
	type LogEventKind,
	type LogOutcome,
	serializeRedactedEvent,
} from './normalize-event';

export type { ILogStoreOptions } from '../contracts/interfaces/log-store.interface';

/**
 * x00154 S1 — backfill input shape. Old JSONL records (pre-`f00153` S1)
 * omit `severity` and `incidentType`; new transports may hand the store
 * a raw record straight from the MCP server. Either flavour must project
 * to a complete {@link ILogEvent} on disk so `LogEventSchema` validates.
 *
 * {@link completeLogEvent} consumes this shape; both the write path
 * (`appendEvent`) and the read path (`readAllFiles`) route raw records
 * through it. An explicit non-`LogSeverity` string for `severity`
 * (e.g. `'?'` from a corrupted stream) is rejected with
 * `INVALID_SEVERITY` instead of being silently coerced.
 */
export interface ILogEventInput
	extends Omit<ILogEvent, 'severity' | 'incidentType'> {
	readonly severity?: LogSeverity | string | undefined;
	readonly incidentType?: string | null | undefined;
}

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
const DAY_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;

const dayFromTs = (ts: string): string => {
	const parsed = new Date(ts);
	if (Number.isNaN(parsed.getTime()))
		return new Date().toISOString().slice(0, 10);
	return parsed.toISOString().slice(0, 10);
};

const dayFromSince = (since: string): string => {
	// Accept either an ISO timestamp or a bare `YYYY-MM-DD` day string.
	// x00153 S2: `since` filters out whole day-files before its boundary
	// instead of opening them and discarding every line.
	const m = DAY_PREFIX_RE.exec(since);
	if (m && m[1] !== undefined) return m[1];
	return new Date(since).toISOString().slice(0, 10);
};

const dayFromFile = (name: string): string | null =>
	DATE_RE.test(name) ? name.slice(0, 10) : null;
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

/**
 * x00154 S1 — backfill `severity` + `incidentType` from a raw record.
 *
 * Rules:
 *   - `severity`:
 *     - explicit value that is a valid {@link LogSeverity} → use it;
 *     - explicit value that is NOT a valid {@link LogSeverity} (including
 *       arbitrary strings like `'?'` from a corrupted stream) → throw
 *       `INVALID_SEVERITY` so the bad input is surfaced, not silently
 *       coerced to a default (silent coercion is the symptom that caused
 *       `no_severity=412/412` on the live JSONL in the first place);
 *     - missing (`undefined`) → derive from `outcome` via
 *       {@link severityForOutcome}.
 *   - `incidentType`:
 *     - explicit value (`null` or string) → use it;
 *     - missing (`undefined`) → derive from `kind` via
 *       {@link incidentTypeForKind}.
 *
 * The function is safe to call on already-complete {@link ILogEvent}s:
 * the explicit-value branches pass through. It is also the single
 * backfill point for both the writer (`appendEvent`) and the reader
 * (`readAllFiles`), so a stale JSONL record reconstructed on read yields
 * the same projection as a freshly-normalised write.
 */
export const completeLogEvent = (input: ILogEventInput): ILogEvent => {
	const severityIn = input.severity;
	let severity: LogSeverity;
	if (severityIn === undefined) {
		severity = severityForOutcome(input.outcome);
	} else if (isLogSeverity(severityIn)) {
		severity = severityIn;
	} else {
		// x00154 S1 — explicit invalid severity (e.g. '?') must be rejected,
		// not silently coerced to severityForOutcome(outcome).
		throw new Error('INVALID_SEVERITY');
	}
	const incidentType =
		input.incidentType === undefined
			? incidentTypeForKind(input.kind)
			: input.incidentType;
	return {
		ts: input.ts,
		kind: input.kind,
		agent: input.agent,
		taskId: input.taskId,
		outcome: input.outcome,
		severity,
		incidentType,
		files: input.files,
		summary: input.summary,
		meta: input.meta,
	};
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
	const reader = new SafeWorkspaceReader(logsDir);

	const readAllFiles = async (dayRange?: {
		readonly startDay?: string;
		readonly endDay?: string;
	}): Promise<readonly ILogEvent[]> => {
		await mkdir(logsDir, { recursive: true });
		const allNames = (await readdir(logsDir)).filter((name) =>
			DATE_RE.test(name),
		);
		const startDay = dayRange?.startDay;
		const endDay = dayRange?.endDay;
		const names = allNames
			.filter((name) => {
				const day = dayFromFile(name);
				if (!day) return false;
				if (startDay && day < startDay) return false;
				if (endDay && day > endDay) return false;
				return true;
			})
			.sort();
		const events: ILogEvent[] = [];
		for (const name of names) {
			const file = join(logsDir, name);
			const content = await withFileMutex(
				file,
				async () =>
					(await reader.readText(name).catch(() => ({ content: '' })))
						.content,
				// a00085 #6: readers wait for the writer (never steal).
				{ onContention: 'wait', timeoutMs: 10_000 },
			);
			let lineOffset = 0;
			for (const line of content.split('\n')) {
				if (!line.trim()) {
					lineOffset += 1;
					continue;
				}
				try {
					// x00154 S1 — old JSONL records written pre-`f00153` S1
					// lack `severity` + `incidentType`. Backfill here so
					// `readRange`/`tail` returns a complete projection that
					// satisfies `LogEventSchema` even for legacy data.
					const parsed = JSON.parse(line) as Record<string, unknown>;
					events.push(
						completeLogEvent(parsed as unknown as ILogEventInput),
					);
				} catch {
					// Derive `ts` from the day-file name (e.g. `2026-07-26.jsonl`)
					// rather than `Date.now()` so the placeholder keeps its
					// original position in the timeline instead of jumping to
					// "now". Without this, a corrupt line in yesterday's file
					// masquerades as a fresh error and breaks time-window
					// queries (S3 of x00153).
					const dayMatch = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name);
					const dayTs = dayMatch
						? `${dayMatch[1]}T00:00:00.000Z`
						: new Date(0).toISOString();
					events.push({
						ts: dayTs,
						kind: 'log-warning',
						severity: 'warning',
						incidentType: 'corrupt-line',
						agent: null,
						taskId: null,
						outcome: 'failed',
						files: [join(logsDir, name)],
						summary: `Skipped corrupt line in ${name} (offset ${lineOffset})`,
						meta: { file: name, offset: lineOffset },
					});
				}
				lineOffset += 1;
			}
		}
		return events.sort((a, b) => compareIso(a.ts, b.ts));
	};

	return {
		async appendEvent(event) {
			// x00154 S1 — derive `severity` + `incidentType` from the raw
			// record before writing. `completeLogEvent` also rejects an
			// explicit invalid `severity` (e.g. `'?'`) with INVALID_SEVERITY
			// so the writer never silently coerces a malformed record.
			//
			// The public `ILogStore.appendEvent` signature is still
			// `ILogEvent`; production callers always go through
			// `normalizeEvent(...)` first, so they already supply
			// complete records. The cast here is a defensive backfill for
			// any future in-process writer that hasn't been updated (and
			// for the spec at `tests/log-store.spec.ts` that exercises the
			// backfill path directly).
			const complete = completeLogEvent(
				event as unknown as ILogEventInput,
			);
			const file = fileFor(complete);
			await mkdir(logsDir, { recursive: true });
			const line = `${serializeRedactedEvent(complete, options.maxLineBytes)}\n`;
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
			const dayRange: { startDay?: string; endDay?: string } = {};
			if (filter.since) dayRange.startDay = dayFromSince(filter.since);
			if (filter.until) dayRange.endDay = dayFromSince(filter.until);
			const events = await readAllFiles(dayRange);
			return events.filter((event) => matches(event, filter));
		},
		async tail(options = {}) {
			const limit = Math.max(1, Math.min(options.limit ?? 50, 1000));
			// x00153 S2: tail() opens the active day-file + at most one previous
			// when N exceeds the active file's line count, never all retained files.
			await mkdir(logsDir, { recursive: true });
			const dayFiles = (await readdir(logsDir))
				.filter((name) => DATE_RE.test(name))
				.sort();
			const activeDay = dayFromFile(dayFiles.at(-1) ?? '');
			const previousDay = dayFromFile(
				dayFiles.length >= 2 ? (dayFiles.at(-2) ?? '') : '',
			);
			const dayRange: { startDay?: string; endDay?: string } = activeDay
				? { endDay: activeDay }
				: {};
			if (previousDay) dayRange.startDay = previousDay;
			const events = await readAllFiles(dayRange);
			const filtered = events.filter(
				(event) =>
					(options.outcomeFilter
						? event.outcome === options.outcomeFilter
						: true) &&
					(options.kindFilter
						? event.kind === options.kindFilter
						: true),
			);
			// If the active day-file holds fewer than `limit` events, we may
			// need to extend the read back further — but only if there are
			// earlier files. This avoids the O(all-files) cost when the
			// active file is full.
			let page = filtered.slice(-limit);
			if (
				page.length < limit &&
				dayFiles.length > 2 &&
				previousDay !== undefined
			) {
				const earlierDay = dayFromFile(dayFiles.at(-3) ?? '');
				if (earlierDay) {
					const extra = await readAllFiles({
						startDay: earlierDay,
						endDay: earlierDay,
					});
					page = [
						...extra.filter(
							(event) =>
								(options.outcomeFilter
									? event.outcome === options.outcomeFilter
									: true) &&
								(options.kindFilter
									? event.kind === options.kindFilter
									: true),
						),
						...filtered,
					].slice(-limit);
				}
			}
			return page;
		},
	};
};
