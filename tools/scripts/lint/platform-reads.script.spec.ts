import { describe, expect, it } from 'vitest';

import { countPlatformReads, overBaseline } from './platform-reads.script';

describe('platform-reads', () => {
	it('counts direct platform questions in product code, outside the platform folder', () => {
		const counts = countPlatformReads([
			{
				path: 'packages/x/src/a.ts',
				text: "if (process.platform === 'win32') {}\nconst b = 1;",
			},
			{
				path: 'packages/core/src/lib/platform/p.ts',
				text: 'process.platform',
			},
			{ path: 'packages/x/tests/a.spec.ts', text: 'process.platform' },
			{
				path: 'plugins/y/src/b.ts',
				text: "readFileSync('/proc/version')",
			},
		]);
		expect(counts).toEqual({
			'packages/x/src/a.ts': 1,
			'plugins/y/src/b.ts': 1,
		});
	});

	it('fails a file over its baseline, and a new one, never one that shrank', () => {
		expect(
			overBaseline(
				{ 'a.ts': 2, 'b.ts': 1, 'c.ts': 1 },
				{ 'a.ts': 2, 'c.ts': 3 },
			),
		).toEqual([{ path: 'b.ts', reads: 1, allowed: 0 }]);
	});
});
