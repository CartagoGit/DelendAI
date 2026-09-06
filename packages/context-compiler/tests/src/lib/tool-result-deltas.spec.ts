import { describe, expect, it } from 'vitest';

import {
	type IArtifactKey,
	type IArtifactRecord,
	type IArtifactStore,
	asWorktreeId,
	canonicalStateHash,
	type StateScope,
} from '@delendai/state';

import { createToolResultDeltaSink } from '../../../src/lib/tool-result-deltas';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-tool-deltas'),
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

describe('createToolResultDeltaSink', () => {
	it('persists a result and returns a summary plus a full-content ref', async () => {
		const sink = createToolResultDeltaSink({
			artifactStore: new StubArtifactStore(),
			summarizer: () => '2 passed, 1 failed',
		});

		const delta = await sink.persistAndSummarize(
			{ passed: 2, failed: 1 },
			'test-run',
		);

		expect(delta.summary).toBe('2 passed, 1 failed');
		expect(delta.ref).toEqual(delta.fullContent);
		expect(delta.contentHash).toHaveLength(64);
	});

	it('returns the same content hash for identical results', async () => {
		const sink = createToolResultDeltaSink({
			artifactStore: new StubArtifactStore(),
			summarizer: () => 'stable',
		});

		const first = await sink.persistAndSummarize({ passed: 3 }, 'test-run');
		const second = await sink.persistAndSummarize(
			{ passed: 3 },
			'test-run',
		);

		expect(first.contentHash).toBe(second.contentHash);
	});

	it('returns different content hashes for different results', async () => {
		const sink = createToolResultDeltaSink({
			artifactStore: new StubArtifactStore(),
			summarizer: () => 'changed',
		});

		const first = await sink.persistAndSummarize({ passed: 3 }, 'test-run');
		const second = await sink.persistAndSummarize(
			{ passed: 4 },
			'test-run',
		);

		expect(first.contentHash).not.toBe(second.contentHash);
	});
});
