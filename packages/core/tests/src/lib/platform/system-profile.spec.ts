import { afterEach, describe, expect, it } from 'vitest';

import {
	classifyOsFamily,
	clearSystemProfileCache,
	crossOsMountPrefixesFor,
	detectSystemProfile,
	isCrossOsMountPath,
	isWslEnvironment,
	needsFnmEnv,
	parseLocaleStatus,
	requestedLocale,
} from '@delendai/core/lib/platform/system-profile.helper';

// Captured verbatim from a WSL2 box and a native Ubuntu box; the pure
// classifiers are tested against these strings so nothing here depends on
// the machine the suite happens to run on.
const WSL_PROC_VERSION =
	'Linux version 6.18.33.2-microsoft-standard-WSL2 (root@f1bbfb02316b) ' +
	'(gcc (GCC) 13.2.0, GNU ld (GNU Binutils) 2.41) #1 SMP PREEMPT_DYNAMIC ' +
	'Thu Jun 18 21:54:43 UTC 2026';
const NATIVE_PROC_VERSION =
	'Linux version 6.8.0-45-generic (buildd@lcy02-amd64-091) (x86_64-linux-gnu-gcc ' +
	'(Ubuntu 13.2.0-23ubuntu4) 13.2.0) #45-Ubuntu SMP PREEMPT_DYNAMIC';
// `locale -a` on a minimal image: only the built-in C locales exist.
const MINIMAL_LOCALE_LIST = 'C\nC.utf8\nPOSIX\n';
const FULL_LOCALE_LIST = 'C\nC.utf8\nen_US.utf8\nPOSIX\n';

const noEnv: Readonly<Record<string, string | undefined>> = {};

describe('classifyOsFamily', () => {
	it('collapses platform ids to the families that change a command', () => {
		expect(classifyOsFamily('linux')).toBe('linux');
		expect(classifyOsFamily('darwin')).toBe('macos');
		expect(classifyOsFamily('win32')).toBe('windows');
		expect(classifyOsFamily('freebsd')).toBe('other');
	});
});

describe('isWslEnvironment', () => {
	it('trusts the WSL env vars when they are present', () => {
		expect(
			isWslEnvironment({
				platformId: 'linux',
				env: { WSL_DISTRO_NAME: 'Ubuntu' },
			}),
		).toBe(true);
		expect(
			isWslEnvironment({
				platformId: 'linux',
				env: { WSL_INTEROP: '/run/WSL/1233908_interop' },
			}),
		).toBe(true);
	});

	it('falls back to /proc/version for a stripped environment', () => {
		expect(
			isWslEnvironment({
				platformId: 'linux',
				env: noEnv,
				procVersion: WSL_PROC_VERSION,
			}),
		).toBe(true);
	});

	it('is false on a native Linux kernel', () => {
		expect(
			isWslEnvironment({
				platformId: 'linux',
				env: noEnv,
				procVersion: NATIVE_PROC_VERSION,
			}),
		).toBe(false);
	});

	it('is false on a non-Linux platform whatever the kernel string says', () => {
		expect(
			isWslEnvironment({
				platformId: 'darwin',
				env: { WSL_DISTRO_NAME: 'Ubuntu' },
				procVersion: WSL_PROC_VERSION,
			}),
		).toBe(false);
	});
});

describe('requestedLocale', () => {
	it('prefers LC_ALL, then LANG, then C', () => {
		expect(
			requestedLocale({ LC_ALL: 'en_US.UTF-8', LANG: 'C.UTF-8' }),
		).toBe('en_US.UTF-8');
		expect(requestedLocale({ LANG: 'C.UTF-8' })).toBe('C.UTF-8');
		expect(requestedLocale({ LC_ALL: '  ' })).toBe('C');
		expect(requestedLocale(noEnv)).toBe('C');
	});
});

describe('parseLocaleStatus', () => {
	it('accepts the C locale without consulting the generated list', () => {
		expect(parseLocaleStatus('C', '').usable).toBe(true);
		expect(parseLocaleStatus('POSIX', '').usable).toBe(true);
	});

	it('matches UTF-8 spelled either way', () => {
		// The environment says `C.UTF-8`; `locale -a` prints `C.utf8`.
		expect(parseLocaleStatus('C.UTF-8', MINIMAL_LOCALE_LIST).usable).toBe(
			true,
		);
		expect(parseLocaleStatus('en_US.UTF-8', FULL_LOCALE_LIST).usable).toBe(
			true,
		);
	});

	it('flags a forwarded locale that was never generated', () => {
		// This is the case `locale` cannot report: it warns on stderr and
		// still exits 0, so the exit code says everything is fine.
		const status = parseLocaleStatus('en_US.UTF-8', MINIMAL_LOCALE_LIST);

		expect(status.usable).toBe(false);
		expect(status.requested).toBe('en_US.UTF-8');
		expect(status.reason).toContain('LC_ALL=C.UTF-8');
	});
});

describe('isCrossOsMountPath', () => {
	const prefixes = crossOsMountPrefixesFor(true);

	it('matches a Windows drive mount and its children', () => {
		expect(isCrossOsMountPath('/mnt/c', prefixes)).toBe(true);
		expect(isCrossOsMountPath('/mnt/c/Users/dev/project', prefixes)).toBe(
			true,
		);
		expect(isCrossOsMountPath('/mnt/d/data', prefixes)).toBe(true);
	});

	it('does not match a native path, nor a lookalike sibling', () => {
		expect(isCrossOsMountPath('/home/dev/project', prefixes)).toBe(false);
		expect(isCrossOsMountPath('/mnt/cdrom/x', prefixes)).toBe(false);
		expect(isCrossOsMountPath('/mnt/storage', prefixes)).toBe(false);
	});

	it('has no cross-OS prefixes at all off WSL', () => {
		expect(crossOsMountPrefixesFor(false)).toEqual([]);
		expect(
			isCrossOsMountPath('/mnt/c/x', crossOsMountPrefixesFor(false)),
		).toBe(false);
	});
});

describe('needsFnmEnv', () => {
	const presence = (available: boolean) => ({ available });
	const tools = (fnm: boolean, node: boolean) =>
		({
			bun: presence(false),
			node: presence(node),
			npm: presence(false),
			pnpm: presence(false),
			fnm: presence(fnm),
			rg: presence(false),
			fd: presence(false),
			jq: presence(false),
			git: presence(false),
		}) as const;

	it('is true only when fnm is installed and node is not on PATH', () => {
		expect(needsFnmEnv(tools(true, false))).toBe(true);
		// `eval "$(fnm env)"` already ran in this shell.
		expect(needsFnmEnv(tools(true, true))).toBe(false);
		// A system node with no version manager at all.
		expect(needsFnmEnv(tools(false, true))).toBe(false);
		expect(needsFnmEnv(tools(false, false))).toBe(false);
	});
});

describe('detectSystemProfile', () => {
	afterEach(() => {
		clearSystemProfileCache();
	});

	it('caches, so a second caller pays nothing', async () => {
		const first = await detectSystemProfile();
		const second = await detectSystemProfile();

		expect(second).toBe(first);
		expect(await detectSystemProfile({ refresh: true })).not.toBe(first);
	});

	it('returns a self-consistent profile whatever machine it runs on', async () => {
		const profile = await detectSystemProfile();

		expect(profile.cpuCount).toBeGreaterThanOrEqual(1);
		expect(profile.totalMemoryBytes).toBeGreaterThan(0);
		expect(Date.parse(profile.detectedAt)).not.toBeNaN();
		// The invariants, not the values: a non-WSL box has no bridge paths,
		// and an unavailable tool never carries a resolved path.
		if (!profile.isWsl) expect(profile.crossOsMountPrefixes).toEqual([]);
		for (const presence of Object.values(profile.tools)) {
			if (!presence.available) expect(presence.path).toBeUndefined();
		}
	});
});
