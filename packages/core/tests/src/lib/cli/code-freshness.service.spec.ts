import { describe, expect, it } from 'vitest';

import { codeFreshnessOf } from '../../../../src/lib/cli/code-freshness.service';

describe('codeFreshnessOf', () => {
	it('is fresh when the stale-runtime watch says nothing, or is not wired', async () => {
		expect(await codeFreshnessOf(async () => undefined)).toEqual({
			stale: false,
		});
		expect(await codeFreshnessOf(undefined)).toEqual({ stale: false });
	});

	it('says why and what to do when the watch reads the server as behind', async () => {
		const answer = await codeFreshnessOf(
			async () => 'the checkout is at bbb, 3 source files changed',
		);
		expect(answer).toMatchObject({
			stale: true,
			reason: 'the checkout is at bbb, 3 source files changed',
		});
		expect(answer.next).toContain('Restart the host server');
	});
});
