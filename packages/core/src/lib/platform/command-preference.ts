/**
 * command-preference.ts — q00014 S1: given a purpose and an
 * `ISystemProfile`, the cheapest command that actually exists here.
 *
 * Pure by construction: no I/O, no `process`, no clock. The profile is
 * the only source of truth about the machine, and the one hard rule is
 * that a tool the profile marks absent can never appear in the result —
 * a recommendation that fails costs more than no recommendation at all.
 */
import type {
	ICommandPreference,
	ICommandPreferenceQuery,
	ICommandPurpose,
	IKnownCommand,
	ISystemProfile,
} from '../contracts/interfaces/system-profile.interface';
import { isCrossOsMountPath } from './system-profile';

/** One candidate in a purpose's preference chain, before availability filtering. */
interface ICandidate {
	/** Probed binary that must be available, or `null` for a POSIX baseline. */
	readonly requires: IKnownCommand | null;
	readonly command: string;
	readonly argv: readonly string[];
	readonly reason: string;
	/** False for last-resort baselines, so callers can suggest an install. */
	readonly optimal: boolean;
}

/** Below this, more workers just queue behind each other. */
const MIN_BYTES_PER_WORKER = 1024 * 1024 * 1024;

/** Beyond this, extra workers cost more in scheduling than they return. */
const MAX_WORKERS = 16;

/** Cross-OS I/O is bridge-bound, not CPU-bound; extra workers thrash the bridge. */
const CROSS_OS_MOUNT_WORKERS = 2;

/**
 * Safe worker count for this machine, and for this path in particular.
 *
 * Bounded by cores AND by memory (a 16-core box with 2 GiB cannot run 16
 * type-checkers), then clamped hard on a cross-OS mount where the
 * bottleneck is the filesystem bridge rather than the CPU.
 */
export const safeParallelism = (
	profile: ISystemProfile,
	options: { readonly crossOsMount?: boolean } = {},
): number => {
	const byMemory = Math.floor(
		profile.totalMemoryBytes / MIN_BYTES_PER_WORKER,
	);
	const base = Math.max(1, Math.min(profile.cpuCount, byMemory, MAX_WORKERS));
	if (options.crossOsMount === true) {
		return Math.min(base, CROSS_OS_MOUNT_WORKERS);
	}
	return base;
};

/**
 * Text search. `rg` when present; otherwise the POSIX baseline, which is
 * slower but is the one thing that is always there.
 */
const searchTextChain = (
	profile: ISystemProfile,
	parallelism: number,
): readonly ICandidate[] => [
	{
		requires: 'rg',
		command: 'rg',
		argv: ['--line-number', '--color=never', '--threads', `${parallelism}`],
		reason:
			'ripgrep is installed and skips ignored files, so it reads far ' +
			'less than a recursive grep.',
		optimal: true,
	},
	{
		requires: null,
		command: profile.os === 'windows' ? 'findstr' : 'grep',
		argv: profile.os === 'windows' ? ['/S', '/N'] : ['-rn'],
		reason:
			'ripgrep is not installed here; falling back to the POSIX ' +
			'baseline, which walks ignored directories too.',
		optimal: false,
	},
];

/**
 * File listing. `fd` wins natively, but on a cross-OS mount the cost is
 * the directory walk itself, and `git ls-files` answers from the index
 * with one read instead of stat-ing the tree through the bridge.
 */
const listFilesChain = (
	profile: ISystemProfile,
	crossOsMount: boolean,
): readonly ICandidate[] => {
	const fd: ICandidate = {
		requires: 'fd',
		command: 'fd',
		argv: ['--type', 'f'],
		reason: 'fd is installed and honours .gitignore while walking.',
		optimal: true,
	};
	const gitLsFiles: ICandidate = {
		requires: 'git',
		command: 'git',
		argv: ['ls-files'],
		reason: crossOsMount
			? 'This path crosses the Windows filesystem bridge, where the ' +
				'directory walk is the cost; git ls-files answers from the ' +
				'index instead of stat-ing the tree.'
			: 'fd is not installed; git ls-files reads the index and is ' +
				'still cheaper than a full walk.',
		optimal: true,
	};
	const baseline: ICandidate = {
		requires: null,
		command: profile.os === 'windows' ? 'dir' : 'find',
		argv: profile.os === 'windows' ? ['/S', '/B'] : ['.', '-type', 'f'],
		reason:
			'Neither fd nor git is available; falling back to a full ' +
			'directory walk.',
		optimal: false,
	};
	return crossOsMount
		? [gitLsFiles, fd, baseline]
		: [fd, gitLsFiles, baseline];
};

/**
 * Argv per package manager and purpose. A literal, not a lookup table
 * with a fallback: every purpose has a real answer for every manager, and
 * a missing one should be a type error rather than an empty argv.
 */
const PACKAGE_MANAGER_ARGV = {
	bun: {
		'run-tests': ['run', 'test'],
		typecheck: ['x', 'tsc', '--noEmit'],
		'install-deps': ['install'],
	},
	pnpm: {
		'run-tests': ['test'],
		typecheck: ['exec', 'tsc', '--noEmit'],
		'install-deps': ['install'],
	},
	npm: {
		'run-tests': ['test'],
		typecheck: ['exec', '--', 'tsc', '--noEmit'],
		'install-deps': ['install'],
	},
} as const;

/** Package-manager chain, shared by run-tests / typecheck / install-deps. */
const packageManagerChain = (
	purpose: Extract<
		ICommandPurpose,
		'run-tests' | 'typecheck' | 'install-deps'
	>,
): readonly ICandidate[] => [
	{
		requires: 'bun',
		command: 'bun',
		argv: PACKAGE_MANAGER_ARGV.bun[purpose],
		reason:
			'bun is installed and needs no version-manager shim, so it runs ' +
			'in any shell.',
		optimal: true,
	},
	{
		requires: 'pnpm',
		command: 'pnpm',
		argv: PACKAGE_MANAGER_ARGV.pnpm[purpose],
		reason: 'bun is absent; pnpm is the next cheapest runner here.',
		optimal: true,
	},
	{
		requires: 'npm',
		command: 'npm',
		argv: PACKAGE_MANAGER_ARGV.npm[purpose],
		reason: 'Only npm resolves here.',
		optimal: false,
	},
];

const chainFor = (
	purpose: ICommandPurpose,
	profile: ISystemProfile,
	parallelism: number,
	crossOsMount: boolean,
): readonly ICandidate[] => {
	if (purpose === 'search-text') return searchTextChain(profile, parallelism);
	if (purpose === 'list-files') return listFilesChain(profile, crossOsMount);
	return packageManagerChain(purpose);
};

const isAvailable = (candidate: ICandidate, profile: ISystemProfile): boolean =>
	candidate.requires === null ||
	profile.tools[candidate.requires].available === true;

const warningsFor = (
	candidate: ICandidate,
	profile: ISystemProfile,
	crossOsMount: boolean,
): readonly string[] => {
	const warnings: string[] = [];
	if (crossOsMount) {
		warnings.push(
			'This path is on a Windows drive mounted into WSL; I/O there is ' +
				'roughly an order of magnitude slower than a native path.',
		);
	}
	if (!profile.locale.usable) warnings.push(profile.locale.reason);
	if (
		profile.nodeNeedsFnmEnv &&
		(candidate.requires === 'npm' || candidate.requires === 'node')
	) {
		warnings.push(
			'node is managed by fnm and is not on PATH in this shell; run ' +
				'eval "$(fnm env)" first.',
		);
	}
	return warnings;
};

/**
 * The preferred command for one purpose on one machine.
 *
 * Returns `null` when nothing in the chain is available (e.g. `run-tests`
 * with no package manager at all) — the caller then knows to ask rather
 * than to run something that will fail.
 */
export const preferCommand = (
	query: ICommandPreferenceQuery,
	profile: ISystemProfile,
): ICommandPreference | null => {
	const crossOsMount =
		query.path !== undefined &&
		isCrossOsMountPath(query.path, profile.crossOsMountPrefixes);
	const parallelism = safeParallelism(profile, { crossOsMount });
	const candidate = chainFor(
		query.purpose,
		profile,
		parallelism,
		crossOsMount,
	).find((entry) => isAvailable(entry, profile));
	if (candidate === undefined) return null;
	return {
		purpose: query.purpose,
		command: candidate.command,
		argv: candidate.argv,
		reason: candidate.reason,
		optimal: candidate.optimal,
		parallelism,
		warnings: warningsFor(candidate, profile, crossOsMount),
	};
};
