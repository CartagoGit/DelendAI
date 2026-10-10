export interface IMemoryEntry {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly tags: readonly string[];
	readonly createdAt?: string;
	readonly updatedAt?: string;
	readonly expiresAt?: string;
}

export interface IMemoryListEntry {
	readonly id: string;
	readonly title: string;
	readonly tags: readonly string[];
}

export interface IMemoryListOptions {
	readonly limit?: number;
	readonly offset?: number;
	readonly tags?: readonly string[];
}

export interface IMemoryListResult {
	readonly notes: readonly IMemoryListEntry[];
	readonly total: number;
	readonly offset: number;
	readonly nextOffset?: number;
}

export interface IMemoryRecallOptions {
	readonly query?: string;
	readonly tags?: readonly string[];
	readonly limit?: number;
}

export interface IMemorySaveInput {
	readonly title: string;
	readonly body: string;
	readonly tags?: readonly string[];
	readonly expiresAt?: string;
}

export interface IMemorySaveResult {
	readonly ok: true;
	readonly saved: IMemoryEntry;
	readonly redactedSecrets: number;
}

export interface IMemoryForgetResult {
	readonly ok: true;
	readonly removed: string;
}
