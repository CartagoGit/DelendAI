import { describe, it } from 'vitest';
import { STATE_ABI_VERSION } from '../../src/lib/fingerprint';
import { defineInMemoryStateRegistry } from '../../src/lib/driver-in-memory';
import type { IStateProducer } from '../../src/lib/producer';
import type { StateScope } from '../../src/lib/scope';
import { asWorktreeId } from '../../src/lib/scope';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-A'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

describe('debug s3b', () => {
	it('setup flow', () => {
		const r = defineInMemoryStateRegistry({ clock: () => 0 });
		const p: IStateProducer = {
			id: 'a',
			abiVersion: STATE_ABI_VERSION,
			producerVersion: 1,
			serves: ['project'],
			inputs: [],
			rebuild: () => ({ canonical: { kind: 'a' } }),
			reconcile: () => ({ canonical: { kind: 'a' } }),
		};
		r.defineProducer(p);
		const result = r.hydrate({
			scope,
			storageIdentity: { repositoryInstanceId: 'r', worktreeId: 'wt-A' },
			snapshot: {
				fingerprint: {
					abiVersion: STATE_ABI_VERSION,
					producers: [
						{
							id: 'a',
							producerVersion: 1,
							abiVersion: STATE_ABI_VERSION,
							inputs: [],
						},
					],
				},
				contents: new Map(),
				declared: [],
			},
		});
		console.log(
			'HYDRATE:',
			result.ok,
			result.ok ? '' : `${result.reason} ${result.detail}`,
		);
		if (!result.ok) return;
		const a = r.acquireProjectLease({
			scope,
			generationId: result.generation.id,
			token: result.generation.projectLeaseToken,
		});
		console.log(
			'LEASE A:',
			JSON.stringify(a, (k, v) => (typeof v === 'function' ? 'fn' : v)),
		);
	});
});
