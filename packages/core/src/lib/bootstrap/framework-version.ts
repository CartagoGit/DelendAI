// framework-version.ts — resolve the INSTALLED version of a
// framework dependency, not just its id.
//
// `matchFramework` (framework-rules.ts) says "this project is Angular".
// This module says "Angular 17.3.2, read from bun.lock" — or reports
// `unresolved` when nothing safely answers that. A rule keyed to the
// wrong version is worse than no rule, so this never guesses from a
// manifest range alone.
//
// Pure: every function here takes already-read text and returns data.
// No fs, no subprocess, no network. The lockfile kinds mirror the ones
// `detect-stack-defaults.helper.ts` already lists
// (`listPackageManagerLockfiles`).

import { parseJsonc } from '../config/jsonc-document';
import type {
	ILockfileKind,
	ILockfileRef,
	IResolvedFrameworkVersion,
} from '../contracts/interfaces/framework-version.interface';

const EXACT_VERSION_PATTERN =
	/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

/** A manifest range that is itself a single pinned version, not a range. */
export const isExactVersion = (range: string): boolean =>
	EXACT_VERSION_PATTERN.test(range.trim());

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

interface IBunLockPackages {
	readonly packages?: Readonly<Record<string, readonly unknown[]>>;
}

/** bun.lock: `"packages": { "<dep>": ["<dep>@<version>", ...] }`. */
const extractFromBunLock = (
	text: string,
	depName: string,
): string | undefined => {
	const { value } = parseJsonc(text);
	const packages = (value as IBunLockPackages | undefined)?.packages;
	const entry = packages?.[depName];
	const spec = entry?.[0];
	if (typeof spec !== 'string') return undefined;
	const prefix = `${depName}@`;
	return spec.startsWith(prefix) ? spec.slice(prefix.length) : undefined;
};

interface INpmLockPackages {
	readonly packages?: Readonly<Record<string, { version?: string }>>;
	readonly dependencies?: Readonly<Record<string, { version?: string }>>;
}

/**
 * package-lock.json: lockfile v2/v3 keys packages by
 * `node_modules/<dep>`; v1 keys `dependencies` by `<dep>` directly.
 */
const extractFromNpmLock = (
	text: string,
	depName: string,
): string | undefined => {
	const { value } = parseJsonc(text);
	const lock = value as INpmLockPackages | undefined;
	const fromPackages = lock?.packages?.[`node_modules/${depName}`]?.version;
	if (fromPackages !== undefined) return fromPackages;
	return lock?.dependencies?.[depName]?.version;
};

/**
 * yarn.lock: entries are blank-line-separated blocks whose header line
 * names the dep (possibly several comma-joined specifiers) and whose
 * body has a `version "x.y.z"` line.
 */
const extractFromYarnLock = (
	text: string,
	depName: string,
): string | undefined => {
	const header = new RegExp(`(^|,\\s*)"?${escapeRegExp(depName)}@`, 'u');
	const blocks = text.split(/\n{2,}/u);
	const block = blocks.find((candidate) => {
		const firstLine = candidate.split('\n', 1)[0] ?? '';
		return header.test(firstLine);
	});
	if (block === undefined) return undefined;
	const versionMatch = /^\s*version:?\s+"?([^"\s]+)"?/mu.exec(block);
	return versionMatch?.[1];
};

/**
 * pnpm-lock.yaml: the `packages:` section keys entries as
 * `[/]<dep>@<version>[(<peer>@<peerVersion>)]:`.
 */
const extractFromPnpmLock = (
	text: string,
	depName: string,
): string | undefined => {
	const pattern = new RegExp(
		`^\\s*/?${escapeRegExp(depName)}@([^:\\s(]+)`,
		'mu',
	);
	return pattern.exec(text)?.[1];
};

const LOCKFILE_EXTRACTORS: Readonly<
	Record<ILockfileKind, (text: string, depName: string) => string | undefined>
> = {
	'bun.lock': extractFromBunLock,
	'package-lock.json': extractFromNpmLock,
	'yarn.lock': extractFromYarnLock,
	'pnpm-lock.yaml': extractFromPnpmLock,
};

/** Dispatch to the parser matching the lockfile's own format. */
export const extractLockfileVersion = (
	lockfile: ILockfileRef,
	depName: string,
): string | undefined =>
	LOCKFILE_EXTRACTORS[lockfile.kind](lockfile.text, depName);

/**
 * Resolve the installed version of `depName`.
 *
 * Order: the lockfile's resolved entry first; an exact-pinned manifest
 * range second (that IS a resolved version, just spelled in the
 * manifest); anything else — a real range with no lockfile answer, or
 * no manifest entry at all — is `unresolved`.
 */
export const resolveFrameworkVersion = (
	depName: string,
	manifestRange: string | undefined,
	lockfile: ILockfileRef | undefined,
): IResolvedFrameworkVersion => {
	const fromLockfile =
		lockfile === undefined
			? undefined
			: extractLockfileVersion(lockfile, depName);
	if (fromLockfile !== undefined) {
		return {
			depName,
			version: fromLockfile,
			range: manifestRange,
			source: 'lockfile',
		};
	}
	if (manifestRange !== undefined && isExactVersion(manifestRange)) {
		return {
			depName,
			version: manifestRange,
			range: manifestRange,
			source: 'manifest',
		};
	}
	return {
		depName,
		version: undefined,
		range: manifestRange,
		source: 'unresolved',
	};
};
