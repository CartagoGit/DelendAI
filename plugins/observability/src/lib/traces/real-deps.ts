import { readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';

import type {
	IReadReleaseHealthDeps,
	IReadReleaseHealthFilter,
	IReadTracesDeps,
	IReadTracesFilter,
	IReadonlyReleaseHealthRecord,
	IReadonlyTraceRecord,
} from './interfaces';

interface IJsonRecord {
	readonly [key: string]: unknown;
}

const LOGS_DIR = '.cache/mcp-vertex/results/logs';
const ERRORS_DIR = '.cache/mcp-vertex/results/logs-errors';

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
		if (typeof candidate === 'string' && candidate.length > 0)
			return candidate;
	}
	return undefined;
};

const readBoolean = (
	value: unknown,
	paths: readonly (readonly string[])[],
): boolean | undefined => {
	for (const path of paths) {
		const candidate = readNested(value, path);
		if (typeof candidate === 'boolean') return candidate;
	}
	return undefined;
};

const listJsonlFiles = async (dirAbs: string): Promise<readonly string[]> => {
	try {
		const names = await readdir(dirAbs);
		return names
			.filter((name) => name.endsWith('.jsonl'))
			.sort((left, right) => right.localeCompare(left))
			.map((name) => join(dirAbs, name));
	} catch {
		return [];
	}
};

const readJsonLines = async (
	paths: readonly string[],
): Promise<readonly unknown[]> => {
	const out: unknown[] = [];
	for (const path of paths) {
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
					out.push(JSON.parse(trimmed));
				} catch {
					// skip malformed lines
				}
			}
		} catch {
			// unreadable file — skip it
		}
	}
	return out;
};

const takeRecent = <T>(
	items: readonly T[],
	limit: number | undefined,
): readonly T[] => {
	if (limit === undefined) return items;
	return items.slice(Math.max(0, items.length - limit));
};

const normalizeTraceRecord = (
	value: unknown,
): IReadonlyTraceRecord | undefined => {
	if (!isRecord(value)) return undefined;
	const service =
		readString(value, [
			['service'],
			['project'],
			['meta', 'service'],
			['meta', 'project'],
			['meta', 'args', 'service'],
			['meta', 'result', 'service'],
			['meta', 'result', 'structuredContent', 'service'],
		]) ?? 'unknown';
	const traceId = readString(value, [
		['traceId'],
		['trace_id'],
		['trace', 'id'],
		['meta', 'traceId'],
		['meta', 'trace_id'],
		['meta', 'args', 'traceId'],
		['meta', 'args', 'trace_id'],
		['meta', 'result', 'traceId'],
		['meta', 'result', 'structuredContent', 'traceId'],
	]);
	if (traceId === undefined) return undefined;
	const ts =
		readString(value, [['ts'], ['timestamp'], ['time'], ['occurredAt']]) ??
		new Date(0).toISOString();
	const explicitIsError = readBoolean(value, [
		['isError'],
		['error'],
		['crashed'],
	]);
	const outcome = readString(value, [['outcome'], ['kind']]);
	const errorMessage = readString(value, [
		['errorMessage'],
		['error', 'message'],
		['meta', 'error', 'message'],
		['meta', 'result', 'errorMessage'],
	]);
	const isError =
		explicitIsError ??
		(outcome !== undefined
			? ['error', 'failed', 'fatal', 'cancelled', 'crashed'].includes(
					outcome.toLowerCase(),
				)
			: errorMessage !== undefined);
	return {
		service,
		traceId,
		ts,
		isError,
		...(errorMessage !== undefined ? { errorMessage } : {}),
	};
};

const normalizeReleaseRecord = (
	value: unknown,
): IReadonlyReleaseHealthRecord | undefined => {
	if (!isRecord(value)) return undefined;
	const version = readString(value, [
		['version'],
		['release'],
		['releaseVersion'],
		['release', 'version'],
		['meta', 'version'],
		['meta', 'release'],
		['meta', 'args', 'version'],
		['meta', 'result', 'version'],
		['meta', 'result', 'structuredContent', 'version'],
	]);
	const sessionId = readString(value, [
		['sessionId'],
		['session_id'],
		['meta', 'sessionId'],
		['meta', 'session_id'],
		['meta', 'args', 'sessionId'],
		['meta', 'result', 'sessionId'],
		['callId'],
	]);
	if (version === undefined || sessionId === undefined) return undefined;
	const explicitCrash = readBoolean(value, [
		['crashed'],
		['crash'],
		['isCrash'],
	]);
	const outcome = readString(value, [['outcome'], ['kind']]);
	const crashed =
		explicitCrash ??
		(outcome !== undefined
			? ['error', 'failed', 'fatal', 'cancelled', 'crashed'].includes(
					outcome.toLowerCase(),
				)
			: readString(value, [
					['error', 'message'],
					['meta', 'error', 'message'],
				]) !== undefined);
	const ts = readString(value, [
		['ts'],
		['timestamp'],
		['time'],
		['occurredAt'],
	]);
	return {
		version,
		sessionId,
		crashed,
		...(ts !== undefined ? { ts } : {}),
	};
};

const loadLogs = async (
	workspaceRootAbs: string,
): Promise<readonly unknown[]> => {
	const [logFiles, errorFiles] = await Promise.all([
		listJsonlFiles(join(workspaceRootAbs, LOGS_DIR)),
		listJsonlFiles(join(workspaceRootAbs, ERRORS_DIR)),
	]);
	return readJsonLines([...logFiles, ...errorFiles]);
};

export const realReadTracesDeps = (
	workspaceRootAbs: string,
): IReadTracesDeps => ({
	listTraceRecords: async (filter?: IReadTracesFilter) => {
		const records = (await loadLogs(workspaceRootAbs))
			.map(normalizeTraceRecord)
			.filter(
				(record): record is IReadonlyTraceRecord =>
					record !== undefined,
			)
			.filter((record) =>
				filter?.service === undefined
					? true
					: record.service === filter.service,
			);
		return takeRecent(records, filter?.limit);
	},
});

export const realReadReleaseHealthDeps = (
	workspaceRootAbs: string,
): IReadReleaseHealthDeps => ({
	listReleaseHealthRecords: async (filter?: IReadReleaseHealthFilter) => {
		const records = (await loadLogs(workspaceRootAbs))
			.map(normalizeReleaseRecord)
			.filter(
				(record): record is IReadonlyReleaseHealthRecord =>
					record !== undefined,
			)
			.filter((record) =>
				filter?.version === undefined
					? true
					: record.version === filter.version,
			);
		return takeRecent(records, filter?.limit);
	},
});
