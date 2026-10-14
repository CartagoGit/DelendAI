/**
 * memo-derivation-engine.spec.ts — a value is derived once per input
 * fingerprint, and kept in a store when one is given.
 */
import { describe, expect, it } from 'vitest';

import type {
	IArtifactKey,
	IArtifactRecord,
	IArtifactStore,
} from '../../../src/lib/artifact-store.interface';
import { createMemoDerivationEngine } from '../../../src/lib/memo-derivation-engine.service';
import { asWorktreeId, type StateScope } from '../../../src/lib/scope';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-memo'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

const mapStore = (): IArtifactStore => {
	const records = new Map<string, IArtifactRecord<unknown>>();
	return {
		async put<T>(key: IArtifactKey, value: T) {
			const record = {
				key,
				value,
				contentHash: 'h',
				createdAt: 1,
				updatedAt: 1,
				reconciledCommitSha: '',
			};
			records.set(JSON.stringify(key), record);
			return record;
		},
		async get<T>(key: IArtifactKey) {
			return (
				(records.get(JSON.stringify(key)) as IArtifactRecord<T>) ?? null
			);
		},
		async delete() {},
		async list() {
			return [];
		},
	};
};

describe('createMemoDerivationEngine', () => {
	it('derives once per fingerprint, and again after a restart only without a store', async () => {
		let derived = 0;
		const derivation = {
			name: 'count',
			fingerprint: () => 'same',
			derive: async () => {
				derived += 1;
				return { n: derived };
			},
		};
		const engineWith = (store?: IArtifactStore) => {
			const engine = createMemoDerivationEngine({
				store,
				scope,
				now: () => 5,
			});
			engine.register(derivation);
			return engine;
		};
		const store = mapStore();
		const first = await engineWith(store).apply('count', {
			inputs: [],
			fingerprint: 'x',
		});
		const again = await engineWith(store).apply('count', {
			inputs: [],
			fingerprint: 'x',
		});
		expect(again.value).toEqual(first.value);
		expect(derived).toBe(1);
		const inMemory = engineWith();
		const once = await inMemory.apply('count', {
			inputs: [],
			fingerprint: 'x',
		});
		expect(once).toMatchObject({
			createdAt: 5,
			key: { kind: 'fingerprint', id: 'count:same' },
		});
		await inMemory.apply('count', { inputs: [], fingerprint: 'x' });
		expect(derived).toBe(2);
		await expect(
			inMemory.apply('nope', { inputs: [], fingerprint: 'x' }),
		).rejects.toThrow(/Unknown derivation/u);
	});
});
