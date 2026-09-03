import { describe, expect, it } from 'vitest';

import { diffSnapshots } from './generated-determinism.script';

describe('generated-determinism', () => {
	it('reports an artifact whose digest moved between two runs', () => {
		// Nothing changed in the repository between the runs, so a
		// difference can only come from the generator itself.
		const unstable = diffSnapshots(
			new Map([
				['packages/core/AGENT.md', 'aaa'],
				['packages/cli/AGENT.md', 'bbb'],
			]),
			new Map([
				['packages/core/AGENT.md', 'zzz'],
				['packages/cli/AGENT.md', 'bbb'],
			]),
		);
		expect(unstable).toEqual([
			{
				path: 'packages/core/AGENT.md',
				firstDigest: 'aaa',
				secondDigest: 'zzz',
			},
		]);
	});

	it('says nothing when both runs agree', () => {
		const snapshot = new Map([['a', 'x']]);
		expect(diffSnapshots(snapshot, snapshot)).toEqual([]);
	});

	it('treats an artifact that vanished on the second run as unstable', () => {
		// A generator that produced a file once and not again is not
		// deterministic either, so absence is a difference rather than
		// something to skip.
		const unstable = diffSnapshots(new Map([['a', 'x']]), new Map());
		expect(unstable).toEqual([
			{ path: 'a', firstDigest: 'x', secondDigest: 'absent' },
		]);
	});
});
