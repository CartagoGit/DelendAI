import { describe, expect, it } from 'vitest';

import {
	asWorktreeId,
	type IArtifactKey,
	type StateScope,
} from '@delendai/state';

import {
	calculateManifestHash,
	contextSummaryForRefs,
	parseArtifactKey,
	serializeArtifactKey,
} from '../../../src/lib/context-manifest';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-manifest'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

describe('context manifest helpers', () => {
	it('round-trips artifact keys through ref ids', () => {
		const key: IArtifactKey = { scope, kind: 'artifact', id: 'artifact-1' };

		expect(parseArtifactKey(serializeArtifactKey(key))).toEqual(key);
	});

	it('computes canonical hashes from refs plus summary', () => {
		const refs = [
			{ kind: 'artifact', id: 'artifact-1', contentHash: 'abc' },
		] as const;
		const summary = contextSummaryForRefs(refs);

		expect(calculateManifestHash(refs, summary)).toHaveLength(64);
	});
});
