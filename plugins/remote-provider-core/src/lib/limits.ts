/**
 * Hard limits for remote-provider responses.
 *
 * All limits are enforced before data leaves the plugin.  They protect the
 * MCP output budget, prevent runaway pagination, and bound wall-clock time.
 */

import type {
	IRemoteTruncationInfo,
	RemoteTruncationReason,
} from '@mcp-vertex/contracts/remote-provider';

export interface IResponseLimits {
	/** Maximum bytes kept from the raw response body. */
	readonly maxBytes: number;
	/** Maximum lines kept after splitting on newlines. */
	readonly maxLines: number;
	/** Maximum number of pages fetched in a paginated request. */
	readonly maxPages: number;
	/** Maximum number of items across all pages. */
	readonly maxArtifacts: number;
}

export const DEFAULT_LIMITS: IResponseLimits = {
	maxBytes: 512_000,
	maxLines: 4_000,
	maxPages: 10,
	maxArtifacts: 500,
};

export interface IApplyByteLimitResult {
	readonly text: string;
	readonly truncation: IRemoteTruncationInfo;
}

/** Truncate a body string to at most `maxBytes` UTF-8 bytes. */
export const applyByteLimit = (
	raw: string,
	maxBytes: number,
): IApplyByteLimitResult => {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder('utf-8', { fatal: false });
	const encoded = encoder.encode(raw);
	const originalBytes = encoded.byteLength;

	if (originalBytes <= maxBytes) {
		return {
			text: raw,
			truncation: {
				truncated: false,
				reason: null,
				originalBytes,
				keptBytes: originalBytes,
				originalLines: null,
				keptLines: null,
			},
		};
	}

	const kept = decoder.decode(encoded.subarray(0, maxBytes));
	return {
		text: kept,
		truncation: {
			truncated: true,
			reason: 'byte-limit' satisfies RemoteTruncationReason,
			originalBytes,
			keptBytes: maxBytes,
			originalLines: null,
			keptLines: null,
		},
	};
};

export interface IApplyLineLimitResult {
	readonly lines: readonly string[];
	readonly truncation: IRemoteTruncationInfo;
}

/** Truncate an array of lines to at most `maxLines`. */
export const applyLineLimit = (
	allLines: readonly string[],
	maxLines: number,
): IApplyLineLimitResult => {
	const originalLines = allLines.length;
	if (originalLines <= maxLines) {
		return {
			lines: allLines,
			truncation: {
				truncated: false,
				reason: null,
				originalBytes: null,
				keptBytes: null,
				originalLines,
				keptLines: originalLines,
			},
		};
	}

	return {
		lines: allLines.slice(0, maxLines),
		truncation: {
			truncated: true,
			reason: 'line-limit' satisfies RemoteTruncationReason,
			originalBytes: null,
			keptBytes: null,
			originalLines,
			keptLines: maxLines,
		},
	};
};

export interface IPaginationGuard {
	/** Whether more pages exist but were not fetched. */
	readonly capped: boolean;
	/** Number of pages fetched. */
	readonly pagesFetched: number;
	/** Total items collected. */
	readonly itemsCollected: number;
}

/**
 * Decide whether to fetch another page given current counters.
 * Returns false when either limit would be exceeded.
 */
export const shouldFetchNextPage = (
	pagesFetched: number,
	itemsCollected: number,
	limits: IResponseLimits,
): boolean =>
	pagesFetched < limits.maxPages && itemsCollected < limits.maxArtifacts;

/** Build a truncation info when artifact or page limits were hit. */
export const buildArtifactTruncation = (
	itemsCollected: number,
	_limits: IResponseLimits,
): IRemoteTruncationInfo => ({
	truncated: true,
	reason: 'server-limit' satisfies RemoteTruncationReason,
	originalBytes: null,
	keptBytes: null,
	originalLines: null,
	keptLines: itemsCollected,
});
