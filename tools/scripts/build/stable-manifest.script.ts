#!/usr/bin/env bun
/**
 * stable-manifest.script.ts — f00152 S2 (L4 — stable facade manifest).
 *
 * Pure CLI wrapper around `buildStableManifest`. Reads the package
 * version from `packages/core/package.json`, builds the manifest,
 * and writes it to `docs/mcp-vertex/api/stable.json`.
 *
 * SOLID notes:
 *   - **SRP**: this file does I/O only. The manifest shape lives in
 *     `packages/core/src/lib/api/stable-manifest.ts` and is the
 *     single source of truth.
 *   - **DIP**: imports the pure builder from `@mcp-vertex/core` so
 *     tests run against the same code path.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
	buildStableManifest,
	STABLE_API_TOOLS,
	STABLE_MANIFEST_REL,
} from '@mcp-vertex/core/public';

import { registerStableToolContributions } from '../lib/register-stable-tool-contributions';

const REPO_ROOT = process.cwd();
const SEMVER_RE =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

type TStableManifest = ReturnType<typeof buildStableManifest>;

const isJsonSchemaObject = (value: unknown): boolean =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeManifest = (manifest: TStableManifest): string =>
	JSON.stringify({
		version: {
			schema: manifest.version.schema,
			packageVersion: manifest.version.packageVersion,
		},
		tools: manifest.tools,
	});

const isSortedByName = (manifest: TStableManifest): boolean =>
	manifest.tools.every(
		(tool, index, tools) =>
			index === 0 || tools[index - 1]!.name.localeCompare(tool.name) <= 0,
	);

const assertCanonicalManifest = (
	manifest: TStableManifest,
	packageVersion: string,
): void => {
	if (manifest.version.packageVersion !== packageVersion) {
		throw new Error(
			`stable-manifest: packageVersion ${manifest.version.packageVersion} does not match ${packageVersion}`,
		);
	}
	if (!isSortedByName(manifest)) {
		throw new Error('stable-manifest: tools are not sorted by name');
	}
	for (const tool of manifest.tools) {
		if (!SEMVER_RE.test(tool.sinceVersion)) {
			throw new Error(
				`stable-manifest: tool ${tool.name} has non-semver sinceVersion`,
			);
		}
		if (!isJsonSchemaObject(tool.inputSchema)) {
			throw new Error(
				`stable-manifest: tool ${tool.name} has a null or invalid inputSchema`,
			);
		}
		if (!isJsonSchemaObject(tool.outputSchema)) {
			throw new Error(
				`stable-manifest: tool ${tool.name} has a null or invalid outputSchema`,
			);
		}
	}
};

const readExistingManifest = (abs: string): TStableManifest | null => {
	if (!existsSync(abs)) return null;
	try {
		return JSON.parse(readFileSync(abs, 'utf8')) as TStableManifest;
	} catch {
		return null;
	}
};

const pickGeneratedAt = (
	existingManifest: TStableManifest | null,
	packageVersion: string,
): string => {
	if (
		existingManifest === null ||
		typeof existingManifest.version.generatedAt !== 'string'
	) {
		return new Date().toISOString();
	}
	const previousGeneratedAt = existingManifest.version.generatedAt;
	const fresh = buildStableManifest(
		STABLE_API_TOOLS,
		packageVersion,
		previousGeneratedAt,
	);
	return normalizeManifest(existingManifest) === normalizeManifest(fresh)
		? previousGeneratedAt
		: new Date().toISOString();
};

const runVerifier = (abs: string, previous: string): void => {
	const result = spawnSync(
		process.execPath,
		['tools/scripts/verify/stable-manifest.script.ts'],
		{
			cwd: REPO_ROOT,
			encoding: 'utf8',
		},
	);
	if (result.status === 0) {
		return;
	}
	if (previous.length > 0) {
		writeFileSync(abs, previous);
	}
	if (result.stdout) {
		process.stdout.write(result.stdout);
	}
	if (result.stderr) {
		process.stderr.write(result.stderr);
	}
	throw new Error('stable-manifest: generated manifest failed verification');
};

const readCorePackageVersion = (): string => {
	const pkg = JSON.parse(
		readFileSync(join(REPO_ROOT, 'packages/core/package.json'), 'utf8'),
	) as { version?: string };
	if (typeof pkg.version !== 'string') {
		throw new Error(
			'packages/core/package.json is missing a "version" field',
		);
	}
	return pkg.version;
};

const main = (): void => {
	registerStableToolContributions();
	const packageVersion = readCorePackageVersion();
	const abs = join(REPO_ROOT, STABLE_MANIFEST_REL);
	mkdirSync(dirname(abs), { recursive: true });
	const existed = existsSync(abs);
	const previous = existed ? readFileSync(abs, 'utf8') : '';
	const existingManifest = readExistingManifest(abs);
	const manifest = buildStableManifest(
		STABLE_API_TOOLS,
		packageVersion,
		pickGeneratedAt(existingManifest, packageVersion),
	);
	assertCanonicalManifest(manifest, packageVersion);
	const out = `${JSON.stringify(manifest, null, 2)}\n`;
	writeFileSync(abs, out);
	runVerifier(abs, previous);
	if (previous === out) {
		process.stdout.write(
			`stable-manifest: unchanged (${STABLE_MANIFEST_REL}, schema ${manifest.version.schema}, package ${packageVersion})\n`,
		);
	} else {
		process.stdout.write(
			`stable-manifest: regenerated (${STABLE_MANIFEST_REL}, schema ${manifest.version.schema}, package ${packageVersion})\n`,
		);
	}
};

if (import.meta.main) {
	main();
}
