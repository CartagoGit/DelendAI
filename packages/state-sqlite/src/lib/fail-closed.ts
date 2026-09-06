import type {
	IStateStoreFailure,
	TDriftDirection,
} from '@delendai/state/generation';

import { STATE_SQLITE_SCHEMA_VERSION } from './schema';

const UNAVAILABLE_CODES = new Set([
	'ENOENT',
	'EACCES',
	'SQLITE_BUSY',
	'SQLITE_IOERR',
	'SQLITE_FULL',
]);

export interface ISqliteErrorSnapshot {
	readonly reconciledCommitSha?: string;
	readonly headCommitSha?: string;
	readonly drift?: TDriftDirection;
}

interface ILooseSqliteError {
	readonly code?: unknown;
	readonly message?: unknown;
	readonly pragma?: unknown;
	readonly observedSchemaVersion?: unknown;
	readonly reason?: unknown;
}

export function mapSqliteError(
	error: unknown,
	snapshot?: ISqliteErrorSnapshot,
): IStateStoreFailure {
	const candidate = asLooseSqliteError(error);
	const code = asString(candidate.code) ?? codeFromMessage(candidate.message);
	if (code && UNAVAILABLE_CODES.has(code)) {
		return { code };
	}
	if (candidate.reason === 'integrity_check_failed') {
		return {
			pragma: asString(candidate.pragma) ?? 'integrity_check_failed',
		};
	}
	if (candidate.reason === 'schema_unsupported') {
		const observedSchemaVersion = asNumber(candidate.observedSchemaVersion);
		return {
			pragma: String(observedSchemaVersion ?? ''),
			supportedSchemaRange: {
				min: STATE_SQLITE_SCHEMA_VERSION,
				max: STATE_SQLITE_SCHEMA_VERSION,
			},
			observedSchemaVersion,
		};
	}
	if (snapshot?.reconciledCommitSha || snapshot?.headCommitSha) {
		return {
			reconciledCommitSha: snapshot.reconciledCommitSha,
			headCommitSha: snapshot.headCommitSha,
			drift: inferDriftDirection(snapshot),
		};
	}
	return {
		code: code ?? 'SQLITE_UNKNOWN',
	};
}

export function stateStoreUnavailable(error: unknown): IStateStoreFailure {
	return mapSqliteError(error);
}

export function stateStoreCorrupt(pragma: string): IStateStoreFailure {
	return mapSqliteError({ reason: 'integrity_check_failed', pragma });
}

export function stateStoreSchemaUnsupported(
	observedSchemaVersion: number,
): IStateStoreFailure {
	return mapSqliteError({
		reason: 'schema_unsupported',
		observedSchemaVersion,
	});
}

export function stateStoreStale(
	snapshot: ISqliteErrorSnapshot,
): IStateStoreFailure {
	return mapSqliteError({ reason: 'stale_store' }, snapshot);
}

export function inferDriftDirection(
	snapshot: ISqliteErrorSnapshot,
): TDriftDirection {
	if (snapshot.drift) return snapshot.drift;
	if (
		snapshot.reconciledCommitSha &&
		snapshot.headCommitSha &&
		snapshot.reconciledCommitSha === snapshot.headCommitSha
	) {
		return 'equal';
	}
	return 'diverged';
}

function asLooseSqliteError(error: unknown): ILooseSqliteError {
	if (typeof error === 'object' && error !== null) {
		return error as ILooseSqliteError;
	}
	return {};
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: undefined;
}

function codeFromMessage(message: unknown): string | undefined {
	if (typeof message !== 'string') return undefined;
	for (const code of UNAVAILABLE_CODES) {
		if (message.includes(code)) return code;
	}
	return undefined;
}