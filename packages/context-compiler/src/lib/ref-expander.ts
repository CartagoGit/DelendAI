import type { IArtifactStore } from '@delendai/state';

import {
	isContextManifest,
	loadRecordFromRef,
	type IContextRef,
} from './context-manifest';

export interface IRefExpander {
	expand(ref: IContextRef, depth?: number): Promise<unknown>;
}

export const createRefExpander = (
	artifactStore: IArtifactStore,
): IRefExpander => ({
	async expand(ref: IContextRef, depth = 0): Promise<unknown> {
		const record = await loadRecordFromRef(artifactStore, ref);
		if (depth <= 0 || !isContextManifest(record.value)) {
			return record.value;
		}

		return {
			...record.value,
			refs: await Promise.all(
				record.value.refs.map((nestedRef) =>
					this.expand(nestedRef, depth - 1),
				),
			),
		};
	},
});
