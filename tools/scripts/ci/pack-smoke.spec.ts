import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..',
);
const scriptPath = join(
	repoRoot,
	'tools',
	'scripts',
	'ci',
	'pack-smoke.script.ts',
);

const runWrapper = (command: readonly string[]) =>
	spawnSync('bun', [scriptPath, '--command', ...command], {
		cwd: repoRoot,
		encoding: 'utf8',
	});

describe('pack-smoke output preservation', () => {
	it('preserves stdout and stderr when the command exits unsuccessfully', () => {
		const result = runWrapper([
			'sh',
			'-c',
			'printf "stdout failure\\n"; printf "stderr failure\\n" >&2; exit 42',
		]);

		expect(result.status).toBe(42);
		expect(result.stdout).toContain('stdout failure');
		expect(result.stdout).toContain('stderr failure');
		expect(result.stdout).toContain('::group::pack-smoke output (exit=42)');
		expect(result.stdout).toContain('::endgroup::');
	});

	it('preserves the spawn error inside the output group', () => {
		const result = runWrapper(['command-that-does-not-exist']);

		expect(result.status).toBe(1);
		expect(result.stdout).toContain('::group::pack-smoke output (exit=1)');
		expect(result.stdout).toContain(
			'pack-smoke: failed to start command: Executable not found in $PATH',
		);
		expect(result.stdout).toContain('::endgroup::');
		expect(result.stdout).toContain(
			'::error::pack-smoke failed with exit 1',
		);
	});

	it('rejects --command without a command', () => {
		const result = spawnSync('bun', [scriptPath, '--command'], {
			cwd: repoRoot,
			encoding: 'utf8',
		});

		expect(result.status).toBe(2);
		expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).toContain(
			'--command requires at least one argument',
		);
	});
});
