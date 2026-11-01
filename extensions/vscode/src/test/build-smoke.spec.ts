import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const EXTENSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe('VS Code production build', () => {
	it('bundles shared SCSS-backed dashboard styles', async () => {
		const outdir = await mkdtemp(join(tmpdir(), 'delendai-vscode-build-'));
		temporaryDirectories.push(outdir);

		const result = spawnSync(
			'bun',
			['scripts/build.ts', '--outdir', outdir],
			{ cwd: EXTENSION_ROOT, encoding: 'utf8' },
		);

		expect(result.status, result.stderr || result.stdout).toBe(0);
		const bundle = await readFile(join(outdir, 'extension.js'), 'utf8');
		expect(bundle).toContain('.delendai-tabs__bar');
		expect(bundle).not.toContain('SCSS compile failed');
	});

	it('loads in the runtime that hosts it', async () => {
		const outdir = await mkdtemp(join(tmpdir(), 'delendai-vscode-load-'));
		temporaryDirectories.push(outdir);
		const built = spawnSync(
			'bun',
			['scripts/build.ts', '--outdir', outdir],
			{ cwd: EXTENSION_ROOT, encoding: 'utf8' },
		);
		expect(built.status, built.stderr || built.stdout).toBe(0);
		const host = join(outdir, 'node_modules/vscode');
		await mkdir(host, { recursive: true });
		await writeFile(join(host, 'index.js'), 'module.exports = {};');

		// A bundle can build and still throw on its first line: every other
		// spec runs the sources, never what the package ships.
		const loaded = spawnSync(
			'node',
			['--input-type=module', '-e', "await import('./extension.js');"],
			{ cwd: outdir, encoding: 'utf8' },
		);

		expect(loaded.status, loaded.stderr).toBe(0);
	});
});
