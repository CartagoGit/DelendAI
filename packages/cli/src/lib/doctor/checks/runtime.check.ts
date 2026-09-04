/**
 * doctor/checks/runtime.check.ts — f00191 / q00006 Track I.
 *
 * Verifies the active runtime is Bun and meets the minimum version
 * declared by `package.json#engines.bun`. The project is Bun-first
 * (see `packageManager: "bun@<x>"` + every test runner is Bun),
 * so running `delendai doctor` on plain Node is a guaranteed surprise.
 *
 * Reads the engines constraint from `package.json` rather than
 * hard-coding it: when the floor moves in `package.json`, this check
 * moves with it without a code change.
 */
import type { DoctorCheck } from '../types';

export interface IBunVersion {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
}

export const parseBunVersion = (raw: string): IBunVersion | undefined => {
	const match = raw.match(/^(\d+)\.(\d+)\.(\d+)/u);
	if (match === null) return undefined;
	const [, major, minor, patch] = match;
	if (major === undefined || minor === undefined || patch === undefined) {
		return undefined;
	}
	return {
		major: Number(major),
		minor: Number(minor),
		patch: Number(patch),
	};
};

export const readEnginesBun = (
	pkg: unknown,
): { readonly raw: string; readonly floor: IBunVersion } | undefined => {
	if (typeof pkg !== 'object' || pkg === null) return undefined;
	const engines = (pkg as { engines?: unknown }).engines;
	if (typeof engines !== 'object' || engines === null) return undefined;
	const bun = (engines as { bun?: unknown }).bun;
	if (typeof bun !== 'string') return undefined;
	const stripped = bun.replace(/^>=\s*/u, '');
	const parsed = parseBunVersion(stripped);
	if (parsed === undefined) return undefined;
	return { raw: bun, floor: parsed };
};

/** Read the active Bun runtime version (or empty when not on Bun). */
export const activeBunVersion = (
	readVersion: () => string | undefined,
): IBunVersion | undefined => {
	const raw = readVersion();
	if (raw === undefined || raw.length === 0) return undefined;
	return parseBunVersion(raw);
};

/**
 * `>=1.1.0` means major.minor.patch where each component must be at
 * least the floor. This is a deliberately tiny semver comparison —
 * the engines field uses `>=x.y.z` literals, no `^`/`~`/ranges.
 */
export const bunMeetsFloor = (
	active: IBunVersion,
	floor: IBunVersion,
): boolean => {
	if (active.major !== floor.major) return active.major > floor.major;
	if (active.minor !== floor.minor) return active.minor > floor.minor;
	return active.patch >= floor.patch;
};

export const checkRuntime: DoctorCheck = async ({ fs }) => {
	const pkgRaw = await fs.readFile('package.json');
	const pkg: unknown = pkgRaw === undefined ? undefined : JSON.parse(pkgRaw);
	const engines = readEnginesBun(pkg);
	if (engines === undefined) {
		return {
			name: 'runtime',
			status: 'warn',
			findings: ['package.json has no engines.bun — cannot verify floor'],
		};
	}
	const active = activeBunVersion(() => {
		const bun = (globalThis as { Bun?: { version?: string } }).Bun;
		return bun?.version;
	});
	if (active === undefined) {
		return {
			name: 'runtime',
			status: 'error',
			findings: [
				'active runtime is not Bun',
				`package.json requires ${engines.raw}`,
			],
		};
	}
	if (!bunMeetsFloor(active, engines.floor)) {
		return {
			name: 'runtime',
			status: 'error',
			findings: [
				`Bun ${active.major}.${active.minor}.${active.patch} is below floor ${engines.raw}`,
			],
		};
	}
	return {
		name: 'runtime',
		status: 'ok',
		findings: [
			`Bun ${active.major}.${active.minor}.${active.patch} (>= ${engines.floor.major}.${engines.floor.minor}.${engines.floor.patch})`,
		],
	};
};
