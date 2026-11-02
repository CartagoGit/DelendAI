import type {
	IRemoteProviderError,
	IRemoteResponseMeta,
	RemoteProviderErrorCode,
	RemoteProviderId,
} from './remote-provider';

// Re-exported so plugins can keep importing the full shape of a remote
// mutation outcome from a single public entry. The contract remains the
// canonical source of truth: `remote-provider` defines the primitive
// error/meta/provider-id types, and `remote-mutations` composes them.
export type { IRemoteProviderError, IRemoteResponseMeta, RemoteProviderId };

export type RemoteMutationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RemoteMutationErrorCode =
	| RemoteProviderErrorCode
	| 'confirmation-required'
	| 'duplicate-operation';

export interface IRemoteMutationError
	extends Omit<IRemoteProviderError, 'code'> {
	readonly code: RemoteMutationErrorCode;
	readonly nextAction?: string;
}

export interface IRemoteMutationDuplicateInfo<TExisting = unknown> {
	readonly message: string;
	readonly existing?: TExisting;
}

export interface IRemoteMutationAuditReceipt {
	readonly provider: RemoteProviderId;
	readonly actor: string;
	readonly effect: string;
	readonly resource: string;
	readonly timestamp: string;
	readonly request: {
		readonly method: RemoteMutationMethod;
		readonly path: string;
	};
	readonly remote: {
		readonly status: number | null;
		readonly requestId: string | null;
		readonly attempts: number;
		readonly duplicate: boolean;
	};
	readonly idempotency: {
		readonly key: string | null;
		readonly replay: boolean;
	};
	readonly details?: Readonly<
		Record<string, string | number | boolean | null>
	>;
}

export interface IRemoteMutationApplied<TData> {
	readonly ok: true;
	readonly outcome: 'applied';
	readonly provider: RemoteProviderId;
	readonly data: TData;
	readonly meta: IRemoteResponseMeta;
	readonly audit: IRemoteMutationAuditReceipt;
	readonly idempotentReplay: false;
}

export interface IRemoteMutationDuplicate<TExisting = unknown> {
	readonly ok: true;
	readonly outcome: 'duplicate';
	readonly provider: RemoteProviderId;
	readonly duplicate: IRemoteMutationDuplicateInfo<TExisting>;
	readonly meta: IRemoteResponseMeta | null;
	readonly audit: IRemoteMutationAuditReceipt;
	readonly idempotentReplay: true;
}

export interface IRemoteMutationRejected {
	readonly ok: false;
	readonly outcome: 'rejected';
	readonly provider: RemoteProviderId;
	readonly error: IRemoteMutationError & {
		readonly code: 'confirmation-required';
	};
	readonly audit: IRemoteMutationAuditReceipt;
	readonly idempotentReplay: false;
}

export interface IRemoteMutationFailed {
	readonly ok: false;
	readonly outcome: 'failed';
	readonly provider: RemoteProviderId;
	readonly error: IRemoteMutationError;
	readonly audit: IRemoteMutationAuditReceipt;
	readonly idempotentReplay: false;
}

export type RemoteMutationResult<TData, TExisting = TData> =
	| IRemoteMutationApplied<TData>
	| IRemoteMutationDuplicate<TData | TExisting>
	| IRemoteMutationRejected
	| IRemoteMutationFailed;
