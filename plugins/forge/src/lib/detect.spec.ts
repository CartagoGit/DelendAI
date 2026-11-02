import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { detectForgeProvider, detectForgeProviderFromRemote } from './detect';
import { configureForgeHosts } from './services/forge';

const makeRepo = async (originUrl: string): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), 'forge-detect-'));
	await mkdir(join(dir, '.git'));
	await writeFile(
		join(dir, '.git', 'config'),
		`[remote "origin"]\n\turl = ${originUrl}\n`,
		'utf8',
	);
	return dir;
};

describe('detectForgeProvider', async () => {
	it('detects GitHub from ssh remotes', async () => {
		const dir = await makeRepo('git@github.com:foo/bar.git');
		try {
			expect(await detectForgeProvider(dir)).toBe('github');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('detects GitHub from https remotes', async () => {
		const dir = await makeRepo('https://github.com/foo/bar.git');
		try {
			expect(await detectForgeProvider(dir)).toBe('github');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('detects GitLab from ssh remotes', async () => {
		const dir = await makeRepo('git@gitlab.com:foo/bar.git');
		try {
			expect(await detectForgeProvider(dir)).toBe('gitlab');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('detects GitLab from https remotes', async () => {
		const dir = await makeRepo('https://gitlab.com/foo/bar.git');
		try {
			expect(await detectForgeProvider(dir)).toBe('gitlab');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('returns unknown for non-forge remotes', async () => {
		expect(
			detectForgeProviderFromRemote('https://example.com/foo/bar.git'),
		).toBe('unknown');
	});

	it('detects a self-hosted forge by its name or by the hosts option', () => {
		expect(
			detectForgeProviderFromRemote(
				'git@github.example.com:team/app.git',
			),
		).toBe('github');
		expect(
			detectForgeProviderFromRemote(
				'https://gitlab.corp.internal/team/app',
			),
		).toBe('gitlab');
		expect(
			detectForgeProviderFromRemote('https://code.corp.example/team/app'),
		).toBe('unknown');
		configureForgeHosts({ 'code.corp.example': 'gitlab' });
		try {
			expect(
				detectForgeProviderFromRemote(
					'https://code.corp.example/team/app',
				),
			).toBe('gitlab');
		} finally {
			configureForgeHosts({});
		}
	});
});
