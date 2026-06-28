#!/usr/bin/env bun
/**
 * check-worktree-location.script.ts — f00086 S3 / c00086 re-tie.
 *
 * Worktree-location discipline. The 28-Jun incident surfaced a
 * worktree at `/home/cartago/_projects/mcp-vertex/.worktrees/lacerta`
 * — outside the canonical cache root
 * `/home/cartago/_projects/mcp-vertex/.cache/mcp-vertex/.worktrees/`.
 * That is an AGENTS.md R13 violation (the cache is for engine
 * state, not for ad-hoc agent dirs) AND a R14 violation (root
 * has no whitelisted executable dirs).
 *
 * The script is **pure over its inputs**: it never spawns git.
 * The CLI shell is the only piece that talks to `git worktree
 * list`; the test injects a literal list of worktree paths so
 * the engine stays importable without `process.exit` side
 * effects.
 *
 * Policy (AGENTS.md R12–R14, f00082, f00086 S3):
 *   - The MAIN worktree (`<workspace>` itself) is always
 *     allowed.
 *   - Any worktree whose path starts with
 *     `<workspace>/.cache/mcp-vertex/.worktrees/` is allowed
 *     (the canonical cache root).
 *   - Any worktree whose path starts with
 *     `<workspace>/.worktrees/` is BLOCKED (legacy / out-of-cache).
 *   - Any other path is BLOCKED (the cache is the only allowed
 *     worktree root).
 */
import { spawnSync } from 'node:child_process';

const CANONICAL_WORKTREE_PREFIX = '.cache/mcp-vertex/.worktrees/';
const LEGACY_WORKTREE_PREFIX = '.worktrees/';

export interface IWorktreeLocationInput {
	readonly workspaceRoot: string;
	readonly worktreePaths: readonly string[];
}

export type WorktreeLocationResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly violations: readonly string[] };

/**
 * Pure decision engine. No I/O, no side effects. Tests inject
 * the `worktreePaths` list directly so the engine stays
 * importable.
 */
export const lintWorktreeLocations = (
	input: IWorktreeLocationInput,
): WorktreeLocationResult => {
	const violations: string[] = [];
	const { workspaceRoot, worktreePaths } = input;

	for (const wt of worktreePaths) {
		// The main worktree IS the workspace root — always allowed.
		if (wt === workspaceRoot) continue;

		// Compute the path relative to the workspace root so the
		// canonical-prefix check is stable across hosts (the
		// absolute path can differ in `/private/...` vs `/...`
		// shenanigans on macOS).
		const rel = wt.startsWith(workspaceRoot + '/')
			? wt.slice(workspaceRoot.length + 1)
			: wt;

		// Canonical cache root — the only allowed location.
		if (rel.startsWith(CANONICAL_WORKTREE_PREFIX)) continue;

		// Legacy / out-of-cache — the AGENTS.md violation. Block
		// the discipline breach explicitly so the next
		// `bun run validate` after a manual `git worktree add`
		// surfaces it.
		if (rel.startsWith(LEGACY_WORKTREE_PREFIX)) {
			violations.push(
				`worktree \`${wt}\` lives outside the canonical cache root.`,
				`  move it:  git worktree move ${wt} ${workspaceRoot}/${CANONICAL_WORKTREE_PREFIX}<name>`,
				`  or remove:  git worktree remove --force ${wt}`,
				'',
			);
			continue;
		}

		// Any other location — block the same way. The cache is
		// the only allowed worktree root.
		violations.push(
			`worktree \`${wt}\` lives outside the canonical cache root.`,
			`  AGENTS.md: only \`<workspace>/${CANONICAL_WORKTREE_PREFIX}\` is a valid worktree location.`,
			`  move it:  git worktree move ${wt} ${workspaceRoot}/${CANONICAL_WORKTREE_PREFIX}<name>`,
			`  or remove:  git worktree remove --force ${wt}`,
			'',
		);
	}

	if (violations.length === 0) return { ok: true };
	return { ok: false, violations };
};

// ---------- CLI shell ----------

interface IWorktreeListEntry {
	readonly path: string;
}

const parseWorktreeList = (raw: string): readonly IWorktreeListEntry[] => {
	const blocks = raw
		.split('\n\n')
		.map((block) => block.trim())
		.filter((b) => b.length > 0);
	const entries: IWorktreeListEntry[] = [];
	for (const block of blocks) {
		for (const line of block.split('\n')) {
			if (line.startsWith('worktree ')) {
				entries.push({ path: line.slice('worktree '.length) });
			}
		}
	}
	return entries;
};

const readWorktreePaths = (cwd: string): readonly string[] => {
	const res = spawnSync(
		'git',
		['worktree', 'list', '--porcelain'],
		{ cwd, encoding: 'utf8' },
	);
	if (res.status !== 0) return [];
	return parseWorktreeList(res.stdout ?? '').map((e) => e.path);
};

const formatReport = (result: WorktreeLocationResult): string => {
	if (result.ok) {
		return '✓ check-worktree-location: ok\n';
	}
	return [
		'✗ check-worktree-location: blocked',
		'',
		...result.violations,
		'move or remove the offending worktrees, then re-run `bun run validate`.',
	].join('\n');
};

const main = async (): Promise<number> => {
	const cwd = process.cwd();
	const workspaceRoot = cwd;
	const worktreePaths = readWorktreePaths(cwd);
	const result = lintWorktreeLocations({ workspaceRoot, worktreePaths });
	const report = formatReport(result);
	if (result.ok) {
		process.stdout.write(report);
		return 0;
	}
	process.stderr.write(report);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
