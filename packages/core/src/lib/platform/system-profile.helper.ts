/**
 * system-profile.ts — q00014 S1: detect, once, what kind of machine this
 * is, so no agent has to rediscover it by failing.
 *
 * All the I/O lives in `detectSystemProfile`, which caches its result for
 * the life of the process. Everything else in this file is a pure
 * classifier over captured strings (`/proc/version`, `locale -a`, a
 * platform id) — which is what the tests drive, so no assertion ever
 * depends on the machine the suite happens to run on.
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cpus, platform, totalmem } from 'node:os';

import type {
	IKnownCommand,
	ILocaleStatus,
	IOsFamily,
	ISystemProfile,
	IToolPresence,
} from '../contracts/interfaces/system-profile.interface';

/** Probed in one batch by `detectSystemProfile`; order is irrelevant. */
const PROBED_COMMANDS: readonly IKnownCommand[] = [
	'bun',
	'node',
	'npm',
	'pnpm',
	'fnm',
	'rg',
	'fd',
	'jq',
	'git',
];

/** WSL mounts Windows drives here; `/mnt/c/...` is the common case. */
const WSL_DRIVE_MOUNT_ROOT = '/mnt/';

/** Locales that exist without being generated, so `locale -a` need not list them. */
const ALWAYS_PRESENT_LOCALES = new Set(['c', 'posix', '']);

/** Collapse `NodeJS.Platform` to the families that change a command choice. */
export const classifyOsFamily = (platformId: string): IOsFamily => {
	if (platformId === 'linux') return 'linux';
	if (platformId === 'darwin') return 'macos';
	if (platformId === 'win32') return 'windows';
	return 'other';
};

/**
 * True when this Linux userland is running under Windows. Env vars are
 * authoritative when present (WSL sets both); `/proc/version` is the
 * fallback for a stripped environment, e.g. a service or a `sudo -i` shell.
 */
export const isWslEnvironment = (input: {
	readonly platformId: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly procVersion?: string | undefined;
}): boolean => {
	if (classifyOsFamily(input.platformId) !== 'linux') return false;
	if (
		input.env.WSL_DISTRO_NAME !== undefined ||
		input.env.WSL_INTEROP !== undefined
	) {
		return true;
	}
	return /microsoft|wsl/iu.test(input.procVersion ?? '');
};

/**
 * Normalise a locale tag for comparison: `en_US.UTF-8` and `en_US.utf8`
 * are the same locale spelled two ways, and `locale -a` prints the
 * second while environments almost always carry the first.
 */
const normalizeLocaleTag = (tag: string): string =>
	tag.trim().toLowerCase().replace(/-/gu, '');

/**
 * Decide whether the requested locale is actually generated here.
 *
 * The `locale` command cannot answer this: a forwarded-but-ungenerated
 * `LC_ALL` makes it warn on stderr and exit 0, so the exit code says
 * "fine" while every child process gets a warning banner mixed into its
 * output. Membership in `locale -a` is the only honest signal.
 */
export const parseLocaleStatus = (
	requested: string,
	localeListOutput: string,
): ILocaleStatus => {
	const wanted = normalizeLocaleTag(requested);
	if (ALWAYS_PRESENT_LOCALES.has(wanted)) {
		return {
			requested: requested === '' ? 'C' : requested,
			usable: true,
			reason: 'The C/POSIX locale always exists; no generation needed.',
		};
	}
	const generated = new Set(
		localeListOutput
			.split('\n')
			.map((line) => normalizeLocaleTag(line))
			.filter((line) => line !== ''),
	);
	if (generated.has(wanted)) {
		return {
			requested,
			usable: true,
			reason: `${requested} is generated on this machine.`,
		};
	}
	return {
		requested,
		usable: false,
		reason:
			`${requested} is requested but not generated here, so commands ` +
			'emit a locale warning on stderr while still exiting 0. Prefix ' +
			'with LC_ALL=C.UTF-8 to get clean output.',
	};
};

/** The locale the environment asks for: `LC_ALL` wins, then `LANG`, else `C`. */
export const requestedLocale = (
	env: Readonly<Record<string, string | undefined>>,
): string => {
	const value = env.LC_ALL ?? env.LANG ?? '';
	return value.trim() === '' ? 'C' : value.trim();
};

/**
 * True when `path` crosses the Windows↔Linux filesystem boundary. Reads
 * are roughly an order of magnitude slower there than on native ext4, so
 * a command that is cheapest natively may not be cheapest here.
 */
export const isCrossOsMountPath = (
	pathValue: string,
	prefixes: readonly string[],
): boolean =>
	prefixes.some(
		(prefix) => pathValue === prefix || pathValue.startsWith(`${prefix}/`),
	);

/**
 * Drive mounts to treat as cross-OS. Derived from the mount root rather
 * than enumerated, so an unusual drive letter is still recognised.
 */
export const crossOsMountPrefixesFor = (isWsl: boolean): readonly string[] => {
	if (!isWsl) return [];
	return 'abcdefghijklmnopqrstuvwxyz'
		.split('')
		.map((drive) => `${WSL_DRIVE_MOUNT_ROOT}${drive}`);
};

/** `fnm` is installed but `node` is not on PATH — this shell never ran `fnm env`. */
export const needsFnmEnv = (
	tools: Readonly<Record<IKnownCommand, IToolPresence>>,
): boolean => tools.fnm.available && !tools.node.available;

/** Resolve one binary on PATH. Never throws, never inherits a shell profile. */
const resolveCommand = (bin: string): Promise<IToolPresence> =>
	new Promise((resolve) => {
		const done = (error: unknown, stdout: string): void => {
			const first = stdout.trim().split('\n')[0]?.trim() ?? '';
			resolve(
				error === null && first !== ''
					? { available: true, path: first }
					: { available: false },
			);
		};
		if (process.platform === 'win32') {
			execFile('where', [bin], { timeout: 3000 }, (error, stdout) =>
				done(error, stdout),
			);
			return;
		}
		execFile(
			'/bin/bash',
			['--noprofile', '--norc', '-c', 'command -v "$1"', 'probe', bin],
			{ timeout: 3000 },
			(error, stdout) => done(error, stdout),
		);
	});

/** Read `locale -a`. An absent `locale` binary yields '' — treated as "nothing generated". */
const readGeneratedLocales = (): Promise<string> =>
	new Promise((resolve) => {
		if (process.platform === 'win32') {
			resolve('');
			return;
		}
		execFile('locale', ['-a'], { timeout: 3000 }, (error, stdout) =>
			resolve(error === null ? stdout : ''),
		);
	});

const readProcVersion = (): string | undefined => {
	try {
		return readFileSync('/proc/version', 'utf8');
	} catch {
		return undefined;
	}
};

let cachedProfile: ISystemProfile | null = null;

/**
 * The one function in this slice that touches the machine. Probes every
 * known command concurrently, reads `/proc/version` and `locale -a`, and
 * caches the result — a second call in the same process is free.
 *
 * Pass `{ refresh: true }` only when the environment can genuinely have
 * changed underneath (a test, or after a shell re-init).
 */
export const detectSystemProfile = async (
	options: { readonly refresh?: boolean } = {},
): Promise<ISystemProfile> => {
	if (cachedProfile !== null && options.refresh !== true)
		return cachedProfile;
	const [presences, localeList] = await Promise.all([
		Promise.all(PROBED_COMMANDS.map((bin) => resolveCommand(bin))),
		readGeneratedLocales(),
	]);
	const tools = Object.fromEntries(
		PROBED_COMMANDS.map((bin, index) => [bin, presences[index]]),
	) as Record<IKnownCommand, IToolPresence>;
	const platformId = platform();
	const isWsl = isWslEnvironment({
		platformId,
		env: process.env,
		procVersion: readProcVersion(),
	});
	cachedProfile = {
		os: classifyOsFamily(platformId),
		isWsl,
		cpuCount: Math.max(1, cpus().length),
		totalMemoryBytes: totalmem(),
		tools,
		nodeNeedsFnmEnv: needsFnmEnv(tools),
		locale: parseLocaleStatus(requestedLocale(process.env), localeList),
		crossOsMountPrefixes: crossOsMountPrefixesFor(isWsl),
		detectedAt: new Date().toISOString(),
	};
	return cachedProfile;
};

/** Drop the cached profile. For tests and for a deliberate re-detect. */
export const clearSystemProfileCache = (): void => {
	cachedProfile = null;
};
