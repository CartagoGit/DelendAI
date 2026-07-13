import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
		const outdir = await mkdtemp(
			join(tmpdir(), 'mcp-vertex-vscode-build-'),
		);
		temporaryDirectories.push(outdir);

		const result = spawnSync(
			'bun',
			['scripts/build.ts', '--outdir', outdir],
			{ cwd: EXTENSION_ROOT, encoding: 'utf8' },
		);

		expect(result.status, result.stderr || result.stdout).toBe(0);
		const bundle = await readFile(join(outdir, 'extension.js'), 'utf8');
		expect(bundle).toContain('.mcpv-tabs__bar');
		expect(bundle).not.toContain('SCSS compile failed');
	});
});
