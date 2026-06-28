/**
 * f00086 / c00086 V1 — `commit-branch-discipline` pure engine.
 *
 * Pins the four rules the pre-commit guard makes:
 *
 *   1. Detached HEAD / non-git cwd → fail-open (release engineers
 *      can check out a tag and commit a hotfix without a branch).
 *   2. Any non-`develop` branch is always allowed (the discipline
 *      is "don't commit to develop directly", not "don't commit").
 *   3. On `develop` with deep paths staged → BLOCK with a clear
 *      next-action telling the agent to open a feature branch.
 *   4. On `develop` with >3 staged files (no deep paths) → BLOCK
 *      because the discipline is "small residual fixes only".
 *
 * Imports the script as a module so the test never invokes
 * `process.exit` — the `if (import.meta.main)` guard at the bottom
 * of the script keeps the side effects out of the import graph.
 */
import { describe, expect, it } from 'vitest';

import {
	DEEP_PATH_PATTERNS,
	MAX_RESIDUAL_FILES,
	findDeepPathViolations,
	lintCommitBranch,
} from './commit-branch-discipline.script';

const baseInput = {
	cwd: '/repo',
	stagedFiles: [] as readonly string[],
};

describe('findDeepPathViolations', () => {
	it('flags files under the four deep paths', () => {
		expect(
			findDeepPathViolations([
				'docs/mcp-vertex/proposals/f00086.md',
				'packages/core/src/index.ts',
				'plugins/proposals/src/lib/foo.ts',
				'tools/scripts/lint/bar.ts',
			]),
		).toEqual([
			'docs/mcp-vertex/proposals/f00086.md',
			'packages/core/src/index.ts',
			'plugins/proposals/src/lib/foo.ts',
			'tools/scripts/lint/bar.ts',
		]);
	});

	it('does NOT flag top-level files (small residual fixes)', () => {
		expect(
			findDeepPathViolations([
				'README.md',
				'package.json',
				'CHANGELOG.md',
			]),
		).toEqual([]);
	});

	it('only flags the deep paths even when shallow files are mixed', () => {
		expect(
			findDeepPathViolations([
				'README.md',
				'packages/core/src/lib/foo.ts',
				'lefthook.yml',
			]),
		).toEqual(['packages/core/src/lib/foo.ts']);
	});

	it('matches the exact regex set declared at module top', () => {
		// 4 patterns today: proposals, packages src, plugins src,
		// tools/scripts. A new deep path must be added explicitly
		// to `DEEP_PATH_PATTERNS` so this test catches the addition
		// in a code review.
		expect(DEEP_PATH_PATTERNS).toHaveLength(4);
	});
});

describe('lintCommitBranch', () => {
	it('fails open on detached HEAD (release-engineer carve-out)', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['packages/core/src/foo.ts'],
			currentBranch: null,
		});
		expect(result.ok).toBe(true);
	});

	it('fails open on empty branch string (same carve-out)', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['packages/core/src/foo.ts'],
			currentBranch: '',
		});
		expect(result.ok).toBe(true);
	});

	it('allows any non-develop branch even with deep paths', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: [
				'docs/mcp-vertex/proposals/x.md',
				'packages/core/src/foo.ts',
			],
			currentBranch: 'agent/copilot-minimax-m3',
		});
		expect(result.ok).toBe(true);
	});

	it('allows a feature branch committing 10 deep files (no cap on non-develop)', () => {
		const staged = Array.from(
			{ length: 10 },
			(_, i) => `packages/core/src/lib/foo-${i}.ts`,
		);
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: staged,
			currentBranch: 'feature/some-thing',
		});
		expect(result.ok).toBe(true);
	});

	it('blocks on develop when ANY deep path is staged', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: [
				'README.md',
				'packages/core/src/lib/agent-identity.ts',
			],
			currentBranch: 'develop',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers[0]).toContain('develop');
			expect(result.blockers.join('\n')).toContain(
				'packages/core/src/lib/agent-identity.ts',
			);
			expect(result.blockers.join('\n')).toContain('git switch -c');
		}
	});

	it('blocks on develop with > MAX_RESIDUAL_FILES (no deep paths)', () => {
		const staged = Array.from(
			{ length: MAX_RESIDUAL_FILES + 1 },
			(_, i) => `docs-${i}.md`,
		);
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: staged,
			currentBranch: 'develop',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain('more than');
		}
	});

	it('allows up to MAX_RESIDUAL_FILES shallow files on develop', () => {
		const staged = Array.from(
			{ length: MAX_RESIDUAL_FILES },
			(_, i) => `docs-${i}.md`,
		);
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: staged,
			currentBranch: 'develop',
		});
		expect(result.ok).toBe(true);
	});

	it('blocks the LEFTHOOK_BYPASS escape hatch in the message', () => {
		const result = lintCommitBranch({
			...baseInput,
			stagedFiles: ['packages/core/src/lib/foo.ts'],
			currentBranch: 'develop',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.blockers.join('\n')).toContain('LEFTHOOK_BYPASS=1');
		}
	});
});
