/**
 * alias-launcher.integration.spec.ts — x00930 S1: `alias link|unlink`
 * drives the real fs adapter against temp dirs only.
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAliasCommand } from '../../commands/alias.command';
import { ALIAS_MARKER } from '../../contracts/constants/alias.constant';
import type { ICliCommandContext } from '../../contracts/interfaces/cli-command.interface';
import { createNodeAliasIo } from './io-real';

interface IRun {
	readonly code: number;
	readonly data?: { action: string; detail: string };
	readonly error?: string;
}

const ctx = (cwd: string): ICliCommandContext => ({
	cwd,
	globals: {
		workspace: cwd,
		json: false,
		format: 'text',
		lang: 'en',
		noColor: true,
		plugins: [],
	},
	request: async () => {
		throw new Error('the alias command calls no tool');
	},
	listTools: async () => [],
	close: async () => {},
});

const command = (tmp: string, canonicalPath: string) =>
	createAliasCommand({
		io: createNodeAliasIo(),
		resolveLaunch: () => ({
			canonicalPath,
			binDir: tmp,
			source: 'meta-url',
		}),
	});

const setup = async () => {
	const tmp = await mkdtemp(join(tmpdir(), 'alias-launcher-'));
	await mkdir(join(tmp, '.bun', 'bin'), { recursive: true });
	vi.stubEnv('BUN_INSTALL', join(tmp, '.bun'));
	return { tmp, launcher: join(tmp, '.bun', 'bin', 'delendai') };
};

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('alias link / unlink', () => {
	it('links the checkout, is idempotent, and unlinks only its own', async () => {
		const { tmp, launcher } = await setup();
		const entry = join(tmp, 'co', 'packages', 'cli', 'src', 'index.ts');
		const cmd = command(tmp, entry);

		const first = (await cmd.run(['link'], ctx(tmp))) as IRun;
		expect(first.data?.action).toBe('created');
		expect(first.data?.detail).toContain(launcher);
		const text = await readFile(launcher, 'utf8');
		expect(text).toContain(ALIAS_MARKER);
		expect(text).toContain(`'${join(tmp, 'co')}'`);

		const again = (await cmd.run(['alias', 'link'], ctx(tmp))) as IRun;
		expect(again.data?.action).toBe('unchanged');

		const gone = (await cmd.run(['unlink'], ctx(tmp))) as IRun;
		expect(gone.data?.action).toBe('removed');
		const none = (await cmd.run(['unlink'], ctx(tmp))) as IRun;
		expect(none.data?.action).toBe('unchanged');
	});

	it('falls back to the cwd when the CLI is not run from a checkout', async () => {
		const { tmp, launcher } = await setup();
		await command(tmp, join(tmp, 'dist', 'index.js')).run(
			['link'],
			ctx(tmp),
		);
		expect(await readFile(launcher, 'utf8')).toContain(
			`'${process.cwd()}'`,
		);
	});

	it('never overwrites or removes a file it did not write', async () => {
		const { tmp, launcher } = await setup();
		await writeFile(launcher, '#!/bin/sh\necho mine\n');
		const cmd = command(tmp, join(tmp, 'index.ts'));
		const linked = (await cmd.run(['link'], ctx(tmp))) as IRun;
		expect(linked.data?.action).toBe('refused');
		const unlinked = (await cmd.run(['unlink'], ctx(tmp))) as IRun;
		expect(unlinked.data?.action).toBe('refused');
		expect(await readFile(launcher, 'utf8')).toContain('mine');
	});

	it('reports a usage error when no global bin directory can be found', async () => {
		const { tmp } = await setup();
		for (const name of [
			'BUN_INSTALL',
			'HOME',
			'USERPROFILE',
			'NPM_CONFIG_PREFIX',
			'npm_config_prefix',
		])
			vi.stubEnv(name, '');
		const out = (await command(tmp, join(tmp, 'index.ts')).run(
			['link'],
			ctx(tmp),
		)) as IRun;
		expect(out.error).toContain('no global bin directory');
	});
});
