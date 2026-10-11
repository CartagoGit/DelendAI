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

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PUBLISH_ORDER } from '../../scripts/release/release-plan.ts';
import { assertPublishablePackagesArePacked } from '../../scripts/smoke/pack.script.ts';

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

/**
 * Regression coverage for the class of bug this wrapper exists to surface:
 * a package declared publishable in `PUBLISH_ORDER` (the release's single
 * source of truth, `tools/scripts/release/release-plan.ts`) silently
 * dropping out of the set `pack.script.ts` actually packs — e.g. because its
 * `package.json` lost its `files` array or flipped `private: true` without
 * also leaving `PUBLISH_ORDER`. `assertPublishablePackagesArePacked` is the
 * one guard that catches this; these specs make sure it stays wired to a
 * real repo state instead of only being exercised by hand during an
 * incident. `plugins/database` is pinned by name because it is the exact
 * package that drifted (missing `files`) and caused
 * `pack-smoke (publishable packages)` to fail in CI run 33006331587.
 */
describe('assertPublishablePackagesArePacked (PUBLISH_ORDER drift guard)', () => {
	it('does not throw against the current repo state', () => {
		expect(() => assertPublishablePackagesArePacked()).not.toThrow();
	});

	it('keeps plugins/database in PUBLISH_ORDER as a packable, publishable package', () => {
		expect(PUBLISH_ORDER).toContain('plugins/database');
		const pkgPath = join(repoRoot, 'plugins/database/package.json');
		expect(existsSync(pkgPath)).toBe(true);
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
			readonly name?: string;
			readonly private?: boolean;
			readonly files?: unknown;
		};
		expect(typeof pkg.name).toBe('string');
		expect(pkg.private).not.toBe(true);
		expect(Array.isArray(pkg.files)).toBe(true);
	});

	it('fails loudly (not silently) whenever a publishable PUBLISH_ORDER entry loses its files[] array', () => {
		// This does not mutate the filesystem — it re-derives the same
		// "publishable" predicate `pack.script.ts` uses and asserts every
		// PUBLISH_ORDER package that is not `private` really does carry a
		// `files` array, i.e. the exact condition that silently dropped
		// `plugins/database` out of the packed set before this fix.
		for (const dir of PUBLISH_ORDER) {
			const pkgPath = join(repoRoot, dir, 'package.json');
			if (!existsSync(pkgPath)) continue;
			const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
				readonly private?: boolean;
				readonly files?: unknown;
			};
			if (pkg.private === true) continue;
			expect(Array.isArray(pkg.files), `${dir}: package.json#files`).toBe(
				true,
			);
		}
	});
});
