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
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
	buildStableManifest,
	STABLE_API_TOOLS,
	STABLE_MANIFEST_REL,
} from '@mcp-vertex/core/public';

const REPO_ROOT = process.cwd();

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
	const packageVersion = readCorePackageVersion();
	const manifest = buildStableManifest(STABLE_API_TOOLS, packageVersion);
	const out = `${JSON.stringify(manifest, null, 2)}\n`;
	const abs = join(REPO_ROOT, STABLE_MANIFEST_REL);
	mkdirSync(dirname(abs), { recursive: true });
	const existed = existsSync(abs);
	const previous = existed ? readFileSync(abs, 'utf8') : '';
	writeFileSync(abs, out);
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
