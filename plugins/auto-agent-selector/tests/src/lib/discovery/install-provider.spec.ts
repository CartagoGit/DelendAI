import { describe, expect, it } from 'vitest';

import { installKnownCli } from '../../../../src/lib/discovery/install-provider';

describe('installKnownCli', () => {
	it('refuses unknown provider ids without spawning a command', async () => {
		let calls = 0;
		const result = await installKnownCli('unknown', async () => {
			calls += 1;
			return { code: 0, stdout: '', stderr: '', timedOut: false };
		});
		expect(calls).toBe(0);
		expect(result).toMatchObject({
			attempted: false,
			ok: false,
			code: null,
		});
	});
});
