import { describe, expect, it } from 'vitest';

import {
	preferCommand,
	safeParallelism,
} from '@delendai/core/lib/platform/command-preference.helper';

import { syntheticProfile } from './synthetic-profile';

const NATIVE_PATH = '/home/dev/project';
const WINDOWS_MOUNT_PATH = '/mnt/c/Users/dev/project';

describe('preferCommand', () => {
	it('prefers ripgrep when the profile says it is installed', () => {
		const preference = preferCommand(
			{ purpose: 'search-text', path: NATIVE_PATH },
			syntheticProfile({ present: ['rg', 'git', 'bun'] }),
		);

		expect(preference?.command).toBe('rg');
		expect(preference?.optimal).toBe(true);
		expect(preference?.reason).toContain('ripgrep');
	});

	it('never recommends rg on a profile without rg', () => {
		const profile = syntheticProfile({ present: ['git', 'bun'] });

		for (const path of [NATIVE_PATH, WINDOWS_MOUNT_PATH]) {
			const preference = preferCommand(
				{ purpose: 'search-text', path },
				profile,
			);
			expect(preference?.command).toBe('grep');
			expect(preference?.optimal).toBe(false);
		}
	});

	it('never recommends any absent tool, for any purpose, on an empty machine', () => {
		const bare = syntheticProfile({ present: [] });
		const purposes = [
			'search-text',
			'list-files',
			'run-tests',
			'typecheck',
			'install-deps',
		] as const;

		for (const purpose of purposes) {
			const preference = preferCommand({ purpose }, bare);
			// A package-manager purpose has no baseline: null beats a
			// recommendation that would fail.
			if (preference === null) continue;
			expect(['grep', 'find']).toContain(preference.command);
		}
		expect(preferCommand({ purpose: 'run-tests' }, bare)).toBeNull();
		expect(preferCommand({ purpose: 'typecheck' }, bare)).toBeNull();
		expect(preferCommand({ purpose: 'install-deps' }, bare)).toBeNull();
	});

	it('falls down the package-manager chain instead of inventing bun', () => {
		const npmOnly = syntheticProfile({ present: ['npm', 'node'] });

		expect(preferCommand({ purpose: 'run-tests' }, npmOnly)?.command).toBe(
			'npm',
		);
		expect(preferCommand({ purpose: 'typecheck' }, npmOnly)?.argv).toEqual([
			'exec',
			'--',
			'tsc',
			'--noEmit',
		]);
	});

	it('warns that node needs fnm env before an npm command', () => {
		const fnmOnly = syntheticProfile({
			present: ['npm', 'fnm'],
			nodeNeedsFnmEnv: true,
		});

		expect(
			preferCommand({ purpose: 'install-deps' }, fnmOnly)?.warnings.join(
				' ',
			),
		).toContain('fnm env');
	});

	it('does not warn about fnm when bun is what runs', () => {
		const withBun = syntheticProfile({
			present: ['bun', 'fnm'],
			nodeNeedsFnmEnv: true,
		});

		expect(
			preferCommand({ purpose: 'run-tests' }, withBun)?.warnings,
		).toEqual([]);
	});

	it('treats a /mnt/c path on WSL differently from a native path', () => {
		const wsl = syntheticProfile({
			present: ['rg', 'fd', 'git', 'bun'],
			isWsl: true,
			cpuCount: 10,
		});

		const native = preferCommand(
			{ purpose: 'list-files', path: NATIVE_PATH },
			wsl,
		);
		const mounted = preferCommand(
			{ purpose: 'list-files', path: WINDOWS_MOUNT_PATH },
			wsl,
		);

		expect(native?.command).toBe('fd');
		expect(native?.warnings).toEqual([]);
		// On the bridge the directory walk is the cost, so the index wins.
		expect(mounted?.command).toBe('git');
		expect(mounted?.argv).toEqual(['ls-files']);
		expect(mounted?.warnings.join(' ')).toContain('slower');
		expect(mounted?.parallelism).toBeLessThan(native?.parallelism ?? 0);
	});

	it('does not treat /mnt/c as a bridge path off WSL', () => {
		const native = syntheticProfile({
			present: ['rg', 'fd', 'git'],
			isWsl: false,
		});

		const preference = preferCommand(
			{ purpose: 'list-files', path: WINDOWS_MOUNT_PATH },
			native,
		);

		expect(preference?.command).toBe('fd');
		expect(preference?.warnings).toEqual([]);
	});

	it('carries an unusable locale into the warnings so a caller can explain it', () => {
		const profile = syntheticProfile({
			present: ['rg'],
			localeUsable: false,
		});

		expect(
			preferCommand({ purpose: 'search-text' }, profile)?.warnings.join(
				' ',
			),
		).toContain('en_US.UTF-8');
	});
});

describe('safeParallelism', () => {
	it('never recommends parallelism on a single-core machine', () => {
		const single = syntheticProfile({ present: ['rg'], cpuCount: 1 });

		expect(safeParallelism(single)).toBe(1);
		expect(preferCommand({ purpose: 'search-text' }, single)?.argv).toEqual(
			['--line-number', '--color=never', '--threads', '1'],
		);
	});

	it('is bounded by memory, not just by cores', () => {
		const starved = syntheticProfile({
			present: ['rg'],
			cpuCount: 32,
			totalMemoryBytes: 2 * 1024 * 1024 * 1024,
		});

		expect(safeParallelism(starved)).toBe(2);
	});

	it('caps workers on a cross-OS mount even with cores to spare', () => {
		const wsl = syntheticProfile({
			present: ['rg'],
			isWsl: true,
			cpuCount: 16,
		});

		expect(safeParallelism(wsl, { crossOsMount: true })).toBe(2);
		expect(safeParallelism(wsl)).toBe(16);
	});

	it('always returns at least one worker', () => {
		const tiny = syntheticProfile({
			present: [],
			cpuCount: 1,
			totalMemoryBytes: 128 * 1024 * 1024,
		});

		expect(safeParallelism(tiny)).toBe(1);
	});
});
