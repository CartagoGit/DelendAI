import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ALIAS_MARKER } from '../../../packages/cli/src/contracts/constants/alias.constant';
import {
	installAlias,
	readAliasState,
} from '../../../packages/cli/src/lib/alias/alias-manager';
import { createNodeAliasIo } from '../../../packages/cli/src/lib/alias/io-real';

const roots: string[] = [];

const makeSandbox = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'b00239-s9-alias-'));
	roots.push(root);
	return root;
};

afterEach(async () => {
	for (const root of roots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

describe('b00239 S9 — alias conflict adoption scenarios', () => {
	it('creates est when the alias name is free', async () => {
		const root = await makeSandbox();
		const binDir = join(root, 'bin');
		const canonicalPath = join(binDir, 'delendai');
		const io = createNodeAliasIo();

		const outcome = await installAlias(
			'est',
			{
				platform: 'posix',
				binDir,
				canonicalPath,
			},
			io,
		);

		expect(outcome.action).toBe('created');
		expect(
			(
				await readAliasState(
					'est',
					{
						platform: 'posix',
						binDir,
						canonicalPath,
					},
					io,
				)
			).state,
		).toBe('ours');
		expect((await stat(join(binDir, 'est'))).isFile()).toBe(true);
		expect(await readFile(join(binDir, 'est'), 'utf8')).toContain(
			ALIAS_MARKER,
		);
	});

	it('refuses to overwrite a foreign est binary and leaves its bytes untouched', async () => {
		const root = await makeSandbox();
		const binDir = join(root, 'bin');
		const canonicalPath = join(binDir, 'delendai');
		const io = createNodeAliasIo();
		await mkdir(binDir, { recursive: true });
		const foreignPath = join(binDir, 'est');
		const foreignContents = '#!/bin/sh\necho foreign-est\n';
		await writeFile(foreignPath, foreignContents, 'utf8');

		const outcome = await installAlias(
			'est',
			{
				platform: 'posix',
				binDir,
				canonicalPath,
			},
			io,
		);

		expect(outcome.action).toBe('refused');
		expect(outcome.status.state).toBe('foreign');
		expect(await readFile(foreignPath, 'utf8')).toBe(foreignContents);
	});
});
