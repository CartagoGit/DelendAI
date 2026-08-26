/**
 * pack-smoke.spec.ts — covers x00268 (Track G, audit §32).
 *
 * Spawns `tools/scripts/ci/pack-smoke.script.ts` against a known
 * success + a known failure command and asserts the wrapper
 * preserves the output verbatim and exits with the inner
 * command's code.
 *
 * The wrapper is TypeScript so it follows the repository's
 * tools-only Bun rule; the emitted markers remain the native
 * GitHub Actions runner protocol.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
// tools/tests/ci/pack-smoke.spec.ts → repo root is 3 levels up.
const repoRoot = join(here, '..', '..', '..');
const scriptPath = join(
	repoRoot,
	'tools',
	'scripts',
	'ci',
	'pack-smoke.script.ts',
);

interface IRunResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly status: number;
}

/**
 * Run the pack-smoke wrapper with a custom command. Uses
 * `spawnSync` so the test stays deterministic and easy to
 * debug; the script completes in well under a second for
 * either path.
 */
const runWrapper = (innerCmd: readonly string[]): IRunResult => {
	const args = ['--command', ...innerCmd];
	const res = spawnSync('bun', [scriptPath, ...args], {
		encoding: 'utf8',
		cwd: repoRoot,
	});
	return {
		stdout: res.stdout ?? '',
		stderr: res.stderr ?? '',
		status: res.status ?? -1,
	};
};

describe('pack-smoke.script.ts (x00268)', () => {
	it('preserves output verbatim on success', () => {
		const result = runWrapper([
			'sh',
			'-c',
			'echo "success line one"; echo "success line two"; exit 0',
		]);
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('::group::pack-smoke output (exit=0)');
		expect(result.stdout).toContain('::endgroup::');
		expect(result.stdout).toContain('success line one');
		expect(result.stdout).toContain('success line two');
		// No `::error::` on success.
		expect(result.stdout).not.toContain('::error::');
	});

	it('preserves output verbatim on failure (the bug audit §32 flagged)', () => {
		const result = runWrapper([
			'sh',
			'-c',
			'echo "first failure line"; echo "second failure line"; exit 42',
		]);
		// Exit code is the inner command's code, NOT a generic set-e abort.
		expect(result.status).toBe(42);
		// Output is preserved INSIDE the group even though the inner command failed.
		expect(result.stdout).toContain('::group::pack-smoke output (exit=42)');
		expect(result.stdout).toContain('::endgroup::');
		expect(result.stdout).toContain('first failure line');
		expect(result.stdout).toContain('second failure line');
		// ::error:: marker is emitted so the step shows as failed.
		expect(result.stdout).toContain(
			'::error::pack-smoke failed with exit 42',
		);
	});

	it('captures stderr inside the group too', () => {
		const result = runWrapper([
			'sh',
			'-c',
			'echo "stdout line"; echo "stderr line" >&2; exit 1',
		]);
		expect(result.status).toBe(1);
		expect(result.stdout).toContain('stdout line');
		expect(result.stdout).toContain('stderr line');
	});

	it('refuses --command with no arguments (exit 2)', () => {
		const res = spawnSync('bun', [scriptPath, '--command'], {
			encoding: 'utf8',
			cwd: repoRoot,
		});
		expect(res.status).toBe(2);
		const combined = `${res.stdout ?? ''}${res.stderr ?? ''}`;
		expect(combined).toContain('--command requires at least one argument');
	});
});
