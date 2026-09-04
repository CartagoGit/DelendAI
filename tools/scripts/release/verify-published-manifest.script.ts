#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIRST_PARTY_PLUGIN_INDEX } from '@delendai/core/public';

import { PUBLISH_ORDER } from './release-plan';

const DEFAULT_ROOT = resolve(
	fileURLToPath(new URL('../../..', import.meta.url)),
);
const SEMVER_RE =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const SRC_PATH_RE = /^(?:\.\/)?src\//;

export interface IPackageJsonShape {
	readonly name?: unknown;
	readonly version?: unknown;
	readonly main?: unknown;
	readonly module?: unknown;
	readonly types?: unknown;
	readonly exports?: unknown;
	readonly files?: unknown;
	readonly bin?: unknown;
}

export interface IRegistryEntryLike {
	readonly id: string;
	readonly package: string;
	readonly summary: string;
	readonly permissions?: readonly string[];
}

export interface ISourceManifestLike {
	readonly id?: unknown;
	readonly package?: unknown;
	readonly version?: unknown;
	readonly permissions?: unknown;
}

export interface IPackDryRunFile {
	readonly path: string;
}

export interface IVerifyPackageInput {
	readonly root: string;
	readonly pkgDir: string;
	readonly packageJson: IPackageJsonShape;
	readonly registryEntries: readonly IRegistryEntryLike[];
	readonly sourceManifest?: ISourceManifestLike;
	readonly packedFiles?: readonly IPackDryRunFile[];
}

export interface IVerifyPackageResult {
	readonly pkgDir: string;
	readonly packageName: string;
	readonly ok: boolean;
	readonly reasons: readonly string[];
	readonly checks: {
		readonly packageJson: boolean;
		readonly registry: boolean;
		readonly sourceManifest: boolean;
		readonly packDryRun: boolean | 'skipped';
	};
}

export interface IVerifyPublishedManifestOptions {
	readonly root?: string;
	readonly full?: boolean;
}

export interface IVerifyPublishedManifestRun {
	readonly root: string;
	readonly full: boolean;
	readonly results: readonly IVerifyPackageResult[];
	readonly ok: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const readJson = <T>(path: string): T =>
	JSON.parse(readFileSync(path, 'utf8')) as T;

const normalizeRelativePath = (value: string): string =>
	normalize(value).replace(/^\.\//, '').replace(/\\/g, '/');

const collectExportTargets = (exportsField: unknown): string[] => {
	if (typeof exportsField === 'string') {
		return [exportsField];
	}
	if (Array.isArray(exportsField)) {
		return exportsField.flatMap((entry) => collectExportTargets(entry));
	}
	if (!isRecord(exportsField)) {
		return [];
	}
	return Object.values(exportsField).flatMap((entry) =>
		collectExportTargets(entry),
	);
};

const packageSlugFromName = (packageName: string): string => {
	if (packageName === 'delendai') {
		return 'delendai';
	}
	return packageName.replace(/^@delendai\//, '');
};

const packageNameLooksValid = (packageName: string): boolean =>
	packageName === 'delendai' || packageName.startsWith('@delendai/');

const filesList = (filesField: unknown): string[] =>
	Array.isArray(filesField)
		? filesField.filter(
				(value): value is string => typeof value === 'string',
			)
		: [];

const isPathCoveredByFiles = (
	pathValue: string,
	filesField: unknown,
): boolean => {
	const normalizedPath = normalizeRelativePath(pathValue);
	const files = filesList(filesField).map(normalizeRelativePath);
	if (files.length === 0) {
		return true;
	}
	return files.some((entry) => {
		if (normalizedPath === entry) {
			return true;
		}
		return normalizedPath.startsWith(`${entry}/`);
	});
};

const shouldExistAfterBuild = (
	pathValue: string,
	filesField: unknown,
): boolean => {
	const normalizedPath = normalizeRelativePath(pathValue);
	if (!normalizedPath.startsWith('dist/')) {
		return false;
	}
	return isPathCoveredByFiles(normalizedPath, filesField);
};

const resolveDeclaredTargets = (
	packageJson: IPackageJsonShape,
): readonly string[] => {
	const targets = new Set<string>();
	for (const field of [
		packageJson.main,
		packageJson.module,
		packageJson.types,
	]) {
		if (typeof field === 'string' && field.trim().length > 0) {
			targets.add(field);
		}
	}
	for (const value of collectExportTargets(packageJson.exports)) {
		if (value.trim().length > 0) {
			targets.add(value);
		}
	}
	if (isRecord(packageJson.bin)) {
		for (const value of Object.values(packageJson.bin)) {
			if (typeof value === 'string' && value.trim().length > 0) {
				targets.add(value);
			}
		}
	}
	return [...targets];
};

const findRegistryEntry = (
	packageName: string,
	pkgDir: string,
	registryEntries: readonly IRegistryEntryLike[],
): IRegistryEntryLike | undefined => {
	const slug = packageSlugFromName(packageName);
	const dirSlug = basename(pkgDir);
	return registryEntries.find(
		(entry) =>
			entry.package === packageName ||
			entry.id === slug ||
			entry.id === dirSlug,
	);
};

const packContainsAnySourceFiles = (
	packedFiles: readonly IPackDryRunFile[],
): boolean =>
	packedFiles.some((file) =>
		SRC_PATH_RE.test(normalizeRelativePath(file.path)),
	);

export const parsePackDryRunJson = (
	stdout: string,
): readonly IPackDryRunFile[] => {
	const trimmed = stdout.trim();
	if (trimmed.length === 0) {
		throw new Error('npm pack --dry-run returned empty output');
	}
	const parsed = JSON.parse(trimmed) as unknown;
	const rows = Array.isArray(parsed) ? parsed : [parsed];
	const filePaths: IPackDryRunFile[] = [];
	for (const row of rows) {
		if (!isRecord(row) || !Array.isArray(row.files)) {
			continue;
		}
		for (const file of row.files) {
			if (isRecord(file) && typeof file.path === 'string') {
				filePaths.push({ path: file.path });
			}
		}
	}
	if (filePaths.length === 0) {
		throw new Error('npm pack --dry-run did not report any packaged files');
	}
	return filePaths;
};

export const runPackDryRun = (
	root: string,
	pkgDir: string,
): readonly IPackDryRunFile[] => {
	const cwd = join(root, pkgDir);
	const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	if (result.status !== 0) {
		throw new Error(
			`npm pack --dry-run failed for ${pkgDir}: ${(result.stderr || result.stdout || '').trim()}`,
		);
	}
	return parsePackDryRunJson(result.stdout);
};

export const loadSourceManifest = async (
	root: string,
	pkgDir: string,
): Promise<ISourceManifestLike | undefined> => {
	const manifestPath = join(root, pkgDir, 'plugin.manifest.ts');
	if (!existsSync(manifestPath)) {
		return undefined;
	}
	const imported = (await import(manifestPath)) as { default?: unknown };
	if (imported.default === undefined || !isRecord(imported.default)) {
		throw new Error(
			`${relative(root, manifestPath)} does not export a manifest object`,
		);
	}
	return imported.default as ISourceManifestLike;
};

export const readVerifyPackageInput = async (
	root: string,
	pkgDir: string,
	options: { readonly full?: boolean } = {},
): Promise<IVerifyPackageInput> => {
	const packageJson = readJson<IPackageJsonShape>(
		join(root, pkgDir, 'package.json'),
	);
	const sourceManifest = await loadSourceManifest(root, pkgDir);
	const packedFiles = options.full ? runPackDryRun(root, pkgDir) : undefined;
	return {
		root,
		pkgDir,
		packageJson,
		registryEntries: FIRST_PARTY_PLUGIN_INDEX.entries.map((entry) => ({
			id: entry.id,
			package: entry.package,
			summary: entry.summary,
			...(entry.permissions === undefined
				? {}
				: {
						permissions: entry.permissions.map((permission) =>
							String(permission),
						),
					}),
		})),
		...(sourceManifest !== undefined ? { sourceManifest } : {}),
		...(packedFiles !== undefined ? { packedFiles } : {}),
	};
};

export const verifyPackage = (
	input: IVerifyPackageInput,
): IVerifyPackageResult => {
	const reasons: string[] = [];
	const packageName =
		typeof input.packageJson.name === 'string'
			? input.packageJson.name
			: '<missing-name>';

	if (!packageNameLooksValid(packageName)) {
		reasons.push(
			`package name must be @delendai/* or delendai, got "${packageName}"`,
		);
	}
	const version =
		typeof input.packageJson.version === 'string'
			? input.packageJson.version
			: '';
	if (!SEMVER_RE.test(version)) {
		reasons.push(
			`package version is not valid semver: "${String(input.packageJson.version ?? '')}"`,
		);
	}

	const declaredTargets = resolveDeclaredTargets(input.packageJson);
	for (const target of declaredTargets) {
		const normalizedTarget = normalizeRelativePath(target);
		if (normalizedTarget.includes('*')) {
			continue;
		}
		const absoluteTarget = join(input.root, input.pkgDir, normalizedTarget);
		if (existsSync(absoluteTarget)) {
			continue;
		}
		if (shouldExistAfterBuild(normalizedTarget, input.packageJson.files)) {
			continue;
		}
		reasons.push(
			`declared path "${target}" is missing and is not covered by a buildable dist/ entry`,
		);
	}

	const registryEntry = findRegistryEntry(
		packageName,
		input.pkgDir,
		input.registryEntries,
	);
	if (registryEntry !== undefined) {
		if (registryEntry.package !== packageName) {
			reasons.push(
				`registry entry package mismatch: registry="${registryEntry.package}" package.json="${packageName}"`,
			);
		}
		if (registryEntry.summary.trim().length === 0) {
			reasons.push(
				`registry entry for ${packageName} is missing summary`,
			);
		}
	}

	if (input.sourceManifest !== undefined) {
		if (
			typeof input.sourceManifest.id !== 'string' ||
			input.sourceManifest.id.trim().length === 0
		) {
			reasons.push('plugin.manifest.ts is missing id');
		}
		if (input.sourceManifest.package !== packageName) {
			reasons.push(
				`plugin.manifest.ts package mismatch: manifest="${String(input.sourceManifest.package ?? '')}" package.json="${packageName}"`,
			);
		}
		if (input.sourceManifest.version !== version) {
			reasons.push(
				`plugin.manifest.ts version mismatch: manifest="${String(input.sourceManifest.version ?? '')}" package.json="${version}"`,
			);
		}
		if (
			!Array.isArray(input.sourceManifest.permissions) ||
			input.sourceManifest.permissions.length === 0
		) {
			reasons.push('plugin.manifest.ts must declare permissions');
		}
	}

	if (input.packedFiles !== undefined) {
		const packedPaths = new Set(
			input.packedFiles.map((file) => normalizeRelativePath(file.path)),
		);
		const mainPath =
			typeof input.packageJson.main === 'string'
				? normalizeRelativePath(input.packageJson.main)
				: undefined;
		if (mainPath !== undefined && !packedPaths.has(mainPath)) {
			reasons.push(
				`npm pack --dry-run does not include declared main: "${input.packageJson.main}"`,
			);
		}
		if (
			!isPathCoveredByFiles('src/index.ts', input.packageJson.files) &&
			packContainsAnySourceFiles(input.packedFiles)
		) {
			reasons.push(
				'npm pack --dry-run includes src/** although package.files does not include src',
			);
		}
	}

	const packageJsonOk = !reasons.some(
		(reason) =>
			reason.includes('package name') ||
			reason.includes('version') ||
			reason.includes('declared path'),
	);
	const registryOk = !reasons.some((reason) =>
		reason.includes('registry entry'),
	);
	const sourceManifestOk = !reasons.some((reason) =>
		reason.includes('plugin.manifest.ts'),
	);
	const packDryRunOk =
		input.packedFiles === undefined
			? 'skipped'
			: !reasons.some(
					(reason) =>
						reason.includes('npm pack --dry-run') ||
						reason.includes('src/**'),
				);

	return {
		pkgDir: input.pkgDir,
		packageName,
		ok: reasons.length === 0,
		reasons,
		checks: {
			packageJson: packageJsonOk,
			registry: registryOk,
			sourceManifest: sourceManifestOk,
			packDryRun: packDryRunOk,
		},
	};
};

export const verifyPublishedManifest = async (
	options: IVerifyPublishedManifestOptions = {},
): Promise<IVerifyPublishedManifestRun> => {
	const root = resolve(options.root ?? DEFAULT_ROOT);
	const full = options.full ?? false;
	const results: IVerifyPackageResult[] = [];
	for (const pkgDir of PUBLISH_ORDER) {
		const input = await readVerifyPackageInput(root, pkgDir, { full });
		results.push(verifyPackage(input));
	}
	return {
		root,
		full,
		results,
		ok: results.every((result) => result.ok),
	};
};

export const formatVerifyPublishedManifestReport = (
	run: IVerifyPublishedManifestRun,
): string => {
	const header = `verify-published-manifest${run.full ? ' --full' : ''} (${run.root})`;
	const lines = [header];
	for (const result of run.results) {
		const status = result.ok ? 'ok' : 'fail';
		const reason = result.ok ? 'verified' : result.reasons.join('; ');
		lines.push(`${status.padEnd(4)} ${result.pkgDir.padEnd(34)} ${reason}`);
	}
	lines.push(
		run.ok
			? `✓ published manifest verification passed for ${run.results.length} packages`
			: `✖ published manifest verification failed for ${run.results.filter((result) => !result.ok).length} package(s)`,
	);
	return lines.join('\n');
};

export const parseArgs = (
	argv: readonly string[],
): IVerifyPublishedManifestOptions => {
	let root: string | undefined;
	let full = false;
	for (const arg of argv) {
		if (arg.startsWith('--root=')) {
			root = arg.slice('--root='.length);
		} else if (arg === '--full') {
			full = true;
		} else {
			throw new Error(`unknown flag: ${arg}`);
		}
	}
	return { ...(root !== undefined ? { root } : {}), full };
};

const main = async (): Promise<number> => {
	try {
		const run = await verifyPublishedManifest(
			parseArgs(process.argv.slice(2)),
		);
		const stream = run.ok ? process.stdout : process.stderr;
		stream.write(`${formatVerifyPublishedManifestReport(run)}\n`);
		return run.ok ? 0 : 1;
	} catch (error: unknown) {
		process.stderr.write(
			`✖ verify-published-manifest failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
		);
		return 1;
	}
};

if (import.meta.main) {
	main().then((code) => process.exit(code));
}
