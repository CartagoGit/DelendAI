import { describe, expect, it } from 'vitest';

import {
	candidateBody,
	candidateBranchName,
	integrationRepositoryUid,
} from '@delendai/core/lib/integration-engine/identity';

describe('integration identity', () => {
	it('keys a repository the way the work model does', () => {
		expect(
			integrationRepositoryUid({
				forge: 'github',
				owner: 'acme',
				repository: 'widgets',
				remote: 'origin',
			}),
		).toBe('github:acme/widgets');
	});

	it('publishes a work ref under the same name without its refs/ prefix', () => {
		expect(candidateBranchName('refs/wip/a/p-s-g1')).toBe('wip/a/p-s-g1');
		expect(candidateBranchName('refs/heads/wip/a/p-s-g1')).toBe(
			'wip/a/p-s-g1',
		);
	});

	it('derives the same branch from the same work ref every time', () => {
		const ref = 'refs/wip/a/p-s-g1';
		expect(candidateBranchName(ref)).toBe(candidateBranchName(ref));
	});

	it('leaves a name that has no refs/ prefix alone', () => {
		expect(candidateBranchName('wip/a/p-s-g1')).toBe('wip/a/p-s-g1');
	});

	it('states the facts of the merge in the body, one scoped path per line', () => {
		const body = candidateBody({
			proposalUid: 'p1',
			sliceUid: 's1',
			generation: 2,
			baseIntegrationSha: 'abc',
			patchDigest: 'def',
			fileScope: ['a.ts', 'b.ts'],
		});
		expect(body.split('\n')).toEqual([
			'Proposal: p1',
			'Slice: s1',
			'Generation: 2',
			'Base: abc',
			'Patch digest: def',
			'',
			'Scope:',
			'- a.ts',
			'- b.ts',
		]);
	});
});
