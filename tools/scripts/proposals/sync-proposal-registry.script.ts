#!/usr/bin/env bun
/**
 * sync-proposal-registry.script.ts — CLI mirror of `proposals_sync_proposals`.
 *
 * Use when the MCP server isn't loaded (raw shell, agent worktree without the
 * swarm preset, etc.) and you need to rebuild the proposals index after a
 * rename/move under `docs/mcp-vertex/proposals/`.
 *
 * Why it exists: x00052 moved the canonical index from
 * `docs/mcp-vertex/proposals/index.json` (gitignored, 62 KB, stale) to
 * `<cacheDir>/proposals/index.json`. The MCP server regenerates it lazily on
 * the next `auto_work` / `continue_proposal` call. Outside the server we have
 * no lazy regenerator, so this script wires `syncProposalRegistry` directly.
 *
 * Usage:
 *   bun tools/scripts/proposals/sync-proposal-registry.script.ts
 *   bun tools/scripts/proposals/sync-proposal-registry.script.ts --root /abs/path
 *
 * Exit codes:
 *   0 — index was rebuilt (or was already in sync)
 *   1 — sync engine returned errors (JSON on stdout, human-readable\n *       diagnosis on stderr so a `>/dev/null` caller still sees it)
 *   2 — invocation error (missing root, etc.)
 */
import { resolve } from 'node:path';

import { syncProposalRegistry } from '../../../plugins/proposals/src/lib/proposals/sync-proposal-registry';
import { DEFAULT_PATH_LAYOUT } from '../../../plugins/proposals/src/lib/contracts/constants/default-path-layout.constant';
import { repoRoot } from '../lib/monorepo-paths';

const parseRoot = (): string => {
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--root') {
			const next = argv[i + 1];
			if (!next) {
				throw new Error('--root requires a path argument');
			}
			return resolve(next);
		}
		if (arg?.startsWith('--root=')) {
			return resolve(arg.slice('--root='.length));
		}
	}
	// x00079 S8: the previous fallback used `process.cwd()`, which can
	// mint a phantom cache when the script is run from outside the repo
	// root (e.g. a worktree or a downloaded tarball). `repoRoot()` resolves
	// the actual worktree toplevel via `git rev-parse --show-toplevel`,
	// with a safe fallback to the script's own location when git is not
	// on PATH.
	return resolve(repoRoot());
};

const main = async (): Promise<void> => {
	const root = parseRoot();
	const layout = DEFAULT_PATH_LAYOUT;
	const result = await syncProposalRegistry(root, layout, []);
	process.stdout.write(
		`${JSON.stringify(
			{
				root,
				indexPath: result.indexPath,
				count: result.count,
				changed: result.changed,
				generated_at: result.generated_at,
				errorCount: result.errors.length,
				errors: result.errors,
			},
			null,
			2,
		)}\n`,
	);
	if (result.errors.length > 0) {
		// The JSON above goes to stdout, and EVERY caller of this script
		// redirects stdout to /dev/null (`bun run sync:proposals >/dev/null`
		// in the `catalog-drift-check` lefthook job and in the
		// `catalog:check` package script). That made a BLOCKING pre-commit
		// gate fail with exit 1 and literally zero output — nothing to act
		// on, so agents just bypassed it. Diagnostics must go to stderr,
		// which no caller redirects, and must name both the drift and the
		// command that fixes it.
		process.stderr.write(
			[
				'',
				'sync:proposals FAILED — the proposal registry could not be rebuilt.',
				`  index: ${result.indexPath}`,
				`  ${result.errors.length} problem(s) on disk under docs/mcp-vertex/proposals/:`,
				'',
				...result.errors.map((message) => `  - ${message}`),
				'',
				'A duplicate id means two agents minted the same proposal id (the id',
				'counter is per-machine gitignored state, so a swarm can race it).',
				'Fix it by renaming ONE of the two files to a fresh id and updating',
				'its frontmatter `id:` to match, then re-run:',
				'',
				'  bun run sync:proposals',
				'  bun tools/scripts/proposals/sync-proposal-counters.script.ts',
				'',
				'Bypass this gate for one commit with: LEFTHOOK=0 git commit ...',
				'',
			].join('\n'),
		);
		process.exit(1);
	}
};

try {
	await main();
} catch (error) {
	process.stderr.write(
		`sync-proposal-registry: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exit(2);
}
