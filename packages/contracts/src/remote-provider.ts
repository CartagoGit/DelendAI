/**
 * Shared contracts for read-only remote HTTP providers.
 *
 * These types stay runtime-agnostic so GitHub/GitLab providers can share
 * transport, paging and error shapes without depending on plugin-git or core.
 */

export type RemoteProviderId = 'github' | 'gitlab' | (string & {});

export type RemoteRefKind =
	| 'branch'
	| 'tag'
	| 'commit'
	| 'merge-request'
	| 'pull-request'
	| 'unknown';

export type RemoteProviderErrorCode =
	| 'unauthorized'
	| 'forbidden'
	| 'not-found'
	| 'rate-limited'
	| 'timeout'
	| 'transient'
	| 'api-incompatible'
	| 'invalid-response'
	| 'invalid-config';

export type RemoteRateLimitScope =
	| 'api'
	| 'core'
	| 'search'
	| 'graphql'
	| 'unknown';

export type RemoteTruncationReason =
	| 'byte-limit'
	| 'line-limit'
	| 'time-limit'
	| 'server-limit';

export interface IRemoteProjectCoordinates {
	readonly provider: RemoteProviderId;
	readonly host: string;
	readonly owner?: string;
	readonly repository?: string;
	readonly projectId?: string | number;
	readonly projectPath?: string;
	readonly displayName?: string;
	readonly webUrl?: string;
	readonly apiUrl?: string;
}

export interface IRemoteGitRef {
	readonly kind: RemoteRefKind;
	readonly name: string;
	readonly fullName?: string;
	readonly sha?: string;
	readonly url?: string;
}

export interface IRemotePaginationMeta {
	readonly page: number | null;
	readonly perPage: number | null;
	readonly nextPage: string | null;
	readonly previousPage: string | null;
	readonly total: number | null;
	readonly totalPages: number | null;
	readonly hasMore: boolean;
}

export interface IRemoteRateLimitMeta {
	readonly limit: number | null;
	readonly remaining: number | null;
	readonly resetAt: string | null;
	readonly retryAfterSeconds: number | null;
	readonly scope: RemoteRateLimitScope;
	readonly source: 'headers' | 'body' | 'unknown';
}

export interface IRemoteTruncationInfo {
	readonly truncated: boolean;
	readonly reason: RemoteTruncationReason | null;
	readonly originalBytes: number | null;
	readonly keptBytes: number | null;
	readonly originalLines: number | null;
	readonly keptLines: number | null;
}

export interface IRemoteResponseMeta {
	readonly status: number;
	readonly requestId: string | null;
	readonly durationMs: number;
	readonly attempts: number;
	readonly pagination: IRemotePaginationMeta | null;
	readonly rateLimit: IRemoteRateLimitMeta | null;
	readonly truncated: IRemoteTruncationInfo | null;
}

export interface IRemoteProviderError {
	readonly code: RemoteProviderErrorCode;
	readonly provider: RemoteProviderId;
	readonly message: string;
	readonly status: number | null;
	readonly requestId: string | null;
	readonly retryAfterSeconds: number | null;
	readonly temporary: boolean;
	readonly retryable: boolean;
	readonly details?: Readonly<
		Record<string, string | number | boolean | null>
	>;
}

export interface IRemoteProviderSuccess<T> {
	readonly ok: true;
	readonly provider: RemoteProviderId;
	readonly data: T;
	readonly meta: IRemoteResponseMeta;
}

export interface IRemoteProviderFailure {
	readonly ok: false;
	readonly error: IRemoteProviderError;
}

export type RemoteProviderResult<T> =
	| IRemoteProviderSuccess<T>
	| IRemoteProviderFailure;
