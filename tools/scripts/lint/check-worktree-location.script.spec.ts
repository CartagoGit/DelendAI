/**
 * f00086 S3 / c00086 re-tie — `check-worktree-location` pure engine.
 *
 * Pins the four rules the discipline makes:
 *
 *   1. The MAIN worktree (the workspace root itself) is always
 *      allowed.
 *   2. A worktree under `<workspace>/.cache/mcp-vertex/.worktrees/`
 *      (the canonical cache root) is allowed.
 *   3. A worktree under `<workspace>/.worktrees/` (legacy /
 *      out-of-cache) is BLOCKED with a clear move command.
 *   4. Any other location is BLOCKED — the cache is the only
 *      allowed worktree root.
 *
 * The 28-Jun incident surfaced the third case
 * (`/home/cartago/_projects/mcp-vertex/.worktrees/lacerta`) and
 * the discipline had to be added because AGENTS.md R12/R13 was
 * advisory-only.
 */
import { describe, expect, it } from 'vitest';

import {
	lintWorktreeLocations,
} from './check-worktree-location.script';

const WS = '/home/cartago/_projects/mcp-vertex';

describe('lintWorktreeLocations', () => {
	it('allows the main worktree (the workspace root)', () => {
		const result = lintWorktreeLocations({
			workspaceRoot: WS,
			worktreePaths: [WS],
		});
		expect(result.ok).toBe(true);
	});

	it('allows a worktree under the canonical cache root', () => {
		const result = lintWorktreeLocations({
			workspaceRoot: WS,
			worktreePaths: [
				WS,
				`${WS}/.cache/mcp-vertex/.worktrees/copilot-minimax-m3`,
			],
		});
		expect(result.ok).toBe(true);
	});

	it('allows multiple worktrees under the canonical cache root', () => {
		const result = lintWorktreeLocations({
			workspaceRoot: WS,
			worktreePaths: [
				WS,
				`${WS}/.cache/mcp-vertex/.worktrees/orion`,
				`${WS}/.cache/mcp-vertex/.worktrees/andromeda-1`,
				`${WS}/.cache/mcp-vertex/.worktrees/andromeda-2`,
			],
		});
		expect(result.ok).toBe(true);
	});

	it('blocks a worktree under the legacy / out-of-cache root', () => {
		// The exact violation from the 28-Jun incident.
		const result = lintWorktreeLocations({
			workspaceRoot: WS,
			worktreePaths: [
				WS,
				`${WS}/.worktrees/lacerta`,
			],
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.violations.join('\n')).toContain(
				'/.worktrees/lacerta',
			);
			expect(result.violations.join('\n')).toContain('git worktree move');
		}
	});

	it('blocks a worktree outside BOTH the cache root AND the legacy dir', () => {
		const result = lintWorktreeLocations({
			workspaceRoot: WS,
			worktreePaths: [
				WS,
				`${WS}/some/random/path/orion`,
			],
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.violations.join('\n')).toContain(
				'AGENTS.md',
			);
		}
	});

	it('reports every violation, not just the first one', () => {
		const result = lintWorktreeLocations({
			workspaceRoot: WS,
			worktreePaths: [
				WS,
				`${WS}/.worktrees/lacerta`,
				`${WS}/.worktrees/orion`,
				'/tmp/somewhere-else',
			],
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.violations.length).toBeGreaterThanOrEqual(3);
		}
	});

	it('passes the discipline on a clean repo with no extra worktrees', () => {
		const result = lintWorktreeLocations({
			workspaceRoot: WS,
			worktreePaths: [WS],
		});
		expect(result.ok).toBe(true);
	});
});
