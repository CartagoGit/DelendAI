import type { IStateStoreFailure } from '@delendai/state';

export const SQLITE_OPEN_ERROR_CODES = [
	'SQLITE_CANTOPEN',
	'SQLITE_BUSY',
	'SQLITE_FULL',
	'SQLITE_IOERR',
] as const;

export const SQLITE_CORRUPT_ERROR_CODES = [
	'INTEGRITY_CHECK_FAILED',
	'SNAPSHOT_JSON_PARSE',
	'SCHEMA_DRIFT',
	'WAL_REPLAY_FAILED',
	'UNKNOWN',
] as const;

export interface ISupportedSchemaRange {
	readonly min: number;
	readonly max: number;
}

export interface ISqliteOpenFailure {
	readonly kind: 'sqlite-open';
	readonly code: (typeof SQLITE_OPEN_ERROR_CODES)[number];
	readonly cause?: unknown;
}

export interface ISchemaVersionMismatchFailure {
	readonly kind: 'schema-version-mismatch';
	readonly observedSchemaVersion: number;
	readonly supportedSchemaRange: ISupportedSchemaRange;
	readonly pragma?: 'user_version';
	readonly cause?: unknown;
}

export interface IIntegrityCheckFailure {
	readonly kind: 'integrity-check-failure';
	readonly pragma: string;
	readonly cause?: unknown;
}

export interface ISnapshotJsonParseFailure {
	readonly kind: 'snapshot-json-parse-failure';
	readonly cause: unknown;
	readonly column?: string;
}

export interface ISchemaDriftFailure {
	readonly kind: 'schema-drift';
	readonly column: string;
	readonly cause?: unknown;
}

export interface IWalReplayFailure {
	readonly kind: 'wal-replay-failure';
	readonly pragma?: string;
	readonly cause?: unknown;
}

export type TSqliteStateRegistryFailure =
	| ISqliteOpenFailure
	| ISchemaVersionMismatchFailure
	| IIntegrityCheckFailure
	| ISnapshotJsonParseFailure
	| ISchemaDriftFailure
	| IWalReplayFailure;

export const DEFAULT_SUPPORTED_SCHEMA_RANGE: ISupportedSchemaRange =
	Object.freeze({
		min: 1,
		max: 1,
	});

const asRecord = (error: unknown): Record<string, unknown> | null =>
	typeof error === 'object' && error !== null
		? (error as Record<string, unknown>)
		: null;

const readString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

const readNumber = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readRange = (value: unknown): ISupportedSchemaRange | undefined => {
	const record = asRecord(value);
	if (record === null) return undefined;
	const min = readNumber(record.min);
	const max = readNumber(record.max);
	if (min === undefined || max === undefined) return undefined;
	return { min, max };
};

const extractCode = (error: unknown): string | undefined => {
	const record = asRecord(error);
	return record === null ? undefined : readString(record.code);
};

const extractMessage = (error: unknown): string | undefined => {
	if (error instanceof Error) return error.message;
	const record = asRecord(error);
	return record === null ? undefined : readString(record.message);
};

const isSqliteOpenCode = (
	code: string | undefined,
): code is (typeof SQLITE_OPEN_ERROR_CODES)[number] =>
	code !== undefined &&
	(SQLITE_OPEN_ERROR_CODES as readonly string[]).includes(code);

const isSchemaVersionMismatch = (
	error: unknown,
): error is ISchemaVersionMismatchFailure => {
	const record = asRecord(error);
	if (record === null) return false;
	return (
		record.kind === 'schema-version-mismatch' ||
		readNumber(record.observedSchemaVersion) !== undefined
	);
};

const isIntegrityCheckFailure = (
	error: unknown,
): error is IIntegrityCheckFailure => {
	const record = asRecord(error);
	if (record === null) return false;
	const pragma = readString(record.pragma);
	return (
		record.kind === 'integrity-check-failure' ||
		(pragma !== undefined &&
			pragma !== 'ok' &&
			!pragma.toLowerCase().includes('wal'))
	);
};

const isSnapshotJsonParseFailure = (
	error: unknown,
): error is ISnapshotJsonParseFailure => {
	const record = asRecord(error);
	if (record?.kind === 'snapshot-json-parse-failure') return true;
	const message = extractMessage(error)?.toLowerCase();
	return (
		error instanceof SyntaxError &&
		message !== undefined &&
		message.includes('json')
	);
};

const isSchemaDriftFailure = (error: unknown): error is ISchemaDriftFailure => {
	const record = asRecord(error);
	if (record?.kind === 'schema-drift') return true;
	const message = extractMessage(error)?.toLowerCase();
	return (
		message !== undefined &&
		(message.includes('no such column') ||
			message.includes('has no column named'))
	);
};

const isWalReplayFailure = (error: unknown): error is IWalReplayFailure => {
	const record = asRecord(error);
	if (record?.kind === 'wal-replay-failure') return true;
	const message = extractMessage(error)?.toLowerCase();
	return message !== undefined && message.includes('wal');
};

const classifySchemaVersionMismatch = (
	error: ISchemaVersionMismatchFailure | Record<string, unknown>,
): IStateStoreFailure => ({
	code: 'SCHEMA_VERSION_UNSUPPORTED',
	pragma: 'user_version',
	supportedSchemaRange:
		readRange(error.supportedSchemaRange) ?? DEFAULT_SUPPORTED_SCHEMA_RANGE,
	observedSchemaVersion: readNumber(error.observedSchemaVersion) ?? 0,
});

const inferSchemaDriftColumn = (error: unknown): string => {
	const record = asRecord(error);
	const explicit = record === null ? undefined : readString(record.column);
	if (explicit !== undefined) return explicit;
	const message = extractMessage(error) ?? '';
	const match =
		/no such column:\s*([^\s]+)/i.exec(message) ??
		/has no column named\s+([^\s]+)/i.exec(message);
	return match?.[1] ?? 'unknown-column';
};

export function classifySqliteError(error: unknown): IStateStoreFailure {
	const code = extractCode(error);
	if (isSqliteOpenCode(code)) {
		return { code };
	}

	if (isSchemaVersionMismatch(error)) {
		return classifySchemaVersionMismatch(asRecord(error) ?? error);
	}

	if (isIntegrityCheckFailure(error)) {
		const record = asRecord(error);
		return {
			code: 'INTEGRITY_CHECK_FAILED',
			pragma: readString(record?.pragma) ?? 'integrity_check',
		};
	}

	if (isSnapshotJsonParseFailure(error)) {
		const record = asRecord(error);
		return {
			code: 'SNAPSHOT_JSON_PARSE',
			pragma: readString(record?.column) ?? 'snapshot_json',
		};
	}

	if (isSchemaDriftFailure(error)) {
		return {
			code: 'SCHEMA_DRIFT',
			pragma: inferSchemaDriftColumn(error),
		};
	}

	if (isWalReplayFailure(error)) {
		const record = asRecord(error);
		return {
			code: 'WAL_REPLAY_FAILED',
			pragma: readString(record?.pragma) ?? 'wal',
		};
	}

	const message = readString(asRecord(error)?.message);
	return message === undefined
		? { code: 'UNKNOWN' }
		: { code: 'UNKNOWN', pragma: message };
}
