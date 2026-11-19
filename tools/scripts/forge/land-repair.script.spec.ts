/**
 * land-repair.script.spec.ts — the repair script reads this repository's
 * policy and hands it to the plugin's repair pass; it refuses what the pass
 * refuses and fails closed on an unreadable policy.
 */
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { describe, expect, it, vi } from 'vitest';

import { runLandRepairScript } from './land-repair.script';

const quiet = () => {
	vi.spyOn(console, 'log').mockImplementation(() => undefined);
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
};

describe('runLandRepairScript', () => {
	it('[<50ms] does nothing while the engine is not `land`', async () => {
		quiet();
		const code = await runLandRepairScript({
			policy: resolveDevelopmentPolicy({ development: {} }),
			env: { GITHUB_REPOSITORY: 'o/n' },
			root: '/repo',
		});
		expect(code).toBe(0);
	});

	it('[<50ms] refuses without a repository', async () => {
		quiet();
		const code = await runLandRepairScript({
			policy: resolveDevelopmentPolicy({ development: {} }),
			env: {},
			root: '/repo',
		});
		expect(code).toBe(2);
	});
});
