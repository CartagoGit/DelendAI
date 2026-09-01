import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	CACHE_REL,
	main,
	pickLatestPublishedVersion,
	sortPublishedVersions,
	validateCoreVersionPin,
	writeRegistryCache,
} from './core-version-pin.script';

const PUBLISHED = ['0.1.0', '0.2.0', '0.2.1', '0.3.0', '1.0.0-rc.1'];
const NOW = 1_700_000_000_000;

const META = {
	source: 'registry' as const,
	cachePath: '.cache/mcp-vertex/registry-versions.json',
	latestCachedVersion: pickLatestPublishedVersion(PUBLISHED) ?? 'n/a',
};

const tempRoots: string[] = [];

const createTempRoot = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'core-version-pin-'));
	tempRoots.push(root);
	return root;
};

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe('validateCoreVersionPin (f00152 S1)', () => {
	describe('absent pin', () => {
		it('resolves to the latest-published sentinel and returns ok', () => {
			const v = validateCoreVersionPin(undefined, PUBLISHED, META);
			expect(v.ok).toBe(true);
			if (v.ok) {
				expect(v.pin).toBe('latest-published');
				expect(v.resolvedVersion).toBe('1.0.0-rc.1');
			}
		});
	});

	describe('sentinel pin', () => {
		it('treats "latest-published" as a no-op and returns ok', () => {
			const v = validateCoreVersionPin(
				'latest-published',
				PUBLISHED,
				META,
			);
			expect(v.ok).toBe(true);
			if (v.ok) {
				expect(v.pin).toBe('latest-published');
				expect(v.resolvedVersion).toBe('1.0.0-rc.1');
			}
		});
	});

	describe('concrete semver pin', () => {
		it('returns ok when pin matches a published version', () => {
			const v = validateCoreVersionPin('0.2.1', PUBLISHED, META);
			expect(v.ok).toBe(true);
			if (v.ok) {
				expect(v.resolvedVersion).toBe('0.2.1');
			}
		});

		it('returns ok when pin matches a pre-release on the published set', () => {
			const v = validateCoreVersionPin('1.0.0-rc.1', PUBLISHED, META);
			expect(v.ok).toBe(true);
			if (v.ok) {
				expect(v.resolvedVersion).toBe('1.0.0-rc.1');
			}
		});

		it('returns fail with code unknown-version when pin does not match', () => {
			const v = validateCoreVersionPin('9.9.9', PUBLISHED, META);
			expect(v.ok).toBe(false);
			if (!v.ok) {
				expect(v.code).toBe('unknown-version');
				expect(v.pin).toBe('9.9.9');
			}
		});
	});

	describe('empty published list', () => {
		it('returns fail with code empty-version-list', () => {
			const v = validateCoreVersionPin(undefined, [], META);
			expect(v.ok).toBe(false);
			if (!v.ok) {
				expect(v.code).toBe('empty-version-list');
			}
		});
	});
});

describe('sortPublishedVersions (semver ordering)', () => {
	it('orders by major.minor.patch descending', () => {
		expect(sortPublishedVersions(['0.1.0', '1.0.0', '0.2.0'])).toEqual([
			'1.0.0',
			'0.2.0',
			'0.1.0',
		]);
	});

	it('orders a release AFTER its pre-releases', () => {
		expect(
			sortPublishedVersions(['1.0.0-rc.1', '1.0.0', '1.0.0-beta.1']),
		).toEqual(['1.0.0', '1.0.0-rc.1', '1.0.0-beta.1']);
	});

	it('returns an empty array for an empty input', () => {
		expect(sortPublishedVersions([])).toEqual([]);
	});
});

describe('pickLatestPublishedVersion', () => {
	it('returns the highest semver from a set', () => {
		expect(pickLatestPublishedVersion(PUBLISHED)).toBe('1.0.0-rc.1');
	});

	it('returns null for an empty set', () => {
		expect(pickLatestPublishedVersion([])).toBeNull();
	});
});

describe('main (focused CLI behavior)', () => {
	it('fails in offline mode with a stale cache', async () => {
		const root = await createTempRoot();
		await writeFile(
			join(root, 'mcp-vertex.config.json'),
			'{"$schema":"test"}\n',
		);
		await mkdir(join(root, '.cache', 'mcp-vertex'), { recursive: true });
		await writeFile(
			join(root, CACHE_REL),
			JSON.stringify(
				{
					packageName: '@mcp-vertex/core',
					versions: ['0.4.5', '0.4.4'],
					fetchedAt: NOW - 25 * 60 * 60 * 1000,
				},
				null,
				2,
			),
		);
		let stderr = '';
		const exitCode = await main({
			argv: ['bun', 'core-version-pin.script.ts', '--offline'],
			rootDir: root,
			now: NOW,
			stdout: { write: () => undefined },
			stderr: {
				write: (chunk: string) => {
					stderr += chunk;
				},
			},
		});
		expect(exitCode).toBe(1);
		expect(stderr).toContain('offline-stale-cache');
	});

	it('succeeds in offline mode with a fresh cache', async () => {
		const root = await createTempRoot();
		await writeFile(
			join(root, 'mcp-vertex.config.json'),
			'{"$schema":"test","coreVersion":"0.4.5"}\n',
		);
		await writeRegistryCache(
			join(root, CACHE_REL),
			['0.4.5', '0.4.4'],
			NOW,
		);
		let stdout = '';
		const exitCode = await main({
			argv: ['bun', 'core-version-pin.script.ts', '--offline'],
			rootDir: root,
			now: NOW,
			stdout: {
				write: (chunk: string) => {
					stdout += chunk;
				},
			},
			stderr: { write: () => undefined },
		});
		expect(exitCode).toBe(0);
		expect(stdout).toContain('expected: 0.4.5');
	});

	it('falls back to bun.lock when npm lookup fails', async () => {
		const root = await createTempRoot();
		await writeFile(
			join(root, 'mcp-vertex.config.json'),
			'{"$schema":"test","coreVersion":"0.1.0"}\n',
		);
		await writeFile(
			join(root, 'bun.lock'),
			'{\n  "workspaces": {\n    "plugins/audit": {\n      "peerDependencies": {\n        "@mcp-vertex/core": "^0.1.0"\n      }\n    }\n  }\n}\n',
		);
		let stdout = '';
		const exitCode = await main({
			argv: ['bun', 'core-version-pin.script.ts'],
			rootDir: root,
			now: NOW,
			runNpmView: async () => {
				throw new Error('npm 404');
			},
			stdout: {
				write: (chunk: string) => {
					stdout += chunk;
				},
			},
			stderr: { write: () => undefined },
		});
		expect(exitCode).toBe(0);
		expect(stdout).toContain('found in lockfile: 0.1.0');
	});
});
