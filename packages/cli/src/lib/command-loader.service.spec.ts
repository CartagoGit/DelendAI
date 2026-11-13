import { describe, expect, it } from 'vitest';

import { loadCommandsFor } from './command-loader.service';

const names = async (argv: readonly string[]): Promise<readonly string[]> =>
	(await loadCommandsFor(argv)).map((command) => command.name);

describe('loadCommandsFor', () => {
	it('loads only work for a work command', async () => {
		expect(await names(['work', 'status'])).toEqual(['work']);
	});

	it('loads only guard for a guard command', async () => {
		expect(await names(['guard', 'status'])).toEqual(['guard']);
	});

	it('loads only the proposals commands for a proposals command', async () => {
		const loaded = await names(['proposals', 'status']);
		expect(loaded.length).toBeGreaterThan(1);
		expect(loaded.every((name) => name.startsWith('proposals '))).toBe(
			true,
		);
	});

	it('loads every command for help, version and other families', async () => {
		for (const argv of [
			['work', '--help'],
			['--version'],
			['git', 'status'],
		]) {
			const loaded = await names(argv);
			expect(loaded).toContain('work');
			expect(loaded).toContain('proposals status');
		}
	});
});
