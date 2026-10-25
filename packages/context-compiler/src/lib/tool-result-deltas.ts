import { sha256Hex, type IArtifactStore } from '@delendai/state';

import {
	createContentArtifactKey,
	createContextRef,
	measureBytes,
	type IContextRef,
} from './context-manifest';

export interface IToolResultDelta {
	readonly kind: 'test-run' | 'build' | 'log' | 'git-diff' | 'generic';
	readonly ref: IContextRef;
	readonly summary: string;
	readonly contentHash: string;
	readonly bytes: number;
}

export interface IToolResultDeltaSink {
	persistAndSummarize(
		result: unknown,
		kind: IToolResultDelta['kind'],
	): Promise<IToolResultDelta>;
}

export interface ICreateToolResultDeltaSinkOptions {
	readonly artifactStore: IArtifactStore;
	readonly summarizer: (result: unknown) => string;
}

export const createToolResultDeltaSink = (
	options: ICreateToolResultDeltaSinkOptions,
): IToolResultDeltaSink => ({
	async persistAndSummarize(
		result: unknown,
		kind: IToolResultDelta['kind'],
	): Promise<IToolResultDelta> {
		// Keyed by a digest of the result, not the result: the key's id
		// travels inside the ref, and a key holding the whole result put
		// it in every delta that was meant to stand in for it.
		const record = await options.artifactStore.put(
			createContentArtifactKey(sha256Hex(JSON.stringify(result) ?? '')),
			result,
		);
		return {
			kind,
			ref: createContextRef(record),
			summary: options.summarizer(result),
			contentHash: record.contentHash,
			bytes: measureBytes(result),
		};
	},
});
