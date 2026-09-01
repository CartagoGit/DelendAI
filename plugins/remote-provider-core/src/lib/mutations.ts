import type {
	IRemoteMutationApplied,
	IRemoteMutationAuditReceipt,
	IRemoteMutationDuplicate,
	IRemoteMutationDuplicateInfo,
	IRemoteMutationError,
	IRemoteMutationFailed,
	IRemoteMutationRejected,
	RemoteMutationMethod,
	RemoteMutationResult,
} from '@mcp-vertex/contracts/remote-mutations';
import type {
	IRemoteProviderError,
	RemoteProviderId,
} from '@mcp-vertex/contracts/remote-provider';
import { buildRedactor, redactRecord } from './redaction';

import type {
	IRemoteHttpClientDeps,
	IRemoteHttpClientOptions,
	IRemoteHttpRequestOptions,
} from './http-client';
import {
	createRemoteHttpClient,
	RemoteProviderRequestError,
} from './http-client';

export interface IRemoteMutationExecutorOptions
	extends Omit<IRemoteHttpClientOptions, 'maxRetries'> {
	readonly nowIso?: () => string;
}

export interface IRemoteMutationRequest<TResponse, TExisting = TResponse>
	extends Omit<IRemoteHttpRequestOptions<TResponse>, 'method'> {
	readonly confirm?: boolean;
	readonly actor: string;
	readonly effect: string;
	readonly resource: string;
	readonly method: RemoteMutationMethod;
	readonly idempotencyKey?: string;
	readonly auditDetails?: Readonly<
		Record<string, string | number | boolean | null | undefined>
	>;
	readonly redactValues?: readonly string[];
	readonly classifyDuplicate?: (input: {
		readonly error?: IRemoteMutationError;
		readonly data?: TResponse;
	}) => IRemoteMutationDuplicateInfo<TExisting> | null;
}

interface IIdempotencyEntry {
	readonly fingerprint: string;
	readonly promise: Promise<RemoteMutationResult<unknown, unknown>>;
}

const CONFIRM_ERROR: IRemoteMutationRejected['error'] = {
	code: 'confirmation-required',
	provider: 'unknown',
	message: 'confirm: true required',
	status: null,
	requestId: null,
	retryAfterSeconds: null,
	temporary: false,
	retryable: false,
	nextAction: 'Pass confirm: true to acknowledge the remote mutation.',
};

const MAX_AUDIT_VALUE_LENGTH = 200;

const trimAuditValue = (value: string): string =>
	value.length <= MAX_AUDIT_VALUE_LENGTH
		? value
		: `${value.slice(0, MAX_AUDIT_VALUE_LENGTH)}...`;

const toRecordValue = (
	value: string | number | boolean | null | undefined,
	redact: (input: string) => string,
): string | number | boolean | null | undefined => {
	if (typeof value !== 'string') return value;
	return trimAuditValue(redact(value));
};

const sanitizeAuditDetails = (
	details:
		| Readonly<Record<string, string | number | boolean | null | undefined>>
		| undefined,
	redact: (input: string) => string,
): Readonly<Record<string, string | number | boolean | null>> | undefined => {
	if (details === undefined) return undefined;
	const result: Record<string, string | number | boolean | null> = {};
	for (const [key, value] of Object.entries(details)) {
		const normalized = toRecordValue(value, redact);
		if (normalized !== undefined) result[key] = normalized;
	}
	return Object.keys(result).length > 0 ? result : undefined;
};

const sanitizeError = (
	error: IRemoteProviderError,
	redact: (input: string) => string,
): IRemoteMutationError => ({
	...error,
	message: trimAuditValue(redact(error.message)),
	...(error.details === undefined
		? {}
		: {
				details: redactRecord(error.details, (value) =>
					trimAuditValue(redact(value)),
				),
			}),
});

const createAuditReceipt = (
	provider: RemoteProviderId,
	request: Pick<
		IRemoteMutationRequest<unknown, unknown>,
		'actor' | 'effect' | 'resource' | 'method' | 'path' | 'idempotencyKey'
	>,
	timestamp: string,
	remote: IRemoteMutationAuditReceipt['remote'],
	idempotentReplay: boolean,
	details?: Readonly<Record<string, string | number | boolean | null>>,
): IRemoteMutationAuditReceipt => ({
	provider,
	actor: request.actor,
	effect: request.effect,
	resource: request.resource,
	timestamp,
	request: {
		method: request.method,
		path: request.path,
	},
	remote,
	idempotency: {
		key: request.idempotencyKey?.trim() || null,
		replay: idempotentReplay,
	},
	...(details === undefined ? {} : { details }),
});

const fingerprintFor = (
	request: Pick<
		IRemoteMutationRequest<unknown, unknown>,
		'method' | 'path' | 'effect' | 'resource'
	>,
): string =>
	[request.method, request.path, request.effect, request.resource].join('::');

const duplicateFromReplay = <TResponse, TExisting>(
	provider: RemoteProviderId,
	prior: RemoteMutationResult<TResponse, TExisting>,
	request: Pick<
		IRemoteMutationRequest<TResponse, TExisting>,
		'actor' | 'effect' | 'resource' | 'method' | 'path' | 'idempotencyKey'
	>,
	timestamp: string,
	details?: Readonly<Record<string, string | number | boolean | null>>,
): IRemoteMutationDuplicate<TResponse | TExisting> => {
	const duplicate: IRemoteMutationDuplicateInfo<TResponse | TExisting> =
		prior.outcome === 'duplicate'
			? prior.duplicate
			: prior.outcome === 'applied'
				? {
						message:
							'idempotency key already completed this remote mutation',
						existing: prior.data,
					}
				: {
						message:
							'idempotency key already completed this remote mutation',
					};
	const meta = prior.ok ? prior.meta : null;
	const remote = {
		status: meta?.status ?? prior.audit.remote.status,
		requestId: meta?.requestId ?? prior.audit.remote.requestId,
		attempts: meta?.attempts ?? prior.audit.remote.attempts,
		duplicate: true,
	};
	return {
		ok: true,
		outcome: 'duplicate',
		provider,
		duplicate,
		meta,
		audit: createAuditReceipt(
			provider,
			request,
			timestamp,
			remote,
			true,
			details,
		),
		idempotentReplay: true,
	};
};

const errorFromUnknown = (
	provider: RemoteProviderId,
	error: unknown,
	redact: (input: string) => string,
): IRemoteMutationError => {
	if (error instanceof RemoteProviderRequestError) {
		return sanitizeError(error.remoteError, redact);
	}
	const message =
		error instanceof Error ? error.message : trimAuditValue(String(error));
	return {
		code: 'invalid-response',
		provider,
		message: trimAuditValue(redact(message)),
		status: null,
		requestId: null,
		retryAfterSeconds: null,
		temporary: false,
		retryable: false,
	};
};

const differentMutationKeyFailure = (
	provider: RemoteProviderId,
	request: Pick<
		IRemoteMutationRequest<unknown, unknown>,
		'actor' | 'effect' | 'resource' | 'method' | 'path' | 'idempotencyKey'
	>,
	timestamp: string,
	details?: Readonly<Record<string, string | number | boolean | null>>,
): IRemoteMutationFailed => ({
	ok: false,
	outcome: 'failed',
	provider,
	error: {
		code: 'duplicate-operation',
		provider,
		message: 'idempotency key was already used for a different mutation',
		status: null,
		requestId: null,
		retryAfterSeconds: null,
		temporary: false,
		retryable: false,
		nextAction:
			'Use a fresh idempotency key for a different remote mutation.',
	},
	audit: createAuditReceipt(
		provider,
		request,
		timestamp,
		{
			status: null,
			requestId: null,
			attempts: 0,
			duplicate: true,
		},
		false,
		details,
	),
	idempotentReplay: false,
});

export const createRemoteMutationExecutor = (
	options: IRemoteMutationExecutorOptions,
	deps: IRemoteHttpClientDeps,
): {
	readonly execute: <TResponse, TExisting = TResponse>(
		request: IRemoteMutationRequest<TResponse, TExisting>,
	) => Promise<RemoteMutationResult<TResponse, TExisting>>;
} => {
	const nowIso = options.nowIso ?? (() => new Date().toISOString());
	const client = createRemoteHttpClient({ ...options, maxRetries: 0 }, deps);
	const seenIdempotency = new Map<string, IIdempotencyEntry>();

	return {
		async execute<TResponse, TExisting = TResponse>(
			request: IRemoteMutationRequest<TResponse, TExisting>,
		): Promise<RemoteMutationResult<TResponse, TExisting>> {
			const redact = buildRedactor([
				options.token,
				...(request.redactValues ?? []),
			]);
			const auditDetails = sanitizeAuditDetails(
				request.auditDetails,
				redact,
			);
			const timestamp = nowIso();
			const idempotencyKey = request.idempotencyKey?.trim() || null;
			const fingerprint = fingerprintFor(request);

			if (request.confirm !== true) {
				return {
					ok: false,
					outcome: 'rejected',
					provider: options.provider,
					error: {
						...CONFIRM_ERROR,
						provider: options.provider,
					},
					audit: createAuditReceipt(
						options.provider,
						request,
						timestamp,
						{
							status: null,
							requestId: null,
							attempts: 0,
							duplicate: false,
						},
						false,
						auditDetails,
					),
					idempotentReplay: false,
				};
			}

			if (idempotencyKey !== null) {
				const existing = seenIdempotency.get(idempotencyKey);
				if (existing !== undefined) {
					if (existing.fingerprint !== fingerprint) {
						return differentMutationKeyFailure(
							options.provider,
							request,
							timestamp,
							auditDetails,
						) as RemoteMutationResult<TResponse, TExisting>;
					}
					return duplicateFromReplay(
						options.provider,
						(await existing.promise) as RemoteMutationResult<
							TResponse,
							TExisting
						>,
						request,
						timestamp,
						auditDetails,
					);
				}
			}

			const operationPromise = (async () => {
				try {
					const result = await client.request({
						...request,
						method: request.method,
					});
					const duplicate = request.classifyDuplicate?.({
						data: result.data,
					});
					if (duplicate !== null && duplicate !== undefined) {
						return {
							ok: true,
							outcome: 'duplicate',
							provider: options.provider,
							duplicate,
							meta: result.meta,
							audit: createAuditReceipt(
								options.provider,
								request,
								nowIso(),
								{
									status: result.meta.status,
									requestId: result.meta.requestId,
									attempts: result.meta.attempts,
									duplicate: true,
								},
								true,
								auditDetails,
							),
							idempotentReplay: true,
						} satisfies IRemoteMutationDuplicate<
							TResponse | TExisting
						>;
					}
					return {
						ok: true,
						outcome: 'applied',
						provider: options.provider,
						data: result.data,
						meta: result.meta,
						audit: createAuditReceipt(
							options.provider,
							request,
							nowIso(),
							{
								status: result.meta.status,
								requestId: result.meta.requestId,
								attempts: result.meta.attempts,
								duplicate: false,
							},
							false,
							auditDetails,
						),
						idempotentReplay: false,
					} satisfies IRemoteMutationApplied<TResponse>;
				} catch (error) {
					const mutationError = errorFromUnknown(
						options.provider,
						error,
						redact,
					);
					const duplicate = request.classifyDuplicate?.({
						error: mutationError,
					});
					if (duplicate !== null && duplicate !== undefined) {
						return {
							ok: true,
							outcome: 'duplicate',
							provider: options.provider,
							duplicate,
							meta: null,
							audit: createAuditReceipt(
								options.provider,
								request,
								nowIso(),
								{
									status: mutationError.status,
									requestId: mutationError.requestId,
									attempts: 1,
									duplicate: true,
								},
								true,
								auditDetails,
							),
							idempotentReplay: true,
						} satisfies IRemoteMutationDuplicate<
							TResponse | TExisting
						>;
					}
					return {
						ok: false,
						outcome: 'failed',
						provider: options.provider,
						error: mutationError,
						audit: createAuditReceipt(
							options.provider,
							request,
							nowIso(),
							{
								status: mutationError.status,
								requestId: mutationError.requestId,
								attempts: 1,
								duplicate: false,
							},
							false,
							auditDetails,
						),
						idempotentReplay: false,
					} satisfies IRemoteMutationFailed;
				}
			})();

			if (idempotencyKey !== null) {
				seenIdempotency.set(idempotencyKey, {
					fingerprint,
					promise: operationPromise as Promise<
						RemoteMutationResult<unknown, unknown>
					>,
				});
			}

			const settled = await operationPromise;
			if (idempotencyKey !== null && settled.outcome === 'failed') {
				seenIdempotency.delete(idempotencyKey);
			}
			return settled;
		},
	};
};
