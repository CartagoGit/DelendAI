import { describe, expect, it } from 'vitest';

import {
	type IArtifactKey,
	type IArtifactRecord,
	type IArtifactStore,
	asWorktreeId,
	canonicalStateHash,
	type StateScope,
} from '@delendai/state';

import {
	createContextRef,
	serializeArtifactKey,
	type IContextManifest,
} from '../../../src/lib/context-manifest';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-context-tests'),
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

describe('context compiler manifest helpers', () => {
	it('creates context refs from stored artifacts', async () => {
		const store = new StubArtifactStore();
		const key: IArtifactKey = {
			scope,
			kind: 'artifact',
			id: 'artifact-helper',
		};
		const record = await store.put(key, { helper: true });

		expect(createContextRef(record).id).toBe(serializeArtifactKey(key));
	});

	it('accepts stored manifests as manifest-shaped values', () => {
		const manifest: IContextManifest = {
			id: 'ctx:123',
			refs: [],
			summary: '0 refs',
			bytes: 0,
			contentHash: canonicalStateHash({ refs: [], summary: '0 refs' }),
			createdAt: 1,
		};

		expect(manifest.summary).toBe('0 refs');
	});
});
