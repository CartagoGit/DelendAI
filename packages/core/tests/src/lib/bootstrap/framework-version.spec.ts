// framework-version.spec.ts: pin how the installed framework VERSION
// resolves — lockfile first, exact manifest pin second, unresolved
// otherwise. f00547 S1.

import { describe, expect, it } from 'vitest';

import {
	extractLockfileVersion,
	isExactVersion,
	resolveFrameworkVersion,
} from '@delendai/core/lib/bootstrap/framework-version';
import type { ILockfileRef } from '@delendai/core/lib/contracts/interfaces/framework-version.interface';

const bunLock: ILockfileRef = {
	kind: 'bun.lock',
	text: `{
		"lockfileVersion": 1,
		"packages": {
			"react": ["react@18.3.1", "", {}, "sha512-x"],
			"@angular/core": ["@angular/core@17.3.2", "", {}, "sha512-y"],
		},
	}`,
};

const npmLockV3: ILockfileRef = {
	kind: 'package-lock.json',
	text: JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'node_modules/vue': { version: '3.4.21' },
		},
	}),
};

const npmLockV1: ILockfileRef = {
	kind: 'package-lock.json',
	text: JSON.stringify({
		lockfileVersion: 1,
		dependencies: {
			svelte: { version: '4.2.12' },
		},
	}),
};

const yarnLock: ILockfileRef = {
	kind: 'yarn.lock',
	text: [
		'next@^14.0.0, next@^14.1.0:',
		'  version "14.1.4"',
		'  resolved "https://registry.yarnpkg.com/next"',
		'',
		'solid-js@^1.8.0:',
		'  version "1.8.15"',
	].join('\n'),
};

const pnpmLock: ILockfileRef = {
	kind: 'pnpm-lock.yaml',
	text: [
		'lockfileVersion: 9.0',
		'',
		'packages:',
		'',
		'  react@18.3.1:',
		'    resolution: {integrity: sha512-x}',
		'',
		'  /vue@3.4.21(typescript@5.4.0):',
		'    resolution: {integrity: sha512-y}',
	].join('\n'),
};

describe('isExactVersion', () => {
	it('accepts a bare semver pin', () => {
		expect(isExactVersion('17.3.2')).toBe(true);
		expect(isExactVersion('1.0.0-beta.1')).toBe(true);
	});

	it('rejects a range', () => {
		expect(isExactVersion('^17.0.0')).toBe(false);
		expect(isExactVersion('~1.2.0')).toBe(false);
		expect(isExactVersion('>=1.0.0')).toBe(false);
		expect(isExactVersion('*')).toBe(false);
	});
});

describe('extractLockfileVersion', () => {
	it('reads a scoped and unscoped dep from bun.lock', () => {
		expect(extractLockfileVersion(bunLock, 'react')).toBe('18.3.1');
		expect(extractLockfileVersion(bunLock, '@angular/core')).toBe('17.3.2');
	});

	it('reads a lockfile-v3 dep from package-lock.json', () => {
		expect(extractLockfileVersion(npmLockV3, 'vue')).toBe('3.4.21');
	});

	it('reads a lockfile-v1 dep from package-lock.json', () => {
		expect(extractLockfileVersion(npmLockV1, 'svelte')).toBe('4.2.12');
	});

	it('reads a multi-specifier entry from yarn.lock', () => {
		expect(extractLockfileVersion(yarnLock, 'next')).toBe('14.1.4');
		expect(extractLockfileVersion(yarnLock, 'solid-js')).toBe('1.8.15');
	});

	it('reads a plain and a peer-qualified entry from pnpm-lock.yaml', () => {
		expect(extractLockfileVersion(pnpmLock, 'react')).toBe('18.3.1');
		expect(extractLockfileVersion(pnpmLock, 'vue')).toBe('3.4.21');
	});

	it('returns undefined for a dep the lockfile does not list', () => {
		expect(extractLockfileVersion(bunLock, 'svelte')).toBeUndefined();
		expect(extractLockfileVersion(npmLockV3, 'react')).toBeUndefined();
		expect(extractLockfileVersion(yarnLock, 'vue')).toBeUndefined();
		expect(extractLockfileVersion(pnpmLock, 'svelte')).toBeUndefined();
	});
});

describe('resolveFrameworkVersion', () => {
	it('prefers the lockfile over the manifest range', () => {
		expect(resolveFrameworkVersion('react', '^18.0.0', bunLock)).toEqual({
			depName: 'react',
			version: '18.3.1',
			range: '^18.0.0',
			source: 'lockfile',
		});
	});

	it('falls back to an exact manifest pin when the lockfile has none', () => {
		expect(
			resolveFrameworkVersion('@angular/core', '17.3.2', npmLockV3),
		).toEqual({
			depName: '@angular/core',
			version: '17.3.2',
			range: '17.3.2',
			source: 'manifest',
		});
	});

	it('reports unresolved for a range with no lockfile', () => {
		expect(resolveFrameworkVersion('vue', '^3.0.0', undefined)).toEqual({
			depName: 'vue',
			version: undefined,
			range: '^3.0.0',
			source: 'unresolved',
		});
	});

	it('reports unresolved for a range the lockfile does not answer', () => {
		expect(resolveFrameworkVersion('svelte', '^4.0.0', bunLock)).toEqual({
			depName: 'svelte',
			version: undefined,
			range: '^4.0.0',
			source: 'unresolved',
		});
	});

	it('reports unresolved with no manifest entry and no lockfile answer', () => {
		expect(
			resolveFrameworkVersion('missing-dep', undefined, bunLock),
		).toEqual({
			depName: 'missing-dep',
			version: undefined,
			range: undefined,
			source: 'unresolved',
		});
	});
});
