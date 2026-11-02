/**
 * accounts.command.spec.ts — `delendai accounts offer`: without a terminal
 * or `--yes` the offers are only listed; anything else is a usage error.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoveryConsentPath, readDiscoveryConsent } from '@delendai/core/cli';

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
	it('is registered as accounts', () => {
		expect(accountsCommand.name).toBe('accounts');
	});

	it('refuses anything but offer', async () => {
		const result = await accountsCommand.run(['list'], context(tmpdir()));
		expect(result.code).toBe(2);
		expect(result.error).toContain('accounts offer');
	});

	it('lists the offers and writes nothing when nobody can answer', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'accounts-cmd-'));
		execFileSync('git', ['init', '-q', workspace]);
		const result = await accountsCommand.run(
			['offer', '--no-catalogue'],
			context(workspace),
		);
		expect(result.code).toBe(0);
		expect(result.data).toMatchObject({ added: [], declined: [] });
	}, 60_000);

	it('turns unattended work on by id, and says which account it cannot find', async () => {
		expect(
			(await accountsCommand.run(['automation', 'x'], context(tmpdir())))
				.code,
		).toBe(2);
		const workspace = mkdtempSync(join(tmpdir(), 'accounts-auto-'));
		execFileSync('git', ['init', '-q', workspace]);
		const missing = await accountsCommand.run(
			['automation', 'nobody-here', 'on'],
			context(workspace),
		);
		expect(missing.code).toBe(3);
		expect(missing.error).toContain('nobody-here');
	});

	it('records a consent answer the discovery reads, and wants exactly one of --yes or --no', async () => {
		const cwd = mkdtempSync(join(tmpdir(), 'accounts-consent-'));
		expect(
			(await accountsCommand.run(['consent'], context(cwd))).code,
		).not.toBe(0);
		expect(
			(
				await accountsCommand.run(
					['consent', '--yes', '--no'],
					context(cwd),
				)
			).code,
		).not.toBe(0);
		await accountsCommand.run(['consent', '--no'], context(cwd));
		const path = discoveryConsentPath(cwd, '.cache/delendai');
		expect(await readDiscoveryConsent(path)).toBe('declined');
		await accountsCommand.run(['consent', '--yes'], context(cwd));
		expect(await readDiscoveryConsent(path)).toBe('granted');
	});
});
