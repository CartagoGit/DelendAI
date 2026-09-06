import { describe, expect, it } from 'vitest';

import {
	type IArtifactKey,
	type IArtifactRecord,
	type IArtifactStore,
	asWorktreeId,
	canonicalStateHash,
	type StateScope,
} from '@delendai/state';

import { createRefExpander } from '../../../src/lib/ref-expander';
import {
	serializeArtifactKey,
	type IContextManifest,
} from '../../../src/lib/context-manifest';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-ref-expander'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

class StubArtifactStore implements IArtifactStore {
	readonly #records = new Map<string, IArtifactRecord<unknown>>();

	async put<T>(key: IArtifactKey, value: T): Promise<IArtifactRecord<T>> {
		const record: IArtifactRecord<T> = {
			key,
			value,
			contentHash: canonicalStateHash(value as never),
			createdAt: 1,
			updatedAt: 1,
			reconciledCommitSha: 'sha',
		};
		this.#records.set(JSON.stringify(key), record);
		return record;
	}

	async get<T>(key: IArtifactKey): Promise<IArtifactRecord<T> | null> {
		return (
			(this.#records.get(JSON.stringify(key)) as IArtifactRecord<T>) ??
			null
		);
	}

	async delete(): Promise<void> {}

	async list(): Promise<readonly IArtifactKey[]> {
		return [];
	}
}

describe('createRefExpander', () => {
	it('recursively expands nested manifest refs when depth is greater than zero', async () => {
		const store = new StubArtifactStore();
		const nestedKey: IArtifactKey = {
			scope,
			kind: 'artifact',
			id: 'nested-artifact',
		};
		const nestedRecord = await store.put(nestedKey, { nested: 'value' });
		const manifest: IContextManifest = {
			id: 'ctx:nested',
			refs: [
				{
					kind: 'artifact',
					id: serializeArtifactKey(nestedKey),
					contentHash: nestedRecord.contentHash,
				},
			],
			summary: '1 refs',
			bytes: 18,
			contentHash: canonicalStateHash({ refs: [], summary: '1 refs' }),
			createdAt: 1,
		};
		const manifestKey: IArtifactKey = {
			scope,
			kind: 'manifest',
			id: 'ctx:nested',
		};
		await store.put(manifestKey, manifest);
		const expander = createRefExpander(store);

		await expect(
			expander.expand(
				{ kind: 'manifest', id: serializeArtifactKey(manifestKey) },
				1,
			),
		).resolves.toMatchObject({ refs: [{ nested: 'value' }] });
	});
});
