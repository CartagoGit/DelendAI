import type { IArtifactStore } from '@delendai/state';

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
	readonly fullContent: IContextRef;
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
		const record = await options.artifactStore.put(
			createContentArtifactKey(measureContentHashSeed(result)),
			result,
		);
		const fullContent = createContextRef(record);
		return {
			kind,
			ref: fullContent,
			summary: options.summarizer(result),
			contentHash: record.contentHash,
			bytes: measureBytes(result),
			fullContent,
		};
	},
});

function measureContentHashSeed(result: unknown): string {
	return JSON.stringify(result);
}
