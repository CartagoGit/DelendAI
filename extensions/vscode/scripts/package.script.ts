#!/usr/bin/env bun
/**
 * package.script.ts — package the VS Code extension into
 * `build/extensions/vscode/<version>/<name>.vsix`.
 *
 * Reads the version from this extension's own `package.json` (single
 * source of truth), runs `vsce package` with the right `--out` flag,
 * and bails out if the version dir does not match the version baked
 * into the package manifest. This is the same logic every future
 * `extensions/[host]/package` script should follow — derive the
 * version and the output path from the monorepo-paths module, never
 * from hard-coded strings.
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	buildVersionDir,
	readJSON,
	WELL_KNOWN,
} from '../../../tools/scripts/lib/monorepo-paths.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..', 'package.json');
const EXTENSION_ROOT = join(HERE, '..');

const manifest = (await readJSON(PKG)) as { name: string; version: string };
if (!manifest.version) {
	console.error(`x no "version" in ${PKG}`);
	process.exit(1);
}

const buildRoot = buildVersionDir('extensions', 'vscode', manifest.version);
const stagingDir = join(
	buildVersionDir('extensions', 'vscode', 'staging'),
	'package',
);
const bundlePath = join(
	buildVersionDir('extensions', 'vscode', 'staging'),
	'extension.js',
);
const outDir = buildRoot;
await mkdir(outDir, { recursive: true });
await rm(stagingDir, { recursive: true, force: true });
await mkdir(stagingDir, { recursive: true });

const sourceManifest = JSON.parse(await readFile(PKG, 'utf8')) as Record<
	string,
	unknown
>;
await writeFile(
	join(stagingDir, 'package.json'),
	`${JSON.stringify({ ...sourceManifest, main: './extension.js' }, null, '\t')}\n`,
);
await cp(join(EXTENSION_ROOT, 'README.md'), join(stagingDir, 'README.md'));
await cp(
	join(EXTENSION_ROOT, 'CHANGELOG.md'),
	join(stagingDir, 'CHANGELOG.md'),
);
await cp(join(EXTENSION_ROOT, 'LICENSE'), join(stagingDir, 'LICENSE'));
await cp(join(EXTENSION_ROOT, 'media'), join(stagingDir, 'media'), {
	recursive: true,
});
await cp(join(WELL_KNOWN.vscode(), 'extension.js'), bundlePath);
await cp(bundlePath, join(stagingDir, 'extension.js'));

console.log(`• packaging ${manifest.name}@${manifest.version}`);
console.log(`  → ${outDir}`);

const r = spawnSync(
	'bunx',
	[
		'vsce',
		'package',
		'--no-dependencies',
		'--no-git-tag-version',
		'--out',
		outDir,
	],
	{
		cwd: stagingDir,
		stdio: 'inherit',
	},
);

await rm(join(buildVersionDir('extensions', 'vscode', 'staging')), {
	recursive: true,
	force: true,
});

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
