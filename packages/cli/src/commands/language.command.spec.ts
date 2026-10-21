/**
 * language.command.spec.ts — `delendai language [<code>]` says what it
 * speaks and keeps a choice.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { readSavedLanguage } from '../lib/cli-language.service';
import { languageCommand } from './language.command';

const context = (): ICliCommandContext => ({
	cwd: tmpdir(),
	globals: {
		workspace: tmpdir(),
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

let root = '';
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'language-'));
	vi.stubEnv('XDG_CONFIG_HOME', root);
	vi.stubEnv('APPDATA', root);
});
afterEach(() => {
	vi.unstubAllEnvs();
});

describe('language command', () => {
	it('is offline', () => {
		expect(languageCommand.name).toBe('language');
		expect(languageCommand.offline).toBe(true);
	});

	it('says what it speaks and which languages it has', async () => {
		const result = await languageCommand.run([], context());
		expect(result.code ?? 0).toBe(0);
		expect(JSON.stringify(result)).toContain('Español');
	});

	it('saves a choice', async () => {
		const result = await languageCommand.run(['ES'], context());
		expect(JSON.stringify(result)).toContain('"saved":"es"');
		expect(
			await readSavedLanguage(join(root, 'delendai', 'language.json')),
		).toBe('es');
	});

	it('refuses what is not a language code', async () => {
		const result = await languageCommand.run(['spanish!'], context());
		expect(result.code).toBe(2);
		expect(result.error).toContain('language');
	});
});
