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
 *   1 — sync engine returned errors (printed as JSON)
 *   2 — invocation error (missing root, etc.)
 */
import { resolve } from 'node:path';

import { syncProposalRegistry } from '../../../plugins/proposals/src/lib/proposals/sync-proposal-registry';
import { DEFAULT_PATH_LAYOUT } from '../../../plugins/proposals/src/lib/contracts/constants/default-path-layout.constant';

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
	return resolve(process.cwd());
};

const main = async (): Promise<void> => {
	const root = parseRoot();
	const layout = DEFAULT_PATH_LAYOUT;
	const result = await syncProposalRegistry(root, layout, []);
	process.stdout.write(
		JSON.stringify(
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
		) + '\n',
	);
	if (result.errors.length > 0) process.exit(1);
};

try {
	await main();
} catch (error) {
	process.stderr.write(
		`sync-proposal-registry: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exit(2);
}