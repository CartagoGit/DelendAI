/**
 * known-client.helper.spec.ts — the catalogue is a starting point:
 * configuration overrides and extends it by command.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
	allKnownClients,
	knownClientOf,
	knownClientsWith,
	useConfiguredClients,
} from '../../../../src/lib/shared/known-client.helper';

afterEach(() => {
	useConfiguredClients([]);
});

describe('known clients', () => {
	it('adds a client nobody shipped, from one entry', () => {
		const clients = knownClientsWith([
			{
				command: 'mimo',
				vendor: 'xiaomi',
				loginStatusArgs: ['status'],
				modelListArgs: ['models'],
			},
		]);
		const mimo = clients.find((client) => client.command === 'mimo');
		expect(mimo).toMatchObject({
			id: 'mimo-cli',
			label: 'mimo',
			vendor: 'xiaomi',
			costTier: 3,
			loginStatusArgs: ['status'],
		});
		expect(mimo?.install.dangerous).toBe(false);
	});

	it('overrides a built-in client by command, keeping what it does not say', () => {
		const [claude] = knownClientsWith([
			{
				command: 'claude',
				vendor: 'anthropic',
				costTier: 2,
				label: 'Claude Code',
			},
		]).filter((client) => client.command === 'claude');
		expect(claude).toMatchObject({
			label: 'Claude Code',
			costTier: 2,
			profileVariable: 'CLAUDE_CONFIG_DIR',
		});
		expect(
			knownClientsWith([
				{ command: 'claude', vendor: 'x', costTier: 9 },
			]).find((client) => client.command === 'claude')?.costTier,
		).toBe(4);
	});

	it('is what the process matches commands to once configured', () => {
		expect(knownClientOf('/usr/local/bin/mimo')).toBeUndefined();
		useConfiguredClients([{ command: 'mimo', vendor: 'xiaomi' }]);
		expect(knownClientOf('/usr/local/bin/mimo.exe')?.vendor).toBe('xiaomi');
		expect(
			allKnownClients().some((client) => client.command === 'claude'),
		).toBe(true);
	});
});
