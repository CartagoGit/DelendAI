import { readdir } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';

import type {
	IReadLocalCorrelateDeps,
	IReadLocalCorrelateFilter,
	IReadonlyLocalLogLine,
	IReadonlyLocalMetricRecord,
} from './interfaces';

interface IJsonRecord {
	readonly [key: string]: unknown;
}

const LOGS_DIR = '.cache/mcp-vertex/results/logs';
const ERRORS_DIR = '.cache/mcp-vertex/results/logs-errors';
const METRICS_DIR = '.cache/mcp-vertex/results/metrics';

const isRecord = (value: unknown): value is IJsonRecord =>
	typeof value === 'object' && value !== null;

const readNested = (value: unknown, path: readonly string[]): unknown => {
	let current: unknown = value;
	for (const part of path) {
		if (!isRecord(current)) return undefined;
		current = current[part];
	}
	return current;
};

const readString = (
	value: unknown,
	paths: readonly (readonly string[])[],
): string | undefined => {
	for (const path of paths) {
		const candidate = readNested(value, path);
		if (typeof candidate === 'string' && candidate.length > 0) {
			return candidate;
		}
	}
	return undefined;
};

const readScalar = (
	value: unknown,
	paths: readonly (readonly string[])[],
): number | string | boolean | null | undefined => {
	for (const path of paths) {
		const candidate = readNested(value, path);
		if (
			typeof candidate === 'number' ||
			typeof candidate === 'string' ||
			typeof candidate === 'boolean' ||
			candidate === null
		) {
			return candidate;
		}
	}
	return undefined;
};

const listJsonlFiles = async (dirAbs: string): Promise<readonly string[]> => {
	try {
		const names = await readdir(dirAbs);
		return names
			.filter((name) => name.endsWith('.jsonl'))
			.sort((left, right) => left.localeCompare(right))
			.map((name) => join(dirAbs, name));
	} catch {
		return [];
	}
};

const isSince = (
	ts: string,
	filter: IReadLocalCorrelateFilter | undefined,
): boolean => {
	if (filter?.since === undefined) return true;
	const tsMs = new Date(ts).getTime();
	const sinceMs = new Date(filter.since).getTime();
	if (Number.isNaN(tsMs) || Number.isNaN(sinceMs)) return false;
	return tsMs >= sinceMs;
};

const normalizeLogRecord = (
	value: unknown,
	workspaceRootAbs: string,
	path: string,
	line: string,
	lineNumber: number,
): IReadonlyLocalLogLine | undefined => {
	if (!isRecord(value)) return undefined;
	const ts =
		readString(value, [['ts'], ['timestamp'], ['time'], ['occurredAt']]) ??
		undefined;
	if (ts === undefined) return undefined;
	return {
		ts,
		logFile: relative(workspaceRootAbs, path),
		line,
		lineNumber,
	};
};

const normalizeMetricRecord = (
	value: unknown,
): IReadonlyLocalMetricRecord | undefined => {
	if (!isRecord(value)) return undefined;
	const ts =
		readString(value, [['ts'], ['timestamp'], ['time'], ['occurredAt']]) ??
		undefined;
	const name = readString(value, [
		['name'],
		['metric'],
		['series'],
		['meta', 'name'],
	]);
	const metricValue = readScalar(value, [
		['value'],
		['count'],
		['sum'],
		['meta', 'value'],
	]);
	if (ts === undefined || name === undefined || metricValue === undefined) {
		return undefined;
	}
	return {
		ts,
		name,
		value: metricValue,
	};
};

const readLogLines = async (
	workspaceRootAbs: string,
	files: readonly string[],
	filter?: IReadLocalCorrelateFilter,
): Promise<readonly IReadonlyLocalLogLine[]> => {
	const out: IReadonlyLocalLogLine[] = [];
	for (const path of files) {
		try {
			const raw = (
				await new SafeWorkspaceReader(dirname(path)).readText(
					basename(path),
				)
			).content;
			const lines = raw.split('\n');
			for (const [index, line] of lines.entries()) {
				const trimmed = line.trim();
				if (trimmed.length === 0) continue;
				try {
					const parsed = JSON.parse(trimmed) as unknown;
					const record = normalizeLogRecord(
						parsed,
						workspaceRootAbs,
						path,
						trimmed,
						index + 1,
					);
					if (record === undefined || !isSince(record.ts, filter)) {
						continue;
					}
					out.push(record);
				} catch {}
			}
		} catch {}
	}
	return out;
};

const readMetricLines = async (
	files: readonly string[],
	filter?: IReadLocalCorrelateFilter,
): Promise<readonly IReadonlyLocalMetricRecord[]> => {
	const out: IReadonlyLocalMetricRecord[] = [];
	for (const path of files) {
		try {
			const raw = (
				await new SafeWorkspaceReader(dirname(path)).readText(
					basename(path),
				)
			).content;
			for (const line of raw.split('\n')) {
				const trimmed = line.trim();
				if (trimmed.length === 0) continue;
				try {
					const parsed = JSON.parse(trimmed) as unknown;
					const record = normalizeMetricRecord(parsed);
					if (record === undefined || !isSince(record.ts, filter)) {
						continue;
					}
					out.push(record);
				} catch {}
			}
		} catch {}
	}
	return out;
};

export const realReadLocalCorrelateDeps = (
	workspaceRootAbs: string,
): IReadLocalCorrelateDeps => ({
	listLocalLogs: async (filter) => {
		const [logFiles, errorFiles] = await Promise.all([
			listJsonlFiles(join(workspaceRootAbs, LOGS_DIR)),
			listJsonlFiles(join(workspaceRootAbs, ERRORS_DIR)),
		]);
		return readLogLines(
			workspaceRootAbs,
			[...logFiles, ...errorFiles],
			filter,
		);
	},
	listLocalMetrics: async (filter) => {
		const metricFiles = await listJsonlFiles(
			join(workspaceRootAbs, METRICS_DIR),
		);
		return readMetricLines(metricFiles, filter);
	},
});
