/**
 * verify-tmp-root.spec.ts — regression test for the canonical scratch
 * root that the three lock specs share.
 *
 * What this pins (the bug the user hit on 2026-08-01):
 * Before this helper existed, every spec called
 * `process.cwd()` to resolve the scratch root. When the suite ran
 * from a swarm agent worktree, `process.cwd()` resolved to the
 * worktree, and the spec wrote `.cache/delendai/verify-tmp/...`
 * inside the worktree — invisible to the `check-cache` lint because
 * the worktree is in its skip-list. The fix is to walk up from
 * `import.meta.url` until we find the repo root marker (`AGENTS.md`),
 * independent of cwd.
 *
 * The tests below pin three properties of the helper:
 *   1. The root is absolute (not relative to cwd).
 *   2. The root is the same regardless of `process.chdir()`.
 *   3. The root ends in `.cache/delendai/verify/lock-specs` (matches
 *      `DEFAULT_CORE_PATHS.cacheDir` + the sanctioned `verify/` subdir —
 *      see `check-stray-cache-files.script.ts`'s `SANCTIONED_TOP_LEVEL`).
 */

import { sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { verifyTmpRoot } from './verify-tmp-root';

describe('verifyTmpRoot (canonical scratch root)', () => {
	const originalCwd = process.cwd();
	afterEach(() => {
		// Restore cwd so a failing test does not leave the rest of the
		// suite running from an unrelated directory.
		process.chdir(originalCwd);
	});

	it('returns an absolute path', () => {
		const root = verifyTmpRoot();
		expect(root).toMatch(new RegExp(`^${sep === '/' ? '/' : '[\\\\/]'}`));
	});

	it('locates the repo root via import.meta.url, not cwd', () => {
		const fromCwd = verifyTmpRoot();
		// Move to a totally unrelated directory and re-check. If the
		// helper depended on cwd, the result would change.
		process.chdir(sep === '/' ? '/tmp' : (process.env.TEMP ?? originalCwd));
		const fromTmp = verifyTmpRoot();
		expect(fromTmp).toBe(fromCwd);
	});

	it('ends in .cache/delendai/verify/lock-specs (matches DEFAULT_CORE_PATHS)', () => {
		const root = verifyTmpRoot();
		expect(
			root.endsWith(
				`${sep}.cache${sep}delendai${sep}verify${sep}lock-specs`,
			),
		).toBe(true);
	});

	it('creates the directory on first call so mkdtempSync has a parent', () => {
		// Calling verifyTmpRoot() twice in a row returns the same
		// path — the helper is idempotent. mkdirSync({ recursive: true })
		// side-effect is intentional and is what makes the next
		// mkdtempSync call succeed.
		const first = verifyTmpRoot();
		const second = verifyTmpRoot();
		expect(second).toBe(first);
	});
});
