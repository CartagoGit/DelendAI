import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('quiet-git-setup', () => {
	it('gives every git a test spawns no auto-gc and no auto-maintenance', () => {
		const read = (key: string) =>
			execFileSync('git', ['config', '--get', key], {
				encoding: 'utf8',
			}).trim();
		expect(read('receive.autogc')).toBe('false');
		expect(read('maintenance.auto')).toBe('false');
		expect(read('gc.auto')).toBe('0');
	});

	it('is applied once, however many test files load it', async () => {
		const count = process.env.GIT_CONFIG_COUNT;
		await import('./quiet-git-setup');
		expect(process.env.GIT_CONFIG_COUNT).toBe(count);
	});
});
