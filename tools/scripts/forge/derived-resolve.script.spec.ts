import { describe, expect, it } from 'vitest';

import { absoluteDir } from './derived-resolve.script';

describe('derived-resolve output directory', () => {
	it('[<5ms] resolves a relative path against the invoking directory, not a scratch worktree', () => {
		expect(absoluteDir('derived-out', '/repo')).toBe('/repo/derived-out');
	});

	it('[<5ms] keeps an absolute path as it is', () => {
		expect(absoluteDir('/tmp/out', '/repo')).toBe('/tmp/out');
	});
});
