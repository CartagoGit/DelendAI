import { describe, expect, it } from 'vitest';

import {
	ALLOWED_TIMERS,
	scanForgePolling,
	scanText,
	staleAllowances,
} from './no-forge-polling.script';
import { lintRepoRoot } from './lib/scan-roots.lib';

describe('no-forge-polling', () => {
	it('flags a recurring timer in a file that talks to the forge', () => {
		const found = scanText(
			'a.ts',
			"const t = setInterval(() => runGh(['pr', 'list']), 1000);",
		);
		expect(found.timer).toBe(true);
		expect(found.findings).toHaveLength(1);
	});

	it('leaves a timer alone in a file that never touches a forge', () => {
		expect(scanText('b.ts', 'setInterval(tick, 5);').timer).toBe(false);
	});

	it('leaves a forge call alone when no timer recurs', () => {
		expect(scanText('c.ts', "runGh(['pr']); setTimeout(x, 1);").timer).toBe(
			false,
		);
	});

	it('[<3000ms] scans the real tree, finds nothing unexplained and no stale entry', async () => {
		const scan = await scanForgePolling(lintRepoRoot(import.meta.url), [
			'packages/core/src',
			'plugins',
			'tools/scripts/host',
		]);
		expect(scan.filesScanned).toBeGreaterThan(100);
		expect(scan.violations).toEqual([]);
		expect(staleAllowances(scan)).toEqual([]);
		expect(Object.keys(ALLOWED_TIMERS).length).toBeGreaterThan(0);
	});

	it('measures nothing over an empty root', async () => {
		const scan = await scanForgePolling('/nonexistent-root', ['src']);
		expect(scan.filesScanned).toBe(0);
	});
});
