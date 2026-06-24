import { describe, expect, it } from 'vitest';

import { killProcessGroup } from '@mcp-vertex/core/public';

describe('killProcessGroup (M25)', async () => {
	it('is a no-op for an undefined pid', async () => {
		expect(() => killProcessGroup(undefined)).not.toThrow();
	});

	it('never throws for an already-gone / non-existent pid', async () => {
		// A pid that is virtually certain not to exist: both the group signal and
		// the leader fallback fail with ESRCH, which the helper swallows.
		expect(() => killProcessGroup(2 ** 30)).not.toThrow();
	});
});
