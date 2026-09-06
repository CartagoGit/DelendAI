import { describe, expect, it } from 'vitest';

import {
	type IArtifactKey,
	type IArtifactRecord,
	type IArtifactStore,
} from '../../../src/lib/artifact-store.interface';
import { canonicalStateHash } from '../../../src/lib/hash';
import { asWorktreeId, type StateScope } from '../../../src/lib/scope';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-artifacts'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

const key = {
	scope,
	kind: 'snapshot',
	id: 'artifact-1',
} satisfies IArtifactKey;

class MapArtifactStore implements IArtifactStore {
	readonly #records = new Map<string, IArtifactRecord<unknown>>();

	constructor(
		private readonly now: () => number,
		private readonly reconciledCommitSha: string,
	) {}

	async put<T>(
		artifactKey: IArtifactKey,
		value: T,
	): Promise<IArtifactRecord<T>> {
		const mapKey = stringifyKey(artifactKey);
		const existing = this.#records.get(mapKey) as
			| IArtifactRecord<T>
			| undefined;
		const now = this.now();
		const record: IArtifactRecord<T> = {
			key: artifactKey,
			value,
			contentHash: canonicalStateHash(value as never),
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
			reconciledCommitSha: this.reconciledCommitSha,
		};
		this.#records.set(mapKey, record);
		return record;
	}

	async get<T>(
		artifactKey: IArtifactKey,
	): Promise<IArtifactRecord<T> | null> {
		return (
			(this.#records.get(
				stringifyKey(artifactKey),
			) as IArtifactRecord<T>) ?? null
		);
	}

	async delete(artifactKey: IArtifactKey): Promise<void> {
		this.#records.delete(stringifyKey(artifactKey));
	}

	async list(
		artifactScope: StateScope,
		kind?: IArtifactKey['kind'],
	): Promise<readonly IArtifactKey[]> {
		return [...this.#records.values()]
			.map((record) => record.key)
			.filter(
				(candidate) =>
					candidate.scope.kind === artifactScope.kind &&
					JSON.stringify(candidate.scope.locator) ===
						JSON.stringify(artifactScope.locator) &&
					(kind === undefined || candidate.kind === kind),
			);
	}
}

function stringifyKey(artifactKey: IArtifactKey): string {
	return JSON.stringify(artifactKey);
}

function acceptsArtifactStore<T extends IArtifactStore>(store: T): T {
	return store;
}

describe('artifact-store.interface (c00523 S1)', () => {
	it('compiles against the store contract', () => {
		const store = acceptsArtifactStore(
			new MapArtifactStore(() => 1000, 'abc123'),
		);
		expect(store).toBeInstanceOf(MapArtifactStore);
	});

	it('round-trips records through a Map-backed stub', async () => {
		const store = new MapArtifactStore(() => 1000, 'abc123');
		const saved = await store.put(key, { proposalIds: ['c00523'] });
		expect(saved.key).toEqual(key);
		expect(saved.createdAt).toBe(1000);
		expect(saved.updatedAt).toBe(1000);
		expect(saved.reconciledCommitSha).toBe('abc123');

		const loaded = await store.get<{ proposalIds: string[] }>(key);
		expect(loaded).not.toBeNull();
		expect(loaded?.contentHash).toBe(saved.contentHash);
		expect(loaded?.value).toEqual({ proposalIds: ['c00523'] });
		expect(await store.list(scope, 'snapshot')).toEqual([key]);

		await store.delete(key);
		expect(await store.get(key)).toBeNull();
	});
});
