#!/usr/bin/env bun
/**
 * core-version-pin.script.ts — f00152 S1 (L1 — version pin).
 *
 * Validates that `mcp-vertex.config.json#coreVersion` points at a real
 * published `@delendai/core` version. The root config may omit the field;
 * omission means `latest-published`, which resolves to the newest published
 * version the cache/registry reports.
 *
 * The registry result is cached at `.cache/mcp-vertex/registry-versions.json`
 * for 24h. `--offline` uses the cache only and fails when the cache is missing
 * or stale.
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@delendai/core/public';

import { readJsonOrNull } from '../../../plugins/proposals/src/lib/proposals/index-reader';
import { repoRoot } from '../lib/monorepo-paths';

export const PACKAGE_NAME = '@delendai/core';
export const CACHE_REL = '.cache/mcp-vertex/registry-versions.json';
export const CONFIG_REL = 'mcp-vertex.config.json';
export const SENTINEL_LATEST = 'latest-published';
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const SEMVER_RE =
	/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

export interface IRegistryCacheFile {
	readonly packageName: string;
	readonly versions: readonly string[];
	readonly fetchedAt: number;
}

export interface ICoreVersionPinOk {
	readonly ok: true;
	readonly pin: string;
	readonly resolvedVersion: string;
	readonly source: 'cache' | 'registry' | 'lockfile';
	readonly message: string;
	readonly latestCachedVersion: string;
}

export interface ICoreVersionPinFailure {
	readonly ok: false;
	readonly code:
		| 'offline-missing-cache'
		| 'offline-stale-cache'
		| 'registry-unavailable'
		| 'lockfile-missing-version'
		| 'unknown-version'
		| 'empty-version-list';
	readonly pin: string;
	readonly message: string;
	readonly cachePath: string;
	readonly latestCachedVersion?: string;
	readonly fetchedAt?: number;
	readonly cause?: string;
}

export type ICoreVersionPinResult = ICoreVersionPinOk | ICoreVersionPinFailure;

export interface ILoadPublishedVersionsResult {
	readonly ok: true;
	readonly source: 'cache' | 'registry' | 'lockfile';
	readonly versions: readonly string[];
	readonly fetchedAt: number;
	readonly cachePath: string;
	readonly latestCachedVersion: string;
}

export type ILoadPublishedVersionsFailure = Omit<
	ICoreVersionPinFailure,
	'code'
> & {
	readonly code:
		| 'offline-missing-cache'
		| 'offline-stale-cache'
		| 'registry-unavailable'
		| 'empty-version-list'
		| 'lockfile-missing-version';
};

interface ITextWriter {
	readonly write: (chunk: string) => unknown;
}

export interface IMainOptions {
	readonly argv?: readonly string[];
	readonly now?: number;
	readonly rootDir?: string;
	readonly runNpmView?: () => Promise<readonly string[]>;
	readonly stdout?: ITextWriter;
	readonly stderr?: ITextWriter;
}

const compareNumeric = (left: number, right: number): number =>
	left < right ? -1 : left > right ? 1 : 0;

const comparePrereleasePart = (left: string, right: string): number => {
	const leftNumeric = /^\d+$/.test(left);
	const rightNumeric = /^\d+$/.test(right);
	if (leftNumeric && rightNumeric) {
		return compareNumeric(Number(left), Number(right));
	}
	if (leftNumeric) return -1;
	if (rightNumeric) return 1;
	return left.localeCompare(right);
};

export const compareSemver = (left: string, right: string): number => {
	const leftMatch = SEMVER_RE.exec(left);
	const rightMatch = SEMVER_RE.exec(right);
	if (leftMatch === null || rightMatch === null) {
		return left.localeCompare(right);
	}
	for (const index of [1, 2, 3] as const) {
		const delta = compareNumeric(
			Number(leftMatch[index]),
			Number(rightMatch[index]),
		);
		if (delta !== 0) return delta;
	}
	const leftPre = leftMatch[4]?.split('.') ?? [];
	const rightPre = rightMatch[4]?.split('.') ?? [];
	if (leftPre.length === 0 && rightPre.length === 0) return 0;
	if (leftPre.length === 0) return 1;
	if (rightPre.length === 0) return -1;
	const maxParts = Math.max(leftPre.length, rightPre.length);
	for (let index = 0; index < maxParts; index += 1) {
		const leftPart = leftPre[index];
		const rightPart = rightPre[index];
		if (leftPart === undefined) return -1;
		if (rightPart === undefined) return 1;
		const delta = comparePrereleasePart(leftPart, rightPart);
		if (delta !== 0) return delta;
	}
	return 0;
};

export const sortPublishedVersions = (
	versions: readonly string[],
): readonly string[] =>
	[...versions].sort((left, right) => compareSemver(right, left));

export const isCacheFresh = (
	fetchedAt: number,
	now: number,
	ttlMs: number = CACHE_TTL_MS,
): boolean => now - fetchedAt <= ttlMs;

export const pickLatestPublishedVersion = (
	versions: readonly string[],
): string | null => sortPublishedVersions(versions)[0] ?? null;

export const validateCoreVersionPin = (
	pinValue: string | undefined,
	versions: readonly string[],
	meta: {
		readonly source: 'cache' | 'registry' | 'lockfile';
		readonly cachePath: string;
		readonly latestCachedVersion: string;
	},
): ICoreVersionPinResult => {
	const effectivePin = pinValue === undefined ? SENTINEL_LATEST : pinValue;
	const latestPublishedVersion = pickLatestPublishedVersion(versions);
	if (latestPublishedVersion === null) {
		return {
			ok: false,
			code: 'empty-version-list',
			pin: effectivePin,
			cachePath: meta.cachePath,
			message: `[core-version-pin] code: empty-version-list`,
		};
	}
	if (effectivePin === SENTINEL_LATEST) {
		return {
			ok: true,
			pin: effectivePin,
			resolvedVersion: latestPublishedVersion,
			source: meta.source,
			latestCachedVersion: meta.latestCachedVersion,
			message: `[core-version-pin] expected: ${latestPublishedVersion}, found in ${meta.source}: ${latestPublishedVersion}`,
		};
	}
	if (!versions.includes(effectivePin)) {
		return {
			ok: false,
			code: 'unknown-version',
			pin: effectivePin,
			cachePath: meta.cachePath,
			latestCachedVersion: meta.latestCachedVersion,
			message:
				`[core-version-pin] code: unknown-version\n` +
				`[core-version-pin] expected: one of published ${PACKAGE_NAME} versions\n` +
				`[core-version-pin] found: ${effectivePin}\n` +
				`[core-version-pin] latest published: ${latestPublishedVersion}`,
		};
	}
	return {
		ok: true,
		pin: effectivePin,
		resolvedVersion: effectivePin,
		source: meta.source,
		latestCachedVersion: meta.latestCachedVersion,
		message: `[core-version-pin] expected: ${effectivePin}, found in ${meta.source}: ${effectivePin}`,
	};
};

const normalizeCache = (
	parsed: Partial<IRegistryCacheFile> | null,
): IRegistryCacheFile | null => {
	if (parsed === null) return null;
	if (
		!Array.isArray(parsed.versions) ||
		typeof parsed.fetchedAt !== 'number'
	) {
		return null;
	}
	return {
		packageName:
			typeof parsed.packageName === 'string'
				? parsed.packageName
				: PACKAGE_NAME,
		versions: sortPublishedVersions(
			parsed.versions.filter(
				(value): value is string => typeof value === 'string',
			),
		),
		fetchedAt: parsed.fetchedAt,
	};
};

export const readRegistryCache = async (
	cachePath: string,
): Promise<IRegistryCacheFile | null> =>
	normalizeCache(
		await readJsonOrNull<Partial<IRegistryCacheFile>>(cachePath),
	);

export const writeRegistryCache = async (
	cachePath: string,
	versions: readonly string[],
	now: number,
): Promise<IRegistryCacheFile> => {
	const payload: IRegistryCacheFile = {
		packageName: PACKAGE_NAME,
		versions: sortPublishedVersions(versions),
		fetchedAt: now,
	};
	await mkdir(dirname(cachePath), { recursive: true });
	await withFileMutex(cachePath, async () => {
		await writeFileAtomic(
			cachePath,
			`${JSON.stringify(payload, null, 2)}\n`,
		);
	});
	return payload;
};

export const readLockfileVersions = async (
	rootDir: string,
): Promise<readonly string[]> => {
	const lockfilePath = join(rootDir, 'bun.lock');
	const raw = await readFile(lockfilePath, 'utf8').catch(() => null);
	if (raw === null) return [];
	const versions = new Set<string>();
	const pattern = /"@delendai\/core"\s*:\s*"([^"]+)"/g;
	for (const match of raw.matchAll(pattern)) {
		const spec = match[1]?.trim();
		if (spec === undefined || spec.length === 0) continue;
		const semver = spec.match(
			/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?/,
		);
		if (semver?.[0] !== undefined) versions.add(semver[0]);
	}
	return sortPublishedVersions([...versions]);
};

export const runNpmViewVersions = async (): Promise<readonly string[]> =>
	new Promise((resolve, reject) => {
		const child = spawn(
			'npm',
			['view', PACKAGE_NAME, 'versions', '--json'],
			{
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on('data', (chunk) => {
			stderr += String(chunk);
		});
		child.on('error', (error) => {
			reject(error);
		});
		child.on('close', (code) => {
			if (code !== 0) {
				reject(
					new Error(
						stderr.trim() || `npm view exited ${String(code)}`,
					),
				);
				return;
			}
			try {
				const parsed = JSON.parse(stdout) as string | string[];
				const versions = Array.isArray(parsed) ? parsed : [parsed];
				resolve(sortPublishedVersions(versions));
			} catch (error) {
				reject(error);
			}
		});
	});

export const loadPublishedVersions = async (options: {
	readonly rootDir: string;
	readonly offline: boolean;
	readonly now: number;
	readonly runNpmView: () => Promise<readonly string[]>;
}): Promise<ILoadPublishedVersionsResult | ILoadPublishedVersionsFailure> => {
	const cachePath = join(options.rootDir, CACHE_REL);
	const cached = await readRegistryCache(cachePath);
	if (options.offline) {
		if (cached === null) {
			return {
				ok: false,
				code: 'offline-missing-cache',
				pin: SENTINEL_LATEST,
				cachePath,
				message: `[core-version-pin] code: offline-missing-cache\n[core-version-pin] cache: ${CACHE_REL}`,
			};
		}
		if (!isCacheFresh(cached.fetchedAt, options.now)) {
			return {
				ok: false,
				code: 'offline-stale-cache',
				pin: SENTINEL_LATEST,
				cachePath,
				fetchedAt: cached.fetchedAt,
				latestCachedVersion:
					pickLatestPublishedVersion(cached.versions) ?? 'n/a',
				message:
					`[core-version-pin] code: offline-stale-cache\n` +
					`[core-version-pin] cache: ${CACHE_REL}\n` +
					`[core-version-pin] fetchedAt: ${new Date(cached.fetchedAt).toISOString()}`,
			};
		}
		return {
			ok: true,
			source: 'cache',
			versions: cached.versions,
			fetchedAt: cached.fetchedAt,
			cachePath,
			latestCachedVersion:
				pickLatestPublishedVersion(cached.versions) ?? 'n/a',
		};
	}
	if (cached !== null && isCacheFresh(cached.fetchedAt, options.now)) {
		return {
			ok: true,
			source: 'cache',
			versions: cached.versions,
			fetchedAt: cached.fetchedAt,
			cachePath,
			latestCachedVersion:
				pickLatestPublishedVersion(cached.versions) ?? 'n/a',
		};
	}
	try {
		const fetchedVersions = sortPublishedVersions(
			await options.runNpmView(),
		);
		if (fetchedVersions.length === 0) {
			return {
				ok: false,
				code: 'empty-version-list',
				pin: SENTINEL_LATEST,
				cachePath,
				message: `[core-version-pin] code: empty-version-list`,
			};
		}
		const written = await writeRegistryCache(
			cachePath,
			fetchedVersions,
			options.now,
		);
		return {
			ok: true,
			source: 'registry',
			versions: written.versions,
			fetchedAt: written.fetchedAt,
			cachePath,
			latestCachedVersion:
				pickLatestPublishedVersion(written.versions) ?? 'n/a',
		};
	} catch (error) {
		const lockfileVersions = await readLockfileVersions(options.rootDir);
		if (lockfileVersions.length > 0) {
			const written = await writeRegistryCache(
				cachePath,
				lockfileVersions,
				options.now,
			);
			return {
				ok: true,
				source: 'lockfile',
				versions: written.versions,
				fetchedAt: written.fetchedAt,
				cachePath,
				latestCachedVersion:
					pickLatestPublishedVersion(written.versions) ?? 'n/a',
			};
		}
		return {
			ok: false,
			code: 'registry-unavailable',
			pin: SENTINEL_LATEST,
			cachePath,
			latestCachedVersion:
				pickLatestPublishedVersion(cached?.versions ?? []) ?? 'n/a',
			...(cached === null ? {} : { fetchedAt: cached.fetchedAt }),
			cause: error instanceof Error ? error.message : String(error),
			message:
				`[core-version-pin] code: registry-unavailable\n` +
				`[core-version-pin] cache: ${CACHE_REL}\n` +
				`[core-version-pin] cause: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
};

export const readCoreVersionFromConfig = async (
	rootDir: string,
): Promise<string | undefined> => {
	const configPath = join(rootDir, CONFIG_REL);
	const parsed = await readJsonOrNull<{ coreVersion?: unknown }>(configPath);
	if (typeof parsed?.coreVersion === 'string') return parsed.coreVersion;
	return undefined;
};

export const parseFlags = (
	argv: readonly string[],
): { readonly offline: boolean } => {
	const args = argv.slice(2);
	let offline = false;
	for (const arg of args) {
		if (arg === '--offline') {
			offline = true;
			continue;
		}
		if (arg === '--help' || arg === '-h') {
			process.stdout.write(
				'Usage: bun tools/scripts/lint/core-version-pin.script.ts [--offline]\n',
			);
			process.exit(0);
		}
		process.stderr.write(`[core-version-pin] unknown flag: ${arg}\n`);
		process.exit(2);
	}
	return { offline };
};

export const main = async (options: IMainOptions = {}): Promise<number> => {
	const argv = options.argv ?? process.argv;
	const now = options.now ?? Date.now();
	const rootDir = options.rootDir ?? repoRoot();
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const flags = parseFlags(argv);
	const loaded = await loadPublishedVersions({
		rootDir,
		offline: flags.offline,
		now,
		runNpmView: options.runNpmView ?? runNpmViewVersions,
	});
	if (!loaded.ok) {
		stderr.write(`${loaded.message}\n`);
		return 1;
	}
	const pin = await readCoreVersionFromConfig(rootDir);
	const verdict = validateCoreVersionPin(pin, loaded.versions, {
		source: loaded.source,
		cachePath: loaded.cachePath,
		latestCachedVersion: loaded.latestCachedVersion,
	});
	if (!verdict.ok) {
		stderr.write(`${verdict.message}\n`);
		return 1;
	}
	stdout.write(`${verdict.message}\n`);
	return 0;
};

if (import.meta.main) {
	process.exit(await main());
}
