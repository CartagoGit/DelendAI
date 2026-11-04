import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { realScanDeps } from '../../../../src/lib/secrets/real-deps';

describe('realScanDeps', () => {
	it('fails a git listing that cannot run instead of returning no files', async () => {
		// Not a git repository: git ls-files exits non-zero.
		const root = await mkdtemp(join(tmpdir(), 'delendai-x01027-'));
		const deps = realScanDeps(root);
		await expect(deps.listFiles('tracked')).rejects.toThrow(
			/git ls-files failed/,
		);
		await expect(deps.listIgnored?.()).rejects.toThrow(/failed/);
	});
});
