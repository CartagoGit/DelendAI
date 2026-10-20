/**
 * accounts.command.spec.ts — `delendai accounts offer`: without a terminal
 * or `--yes` the offers are only listed; anything else is a usage error.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { accountsCommand } from './accounts.command';

const context = (cwd: string): ICliCommandContext => ({
	cwd,
	globals: {
		workspace: cwd,
		json: true,
		format: 'json',
		lang: 'en',
		noColor: true,
		plugins: [],
	},
	request: async () => {
		throw new Error('no tool call expected');
	},
	listTools: async () => [],
	close: async () => undefined,
});

describe('accounts command', () => {
	it('refuses anything but offer', async () => {
		const result = await accountsCommand.run(['list'], context(tmpdir()));
		expect(result.code).toBe(2);
		expect(result.error).toContain('accounts offer');
	});

	it('lists the offers and writes nothing when nobody can answer', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'accounts-cmd-'));
		execFileSync('git', ['init', '-q', workspace]);
		const result = await accountsCommand.run(['offer'], context(workspace));
		expect(result.code).toBe(0);
		expect(result.data).toMatchObject({ added: [], declined: [] });
	}, 60_000);
});
