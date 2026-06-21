#!/usr/bin/env bun
/**
 * package.script.ts — package the VS Code extension into
 * `dist/apps/vscode/<version>/mcp-vertex-vscode-<version>.vsix`.
 *
 * Reads the version from this app's own `package.json` (single source of
 * truth), runs `vsce package` with the right `--out` flag, and bails out
 * if the version dir does not match the version baked into the package
 * manifest. This is the same logic every future `apps/[name]/package`
 * script should follow — derive the version and the output path from
 * the monorepo-paths module, never from hard-coded strings.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	distVersionDir,
	readJSON,
} from '../../../tools/scripts/lib/monorepo-paths.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..', 'package.json');

const manifest = (await readJSON(PKG)) as { name: string; version: string };
if (!manifest.version) {
	console.error(`x no "version" in ${PKG}`);
	process.exit(1);
}

const outDir = distVersionDir('apps', 'vscode', manifest.version);
mkdirSync(outDir, { recursive: true });

console.log(`• packaging ${manifest.name}@${manifest.version}`);
console.log(`  → ${outDir}`);

const r = spawnSync(
	'vsce',
	['package', '--no-dependencies', '--no-git-tag-version', '--out', outDir],
	{
		cwd: join(HERE, '..'),
		stdio: 'inherit',
	},
);

if (r.status !== 0) {
	console.error(`\n✗ vsce package failed (exit ${r.status ?? '?'})`);
	process.exit(r.status ?? 1);
}

const expectedVsix = join(outDir, `${manifest.name}-${manifest.version}.vsix`);
if (!existsSync(expectedVsix)) {
	console.error(
		`✗ vsce reported success but ${expectedVsix} was not produced. ` +
			`Check the vsce log above.`,
	);
	process.exit(1);
}

console.log(`✓ wrote ${expectedVsix}`);
