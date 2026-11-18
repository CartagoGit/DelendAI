import { describe, expect, it } from 'vitest';

import { scanForgePolling, scanText } from './no-forge-polling.script';

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

	it('measures nothing over an empty root', async () => {
		const scan = await scanForgePolling('/nonexistent-root', ['src']);
		expect(scan.filesScanned).toBe(0);
	});
});
