import type { StateScope } from './scope';

export interface IArtifactKey {
	readonly scope: StateScope;
	readonly kind:
		| 'generation'
		| 'snapshot'
		| 'fingerprint'
		| 'parity-report'
		| 'audit';
	readonly id: string;
}

export interface IArtifactRecord<T> {
	readonly key: IArtifactKey;
	readonly value: T;
	readonly contentHash: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly reconciledCommitSha: string;
}

export interface IArtifactStore {
	put<T>(key: IArtifactKey, value: T): Promise<IArtifactRecord<T>>;
	get<T>(key: IArtifactKey): Promise<IArtifactRecord<T> | null>;
	delete(key: IArtifactKey): Promise<void>;
	list(
		scope: StateScope,
		kind?: IArtifactKey['kind'],
	): Promise<readonly IArtifactKey[]>;
}
