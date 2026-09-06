import { describe, expect, it } from 'vitest';

import {
	type IArtifactKey,
	type IArtifactRecord,
	type IArtifactStore,
	type IDerivation,
	type IDerivationEngine,
	type IDerivationInput,
	canonicalStateHash,
	asWorktreeId,
	type StateScope,
} from '@delendai/state';

import { createContextCompiler } from './context-compiler';
import { serializeArtifactKey, type IContextRef } from './context-manifest';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-context-compiler'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

class MapArtifactStore implements IArtifactStore {
	readonly #records = new Map<string, IArtifactRecord<unknown>>();

	constructor(
		private readonly now: () => number,
		private readonly reconciledCommitSha: string,
	) {}

	async put<T>(key: IArtifactKey, value: T): Promise<IArtifactRecord<T>> {
		const mapKey = JSON.stringify(key);
		const existing = this.#records.get(mapKey) as
			| IArtifactRecord<T>
			| undefined;
		const now = this.now();
		const record: IArtifactRecord<T> = {
			key,
			value,
			contentHash: canonicalStateHash(value as never),
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
			reconciledCommitSha: this.reconciledCommitSha,
		};
		this.#records.set(mapKey, record);
		return record;
	}

	async get<T>(key: IArtifactKey): Promise<IArtifactRecord<T> | null> {
		return (
			(this.#records.get(JSON.stringify(key)) as IArtifactRecord<T>) ??
			null
		);
	}

	async delete(key: IArtifactKey): Promise<void> {
		this.#records.delete(JSON.stringify(key));
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

class MapDerivationEngine implements IDerivationEngine {
	readonly #registry = new Map<string, IDerivation<unknown, unknown>>();

	constructor(
		private readonly now: () => number,
		private readonly reconciledCommitSha: string,
	) {}

	register<TIn, TOut>(derivation: IDerivation<TIn, TOut>): void {
		this.#registry.set(
			derivation.name,
			derivation as IDerivation<unknown, unknown>,
		);
	}

	async apply<TIn, TOut>(
		name: string,
		input: IDerivationInput<TIn>,
	): Promise<IArtifactRecord<TOut>> {
		const derivation = this.#registry.get(name) as
			| IDerivation<TIn, TOut>
			| undefined;
		if (derivation === undefined) {
			throw new Error(`Unknown derivation: ${name}`);
		}
		const value = await derivation.derive(input);
		return {
			key: {
				scope: input.inputs[0]?.key.scope ?? scope,
				kind: 'fingerprint',
				id: `${name}:${derivation.fingerprint(input)}`,
			},
			value,
			contentHash: canonicalStateHash(value as never),
			createdAt: this.now(),
			updatedAt: this.now(),
			reconciledCommitSha: this.reconciledCommitSha,
		};
	}
}

async function seedArtifact(
	store: IArtifactStore,
	id: string,
	value: unknown,
	kind: IArtifactKey['kind'] = 'artifact',
): Promise<IContextRef> {
	const key: IArtifactKey = { scope, kind, id };
	const record = await store.put(key, value);
	return {
		kind:
			kind === 'generation'
				? 'generation'
				: kind === 'fingerprint'
					? 'fingerprint'
					: 'artifact',
		id: serializeArtifactKey(key),
		contentHash: record.contentHash,
	};
}

describe('createContextCompiler', () => {
	it('compile with empty refs returns a manifest with zero bytes and a content hash', async () => {
		const compiler = createContextCompiler({
			artifactStore: new MapArtifactStore(() => 1000, 'abc123'),
			derivationEngine: new MapDerivationEngine(() => 1000, 'abc123'),
		});

		const manifest = await compiler.compile([]);

		expect(manifest.bytes).toBe(0);
		expect(manifest.refs).toEqual([]);
		expect(manifest.contentHash).toHaveLength(64);
	});

	it('compile with three refs uses the canonical hash of refs plus summary', async () => {
		const store = new MapArtifactStore(() => 2000, 'def456');
		const refs = await Promise.all([
			seedArtifact(store, 'artifact-1', { order: 1 }),
			seedArtifact(store, 'artifact-2', { order: 2 }),
			seedArtifact(store, 'artifact-3', { order: 3 }),
		]);
		const compiler = createContextCompiler({
			artifactStore: store,
			derivationEngine: new MapDerivationEngine(() => 2000, 'def456'),
		});

		const manifest = await compiler.compile(refs);

		expect(manifest.contentHash).toBe(
			canonicalStateHash({
				refs: manifest.refs.map((ref) => ({
					kind: ref.kind,
					id: ref.id,
					...(ref.contentHash === undefined
						? {}
						: { contentHash: ref.contentHash }),
				})),
				summary: manifest.summary,
			}),
		);
	});

	it('expand returns the stored artifact value', async () => {
		const store = new MapArtifactStore(() => 3000, 'ghi789');
		const ref = await seedArtifact(store, 'artifact-expand', {
			passed: true,
		});
		const compiler = createContextCompiler({
			artifactStore: store,
			derivationEngine: new MapDerivationEngine(() => 3000, 'ghi789'),
		});

		await expect(compiler.expand(ref)).resolves.toEqual({ passed: true });
	});

	it('diff between identical manifests returns a manifest with zero refs', async () => {
		const store = new MapArtifactStore(() => 4000, 'jkl012');
		const refs = [
			await seedArtifact(store, 'artifact-same', { stable: true }),
		];
		const compiler = createContextCompiler({
			artifactStore: store,
			derivationEngine: new MapDerivationEngine(() => 4000, 'jkl012'),
		});

		const before = await compiler.compile(refs);
		const after = await compiler.compile(refs);
		const diff = await compiler.diff(before, after);

		expect(diff.refs).toEqual([]);
		expect(diff.bytes).toBe(0);
	});
});
