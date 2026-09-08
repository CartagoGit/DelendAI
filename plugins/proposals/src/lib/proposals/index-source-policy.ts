import type { IProposalIndexEntry } from './index-reader';

export type TIndexSourceDecision = 'sql' | 'json';

export interface IIndexSourceMetadata {
	readonly sourceCommit: string | null;
	readonly logicalDigest: string | null;
}

export interface IIndexSourcePolicyInput {
	readonly sql: readonly IProposalIndexEntry[] | null;
	readonly json: readonly IProposalIndexEntry[];
	readonly metadata: IIndexSourceMetadata | null;
}

export interface IIndexSourcePolicyResult {
	readonly source: TIndexSourceDecision;
	readonly entries: readonly IProposalIndexEntry[];
	readonly reason: 'parity' | 'divergence' | 'unavailable' | 'metadata-missing';
	readonly divergence: readonly string[];
}

const entryKey = (entry: IProposalIndexEntry): string =>
	`${entry.id}\u0000${entry.file}\u0000${entry.status ?? ''}`;

export const compareIndexEntries = (
	left: readonly IProposalIndexEntry[],
	right: readonly IProposalIndexEntry[],
): readonly string[] => {
	const leftKeys = new Set(left.map(entryKey));
	const rightKeys = new Set(right.map(entryKey));
	return [...new Set([
		...left.filter((entry) => !rightKeys.has(entryKey(entry))).map((entry) => entry.id),
		...right.filter((entry) => !leftKeys.has(entryKey(entry))).map((entry) => entry.id),
	])].sort((a, b) => a.localeCompare(b));
};

export const decideIndexSource = (
	input: IIndexSourcePolicyInput,
): IIndexSourcePolicyResult => {
	if (input.sql === null) {
		return {
			source: 'json',
			entries: input.json,
			reason: 'unavailable',
			divergence: [],
		};
	}
	if (input.metadata === null || input.metadata.sourceCommit === null) {
		return {
			source: 'json',
			entries: input.json,
			reason: 'metadata-missing',
			divergence: [],
		};
	}
	const divergence = compareIndexEntries(input.sql, input.json);
	if (divergence.length > 0) {
		return {
			source: 'json',
			entries: input.json,
			reason: 'divergence',
			divergence,
		};
	}
	return {
		source: 'sql',
		entries: input.sql,
		reason: 'parity',
		divergence: [],
	};
};